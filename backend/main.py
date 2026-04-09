from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import base64
import os
import httpx
from io import BytesIO
from contextlib import asynccontextmanager

# ============================================================================
# CRITICAL: Redirect HuggingFace model cache to D: drive.
# C: drive has almost no free space, D: has ~187 GB.
# This MUST be set BEFORE importing torch/diffusers.
# ============================================================================
os.environ["HF_HOME"] = r"D:\hf_cache"
os.environ["TRANSFORMERS_CACHE"] = r"D:\hf_cache\transformers"
os.environ["TORCH_HOME"] = r"D:\torch_cache"

HF_API_URL = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0"
HF_TOKEN = os.environ.get("HF_TOKEN", "")

pipe = None
model_type = "none"
generation_progress = 0


def try_load_local_model(requested_model="flux"):
    """Try to load FLUX or SDXL Lightning on GPU. Falls back gracefully."""
    global pipe, model_type
    try:
        import torch
        if not torch.cuda.is_available():
            print("No GPU found — will use cloud API.")
            return

        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"GPU Detected: {gpu_name} ({vram_gb:.1f} GB VRAM)")

        if requested_model == "sdxl":
            from diffusers import StableDiffusionXLPipeline, EulerDiscreteScheduler
            print("Loading SDXL Lightning...")
            print("(First run will download components to D:\\hf_cache — subsequent runs are instant)")

            try:
                pipe = StableDiffusionXLPipeline.from_pretrained(
                    "stabilityai/stable-diffusion-xl-base-1.0",
                    torch_dtype=torch.float16,
                    variant="fp16",
                    local_files_only=True
                )
            except Exception:
                # If local files aren't found, drop the flag to allow downloading
                pipe = StableDiffusionXLPipeline.from_pretrained(
                    "stabilityai/stable-diffusion-xl-base-1.0",
                    torch_dtype=torch.float16,
                    variant="fp16"
                )

            pipe.load_lora_weights("ByteDance/SDXL-Lightning", weight_name="sdxl_lightning_4step_lora.safetensors")
            pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
            pipe.to("cuda")
            model_type = "sdxl"
            print("SDXL Lightning loaded successfully on GPU!")

        else: # Default to FLUX
            from diffusers import FluxPipeline
            model_id = "magespace/FLUX.1-schnell-bnb-nf4"
            print(f"Loading {model_id}...")
            print("(First run will download ~8 GB to D:\\hf_cache — subsequent runs are instant)")

            try:
                pipe = FluxPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch.bfloat16,
                    local_files_only=True
                )
            except Exception:
                pipe = FluxPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch.bfloat16
                )
            # We will keep the model entirely on your 12GB VRAM so it doesn't overflow your system RAM
            pipe.to("cuda")
            model_type = "flux"
            print("FLUX model loaded successfully on GPU!")

    except Exception as e:
        print(f"Local model load failed: {e}")
        pipe = None
        model_type = "cloud-api"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe, model_type
    
    model_type = "cloud-api"
    print("=" * 60)
    print("Starting up FAST! Local model is NOT loaded yet.")
    print("Using HuggingFace Cloud API for image generation by default.")
    if HF_TOKEN:
        print("HF_TOKEN detected — using authenticated requests.")
    else:
        print("TIP: Set HF_TOKEN env var for faster rate limits.")
    print("=" * 60)
        
    yield
    # Cleanup on shutdown
    pipe = None


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_header(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


class GenerateRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 576

class LoadModelRequest(BaseModel):
    model_type: str = "flux"


async def generate_via_cloud(prompt: str, width: int = 1024, height: int = 576) -> bytes:
    """Call HF Inference API to generate an image. Returns raw PNG bytes."""
    headers = {}
    if HF_TOKEN:
        headers["Authorization"] = f"Bearer {HF_TOKEN}"

    payload = {
        "inputs": prompt,
        "parameters": {
            "width": width,
            "height": height,
        }
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        print("Sending request to HF Inference API...")
        resp = await client.post(HF_API_URL, json=payload, headers=headers)

        if resp.status_code == 503:
            body = resp.json()
            wait_time = body.get("estimated_time", 30)
            print(f"Model is loading on HF servers, waiting {wait_time:.0f}s...")
            import asyncio
            await asyncio.sleep(min(wait_time, 60))
            resp = await client.post(HF_API_URL, json=payload, headers=headers)

        if resp.status_code != 200:
            error_detail = resp.text
            try:
                error_detail = resp.json().get("error", resp.text)
            except Exception:
                pass
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"HF API error: {error_detail}"
            )

        return resp.content


@app.post("/api/load-model")
async def load_model_endpoint(req: LoadModelRequest):
    global pipe, model_type
    model_pick = req.model_type if req else "flux"

    if pipe is not None and model_type == model_pick:
        return {"status": "already loaded", "model_type": model_type}
    
    if pipe is not None:
        import gc
        import torch
        del pipe
        pipe = None
        gc.collect()
        torch.cuda.empty_cache()

    try_load_local_model(model_pick)
    
    if pipe is not None:
        return {"status": "loaded", "model_type": model_type}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to load {model_pick}. Check console for details.")

@app.get("/api/model-status")
def model_status_endpoint():
    return {
        "loaded": pipe is not None,
        "model_type": model_type
    }


@app.get("/api/generation-progress")
def get_generation_progress():
    global generation_progress
    return {"progress": generation_progress}


@app.post("/generate-banner")
async def generate_banner(req: GenerateRequest):
    global generation_progress
    try:
        # Determine aspect ratio description for the prompt
        gen_w = req.width
        gen_h = req.height
        # Clamp to valid SDXL/FLUX multiples of 8
        gen_w = max(256, (gen_w // 8) * 8)
        gen_h = max(256, (gen_h // 8) * 8)

        if gen_w > gen_h * 1.3:
            aspect_desc = "wide cinematic, landscape orientation, 16:9 aspect ratio"
        elif gen_h > gen_w * 1.3:
            aspect_desc = "vertical portrait orientation, tall composition, 9:16 aspect ratio"
        else:
            aspect_desc = "square composition, centered subject, 1:1 aspect ratio"

        banner_prompt = f"background image, {aspect_desc}, {req.prompt}, professional, high quality"
        print(f"Generating image ({model_type}) at {gen_w}x{gen_h} for: {req.prompt}")

        if (model_type == "flux" or model_type == "sdxl") and pipe is not None:
            generation_progress = 0
            
            def progress_callback(pipe_ref, step_index, timestep, callback_kwargs):
                global generation_progress
                generation_progress = int(((step_index + 1) / 4) * 100)
                return callback_kwargs

            import asyncio
            
            def do_generate():
                if model_type == "sdxl":
                    return pipe(
                        prompt=banner_prompt,
                        num_inference_steps=4,
                        guidance_scale=0.0,
                        width=gen_w,
                        height=gen_h,
                        callback_on_step_end=progress_callback
                    )
                else:    
                    return pipe(
                        prompt=banner_prompt,
                        num_inference_steps=4,
                        guidance_scale=0.0,
                        width=gen_w,
                        height=gen_h,
                        max_sequence_length=256,
                        callback_on_step_end=progress_callback
                    )
                
            result = await asyncio.to_thread(do_generate)
            image = result.images[0]
            buffered = BytesIO()
            image.save(buffered, format="PNG")
            img_bytes = buffered.getvalue()
        else:
            # Cloud API fallback
            img_bytes = await generate_via_cloud(banner_prompt, gen_w, gen_h)

        img_str = base64.b64encode(img_bytes).decode("utf-8")

        print("Image generated successfully!")
        return {
            "image": f"data:image/png;base64,{img_str}",
            "model_used": model_type
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

app.mount("/", StaticFiles(directory=frontend_dir), name="frontend")
