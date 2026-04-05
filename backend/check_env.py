import torch
import sys

print(f"Python: {sys.version}")
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"CUDA device: {torch.cuda.get_device_name(0)}")
else:
    print("CUDA NOT AVAILABLE. Model will be extremely slow on CPU.")

try:
    import diffusers
    print(f"Diffusers version: {diffusers.__version__}")
except ImportError:
    print("Diffusers NOT INSTALLED")

try:
    import transformers
    print(f"Transformers version: {transformers.__version__}")
except ImportError:
    print("Transformers NOT INSTALLED")

try:
    import accelerate
    print("Accelerate IS INSTALLED")
except ImportError:
    print("Accelerate NOT INSTALLED")

try:
    import bitsandbytes
    print("Bitsandbytes IS INSTALLED")
except ImportError:
    print("Bitsandbytes NOT INSTALLED")

try:
    import torchvision
    print("Torchvision IS INSTALLED")
except ImportError:
    print("Torchvision NOT INSTALLED")
