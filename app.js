let canvas;
let guides;

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    setupEventListeners();
});

function initCanvas() {
    const wrapper = document.querySelector('.canvas-container-wrapper');
    
    // Set canvas size to match container but keep internal 2560x1440 logic
    canvas = new fabric.Canvas('canvas', {
        width: wrapper.clientWidth - 80,
        height: wrapper.clientHeight - 80,
        backgroundColor: '#000000',
        preserveObjectStacking: true
    });

    // Initialize guides (pass dimensions)
    guides = new BannerGuides(canvas);
    guides.init();

    setupNavigation();
    resetView();

    window.addEventListener('resize', () => {
        canvas.setDimensions({
            width: wrapper.clientWidth - 80,
            height: wrapper.clientHeight - 80
        });
        resetView();
    });

    // Interaction events
    canvas.on('selection:created', onObjectSelected);
    canvas.on('selection:updated', onObjectSelected);
    canvas.on('selection:cleared', onObjectCleared);
}

function setupNavigation() {
    // Zooming
    canvas.on('mouse:wheel', function(opt) {
        let delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
    });

    // Panning (Space + Drag or Alt + Drag)
    canvas.on('mouse:down', function(opt) {
        let evt = opt.e;
        if (evt.altKey === true || evt.shiftKey === true) {
            this.isDragging = true;
            this.selection = false;
            this.lastPosX = evt.clientX;
            this.lastPosY = evt.clientY;
        }
    });

    canvas.on('mouse:move', function(opt) {
        if (this.isDragging) {
            let e = opt.e;
            let vpt = this.viewportTransform;
            vpt[4] += e.clientX - this.lastPosX;
            vpt[5] += e.clientY - this.lastPosY;
            this.requestRenderAll();
            this.lastPosX = e.clientX;
            this.lastPosY = e.clientY;
        }
    });

    canvas.on('mouse:up', function(opt) {
        this.setViewportTransform(this.viewportTransform);
        this.isDragging = false;
        this.selection = true;
    });
}

function resetView() {
    const wrapper = document.querySelector('.canvas-container-wrapper');
    const scale = Math.min(
        (wrapper.clientWidth - 80) / 2560,
        (wrapper.clientHeight - 80) / 1440
    );
    
    canvas.setZoom(scale);
    canvas.absolutePan({ 
        x: -(canvas.width - 2560 * scale) / 2, 
        y: -(canvas.height - 1440 * scale) / 2 
    });
}

function setupEventListeners() {
    // BG Color
    document.getElementById('bgColor').addEventListener('input', (e) => {
        canvas.setBackgroundColor(e.target.value, canvas.renderAll.bind(canvas));
    });

    // BG Upload
    document.getElementById('bgUpload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                // Scale image to cover virtual 2560x1440 canvas
                const scale = Math.max(2560 / img.width, 1440 / img.height);
                img.set({
                    scaleX: scale,
                    scaleY: scale,
                    left: 0,
                    top: 0,
                    selectable: false,
                    evented: false,
                    name: 'background'
                });
                
                // Remove old background if exists
                const oldBg = canvas.getObjects().find(obj => obj.name === 'background');
                if (oldBg) canvas.remove(oldBg);
                
                canvas.insertAt(img, 0);
                canvas.renderAll();
            });
        };
        reader.readAsDataURL(file);
    });

    // Image Upload
    document.getElementById('imgUpload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                img.scaleToWidth(400);
                img.set({
                    left: 2560 / 2,
                    top: 1440 / 2,
                    originX: 'center',
                    originY: 'center'
                });
                canvas.add(img);
                canvas.setActiveObject(img);
                guides.bringToFront();
            });
        };
        reader.readAsDataURL(file);
    });

    // Text controls
    document.getElementById('textInput').addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text') {
            active.set('text', e.target.value);
            canvas.renderAll();
        }
    });

    document.getElementById('fontFamily').addEventListener('change', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text') {
            active.set('fontFamily', e.target.value);
            canvas.renderAll();
        }
    });

    document.getElementById('fontSize').addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text') {
            active.set('fontSize', parseInt(e.target.value));
            canvas.renderAll();
        }
    });

    document.getElementById('textColor').addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active && (active.type === 'i-text' || active.type === 'text')) {
            active.set('fill', e.target.value);
            canvas.renderAll();
        }
    });

    document.getElementById('textShadow').addEventListener('change', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text') {
            if (e.target.checked) {
                active.set('shadow', new fabric.Shadow({
                    color: 'rgba(0,0,0,0.6)',
                    blur: 15,
                    offsetX: 8,
                    offsetY: 8
                }));
            } else {
                active.set('shadow', null);
            }
            canvas.renderAll();
        }
    });

    // Guide toggles
    document.getElementById('showDesktop').addEventListener('change', (e) => guides.toggle('desktop', e.target.checked));
    document.getElementById('showTablet').addEventListener('change', (e) => guides.toggle('tablet', e.target.checked));
    document.getElementById('showMobile').addEventListener('change', (e) => guides.toggle('mobile', e.target.checked));
}

function addText() {
    const text = new fabric.IText('Your Channel Name', {
        left: 2560/2,
        top: 1440/2,
        fontFamily: 'Inter',
        fontSize: 120,
        fill: '#ffffff',
        originX: 'center',
        originY: 'center',
        textAlign: 'center'
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    guides.bringToFront();
}

function onObjectSelected(e) {
    const obj = e.selected[0];
    if (obj.type === 'i-text') {
        const controls = document.getElementById('textControls');
        controls.style.display = 'block';
        document.getElementById('textInput').value = obj.text;
        document.getElementById('fontSize').value = obj.fontSize;
        document.getElementById('fontFamily').value = obj.fontFamily;
        document.getElementById('textColor').value = obj.fill;
        document.getElementById('textShadow').checked = !!obj.shadow;
    } else {
        document.getElementById('textControls').style.display = 'none';
    }
}

function onObjectCleared() {
    document.getElementById('textControls').style.display = 'none';
}

function exportBanner() {
    // Save current view state
    const currentZoom = canvas.getZoom();
    const currentVpt = canvas.viewportTransform.slice();
    const originalWidth = canvas.getWidth();
    const originalHeight = canvas.getHeight();

    // Hide guides
    const desktopVisible = guides.visible.desktop;
    const tabletVisible = guides.visible.tablet;
    const mobileVisible = guides.visible.mobile;
    guides.toggle('desktop', false);
    guides.toggle('tablet', false);
    guides.toggle('mobile', false);

    // Reset zoom for full resolution export
    canvas.setWidth(2560);
    canvas.setHeight(1440);
    canvas.setZoom(1);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.renderAll();

    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1
    });

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'youtube-banner.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Restore view state
    canvas.setWidth(originalWidth);
    canvas.setHeight(originalHeight);
    canvas.setZoom(currentZoom);
    canvas.setViewportTransform(currentVpt);
    guides.toggle('desktop', desktopVisible);
    guides.toggle('tablet', tabletVisible);
    guides.toggle('mobile', mobileVisible);
}

function clearCanvas() {
    if (confirm('Clear all layers?')) {
        const objects = canvas.getObjects();
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (obj.name !== 'guide-desktop' && obj.name !== 'guide-tablet' && obj.name !== 'guide-mobile') {
                canvas.remove(obj);
            }
        }
        canvas.setBackgroundColor('#000000', canvas.renderAll.bind(canvas));
        document.getElementById('bgColor').value = '#000000';
    }
}

async function generateAIBanner() {
    const promptInput = document.getElementById('aiPrompt');
    const prompt = promptInput.value.trim();
    if (!prompt) {
        alert('Please enter a prompt first.');
        return;
    }

    const btn = document.getElementById('aiBtn');
    const btnText = document.getElementById('aiBtnText');
    const originalText = btnText.innerText;
    
    // Set loading state
    btn.disabled = true;
    btnText.innerText = 'Generating AI Background...';
    btn.style.opacity = '0.7';

    try {
        const response = await fetch('http://127.0.0.1:8085/generate-banner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to generate image');
        }

        const data = await response.json();
        
        fabric.Image.fromURL(data.image, (img) => {
            // Scale image to cover virtual 2560x1440 canvas
            const scale = Math.max(2560 / img.width, 1440 / img.height);
            img.set({
                scaleX: scale,
                scaleY: scale,
                left: 0,
                top: 0,
                selectable: false,
                evented: false,
                name: 'background'
            });
            
            const oldBg = canvas.getObjects().find(obj => obj.name === 'background');
            if (oldBg) canvas.remove(oldBg);
            
            canvas.insertAt(img, 0);
            canvas.renderAll();
        });
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        // Reset state
        btn.disabled = false;
        btnText.innerText = originalText;
        btn.style.opacity = '1';
    }
}
