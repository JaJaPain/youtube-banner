# Cinematic Text Alignment Failure Log
**Date:** April 16, 2026
**Target Project:** YouTubeBannerMaker
**Primary Issue:** Text "Bake In" feature consistently results in misaligned, incorrectly scaled, or "chopped" text when compositing through the Python backend.

---

## Technical Summary of Attempts

### Attempt 1: Standardizing Capture and Coordinates
*   **Hypothesis:** The backend was receiving raw `left/top` coordinates which vary based on Fabric.js origin settings (Center vs. Left/Top). High-resolution displays were also causing the canvas capture to be twice the expected size.
*   **Fix Applied:**
    *   Updated `UIManager.js` to use `activeObj.getCenterPoint()` to ensure the backend always received the mathematical center.
    *   Updated `toDataURL` to use `multiplier: 1` to force the output to match the canvas's logical CSS dimensions.
*   **Reason for Failure:** Accidental UI corruption occurred during the file overwrite. Once the UI was restored, the text still appeared shrunken or offset on High-DPI displays.

### Attempt 2: UI Restoration and Font Mapping
*   **Hypothesis:** The previous attempt's UI corruption lost the new Cinematic Text controls and the expanded 58-font list.
*   **Fix Applied:**
    *   Restored `index.html` layout.
    *   Verified font resolution in `backend/main.py`.
*   **Reason for Failure:** While the UI was back, the core positioning mismatch persisted. Text rendering in Python/PIL didn't match the pixel-for-pixel layout of the browser's Fabric.js rendering engine.

### Attempt 3: Retina/DPI Scaling Correction
*   **Hypothesis:** `multiplier: 1` in Fabric.js on a Retina/4K display returns the **physical** pixel buffer (e.g., 2560x1440 for a 1280x720 canvas). This causes the backend coordinate math (which expects 1280x720) to place the text in the "wrong" quadrant.
*   **Fix Applied:**
    *   Modified `UIManager.js` and `CanvasManager.js` to use `multiplier: 1 / window.devicePixelRatio`. This intended to force the browser to downsample the physical buffer to match the CSS logical dimensions exactly.
*   **Reason for Failure:** Still failed to achieve alignment. Scaling discrepancies between the browser's text rendering (DPI-aware) and the Python environment's static pixel rendering remain unresolved.

---

## Final Status
*   **Progress:** 0% Success in achieving visual alignment.
*   **Resource Usage:** 99% of weekly credits depleted across two separate models.
*   **Current State:** UI is functional, but the "Bake In" feature remains unusable for high-fidelity production due to persistent scaling/coordinate drift.

---

## Files Impacted Today
- `index.html`: Restored layout and fonts.
- `js/UIManager.js`: DPI/multiplier adjustments + coordinate mapping.
- `js/CanvasManager.js`: DPI/multiplier adjustments.
- `backend/main.py`: Debug logging added.
- `backend/text_integration.py`: Investigated for coordinate math errors.

---

## 🛑 ROOT CAUSE DISCOVERED (Post-Log Analysis)
The fundamental failure is not just coordinate math or Retina scaling; it is a **Rendering Core Discrepancy**:

1.  **Fabric.js (Frontend):** A font size of `120` results in text that fits within a 1280px wide canvas.
2.  **Pillow/PIL (Backend):** The exact same font file at size `120` (as verified via terminal testing) results in a width of **1,969 pixels**.
3.  **The Result:** Because the backend text is nearly 2x larger than the frontend text, the "Bake In" process results in massive, chopped-off characters regardless of whether the center point is correct.

### Recommendation for Next Session:
**Shift from "Parameter-based" to "Pixel-based" Integration.**
Instead of sending text properties (Size, Font Name, String), the frontend should send a **transparent PNG mask of the text layer**. This eliminates all renderer size mismatches and DPI issues once and for all.
