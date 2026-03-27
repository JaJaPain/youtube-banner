from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import torch
import base64
from io import BytesIO
from diffusers import FluxPipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Using a FLUX.1 Schnell NF4 checkpoint specifically meant for low-VRAM environments
model_id = "magespace/FLUX.1-schnell-bnb-nf4"

print("Loading FLUX.1 Schnell NF4 model... This may take a moment to download on first run.")
try:
    pipe = FluxPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16
    )
    # Enable CPU offload to keep VRAM usage minimal (fits in 8GB)
    pipe.enable_model_cpu_offload() 
    print("Model loaded successfully.")
except Exception as e:
    print(f"Failed to load model: {e}")
    pipe = None

class GenerateRequest(BaseModel):
    prompt: str

@app.post("/generate-banner")
async def generate_banner(req: GenerateRequest):
    if pipe is None:
        raise HTTPException(status_code=500, detail="The AI model failed to load.")
    
    try:
        print(f"Generating image for prompt: {req.prompt}")
        # Generate 1024x576 (16:9 ratio) using 4 steps for 'schnell'
        result = pipe(
            prompt=req.prompt,
            num_inference_steps=4,
            guidance_scale=0.0,
            width=1024,
            height=576,
            max_sequence_length=256
        )
        image = result.images[0]

        # Convert image to Base64 to send to the browser
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return {"image": f"data:image/png;base64,{img_str}"}
    except Exception as e:
        print(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
