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


def try_load_local_model():
    """Try to load FLUX.1 Schnell NF4 on GPU. Falls back gracefully."""
    global pipe, model_type
    try:
        import torch
        if not torch.cuda.is_available():
            print("No GPU found — will use cloud API.")
            return

        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"GPU Detected: {gpu_name} ({vram_gb:.1f} GB VRAM)")

        from diffusers import FluxPipeline

        model_id = "magespace/FLUX.1-schnell-bnb-nf4"
        print(f"Loading {model_id}...")
        print("(First run will download ~8 GB to D:\\hf_cache — subsequent runs are instant)")

        pipe = FluxPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16
        )
        # We will keep the model entirely on your 12GB VRAM so it doesn't overflow your system RAM
        pipe.to("cuda")
        model_type = "flux-local"
        print("FLUX model loaded successfully on GPU!")

    except Exception as e:
        print(f"Local model load failed: {e}")
        pipe = None


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


class GenerateRequest(BaseModel):
    prompt: str


async def generate_via_cloud(prompt: str) -> bytes:
    """Call HF Inference API to generate an image. Returns raw PNG bytes."""
    headers = {}
    if HF_TOKEN:
        headers["Authorization"] = f"Bearer {HF_TOKEN}"

    payload = {
        "inputs": prompt,
        "parameters": {
            "width": 1024,
            "height": 576,
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
def load_model_endpoint():
    global pipe, model_type
    if pipe is not None:
        return {"status": "already loaded", "model_type": model_type}
    
    try_load_local_model()
    
    if pipe is not None:
        return {"status": "loaded", "model_type": model_type}
    else:
        raise HTTPException(status_code=500, detail="Failed to load local model. Check console for details.")

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
        banner_prompt = f"youtube banner background, wide cinematic, {req.prompt}, professional, high quality, 16:9 aspect ratio"
        print(f"Generating image ({model_type}) for: {req.prompt}")

        if model_type == "flux-local" and pipe is not None:
            generation_progress = 0
            
            def progress_callback(pipe_ref, step_index, timestep, callback_kwargs):
                global generation_progress
                generation_progress = int(((step_index + 1) / 4) * 100)
                return callback_kwargs

            # Local GPU path — fast!
            # Since this runs in async route but blocks thread, 
            # we should execute the actual generation in a threadpool so polling can happen.
            import asyncio
            
            def do_generate():
                return pipe(
                    prompt=banner_prompt,
                    num_inference_steps=4,
                    guidance_scale=0.0,
                    width=1024,
                    height=576,
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
            img_bytes = await generate_via_cloud(banner_prompt)

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
