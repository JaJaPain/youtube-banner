let canvas;
let guides;

window.cycleFont = function(direction) {
    const select = document.getElementById('fontFamily');
    let idx = select.selectedIndex + direction;
    if (idx < 0) idx = select.options.length - 1;
    if (idx >= select.options.length) idx = 0;
    select.selectedIndex = idx;
    
    // Trigger the change event manually to update the canvas
    select.dispatchEvent(new Event('change'));
};

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

    function updateShadow() {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text' && document.getElementById('textShadow').checked) {
            active.set('shadow', new fabric.Shadow({
                color: document.getElementById('shadowColor').value,
                blur: parseInt(document.getElementById('shadowBlur').value) || 0,
                offsetX: parseInt(document.getElementById('shadowOffsetX').value) || 0,
                offsetY: parseInt(document.getElementById('shadowOffsetY').value) || 0
            }));
            canvas.renderAll();
        }
    }

    document.getElementById('textShadow').addEventListener('change', (e) => {
        const active = canvas.getActiveObject();
        const config = document.getElementById('shadowConfig');
        if (e.target.checked) {
            config.style.display = 'flex';
            updateShadow();
        } else {
            config.style.display = 'none';
            if (active && active.type === 'i-text') {
                active.set('shadow', null);
                canvas.renderAll();
            }
        }
    });

    document.getElementById('shadowColor').addEventListener('input', updateShadow);
    document.getElementById('shadowBlur').addEventListener('input', updateShadow);
    document.getElementById('shadowOffsetX').addEventListener('input', updateShadow);
    document.getElementById('shadowOffsetY').addEventListener('input', updateShadow);

    // Text Border
    document.getElementById('textBorder').addEventListener('change', (e) => {
        const active = canvas.getActiveObject();
        const config = document.getElementById('borderConfig');
        if (e.target.checked) {
            config.style.display = 'flex';
            if (active && active.type === 'i-text') {
                active.set({
                    stroke: document.getElementById('textBorderColor').value,
                    strokeWidth: parseInt(document.getElementById('textBorderWidth').value),
                    paintFirst: 'stroke' // Puts stroke outside the fill
                });
                canvas.renderAll();
            }
        } else {
            config.style.display = 'none';
            if (active && active.type === 'i-text') {
                active.set({ stroke: null, strokeWidth: 0 });
                canvas.renderAll();
            }
        }
    });

    document.getElementById('textBorderColor').addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text' && document.getElementById('textBorder').checked) {
            active.set('stroke', e.target.value);
            canvas.renderAll();
        }
    });

    document.getElementById('textBorderWidth').addEventListener('input', (e) => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text' && document.getElementById('textBorder').checked) {
            active.set('strokeWidth', parseInt(e.target.value));
            canvas.renderAll();
        }
    });

    // Text Image Fill
    document.getElementById('textFillUpload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            const active = canvas.getActiveObject();
            if (active && active.type === 'i-text') {
                fabric.Image.fromURL(f.target.result, (img) => {
                    const pattern = new fabric.Pattern({
                        source: img.getElement(),
                        repeat: 'repeat'
                    });
                    active.set('fill', pattern);
                    document.getElementById('removeTextFillBtn').style.display = 'block';
                    canvas.renderAll();
                });
            }
            e.target.value = ''; // Reset
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('removeTextFillBtn').addEventListener('click', () => {
        const active = canvas.getActiveObject();
        if (active && active.type === 'i-text') {
            const color = document.getElementById('textColor').value;
            active.set('fill', color);
            document.getElementById('removeTextFillBtn').style.display = 'none';
            canvas.renderAll();
        }
    });


    // Guide toggles
    document.getElementById('showDesktop').addEventListener('change', (e) => { guides.toggle('desktop', e.target.checked); checkThumbnailDisabled(e.target); });
    document.getElementById('showTablet').addEventListener('change', (e) => { guides.toggle('tablet', e.target.checked); checkThumbnailDisabled(e.target); });
    document.getElementById('showMobile').addEventListener('change', (e) => { guides.toggle('mobile', e.target.checked); checkThumbnailDisabled(e.target); });

    document.getElementById('isThumbnail').addEventListener('change', (e) => {
        const isThumb = e.target.checked;
        if (isThumb) {
            // Uncheck other guides
            document.getElementById('showDesktop').checked = false;
            document.getElementById('showTablet').checked = false;
            document.getElementById('showMobile').checked = false;
            guides.toggle('desktop', false);
            guides.toggle('tablet', false);
            guides.toggle('mobile', false);
            
            // Update export hints
            document.getElementById('exportHint').innerText = 'Target: 1280 x 720px | < 2MB';
            document.getElementById('exportBtnText').innerText = 'Download PNG';
        } else {
            document.getElementById('exportHint').innerText = 'Target: 2560 x 1440px | < 6MB';
            document.getElementById('exportBtnText').innerText = 'Download PNG';
        }
    });

    function checkThumbnailDisabled(target) {
        if (target.checked) {
            const thumb = document.getElementById('isThumbnail');
            if (thumb.checked) {
                thumb.checked = false;
                document.getElementById('exportHint').innerText = 'Target: 2560 x 1440px | < 6MB';
                document.getElementById('exportBtnText').innerText = 'Download PNG';
            }
        }
    }
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
        
        // Restore Shadow UI
        const hasShadow = !!obj.shadow;
        document.getElementById('textShadow').checked = hasShadow;
        if (hasShadow) {
            document.getElementById('shadowConfig').style.display = 'flex';
            document.getElementById('shadowColor').value = obj.shadow.color || '#000000';
            document.getElementById('shadowBlur').value = obj.shadow.blur || 0;
            document.getElementById('shadowOffsetX').value = obj.shadow.offsetX || 0;
            document.getElementById('shadowOffsetY').value = obj.shadow.offsetY || 0;
        } else {
            document.getElementById('shadowConfig').style.display = 'none';
        }
        
        // Restore Fill / Pattern UI
        if (obj.fill instanceof fabric.Pattern) {
            document.getElementById('removeTextFillBtn').style.display = 'block';
            // Leave textColor picker as is, it shouldn't overwrite the pattern unless toggled
        } else {
            document.getElementById('textColor').value = obj.fill;
            document.getElementById('removeTextFillBtn').style.display = 'none';
        }

        // Restore Border UI
        const hasBorder = !!obj.strokeWidth && obj.strokeWidth > 0;
        document.getElementById('textBorder').checked = hasBorder;
        if (hasBorder) {
            document.getElementById('borderConfig').style.display = 'flex';
            document.getElementById('textBorderColor').value = obj.stroke;
            document.getElementById('textBorderWidth').value = obj.strokeWidth;
        } else {
            document.getElementById('borderConfig').style.display = 'none';
        }
    } else {
        document.getElementById('textControls').style.display = 'none';
    }
}

function onObjectCleared() {
    document.getElementById('textControls').style.display = 'none';
}

async function exportBanner() {
    // Save current view state
    var currentZoom = canvas.getZoom();
    var currentVpt = canvas.viewportTransform.slice();
    var originalWidth = canvas.getWidth();
    var originalHeight = canvas.getHeight();

    // Hide guides
    var desktopVisible = guides.visible.desktop;
    var tabletVisible = guides.visible.tablet;
    var mobileVisible = guides.visible.mobile;
    guides.toggle('desktop', false);
    guides.toggle('tablet', false);
    guides.toggle('mobile', false);

    // Check if thumbnail mode is active
    var isThumb = document.getElementById('isThumbnail').checked;
    
    // Reset zoom for full resolution export
    canvas.setWidth(isThumb ? 1280 : 2560);
    canvas.setHeight(isThumb ? 720 : 1440);
    if (isThumb) {
        // We zoom to 0.5 because the original elements are placed for 2560x1440
        canvas.setZoom(0.5);
    } else {
        canvas.setZoom(1);
    }
    
    canvas.setViewportTransform([isThumb ? 0.5 : 1, 0, 0, isThumb ? 0.5 : 1, 0, 0]);
    canvas.renderAll();

    // Build a timestamped filename
    var now = new Date();
    var dateStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') + '-' +
        String(now.getMinutes()).padStart(2, '0') + '-' +
        String(now.getSeconds()).padStart(2, '0');
    var ext = '.png';
    var mime = 'image/png';
    var quality = 1.0;
    
    var prefix = isThumb ? 'youtube-thumbnail_' : 'youtube-banner_';
    var fileName = prefix + dateStr + ext;

    // Get the blob from the raw canvas
    var rawCanvas = canvas.getElement();

    try {
        var blob = await new Promise(function(resolve) {
            rawCanvas.toBlob(function(b) { resolve(b); }, mime, quality);
        });

        if (!blob) {
            alert('Export failed — the canvas may be tainted by cross-origin images.');
            restoreView();
            return;
        }

        // METHOD 1: Native File System Access API (opens real Windows "Save As" dialog)
        if (window.showSaveFilePicker) {
            try {
                var fileHandle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'PNG Image',
                        accept: { [mime]: [ext] }
                    }]
                });
                var writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                restoreView();
                return;
            } catch (err) {
                // User cancelled the save dialog — that's fine, just restore
                if (err.name === 'AbortError') {
                    restoreView();
                    return;
                }
                // If showSaveFilePicker failed for another reason, fall through to method 2
                console.warn('showSaveFilePicker failed, falling back:', err);
            }
        }

        // METHOD 2: Open image in a new tab so user can right-click > Save As
        var url = URL.createObjectURL(blob);
        var newTab = window.open(url, '_blank');
        if (newTab) {
            alert('Your banner has opened in a new tab. Right-click the image and select "Save image as..." to save it to your Downloads folder.');
        } else {
            // Popup blocker caught it — last resort: replace current page
            window.location.href = url;
        }
        restoreView();

    } catch (e) {
        console.error('Export error:', e);
        alert('Export error: ' + e.message);
        restoreView();
    }

    function restoreView() {
        canvas.setWidth(originalWidth);
        canvas.setHeight(originalHeight);
        canvas.setZoom(currentZoom);
        canvas.setViewportTransform(currentVpt);
        guides.toggle('desktop', desktopVisible);
        guides.toggle('tablet', tabletVisible);
        guides.toggle('mobile', mobileVisible);
    }
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

async function toggleLocalModel() {
    const toggle = document.getElementById('useLocalModelToggle');
    const warning = document.getElementById('localModelWarning');
    const btn = document.getElementById('aiBtn');
    
    if (toggle.checked) {
        warning.style.display = 'block';
        warning.style.color = '#f59e0b'; // orange
        warning.innerText = "Please wait... Go grab a cup of coffee, I'll turn green and let you know when your model is loaded into VRAM.";
        btn.disabled = true;
        
        try {
            const response = await fetch('http://127.0.0.1:8085/api/load-model', {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('Failed to load local model');
            }
            warning.style.color = '#10b981'; // green
            warning.innerText = 'Model loaded successfully! Fast generation is now active.';
        } catch (e) {
            console.error(e);
            warning.style.color = '#ef4444'; // red
            warning.innerText = 'Error loading local model. Falling back to cloud.';
            toggle.checked = false;
        } finally {
            btn.disabled = false;
        }
    } else {
        warning.style.display = 'none';
        // if they uncheck it, backend might still have it loaded, but next requests will just use it. 
        // We could implement an unload endpoint, but let's leave it in memory for now.
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

    // Show progress meter area if local mode might be active
    const warning = document.getElementById('localModelWarning');
    const toggle = document.getElementById('useLocalModelToggle');
    let progressInterval = null;
    
    if (toggle.checked) {
        warning.style.display = 'block';
        warning.style.color = '#3b82f6'; // blue
        warning.innerText = 'Generating image: 0%...';
        
        progressInterval = setInterval(async () => {
            try {
                const r = await fetch('http://127.0.0.1:8085/api/generation-progress');
                if (r.ok) {
                    const pd = await r.json();
                    warning.innerText = `Generating image: ${pd.progress}%...`;
                }
            } catch (e) {}
        }, 500);
    }

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
        
        fabric.Image.fromURL(data.image, function(img) {
            // Scale image to cover virtual 2560x1440 canvas
            var scale = Math.max(2560 / img.width, 1440 / img.height);
            img.set({
                scaleX: scale,
                scaleY: scale,
                left: 0,
                top: 0,
                selectable: false,
                evented: false,
                name: 'background'
            });
            
            var oldBg = canvas.getObjects().find(function(obj) { return obj.name === 'background'; });
            if (oldBg) canvas.remove(oldBg);
            
            canvas.insertAt(img, 0);
            canvas.renderAll();
        }, { crossOrigin: 'anonymous' });
        
        if (toggle.checked) {
            warning.style.color = '#10b981'; // green
            warning.innerText = 'Generation complete! Model loaded and ready.';
        }
    } catch (error) {
        alert('Error: ' + error.message);
        if (toggle.checked) {
            warning.style.color = '#10b981'; // green
            warning.innerText = 'Model loaded successfully! Fast generation is now active.';
        }
    } finally {
        if (progressInterval) clearInterval(progressInterval);
        // Reset state
        btn.disabled = false;
        btnText.innerText = originalText;
        btn.style.opacity = '1';
    }
}
