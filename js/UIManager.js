class UIManager {
    constructor(canvasManager, historyManager, aiManager, guides) {
        this.canvasManager = canvasManager;
        this.canvas = canvasManager.canvas;
        this.historyManager = historyManager;
        this.aiManager = aiManager;
        this.guides = guides;
        
        this.setupEventListeners();
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
                        img.scaleToWidth(400);
                        img.set({
                            left: 2560 / 2,
                            top: 1440 / 2,
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

        const checkThumbnailDisabled = (target) => {
            if (target.checked) {
                const thumb = document.getElementById('isThumbnail');
                if (thumb && thumb.checked) {
                    thumb.checked = false;
                    document.getElementById('exportHint').innerText = 'Target: 2560 x 1440px | < 6MB';
                    document.getElementById('exportBtnText').innerText = 'Download PNG';
                }
            }
        };

        const showDesktop = document.getElementById('showDesktop');
        if (showDesktop) showDesktop.addEventListener('change', (e) => { 
            if (this.guides) this.guides.toggle('desktop', e.target.checked); 
            checkThumbnailDisabled(e.target); 
        });

        const showTablet = document.getElementById('showTablet');
        if (showTablet) showTablet.addEventListener('change', (e) => { 
            if (this.guides) this.guides.toggle('tablet', e.target.checked); 
            checkThumbnailDisabled(e.target); 
        });

        const showMobile = document.getElementById('showMobile');
        if (showMobile) showMobile.addEventListener('change', (e) => { 
            if (this.guides) this.guides.toggle('mobile', e.target.checked); 
            checkThumbnailDisabled(e.target); 
        });

        const isThumbnail = document.getElementById('isThumbnail');
        if (isThumbnail) {
            isThumbnail.addEventListener('change', (e) => {
                const isThumb = e.target.checked;
                if (isThumb) {
                    if (document.getElementById('showDesktop')) document.getElementById('showDesktop').checked = false;
                    if (document.getElementById('showTablet')) document.getElementById('showTablet').checked = false;
                    if (document.getElementById('showMobile')) document.getElementById('showMobile').checked = false;
                    if (this.guides) {
                        this.guides.toggle('desktop', false);
                        this.guides.toggle('tablet', false);
                        this.guides.toggle('mobile', false);
                    }
                    if (document.getElementById('exportHint')) document.getElementById('exportHint').innerText = 'Target: 1280 x 720px | < 2MB';
                    if (document.getElementById('exportBtnText')) document.getElementById('exportBtnText').innerText = 'Download PNG';
                } else {
                    if (document.getElementById('exportHint')) document.getElementById('exportHint').innerText = 'Target: 2560 x 1440px | < 6MB';
                    if (document.getElementById('exportBtnText')) document.getElementById('exportBtnText').innerText = 'Download PNG';
                }
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
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        if (this.guides) this.guides.bringToFront();
    }

    onObjectSelected(e) {
        const obj = e.selected[0];
        const controls = document.getElementById('textControls');
        if (obj && obj.type === 'i-text') {
            if (controls) controls.style.display = 'block';
            
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
            if (controls) controls.style.display = 'none';
        }
    }

    onObjectCleared() {
        const controls = document.getElementById('textControls');
        if (controls) controls.style.display = 'none';
    }
}
