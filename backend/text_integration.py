"""
text_integration.py — Cinematic Text Integration Pipeline
==========================================================
Composites text onto banner images with physically-inspired lighting:
  • Background luminance analysis  → optimal text fill color
  • Quadrant-based light detection → directional drop shadows
  • Light wrap (Gaussian glow)     → environmental bleed
  • Soft Light / Overlay blending  → background texture shows through text

All heavy pixel work is done via NumPy; no Python-level pixel loops.
"""
from __future__ import annotations

import gc
import logging
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_ANALYSIS_GRID = 32            # downsample target for luminance analysis
_MAX_WORKING_DIM = 4096        # cap either dimension during processing
_GLOW_OPACITY = 0.55           # max alpha multiplier for the light-wrap glow
_SHADOW_BASE_OPACITY = 0.65    # darker core shadow
_PENUMBRA_OPACITY = 0.35       # softer outer shadow
_MIN_SHADOW_PX = 4             # absolute minimum shadow offset in pixels
_MAX_SHADOW_PX = 40            # cap shadow so it doesn't fly off on huge fonts


# ---------------------------------------------------------------------------
# Utility: safe font loading
# ---------------------------------------------------------------------------
def _load_font(font_path: str, font_size: int) -> ImageFont.FreeTypeFont:
    """Load a TrueType font with multiple fallback strategies."""
    candidates = [font_path]

    # Common Windows fallbacks
    import os
    win_fonts = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    for fallback in ("arial.ttf", "segoeui.ttf", "calibri.ttf", "verdana.ttf"):
        candidates.append(os.path.join(win_fonts, fallback))

    for path in candidates:
        try:
            return ImageFont.truetype(path, font_size)
        except (OSError, IOError):
            continue

    logger.warning("No TrueType font found, falling back to Pillow default bitmap font.")
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Step 1: Analyze background — dominant light + best text fill color
# ---------------------------------------------------------------------------
def analyze_background(
    image: Image.Image,
    grid: int = _ANALYSIS_GRID,
) -> dict:
    """
    Downsample the image onto a small grid and compute:
      • light_color    – RGB tuple of the brightest cluster
      • light_pos      – (x, y) normalized –1…+1  (light source direction)
      • text_fill      – hex string (#RRGGBB) for optimal text readability
      • mean_lum       – scalar 0-255 average luminance (useful for guard rails)
      • brightest_quad  – int 0-3 (TL, TR, BL, BR)

    Uses vectorised NumPy throughout; no Python pixel loops.
    """
    small = image.resize((grid, grid), Image.Resampling.LANCZOS).convert("RGB")
    data = np.asarray(small, dtype=np.float32)        # (G, G, 3)

    # Weighted luminance per pixel  (BT.601)
    lum = 0.299 * data[:, :, 0] + 0.587 * data[:, :, 1] + 0.114 * data[:, :, 2]
    mean_lum = float(np.mean(lum))

    # --- brightest point (light source) ---
    flat_idx = int(np.argmax(lum))
    by, bx = divmod(flat_idx, grid)
    half = (grid - 1) / 2.0
    light_x = (bx - half) / half          # –1 left … +1 right
    light_y = (by - half) / half          # –1 top  … +1 bottom
    light_color = tuple(int(c) for c in data[by, bx])

    # --- brightest quadrant (for shadow direction) ---
    mid_y, mid_x = grid // 2, grid // 2
    quads = [
        float(np.mean(lum[:mid_y, :mid_x])),   # 0 = TL
        float(np.mean(lum[:mid_y, mid_x:])),    # 1 = TR
        float(np.mean(lum[mid_y:, :mid_x])),    # 2 = BL
        float(np.mean(lum[mid_y:, mid_x:])),    # 3 = BR
    ]
    brightest_quad = int(np.argmax(quads))

    # --- choose text fill for readability ---
    # Sample darkest 25 % and brightest 25 % of pixels
    flat_lum = lum.ravel()
    q25, q75 = np.percentile(flat_lum, 25), np.percentile(flat_lum, 75)
    dark_mask = flat_lum <= q25
    bright_mask = flat_lum >= q75

    flat_data = data.reshape(-1, 3)
    avg_dark = flat_data[dark_mask].mean(axis=0) if dark_mask.any() else np.array([30, 30, 30])
    avg_bright = flat_data[bright_mask].mean(axis=0) if bright_mask.any() else np.array([225, 225, 225])

    # If overall image is dark → light text; if bright → dark text
    if mean_lum < 128:
        fill_rgb = np.clip(avg_bright * 1.15, 180, 255).astype(int)
    else:
        fill_rgb = np.clip(avg_dark * 0.7, 0, 80).astype(int)

    text_fill_hex = "#{:02X}{:02X}{:02X}".format(*fill_rgb)

    return {
        "light_color": light_color,
        "light_pos": (float(light_x), float(light_y)),
        "text_fill": text_fill_hex,
        "mean_lum": mean_lum,
        "brightest_quad": brightest_quad,
    }


# ---------------------------------------------------------------------------
# Step 2 & 3: Render text mask + directional shadow masks
# ---------------------------------------------------------------------------
def _render_text_mask(
    width: int,
    height: int,
    text: str,
    font: ImageFont.FreeTypeFont,
    pos_x: float = None,
    pos_y: float = None,
    angle: float = 0.0,
    origin_x: str = "left",
    origin_y: str = "top",
) -> Tuple[Image.Image, Tuple[int, int]]:
    """
    Returns a crisp L-mode text mask and the (x, y) draw origin.
    Supports exact positioning and rotation from the canvas.
    """
    # Measure the text dimensions
    temp = Image.new("L", (1, 1), 0)
    temp_draw = ImageDraw.Draw(temp)
    bbox = temp_draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    ox, oy = bbox[0], bbox[1]   # glyph offsets

    # If no position provided, center on image
    if pos_x is None or pos_y is None:
        cx = width / 2
        cy = height / 2
    else:
        # Convert fabric.js origin to center point
        cx = pos_x
        cy = pos_y
        if origin_x == "left":
            cx += tw / 2
        elif origin_x == "right":
            cx -= tw / 2
        if origin_y == "top":
            cy += th / 2
        elif origin_y == "bottom":
            cy -= th / 2

    if abs(angle) < 0.5:
        # No rotation — draw directly on the full-size mask
        tx = int(cx - tw / 2 - ox)
        ty = int(cy - th / 2 - oy)
        mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask)
        draw.text((tx, ty), text, font=font, fill=255)
        return mask, (tx, ty)
    else:
        # Rotation: draw text on a padded temporary image, rotate, paste
        pad = int(max(tw, th) * 0.8)  # extra padding for rotation
        tmp_w = tw + pad * 2
        tmp_h = th + pad * 2
        tmp = Image.new("L", (tmp_w, tmp_h), 0)
        tmp_draw = ImageDraw.Draw(tmp)
        # Draw text centered in the temp image
        tmp_tx = pad - ox
        tmp_ty = pad - oy
        tmp_draw.text((tmp_tx, tmp_ty), text, font=font, fill=255)

        # Rotate around the center of the temp image
        rotated = tmp.rotate(-angle, resample=Image.BICUBIC, expand=True)

        # Paste rotated text onto full-size mask centered at (cx, cy)
        rw, rh = rotated.size
        paste_x = int(cx - rw / 2)
        paste_y = int(cy - rh / 2)

        mask = Image.new("L", (width, height), 0)
        mask.paste(rotated, (paste_x, paste_y))

        # Return approximate draw origin (used for shadow offset reference)
        return mask, (int(cx - tw / 2), int(cy - th / 2))


def _render_shadow(
    width: int,
    height: int,
    text_mask: Image.Image,
    light_pos: Tuple[float, float],
    font_size: int,
) -> Image.Image:
    """
    Dual-layer shadow derived from the text mask. Shadow direction opposes
    the light source. Works with any text shape including rotated text.
    Returns an RGBA shadow layer ready to composite.
    """
    lx, ly = light_pos
    dist = np.clip(font_size / 12, _MIN_SHADOW_PX, _MAX_SHADOW_PX)
    ox = int(-lx * dist)
    oy = int(-ly * dist)

    mask_arr = np.asarray(text_mask)

    # Umbra (sharp inner shadow) — shift the mask
    umbra = Image.fromarray(np.roll(np.roll(mask_arr, oy, axis=0), ox, axis=1))
    umbra_blur = max(2, font_size // 30)
    umbra = umbra.filter(ImageFilter.GaussianBlur(radius=umbra_blur))
    umbra_arr = np.asarray(umbra, dtype=np.float32) * _SHADOW_BASE_OPACITY
    umbra_arr = np.clip(umbra_arr, 0, 255).astype(np.uint8)

    # Penumbra (soft outer shadow, larger offset)
    pen_ox = int(ox * 1.6)
    pen_oy = int(oy * 1.6)
    penumbra = Image.fromarray(np.roll(np.roll(mask_arr, pen_oy, axis=0), pen_ox, axis=1))
    pen_blur = max(4, font_size // 12)
    penumbra = penumbra.filter(ImageFilter.GaussianBlur(radius=pen_blur))
    pen_arr = np.asarray(penumbra, dtype=np.float32) * _PENUMBRA_OPACITY
    pen_arr = np.clip(pen_arr, 0, 255).astype(np.uint8)

    # Combine umbra + penumbra (max — they overlap)
    combined = np.maximum(umbra_arr, pen_arr)
    shadow_alpha = Image.fromarray(combined, mode="L")

    shadow_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow_layer.putalpha(shadow_alpha)
    return shadow_layer


# ---------------------------------------------------------------------------
# Step 4: Light Wrap (environmental glow bleeding over the text edges)
# ---------------------------------------------------------------------------
def _render_light_wrap(
    width: int,
    height: int,
    text_mask: Image.Image,
    light_color: Tuple[int, int, int],
    font_size: int,
) -> Image.Image:
    """
    Simulates environmental light bleeding over text edges by dilating
    and blurring the text mask, then tinting with the dominant light color.
    Works with any text shape including rotated text.
    Returns RGBA glow layer.
    """
    stroke_w = max(2, font_size // 18)
    blur_r = max(4, font_size // 8)

    # Dilate the mask using MaxFilter to expand the text shape
    glow_mask = text_mask.copy()
    for _ in range(stroke_w):
        glow_mask = glow_mask.filter(ImageFilter.MaxFilter(3))
    glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(radius=blur_r))

    # Scale alpha via NumPy
    gm_arr = np.asarray(glow_mask, dtype=np.float32) * _GLOW_OPACITY
    gm_arr = np.clip(gm_arr, 0, 255).astype(np.uint8)
    glow_alpha = Image.fromarray(gm_arr, mode="L")

    glow_layer = Image.new("RGBA", (width, height), (*light_color, 255))
    glow_layer.putalpha(glow_alpha)
    return glow_layer


# ---------------------------------------------------------------------------
# Step 5: NumPy blending modes (Soft Light / Overlay)
# ---------------------------------------------------------------------------
def _blend_soft_light(base: np.ndarray, blend: np.ndarray) -> np.ndarray:
    """
    Soft Light blending in linear float space.
    Formula (Photoshop-style):
        if blend <= 0.5:  result = 2*base*blend + base² * (1 - 2*blend)
        else:             result = 2*base*(1-blend) + √base * (2*blend - 1)

    Both inputs/outputs are float32 arrays in [0, 1].
    """
    lo = 2.0 * base * blend + (base * base) * (1.0 - 2.0 * blend)
    hi = 2.0 * base * (1.0 - blend) + np.sqrt(np.clip(base, 0, 1)) * (2.0 * blend - 1.0)
    return np.where(blend <= 0.5, lo, hi)


def _blend_overlay(base: np.ndarray, blend: np.ndarray) -> np.ndarray:
    """
    Overlay blending:
        if base <= 0.5:  result = 2 * base * blend
        else:            result = 1 - 2*(1-base)*(1-blend)
    """
    lo = 2.0 * base * blend
    hi = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend)
    return np.where(base <= 0.5, lo, hi)


def _apply_blend(
    bg_rgb: Image.Image,
    tint_color: Tuple[int, int, int],
    text_mask: Image.Image,
    mode: str = "soft_light",
    blend_strength: float = 0.30,
) -> Image.Image:
    """
    Create a text body layer that is *primarily opaque* but lets background
    texture bleed through at *blend_strength* (0-1).

    Pipeline:
      1. Build a solid-fill text layer (fully opaque, clearly readable).
      2. Compute a blended version (Soft Light / Overlay with the background).
      3. Lerp between the solid fill and the blended version at blend_strength.
      4. Mask the result to the text shape.

    Returns an RGBA layer.
    """
    w, h = bg_rgb.size
    base = np.asarray(bg_rgb, dtype=np.float32) / 255.0   # (H, W, 3)

    # Solid fill (the readable text color)
    solid = np.full_like(base, 0.0)
    solid[:, :, 0] = tint_color[0] / 255.0
    solid[:, :, 1] = tint_color[1] / 255.0
    solid[:, :, 2] = tint_color[2] / 255.0

    # Compute the blend effect
    if mode == "overlay":
        blended = _blend_overlay(base, solid)
    else:
        blended = _blend_soft_light(base, solid)

    # Lerp: mostly solid fill + a touch of the blend for texture integration
    # blend_strength=0.0 → pure solid fill (no texture)
    # blend_strength=1.0 → pure blend effect (text disappears, the old bug)
    result = solid * (1.0 - blend_strength) + blended * blend_strength
    result = np.clip(result * 255.0, 0, 255).astype(np.uint8)

    body_img = Image.fromarray(result, mode="RGB").convert("RGBA")
    body_img.putalpha(text_mask)
    return body_img


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def apply_cinematic_text(
    base_image: Image.Image,
    text: str,
    font_path: str,
    font_size: int = 200,
    blend_mode: str = "soft_light",
    *,
    text_x: float = None,
    text_y: float = None,
    text_angle: float = 0.0,
    text_fill: str = None,
    text_scale_x: float = 1.0,
    text_scale_y: float = 1.0,
    text_origin_x: str = "left",
    text_origin_y: str = "top",
) -> Image.Image:
    """
    Composite *text* onto *base_image* with cinematic lighting effects.
    Supports exact positioning, rotation, and user-chosen fill color.
    """
    # --- guard: empty text ---
    if not text or not text.strip():
        logger.info("Empty text provided; returning original image.")
        return base_image.convert("RGB")

    # --- memory guard: cap working resolution ---
    bg = base_image.convert("RGBA")
    w, h = bg.size
    img_scale = 1.0
    if max(w, h) > _MAX_WORKING_DIM:
        img_scale = _MAX_WORKING_DIM / max(w, h)
        new_w = int(w * img_scale)
        new_h = int(h * img_scale)
        bg = bg.resize((new_w, new_h), Image.Resampling.LANCZOS)
        font_size = max(12, int(font_size * img_scale))
        if text_x is not None:
            text_x *= img_scale
            text_y *= img_scale
        logger.info(
            "Image downscaled from %dx%d to %dx%d for processing.",
            w, h, new_w, new_h,
        )
    width, height = bg.size

    # --- compute effective font size from canvas scale ---
    effective_font_size = max(12, int(font_size * max(text_scale_x, text_scale_y)))

    # --- step 1: analyze background ---
    info = analyze_background(bg)
    light_color: Tuple[int, int, int] = info["light_color"]
    light_pos: Tuple[float, float] = info["light_pos"]
    mean_lum: float = info["mean_lum"]

    logger.info(
        "Analysis — mean lum: %.0f, light@(%.2f, %.2f), user_fill: %s",
        mean_lum, *light_pos, text_fill or "auto",
    )

    # Clamp light color away from extremes to avoid invisible glow
    lc_arr = np.array(light_color, dtype=np.float32)
    lc_lum = float(0.299 * lc_arr[0] + 0.587 * lc_arr[1] + 0.114 * lc_arr[2])
    if lc_lum < 40:
        lc_arr = np.clip(lc_arr + 60, 0, 255)
        light_color = tuple(int(c) for c in lc_arr)
    elif lc_lum > 245:
        light_color = (245, 240, 230)

    # --- determine fill color ---
    if text_fill and text_fill.startswith("#") and len(text_fill) >= 7:
        # Use the user's chosen color
        fill_r = int(text_fill[1:3], 16)
        fill_g = int(text_fill[3:5], 16)
        fill_b = int(text_fill[5:7], 16)
        fill_rgb = (fill_r, fill_g, fill_b)
    else:
        # Auto-detect from background analysis
        auto_hex = info["text_fill"]
        fill_r = int(auto_hex[1:3], 16)
        fill_g = int(auto_hex[3:5], 16)
        fill_b = int(auto_hex[5:7], 16)
        fill_rgb = (fill_r, fill_g, fill_b)

    # --- step 2: load font + render text mask ---
    font = _load_font(font_path, effective_font_size)
    text_mask, origin = _render_text_mask(
        width, height, text, font,
        pos_x=text_x, pos_y=text_y,
        angle=text_angle,
        origin_x=text_origin_x, origin_y=text_origin_y,
    )

    # --- step 3: directional shadow (derived from mask) ---
    shadow_layer = _render_shadow(
        width, height, text_mask, light_pos, effective_font_size
    )

    # --- step 4: light wrap glow (derived from mask) ---
    glow_layer = _render_light_wrap(
        width, height, text_mask, light_color, effective_font_size
    )

    # --- step 5: text body (solid fill + subtle blend for texture) ---
    blended_body = _apply_blend(
        bg.convert("RGB"), fill_rgb, text_mask, mode=blend_mode, blend_strength=0.30
    )

    # --- step 5b: thin outline for readability (derived from mask) ---
    outline_width = max(1, effective_font_size // 40)
    outline_mask = text_mask.copy()
    for _ in range(outline_width):
        outline_mask = outline_mask.filter(ImageFilter.MaxFilter(3))
    # Subtract the inner text mask to keep only the outline ring
    outline_arr = np.asarray(outline_mask, dtype=np.float32)
    inner_arr = np.asarray(text_mask, dtype=np.float32)
    ring_arr = np.clip(outline_arr - inner_arr, 0, 255).astype(np.uint8)

    # Outline color: opposite of fill for contrast
    fill_lum = 0.299 * fill_rgb[0] + 0.587 * fill_rgb[1] + 0.114 * fill_rgb[2]
    if fill_lum > 128:
        outline_color = (0, 0, 0, 180)
    else:
        outline_color = (255, 255, 255, 180)

    outline_layer = Image.new("RGBA", (width, height), outline_color[:3] + (255,))
    ring_scaled = np.clip(ring_arr.astype(np.float32) * (outline_color[3] / 255.0), 0, 255).astype(np.uint8)
    outline_layer.putalpha(Image.fromarray(ring_scaled, mode="L"))

    # --- step 6: composite stack ---
    final = Image.alpha_composite(bg, shadow_layer)        # 1. shadow
    final = Image.alpha_composite(final, glow_layer)        # 2. light wrap
    final = Image.alpha_composite(final, outline_layer)     # 3. text outline
    final = Image.alpha_composite(final, blended_body)      # 4. text body

    # clean up large intermediates
    del shadow_layer, glow_layer, blended_body, text_mask, outline_layer
    gc.collect()

    # --- up-scale back if we down-scaled earlier ---
    if img_scale < 1.0:
        final = final.resize((w, h), Image.Resampling.LANCZOS)

    return final.convert("RGB")


# ---------------------------------------------------------------------------
# CLI smoke test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    import os

    print("Cinematic Text Integration — smoke test")
    print("=" * 50)

    if len(sys.argv) < 2:
        # Create a synthetic gradient test image
        print("No image path supplied — generating 1920×1080 test gradient…")
        arr = np.zeros((1080, 1920, 3), dtype=np.uint8)
        # warm-to-cool diagonal gradient
        for c in range(3):
            ramp = np.linspace(
                [200, 80, 40][c], [40, 60, 180][c], 1920, dtype=np.float32
            )
            arr[:, :, c] = np.tile(ramp, (1080, 1)).astype(np.uint8)
        test_img = Image.fromarray(arr, "RGB")
    else:
        test_img = Image.open(sys.argv[1]).convert("RGB")

    font_p = os.path.join(
        os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "impact.ttf"
    )
    result = apply_cinematic_text(test_img, "CINEMATIC", font_p, 180)

    out_path = os.path.join(os.path.dirname(__file__), "test_output.png")
    result.save(out_path)
    print(f"Saved -> {out_path}  ({result.size[0]}x{result.size[1]})")
