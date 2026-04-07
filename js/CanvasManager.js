class CanvasManager {
    constructor() {
        this.wrapper = document.querySelector('.canvas-container-wrapper');
        this.canvas = new fabric.Canvas('canvas', {
            width: this.wrapper.clientWidth - 80,
            height: this.wrapper.clientHeight - 80,
            backgroundColor: '#000000',
            preserveObjectStacking: true,
            fireMiddleClick: true,
            stopContextMenu: true
        });

        this.setupNavigation();
        
        window.addEventListener('resize', () => {
            this.canvas.setDimensions({
                width: this.wrapper.clientWidth - 80,
                height: this.wrapper.clientHeight - 80
            });
            this.resetView();
        });
    }

    setupNavigation() {
        this.canvas.on('mouse:wheel', (opt) => {
            let delta = opt.e.deltaY;
            let zoom = this.canvas.getZoom();
            zoom *= 0.999 ** delta;
            if (zoom > 20) zoom = 20;
            if (zoom < 0.01) zoom = 0.01;
            this.canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
            opt.e.preventDefault();
            opt.e.stopPropagation();
        });

        this.canvas.on('mouse:down', (opt) => {
            let evt = opt.e;
            // Enable dragging if holding Alt, Shift, or pressing middle mouse button (evt.button === 1)
            if (evt.button === 1 || evt.altKey === true || evt.shiftKey === true) {
                this.canvas.isDragging = true;
                this.canvas.selection = false;
                this.canvas.lastPosX = evt.clientX;
                this.canvas.lastPosY = evt.clientY;
                evt.preventDefault();
            }
        });

        this.canvas.on('mouse:move', (opt) => {
            if (this.canvas.isDragging) {
                let e = opt.e;
                let vpt = this.canvas.viewportTransform;
                vpt[4] += e.clientX - this.canvas.lastPosX;
                vpt[5] += e.clientY - this.canvas.lastPosY;
                this.canvas.requestRenderAll();
                this.canvas.lastPosX = e.clientX;
                this.canvas.lastPosY = e.clientY;
            }
        });

        this.canvas.on('mouse:up', (opt) => {
            this.canvas.setViewportTransform(this.canvas.viewportTransform);
            this.canvas.isDragging = false;
            this.canvas.selection = true;
        });

        // Add keyboard shortcuts for panning and zooming
        window.addEventListener('keydown', (e) => {
            // Ignore if user is typing in an input or textarea
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea') return;

            const panAmount = 40;
            let vpt = this.canvas.viewportTransform;
            let needsRender = false;

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                vpt[5] += panAmount;
                needsRender = true;
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                vpt[5] -= panAmount;
                needsRender = true;
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                vpt[4] += panAmount;
                needsRender = true;
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                vpt[4] -= panAmount;
                needsRender = true;
            }

            if (needsRender) {
                this.canvas.setViewportTransform(vpt);
                this.canvas.requestRenderAll();
            }

            // Keyboard Zooming
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                let zoom = this.canvas.getZoom();
                zoom *= 1.1;
                if (zoom > 20) zoom = 20;
                this.canvas.zoomToPoint({ x: this.canvas.width / 2, y: this.canvas.height / 2 }, zoom);
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                let zoom = this.canvas.getZoom();
                zoom /= 1.1;
                if (zoom < 0.01) zoom = 0.01;
                this.canvas.zoomToPoint({ x: this.canvas.width / 2, y: this.canvas.height / 2 }, zoom);
            }
        });
    }

    resetView() {
        const scale = Math.min(
            (this.wrapper.clientWidth - 80) / 2560,
            (this.wrapper.clientHeight - 80) / 1440
        );
        
        this.canvas.setZoom(scale);
        this.canvas.absolutePan({ 
            x: -(this.canvas.width - 2560 * scale) / 2, 
            y: -(this.canvas.height - 1440 * scale) / 2 
        });
    }

    clearCanvas() {
        if (confirm('Clear all layers?')) {
            const objects = this.canvas.getObjects();
            for (let i = objects.length - 1; i >= 0; i--) {
                const obj = objects[i];
                if (!obj.name || !obj.name.startsWith('guide')) {
                    this.canvas.remove(obj);
                }
            }
            this.canvas.setBackgroundColor('#000000', this.canvas.renderAll.bind(this.canvas));
            document.getElementById('bgColor').value = '#000000';
            
            // Allow history to catch this change
            this.canvas.fire('object:modified');
        }
    }

    async exportBanner(guidesManager) {
        // Save current view state
        const currentZoom = this.canvas.getZoom();
        const currentVpt = this.canvas.viewportTransform.slice();
        const originalWidth = this.canvas.getWidth();
        const originalHeight = this.canvas.getHeight();

        // Hide guides
        const desktopVisible = guidesManager.visible.desktop;
        const tabletVisible = guidesManager.visible.tablet;
        const mobileVisible = guidesManager.visible.mobile;
        guidesManager.toggle('desktop', false);
        guidesManager.toggle('tablet', false);
        guidesManager.toggle('mobile', false);

        // Check if thumbnail mode is active
        const isThumb = document.getElementById('isThumbnail').checked;
        
        // Reset zoom for full resolution export
        this.canvas.setWidth(isThumb ? 1280 : 2560);
        this.canvas.setHeight(isThumb ? 720 : 1440);
        if (isThumb) {
            this.canvas.setZoom(0.5);
        } else {
            this.canvas.setZoom(1);
        }
        
        this.canvas.setViewportTransform([isThumb ? 0.5 : 1, 0, 0, isThumb ? 0.5 : 1, 0, 0]);
        this.canvas.renderAll();

        // Build a timestamped filename
        const now = new Date();
        const dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') + '-' +
            String(now.getMinutes()).padStart(2, '0') + '-' +
            String(now.getSeconds()).padStart(2, '0');
        const ext = '.png';
        const mime = 'image/png';
        const quality = 1.0;
        
        const prefix = isThumb ? 'youtube-thumbnail_' : 'youtube-banner_';
        const fileName = prefix + dateStr + ext;

        const rawCanvas = this.canvas.getElement();

        try {
            const blob = await new Promise((resolve) => {
                rawCanvas.toBlob((b) => { resolve(b); }, mime, quality);
            });

            if (!blob) {
                alert('Export failed — the canvas may be tainted by cross-origin images.');
                restoreView(this.canvas);
                return;
            }

            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{ description: 'PNG Image', accept: { [mime]: [ext] } }]
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    restoreView(this.canvas);
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        restoreView(this.canvas);
                        return;
                    }
                    console.warn('showSaveFilePicker failed, falling back:', err);
                }
            }

            const url = URL.createObjectURL(blob);
            const newTab = window.open(url, '_blank');
            if (newTab) {
                alert('Your banner has opened in a new tab. Right-click the image and select "Save image as..." to save it to your Downloads folder.');
            } else {
                window.location.href = url;
            }
            restoreView(this.canvas);

        } catch (e) {
            console.error('Export error:', e);
            alert('Export error: ' + e.message);
            restoreView(this.canvas);
        }

        function restoreView(canvasInstance) {
            canvasInstance.setWidth(originalWidth);
            canvasInstance.setHeight(originalHeight);
            canvasInstance.setZoom(currentZoom);
            canvasInstance.setViewportTransform(currentVpt);
            guidesManager.toggle('desktop', desktopVisible);
            guidesManager.toggle('tablet', tabletVisible);
            guidesManager.toggle('mobile', mobileVisible);
        }
    }
}
