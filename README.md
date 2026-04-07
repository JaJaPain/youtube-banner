# YouTube Banner Creator - Premium Suite

A professional, high-performance web application designed for creating stunned YouTube banners (2560x1440) and thumbnails. This suite features a modularized architecture, offline-first AI generation capabilities, and a robust undo/redo history system.

## 🚀 Key Features

### 🎨 Advanced Design Tools
- **Rich Text Engine**: 
    - 15+ Premium fonts with instant cycling.
    - Advanced **Drop Shadows** (Blur, X/Y Offset).
    - Dynamic **Border Outlines** (Thickness & Color).
    - **Image Pattern Fills**: Map any uploaded image directly onto your text characters.
- **Canvas Navigation**: 
    - **Zooming**: Smooth mouse wheel zoom or keyboard `+`/`-` keys.
    - **Panning**: Middle-mouse button drag, Arrow Keys, or Alt/Shift+Drag.
    - **Reset View**: Instant centering and scaling of the banner viewport.
- **Safe Zone Guides**: Precise overlays for Mobile, Tablet, and Desktop "Safe Areas" to ensure your design looks perfect on every device.

### 🤖 Local & Cloud AI Generation
- **Dual Local GPU Models**: Choose your power level based on your hardware:
    - **FLUX.1 Schnell**: State-of-the-art geometry and text spelling (Requires ~12GB VRAM).
    - **SDXL Lightning**: Ultra-fast 4-step generation for rapid iteration (Requires ~8GB VRAM).
- **Performance Optimized**: Uses `local_files_only` logic to bypass Hugging Face network stalls, resulting in near-instant model loading from disk. 
- **Safety First**: VRAM is automatically flushed during model swaps, and the generation button is locked until the model is confirmed active in memory.
- **Cloud Fallback**: Automatically falls back to high-quality cloud inference if no local GPU is detected.

### 🛠 Technical Excellence
- **Modular Frontend**: Refactored into discrete managers (`CanvasManager`, `UIManager`, `AIManager`, `HistoryManager`) for high maintainability.
- **Undo/Redo System**: Robust command-pattern history tracking for every action (adding elements, moving, resizing, coloring). 
    - Accessible via UI buttons or standard `Ctrl+Z` / `Ctrl+Y`.
- **High-Res Export**: Generates a flattened 2560x1440 PNG with one click, perfectly sized for YouTube's upload requirements.

## 📦 Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/JaJaPain/youtube-banner.git
   ```
2. **Environment Setup**:
   - Ensure you have **Python 3.10+** installed.
   - The app automatically creates a virtual environment on first run.
3. **Launch**:
   - Simply double-click `run_app.bat`. This will:
     - Initialize the FastAPI backend.
     - Detect your GPU and prepare the local environment.
     - Launch the frontend in your default browser.

## 📖 How to Use

1. **Set your Background**: Use a solid color, upload an image, or describe your vision in the **AI Background** box.
2. **Pick your AI Model**: If using a local GPU, select your model from the dropdown and hit **Load Selected Model**.
3. **Add Elements**: Create text blocks or upload foreground images/logos.
4. **Style**: Click any element to reveal the dynamic styling sidebar. Adjust fonts, patterns, and shadows in real-time.
5. **Preview**: Toggle the **Overlays** at the bottom to ensure your text stays within the "Safe Area" for mobile viewers.
6. **Download**: Click **Download PNG** to save your high-resolution masterpiece.

## 🧪 Requirements
- **OS**: Windows (tested)
- **GPU (for Local AI)**: NVIDIA RTX series (8GB+ VRAM recommended for SDXL, 12GB+ for FLUX).
- **Backend Dependencies**: `fastapi`, `diffusers`, `torch`, `peft`, `transformers`, `accelerate`.

---
*Built with ❤️ for Creators.*
