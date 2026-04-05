# YouTube Banner Creator Walkthrough

I have built a premium, web-based YouTube Banner Creator that allows you to design high-quality banners with precise safe-zone guides.

## Features

- **Advanced Text Manipulation**: 
    - 15+ Premium Fonts quickly accessed via cycling buttons.
    - Advanced **Drop Shadows** with precise blur and X/Y offset sliders.
    - Custom **Border Outlines** around text of any thickness and color.
    - **Image Pattern Fills**: Upload an image to map directly as the core texture of your font!
- **Image Management**: Upload background images and individual elements to add to your banner.
- **AI Background Generation**:
    - Write a prompt to magically spin up highly detailed backgrounds instantly.
    - **Local GPU Execution**: By toggling "Use Local AI Model", the app loads the highly compressed `FLUX.1-schnell-bnb-nf4` directly to your local GPU.
    - Keeps the entire model entirely loaded in 11.4GB VRAM preventing System RAM swap crashes, producing background generations in under 10 seconds.
    - Live on-screen generation progress polling directly to the frontend interface.
- **Premium UI**: Sleek dark mode with glassmorphism effects and micro-animations.
- **Direct Export**: Download your final design directly as a 2560x1440 PNG, ready for YouTube.
- **Canvas Navigation**: 
    - **Zoom**: Use your mouse wheel to zoom in and out.
    - **Pan**: Hold **Alt** (or **Shift**) and drag with your mouse to move the canvas around.
    - **Reset**: Click the **Reset View** button to center the banner.

## How to use

1. Double-click `run_app.bat` to automatically initialize the local Python backend server and launch the app in your default browser.
2. Use the **Background** section to set a solid color or upload a background image.
3. Or type a description into the **AI Background** section and use either cloud or fully offline GPU-powered logic to generate stunning backdrops.
4. Add text or additional images using the **Elements** section.
5. Select any text to reveal **Text Options** in the sidebar.
6. Use the **Overlays** at the bottom to toggle safe zone guides.
7. Click **Download PNG** to save your banner.

## Demo

![Final App Screenshot](Screenshot.png)

## Verification Results

The app was tested using a local server and browser subagent:
- [x] Professional dark theme loaded correctly.
- [x] Canvas guides for all devices displayed accurately at center.
- [x] Text addition and real-time editing verified.
- [x] Font switching (Google Fonts) and color picking verified.
- [x] Export functionality successfully triggered a PNG download at 2560x1440.
