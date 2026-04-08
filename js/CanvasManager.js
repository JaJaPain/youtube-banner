class CanvasManager {
    constructor() {
        this.wrapper = document.querySelector('.canvas-container-wrapper');
        this.currentPreset = 'yt-banner';
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

    /** Get the active preset config from the global PLATFORM_PRESETS */
    getPreset() {
        return PLATFORM_PRESETS[this.currentPreset];
    }

    /**
     * Switch canvas logical dimensions to match a new preset.
     * Does NOT delete any layers — only resizes the workspace.
     */
    applyPreset(presetId, guidesManager) {
        if (!PLATFORM_PRESETS[presetId]) return;
        this.currentPreset = presetId;

        // Update guides
        guidesManager.setPreset(presetId);

        // Reset the viewport to fit the new dimensions
        this.resetView();

        // Update overlay controls in the footer bar
        this._updateOverlayControls(guidesManager);

        // Update the export hint
        this._updateExportHint();

        // Update the dimension hint under the dropdown
        const preset = this.getPreset();
        const dimsHint = document.getElementById('presetDimsHint');
        if (dimsHint) dimsHint.innerText = `${preset.width} × ${preset.height}px`;
    }

    /** Rebuild the bottom overlay-controls bar to show this preset's guide toggles */
    _updateOverlayControls(guidesManager) {
        const container = document.getElementById('guideTogglesContainer');
        if (!container) return;

        container.innerHTML = '';
        const preset = this.getPreset();

        preset.guides.forEach(g => {
            const label = document.createElement('label');
            label.className = 'overlay-control';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = guidesManager.visible[g.id] !== false;
            cb.addEventListener('change', () => {
                guidesManager.toggle(g.id, cb.checked);
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + g.label));
            container.appendChild(label);
        });
    }

    /** Update the export hint text and size-warning state */
    _updateExportHint() {
        const preset = this.getPreset();
        const hint = document.getElementById('exportHint');
        if (hint) {
            const sizeStr = preset.maxFileSize
                ? `< ${Math.round(preset.maxFileSize / (1024 * 1024))}MB`
                : 'No hard limit';
            hint.innerText = `Target: ${preset.width} × ${preset.height}px | ${sizeStr}`;
        }
        // Hide any previous size warning
        const warn = document.getElementById('sizeWarning');
        if (warn) warn.style.display = 'none';
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

        window.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea') return;

            const panAmount = 40;
            let vpt = this.canvas.viewportTransform;
            let needsRender = false;

            if (e.key === 'ArrowUp')    { e.preventDefault(); vpt[5] += panAmount; needsRender = true; }
            else if (e.key === 'ArrowDown')  { e.preventDefault(); vpt[5] -= panAmount; needsRender = true; }
            else if (e.key === 'ArrowLeft')  { e.preventDefault(); vpt[4] += panAmount; needsRender = true; }
            else if (e.key === 'ArrowRight') { e.preventDefault(); vpt[4] -= panAmount; needsRender = true; }

            if (needsRender) {
                this.canvas.setViewportTransform(vpt);
                this.canvas.requestRenderAll();
            }

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
        const preset = this.getPreset();
        const pw = preset.width;
        const ph = preset.height;

        const scale = Math.min(
            (this.wrapper.clientWidth - 80) / pw,
            (this.wrapper.clientHeight - 80) / ph
        );
        
        this.canvas.setZoom(scale);
        this.canvas.absolutePan({ 
            x: -(this.canvas.width - pw * scale) / 2, 
            y: -(this.canvas.height - ph * scale) / 2 
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
            this.canvas.fire('object:modified');
        }
    }

    async exportBanner(guidesManager) {
        const preset = this.getPreset();
        const exportW = preset.width;
        const exportH = preset.height;

        // Save current view state
        const currentZoom = this.canvas.getZoom();
        const currentVpt = this.canvas.viewportTransform.slice();
        const originalWidth = this.canvas.getWidth();
        const originalHeight = this.canvas.getHeight();

        // Hide all guides
        const savedVisibility = { ...guidesManager.visible };
        Object.keys(savedVisibility).forEach(id => guidesManager.toggle(id, false));

        // Set canvas to export dimensions at zoom 1
        this.canvas.setWidth(exportW);
        this.canvas.setHeight(exportH);
        this.canvas.setZoom(1);
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        this.canvas.renderAll();

        // Read quality slider
        const qualitySlider = document.getElementById('exportQuality');
        let quality = qualitySlider ? parseFloat(qualitySlider.value) : 1.0;

        // Determine format
        const format = preset.defaultFormat || 'image/png';
        const ext = format === 'image/jpeg' ? '.jpg' : '.png';

        // Build filename
        const now = new Date();
        const dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') + '-' +
            String(now.getMinutes()).padStart(2, '0') + '-' +
            String(now.getSeconds()).padStart(2, '0');
        const fileName = `${preset.filePrefix}_${dateStr}${ext}`;

        const rawCanvas = this.canvas.getElement();

        try {
            let blob = await new Promise(resolve => {
                rawCanvas.toBlob(b => resolve(b), format, quality);
            });

            if (!blob) {
                alert('Export failed — the canvas may be tainted by cross-origin images.');
                restoreView(this);
                return;
            }

            // === Size validation ===
            const sizeWarning = document.getElementById('sizeWarning');
            if (preset.maxFileSize && blob.size > preset.maxFileSize) {
                const limitMB = Math.round(preset.maxFileSize / (1024 * 1024));
                const currentMB = (blob.size / (1024 * 1024)).toFixed(2);

                // Auto-retry with JPEG at lower quality
                if (format !== 'image/jpeg' || quality > 0.5) {
                    const retryQuality = Math.max(0.5, quality - 0.2);
                    blob = await new Promise(resolve => {
                        rawCanvas.toBlob(b => resolve(b), 'image/jpeg', retryQuality);
                    });
                }

                if (blob.size > preset.maxFileSize) {
                    if (sizeWarning) {
                        sizeWarning.style.display = 'flex';
                        sizeWarning.innerText = `⚠ File size (${currentMB} MB) exceeds ${limitMB} MB limit for ${preset.label}. Lower the Quality slider and try again.`;
                    }
                    restoreView(this);
                    return;
                } else {
                    if (sizeWarning) sizeWarning.style.display = 'none';
                }
            } else {
                if (sizeWarning) sizeWarning.style.display = 'none';
            }

            // Save the file
            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{ description: `${ext === '.jpg' ? 'JPEG' : 'PNG'} Image`, accept: { [format]: [ext] } }]
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    restoreView(this);
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') { restoreView(this); return; }
                    console.warn('showSaveFilePicker failed, falling back:', err);
                }
            }

            const url = URL.createObjectURL(blob);
            const newTab = window.open(url, '_blank');
            if (newTab) {
                alert(`Your ${preset.label} has opened in a new tab. Right-click the image and select "Save image as..." to download.`);
            } else {
                window.location.href = url;
            }
            restoreView(this);

        } catch (e) {
            console.error('Export error:', e);
            alert('Export error: ' + e.message);
            restoreView(this);
        }

        function restoreView(mgr) {
            mgr.canvas.setWidth(originalWidth);
            mgr.canvas.setHeight(originalHeight);
            mgr.canvas.setZoom(currentZoom);
            mgr.canvas.setViewportTransform(currentVpt);
            Object.keys(savedVisibility).forEach(id => guidesManager.toggle(id, savedVisibility[id]));
        }
    }
}
