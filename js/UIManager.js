class UIManager {
    constructor(canvasManager, historyManager, aiManager, guides) {
        this.canvasManager = canvasManager;
        this.canvas = canvasManager.canvas;
        this.historyManager = historyManager;
        this.aiManager = aiManager;
        this.guides = guides;
        
        this.setupEventListeners();
        this.setupLayersList();
    }

    async saveProject() {
        const objects = this.canvas.getObjects();
        const projectData = {
            version: '1.0',
            backgroundColor: this.canvas.backgroundColor,
            layers: []
        };

        // Gather all layers while ensuring images are embedded as Base64
        const layerPromises = objects.map(async (obj) => {
            // Ignore guides
            if (obj.name && obj.name.startsWith('guide-')) return null;

            // Use fabric toJSON but ensure we get the custom properties we need
            // Fabric 5.x toObject includes many properties, but let's be explicit
            const extraProps = ['name', 'id', 'selectable', 'evented', 'shadow', 'stroke', 'strokeWidth', 'paintFirst', 'effects'];
            const data = obj.toObject(extraProps);
            
            // Handle cross-origin images or local files to ensure Base64 in JSON
            if (obj.type === 'image') {
                const element = obj.getElement();
                if (element && element.src) {
                    if (!element.src.startsWith('data:')) {
                        try {
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = element.naturalWidth || element.width;
                            tempCanvas.height = element.naturalHeight || element.height;
                            const ctx = tempCanvas.getContext('2d');
                            ctx.drawImage(element, 0, 0);
                            data.src = tempCanvas.toDataURL('image/png');
                        } catch (e) {
                            console.warn('Could not convert image to Base64 (tainted canvas?), using original src:', e);
                        }
                    }
                }
            }
            
            // Special handling for text with pattern fills
            if (obj.fill instanceof fabric.Pattern && obj.fill.source) {
                const source = obj.fill.source;
                if (source instanceof HTMLImageElement && !source.src.startsWith('data:')) {
                    try {
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = source.naturalWidth || source.width;
                        tempCanvas.height = source.naturalHeight || source.height;
                        const ctx = tempCanvas.getContext('2d');
                        ctx.drawImage(source, 0, 0);
                        data.fillPatternSrc = tempCanvas.toDataURL('image/png');
                    } catch (e) {
                        console.warn('Could not convert pattern source to Base64:', e);
                    }
                } else if (source instanceof HTMLImageElement) {
                    data.fillPatternSrc = source.src;
                }
            }

            return data;
        });

        const resolvedLayers = await Promise.all(layerPromises);
        projectData.layers = resolvedLayers.filter(l => l !== null);

        const jsonString = JSON.stringify(projectData);
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10) + '_' + now.getHours() + '-' + now.getMinutes();
        const fileName = `banner-project-${dateStr}.jjp`;
        
        // Use the Modern File System Access API if available
        if (window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'BannerCraft Project File',
                        accept: { 'application/json': ['.jjp'] }
                    }]
                });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonString);
                await writable.close();
            } catch (err) {
                // Ignore AbortError (user cancelled)
                if (err.name !== 'AbortError') {
                    console.error('File saving failed:', err);
                    alert('Failed to save file: ' + err.message);
                }
            }
        } else {
            // Fallback for older browsers
            const blob = new Blob([jsonString], { type: 'application/json' });
            if (window.saveAs) {
                saveAs(blob, fileName);
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        }
    }

    async loadProject(file) {
        if (!file) return;
        
        // Show loading state if needed
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // Clear existing non-guide layers
                const currentObjects = this.canvas.getObjects();
                for (let i = currentObjects.length - 1; i >= 0; i--) {
                    const obj = currentObjects[i];
                    if (!obj.name || !obj.name.startsWith('guide-')) {
                        this.canvas.remove(obj);
                    }
                }

                // Restore background
                if (data.backgroundColor) {
                    this.canvas.setBackgroundColor(data.backgroundColor, this.canvas.renderAll.bind(this.canvas));
                    const bgColorInput = document.getElementById('bgColor');
                    if (bgColorInput) bgColorInput.value = data.backgroundColor;
                }

                // Fabric enlivenObjects is good for reconstructing from JSON objects
                // However, we want to maintain the layer order exactly as saved.
                // We'll process them one by one to ensure proper sequence if there are async image loads.
                for (const layerData of data.layers) {
                    await new Promise((resolve) => {
                        if (layerData.type === 'image') {
                            fabric.Image.fromURL(layerData.src, (img) => {
                                img.set(layerData);
                                // Ensure background images are handled correctly
                                if (layerData.name === 'background') {
                                    this.canvas.insertAt(img, 0);
                                } else {
                                    this.canvas.add(img);
                                }
                                resolve();
                            }, { crossOrigin: 'anonymous' });
                        } else if (layerData.type === 'i-text' || layerData.type === 'text') {
                            const text = new fabric.IText(layerData.text || '', layerData);
                            
                            // Restore pattern if it was present
                            if (layerData.fillPatternSrc) {
                                fabric.Image.fromURL(layerData.fillPatternSrc, (img) => {
                                    const pattern = new fabric.Pattern({
                                        source: img.getElement(),
                                        repeat: 'repeat'
                                    });
                                    text.set('fill', pattern);
                                    this.canvas.add(text);
                                    resolve();
                                });
                            } else {
                                this.canvas.add(text);
                                resolve();
                            }
                        } else {
                            // Fallback for other standard Fabric types
                            fabric.util.enlivenObjects([layerData], (enlivened) => {
                                enlivened.forEach(obj => this.canvas.add(obj));
                                resolve();
                            });
                        }
                    });
                }

                // Finalize restoration
                if (this.guides) this.guides.bringToFront();
                this.canvas.renderAll();
                this.updateLayersList();
                
                // Fire object:modified so HistoryManager records this state
                this.canvas.fire('object:modified');
                
                alert('Project loaded successfully!');
            } catch (err) {
                console.error('Error parsing project file:', err);
                alert('Oops! That .jjp file seems corrupted or invalid.');
            }
        };
        reader.readAsText(file);
    }

    setupLayersList() {
        this.updateLayersList();
        
        // Listen to canvas events to update the list
        this.canvas.on('object:added', () => this.updateLayersList());
        this.canvas.on('object:removed', () => this.updateLayersList());
        this.canvas.on('object:modified', () => this.updateLayersList());
        
        // Update selection states in real-time
        this.canvas.on('selection:created', () => this.updateLayersList());
        this.canvas.on('selection:updated', () => this.updateLayersList());
        this.canvas.on('selection:cleared', () => this.updateLayersList());
    }

    updateLayersList() {
        const container = document.getElementById('layersListContainer');
        if (!container) return;

        // Clear existing items
        container.innerHTML = '';

        // Get objects. Filter out background and guides if necessary, but keep images and text.
        // Fabric js has objects in back-to-front order. Reverse to show top layer first.
        const objects = [...this.canvas.getObjects()].reverse();
        
        const validObjects = objects.filter(obj => {
            return obj.name !== 'background' && !(obj.name && obj.name.startsWith('guide-'));
        });

        if (validObjects.length === 0) {
            container.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-secondary); text-align: center; padding: 8px;">No elements added yet</div>';
            return;
        }

        const activeObject = this.canvas.getActiveObject();
        const activeObjects = this.canvas.getActiveObjects ? this.canvas.getActiveObjects() : (activeObject ? [activeObject] : []);

        validObjects.forEach(obj => {
            const item = document.createElement('div');
            item.style.padding = '6px 8px';
            item.style.fontSize = '0.8rem';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '4px';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            item.style.transition = 'all 0.1s ease';

            const isActive = activeObjects.includes(obj);
            if (isActive) {
                item.style.backgroundColor = 'var(--primary-color)';
                item.style.color = '#fff';
            } else {
                item.style.backgroundColor = 'transparent';
                item.style.color = 'var(--text-secondary)';
                item.onmouseenter = () => item.style.backgroundColor = 'rgba(255,255,255,0.1)';
                item.onmouseleave = () => item.style.backgroundColor = 'transparent';
            }

            // Determine label and icon
            let labelText = 'Object';
            let iconData = 'square';
            if (obj.type === 'i-text' || obj.type === 'text') {
                labelText = obj.text && obj.text.length > 20 ? obj.text.substring(0, 20) + '...' : (obj.text || 'Text');
                iconData = 'type';
            } else if (obj.type === 'image') {
                labelText = 'Image Element';
                iconData = 'image';
            }

            const label = document.createElement('span');
            label.style.whiteSpace = 'nowrap';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.flex = '1';
            label.innerText = labelText;

            item.innerHTML = `<i data-lucide="${iconData}" style="width: 14px; height: 14px; flex-shrink: 0;"></i>`;
            item.appendChild(label);

            // Reorder controls
            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '2px';
            controls.style.marginLeft = 'auto';

            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'btn btn-secondary';
            moveUpBtn.style.padding = '2px 4px';
            moveUpBtn.style.fontSize = '0.7rem';
            moveUpBtn.innerHTML = '<i data-lucide="chevron-up" style="width: 12px; height: 12px;"></i>';
            moveUpBtn.title = "Move Up (Brighter/Frontend)";
            moveUpBtn.onclick = (e) => {
                e.stopPropagation();
                this.canvas.bringForward(obj);
                if (this.guides) this.guides.bringToFront();
                this.canvas.renderAll();
                this.updateLayersList();
                this.canvas.fire('object:modified', {target: obj});
            };

            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'btn btn-secondary';
            moveDownBtn.style.padding = '2px 4px';
            moveDownBtn.style.fontSize = '0.7rem';
            moveDownBtn.innerHTML = '<i data-lucide="chevron-down" style="width: 12px; height: 12px;"></i>';
            moveDownBtn.title = "Move Down (Darker/Backend)";
            moveDownBtn.onclick = (e) => {
                e.stopPropagation();
                // We shouldn't send it behind the background (index 0 usually).
                // Find all non-background/non-guide objects
                const objects = this.canvas.getObjects();
                const bgIdx = objects.findIndex(o => o.name === 'background');
                const currIdx = objects.indexOf(obj);
                
                if (currIdx > bgIdx + 1) {
                    this.canvas.sendBackwards(obj);
                    if (this.guides) this.guides.bringToFront();
                    this.canvas.renderAll();
                    this.updateLayersList();
                    this.canvas.fire('object:modified', {target: obj});
                }
            };

            controls.appendChild(moveUpBtn);
            controls.appendChild(moveDownBtn);
            item.appendChild(controls);
            
            item.onclick = () => {
                this.canvas.setActiveObject(obj);
                this.canvas.renderAll();
                this.canvas.fire('selection:created', { selected: [obj] });
            };

            container.appendChild(item);
        });

        // Re-inject icons
        if (window.lucide) {
            lucide.createIcons({root: container});
        }
    }

    setupEventListeners() {
        const bgInput = document.getElementById('bgColor');
        if (bgInput) {
            bgInput.addEventListener('input', (e) => {
                this.canvas.setBackgroundColor(e.target.value, this.canvas.renderAll.bind(this.canvas));
                this.canvas.fire('object:modified');
            });
        }

        const bgUpload = document.getElementById('bgUpload');
        if (bgUpload) {
            bgUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (f) => {
                    fabric.Image.fromURL(f.target.result, (img) => {
                        const p = this.canvasManager.getPreset();
                        const scale = Math.max(p.width / img.width, p.height / img.height);
                        img.set({
                            scaleX: scale,
                            scaleY: scale,
                            left: p.width / 2,
                            top: p.height / 2,
                            originX: 'center',
                            originY: 'center',
                            selectable: false,
                            evented: false,
                            name: 'background'
                        });
                        
                        const oldBg = this.canvas.getObjects().find(obj => obj.name === 'background');
                        if (oldBg) this.canvas.remove(oldBg);
                        
                        this.canvas.insertAt(img, 0);
                        this.canvas.renderAll();
                        this.canvas.fire('object:added', {target: img});
                    });
                };
                reader.readAsDataURL(file);
            });
        }

        const imgUpload = document.getElementById('imgUpload');
        if (imgUpload) {
            imgUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (f) => {
                    fabric.Image.fromURL(f.target.result, (img) => {
                        const p = this.canvasManager.getPreset();
                        img.scaleToWidth(Math.min(400, p.width * 0.3));
                        img.set({
                            left: p.width / 2,
                            top: p.height / 2,
                            originX: 'center',
                            originY: 'center'
                        });
                        this.canvas.add(img);
                        this.canvas.setActiveObject(img);
                        if (this.guides) this.guides.bringToFront();
                    });
                };
                reader.readAsDataURL(file);
            });
        }

        const textInput = document.getElementById('textInput');
        if (textInput) {
            textInput.addEventListener('input', (e) => {
                const active = this.canvas.getActiveObject();
                if (active && active.type === 'i-text') {
                    active.set('text', e.target.value);
                    this.canvas.renderAll();
                }
            });
        }

        const fontFamily = document.getElementById('fontFamily');
        if (fontFamily) {
            fontFamily.addEventListener('change', (e) => {
                const active = this.canvas.getActiveObject();
                if (active && active.type === 'i-text') {
                    active.set('fontFamily', e.target.value);
                    this.canvas.renderAll();
                    this.canvas.fire('object:modified', {target: active});
                }
            });
        }

        const fontSize = document.getElementById('fontSize');
        if (fontSize) {
            fontSize.addEventListener('input', (e) => {
                const active = this.canvas.getActiveObject();
                if (active && active.type === 'i-text') {
                    active.set('fontSize', parseInt(e.target.value));
                    this.canvas.renderAll();
                }
            });
            fontSize.addEventListener('change', (e) => {
                const active = this.canvas.getActiveObject();
                if (active) this.canvas.fire('object:modified', {target: active});
            });
        }

        const textColor = document.getElementById('textColor');
        if (textColor) {
            textColor.addEventListener('input', (e) => {
                const active = this.canvas.getActiveObject();
                if (active && (active.type === 'i-text' || active.type === 'text')) {
                    active.set('fill', e.target.value);
                    this.canvas.renderAll();
                }
            });
            textColor.addEventListener('change', (e) => {
                const active = this.canvas.getActiveObject();
                if (active) this.canvas.fire('object:modified', {target: active});
            });
        }

        const updateShadow = () => {
            const active = this.canvas.getActiveObject();
            const textShadow = document.getElementById('textShadow');
            if (active && active.type === 'i-text' && textShadow && textShadow.checked) {
                active.set('shadow', new fabric.Shadow({
                    color: document.getElementById('shadowColor').value,
                    blur: parseInt(document.getElementById('shadowBlur').value) || 0,
                    offsetX: parseInt(document.getElementById('shadowOffsetX').value) || 0,
                    offsetY: parseInt(document.getElementById('shadowOffsetY').value) || 0
                }));
                this.canvas.renderAll();
            }
        };

        const textShadow = document.getElementById('textShadow');
        if (textShadow) {
            textShadow.addEventListener('change', (e) => {
                const active = this.canvas.getActiveObject();
                const config = document.getElementById('shadowConfig');
                if (e.target.checked) {
                    config.style.display = 'flex';
                    updateShadow();
                    if (active) this.canvas.fire('object:modified', {target: active});
                } else {
                    config.style.display = 'none';
                    if (active && active.type === 'i-text') {
                        active.set('shadow', null);
                        this.canvas.renderAll();
                        this.canvas.fire('object:modified', {target: active});
                    }
                }
            });
        }

        const shadowInputs = ['shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY'];
        shadowInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateShadow);
                el.addEventListener('change', () => {
                    const active = this.canvas.getActiveObject();
                    if (active) this.canvas.fire('object:modified', {target: active});
                });
            }
        });

        const textBorder = document.getElementById('textBorder');
        if (textBorder) {
            textBorder.addEventListener('change', (e) => {
                const active = this.canvas.getActiveObject();
                const config = document.getElementById('borderConfig');
                if (e.target.checked) {
                    config.style.display = 'flex';
                    if (active && active.type === 'i-text') {
                        active.set({
                            stroke: document.getElementById('textBorderColor').value,
                            strokeWidth: parseInt(document.getElementById('textBorderWidth').value),
                            paintFirst: 'stroke'
                        });
                        this.canvas.renderAll();
                        this.canvas.fire('object:modified', {target: active});
                    }
                } else {
                    config.style.display = 'none';
                    if (active && active.type === 'i-text') {
                        active.set({ stroke: null, strokeWidth: 0 });
                        this.canvas.renderAll();
                        this.canvas.fire('object:modified', {target: active});
                    }
                }
            });
        }

        const textBorderColor = document.getElementById('textBorderColor');
        if (textBorderColor) {
            textBorderColor.addEventListener('input', (e) => {
                const active = this.canvas.getActiveObject();
                if (active && active.type === 'i-text' && document.getElementById('textBorder').checked) {
                    active.set('stroke', e.target.value);
                    this.canvas.renderAll();
                }
            });
            textBorderColor.addEventListener('change', () => {
                const active = this.canvas.getActiveObject();
                if (active) this.canvas.fire('object:modified', {target: active});
            });
        }

        const textBorderWidth = document.getElementById('textBorderWidth');
        if (textBorderWidth) {
            textBorderWidth.addEventListener('input', (e) => {
                const active = this.canvas.getActiveObject();
                if (active && active.type === 'i-text' && document.getElementById('textBorder').checked) {
                    active.set('strokeWidth', parseInt(e.target.value));
                    this.canvas.renderAll();
                }
            });
            textBorderWidth.addEventListener('change', () => {
                const active = this.canvas.getActiveObject();
                if (active) this.canvas.fire('object:modified', {target: active});
            });
        }

        const textFillUpload = document.getElementById('textFillUpload');
        if (textFillUpload) {
            textFillUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (f) => {
                    const active = this.canvas.getActiveObject();
                    if (active && active.type === 'i-text') {
                        fabric.Image.fromURL(f.target.result, (img) => {
                            const pattern = new fabric.Pattern({
                                source: img.getElement(),
                                repeat: 'repeat'
                            });
                            active.set('fill', pattern);
                            document.getElementById('removeTextFillBtn').style.display = 'block';
                            this.canvas.renderAll();
                            this.canvas.fire('object:modified', {target: active});
                        });
                    }
                    e.target.value = '';
                };
                reader.readAsDataURL(file);
            });
        }

        const removeTextFillBtn = document.getElementById('removeTextFillBtn');
        if (removeTextFillBtn) {
            removeTextFillBtn.addEventListener('click', () => {
                const active = this.canvas.getActiveObject();
                if (active && active.type === 'i-text') {
                    const color = document.getElementById('textColor').value;
                    active.set('fill', color);
                    removeTextFillBtn.style.display = 'none';
                    this.canvas.renderAll();
                    this.canvas.fire('object:modified', {target: active});
                }
            });
        }

        // Guide toggles are now dynamically managed by CanvasManager._updateOverlayControls()

        const updateEffects = () => {
            const active = this.canvas.getActiveObject();
            if (active) {
                if (!active.effects) active.effects = { brightness: 100, contrast: 100, blur: 0 };
                
                const b = document.getElementById('brightnessSlider').value;
                const c = document.getElementById('contrastSlider').value;
                const bl = document.getElementById('blurSlider').value;
                
                active.effects.brightness = parseInt(b);
                active.effects.contrast = parseInt(c);
                active.effects.blur = parseInt(bl);
                
                document.getElementById('brightnessVal').innerText = b + '%';
                document.getElementById('contrastVal').innerText = c + '%';
                document.getElementById('blurVal').innerText = bl + 'px';
                
                active.set('dirty', true);
                this.canvas.renderAll();
            }
        };

        ['brightnessSlider', 'contrastSlider', 'blurSlider'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateEffects);
                el.addEventListener('change', () => {
                    const active = this.canvas.getActiveObject();
                    if (active) this.canvas.fire('object:modified', {target: active});
                });
            }
        });

        const projectLoad = document.getElementById('projectLoad');
        if (projectLoad) {
            projectLoad.addEventListener('change', (e) => {
                this.loadProject(e.target.files[0]);
                // Clear value so user can load same file again if they want
                e.target.value = '';
            });
        }

        this.canvas.on('selection:created', this.onObjectSelected.bind(this));
        this.canvas.on('selection:updated', this.onObjectSelected.bind(this));
        this.canvas.on('selection:cleared', this.onObjectCleared.bind(this));
        
        window.cycleFont = (direction) => {
            const select = document.getElementById('fontFamily');
            if (select) {
                let idx = select.selectedIndex + direction;
                if (idx < 0) idx = select.options.length - 1;
                if (idx >= select.options.length) idx = 0;
                select.selectedIndex = idx;
                select.dispatchEvent(new Event('change'));
            }
        };
    }

    addText() {
        const p = this.canvasManager.getPreset();
        const text = new fabric.IText('Your Channel Name', {
            left: p.width / 2,
            top: p.height / 2,
            fontFamily: 'Inter',
            fontSize: 120,
            fill: '#ffffff',
            originX: 'center',
            originY: 'center',
            textAlign: 'center'
        });
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        if (this.guides) this.guides.bringToFront();
    }

    onObjectSelected(e) {
        const obj = e.selected[0];
        const selectionControls = document.getElementById('selectionControls');
        const textControls = document.getElementById('textControls');
        const layerEffectsPanel = document.getElementById('layerEffectsPanel');
        
        if (obj) {
            if (selectionControls) selectionControls.style.display = 'block';
            if (layerEffectsPanel) layerEffectsPanel.style.display = 'block';

            // Sync Effects Sliders
            const effects = obj.effects || { brightness: 100, contrast: 100, blur: 0 };
            document.getElementById('brightnessSlider').value = effects.brightness;
            document.getElementById('brightnessVal').innerText = effects.brightness + '%';
            document.getElementById('contrastSlider').value = effects.contrast;
            document.getElementById('contrastVal').innerText = effects.contrast + '%';
            document.getElementById('blurSlider').value = effects.blur;
            document.getElementById('blurVal').innerText = effects.blur + 'px';
            
            if (obj.type === 'i-text') {
                if (textControls) textControls.style.display = 'block';
                
                const textInput = document.getElementById('textInput');
                if (textInput) textInput.value = obj.text;
                
                const fontSize = document.getElementById('fontSize');
                if (fontSize) fontSize.value = obj.fontSize;
                
                const fontFamily = document.getElementById('fontFamily');
                if (fontFamily) fontFamily.value = obj.fontFamily;
                
                const hasShadow = !!obj.shadow;
                const textShadow = document.getElementById('textShadow');
                if (textShadow) textShadow.checked = hasShadow;
                
                const shadowConfig = document.getElementById('shadowConfig');
                if (hasShadow) {
                    if (shadowConfig) shadowConfig.style.display = 'flex';
                    if (document.getElementById('shadowColor')) document.getElementById('shadowColor').value = obj.shadow.color || '#000000';
                    if (document.getElementById('shadowBlur')) document.getElementById('shadowBlur').value = obj.shadow.blur || 0;
                    if (document.getElementById('shadowOffsetX')) document.getElementById('shadowOffsetX').value = obj.shadow.offsetX || 0;
                    if (document.getElementById('shadowOffsetY')) document.getElementById('shadowOffsetY').value = obj.shadow.offsetY || 0;
                } else {
                    if (shadowConfig) shadowConfig.style.display = 'none';
                }
                
                const removeTextFillBtn = document.getElementById('removeTextFillBtn');
                const textColor = document.getElementById('textColor');
                if (obj.fill instanceof fabric.Pattern) {
                    if (removeTextFillBtn) removeTextFillBtn.style.display = 'block';
                } else {
                    if (textColor) textColor.value = obj.fill;
                    if (removeTextFillBtn) removeTextFillBtn.style.display = 'none';
                }

                const hasBorder = !!obj.strokeWidth && obj.strokeWidth > 0;
                const textBorder = document.getElementById('textBorder');
                if (textBorder) textBorder.checked = hasBorder;
                
                const borderConfig = document.getElementById('borderConfig');
                if (hasBorder) {
                    if (borderConfig) borderConfig.style.display = 'flex';
                    if (document.getElementById('textBorderColor')) document.getElementById('textBorderColor').value = obj.stroke;
                    if (document.getElementById('textBorderWidth')) document.getElementById('textBorderWidth').value = obj.strokeWidth;
                } else {
                    if (borderConfig) borderConfig.style.display = 'none';
                }
            } else {
                if (textControls) textControls.style.display = 'none';
            }
        }
    }

    onObjectCleared() {
        const selectionControls = document.getElementById('selectionControls');
        const textControls = document.getElementById('textControls');
        const layerEffectsPanel = document.getElementById('layerEffectsPanel');
        if (selectionControls) selectionControls.style.display = 'none';
        if (textControls) textControls.style.display = 'none';
        if (layerEffectsPanel) layerEffectsPanel.style.display = 'none';
    }

    resetEffects() {
        const active = this.canvas.getActiveObject();
        if (active) {
            active.effects = { brightness: 100, contrast: 100, blur: 0 };
            
            document.getElementById('brightnessSlider').value = 100;
            document.getElementById('brightnessVal').innerText = '100%';
            document.getElementById('contrastSlider').value = 100;
            document.getElementById('contrastVal').innerText = '100%';
            document.getElementById('blurSlider').value = 0;
            document.getElementById('blurVal').innerText = '0px';
            
            active.set('dirty', true);
            this.canvas.renderAll();
            this.canvas.fire('object:modified', {target: active});
        }
    }

    deleteSelected() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject) return;

        if (confirm("Are you sure you want to delete this element?")) {
            this.canvas.remove(activeObject);
            this.canvas.discardActiveObject();
            this.canvas.renderAll();
            this.updateLayersList();
            this.canvas.fire('object:modified'); // Trigger history save
        }
    }
}
