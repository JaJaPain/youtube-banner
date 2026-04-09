class AIManager {
    constructor(canvas, guides) {
        this.canvas = canvas;
        this.guides = guides;
        this.checkInitialStatus();
    }

    async checkInitialStatus() {
        try {
            const r = await fetch('http://127.0.0.1:8085/api/model-status');
            if (r.ok) {
                const data = await r.json();
                const btn = document.getElementById('aiBtn');
                const toggle = document.getElementById('useLocalModelToggle');
                const warning = document.getElementById('localModelWarning');
                
                if (data.loaded && (data.model_type === 'flux' || data.model_type === 'sdxl' || data.model_type === 'flux-local')) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    toggle.checked = true;
                    
                    const options = document.getElementById('localModelOptions');
                    if (options) options.style.display = 'flex';
                    
                    const select = document.getElementById('localModelSelect');
                    if (select) select.value = data.model_type === 'flux-local' ? 'flux' : data.model_type;

                    warning.style.display = 'block';
                    warning.style.color = '#10b981';
                    warning.innerText = `Model (${data.model_type}) already loaded in backend. Fast generation is active.`;
                } else {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                }
            }
        } catch (e) {
            console.error('Failed to get initial model status', e);
        }
    }

    async toggleLocalModel() {
        const toggle = document.getElementById('useLocalModelToggle');
        const options = document.getElementById('localModelOptions');
        const warning = document.getElementById('localModelWarning');
        const btn = document.getElementById('aiBtn');
        
        if (toggle.checked) {
            options.style.display = 'flex';
        } else {
            options.style.display = 'none';
            warning.style.display = 'none';
            btn.disabled = true; // Disable if unchecked as a safety measure
            btn.style.opacity = '0.5';
        }
    }

    async loadSelectedLocalModel() {
        const modelPick = document.getElementById('localModelSelect').value;
        const warning = document.getElementById('localModelWarning');
        const btn = document.getElementById('aiBtn');
        const loadBtn = document.getElementById('loadBtn');
        
        warning.style.display = 'block';
        warning.style.color = '#f59e0b'; // orange
        warning.innerText = "Please wait... Go grab a cup of coffee, I'll turn green and let you know when your model is loaded into VRAM.";
        btn.disabled = true;
        btn.style.opacity = '0.5';
        loadBtn.disabled = true;
        
        try {
            const response = await fetch('http://127.0.0.1:8085/api/load-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_type: modelPick })
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to load local model');
            }
            warning.style.color = '#10b981'; // green
            warning.innerText = 'Model loaded successfully! Fast generation is now active.';
            btn.disabled = false;
            btn.style.opacity = '1';
        } catch (e) {
            console.error(e);
            warning.style.color = '#ef4444'; // red
            warning.innerText = `Error loading model: ${e.message}`;
            btn.disabled = true;
            btn.style.opacity = '0.5';
        } finally {
            loadBtn.disabled = false;
        }
    }

    async generateAIBanner() {
        const promptInput = document.getElementById('aiPrompt');
        const prompt = promptInput.value.trim();
        if (!prompt) {
            alert('Please enter a prompt first.');
            return;
        }

        const btn = document.getElementById('aiBtn');
        const btnText = document.getElementById('aiBtnText');
        const originalText = btnText.innerText;
        
        btn.disabled = true;
        btnText.innerText = 'Generating AI Background...';
        btn.style.opacity = '0.7';

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
            }, 2000);
        }

        try {
            // Get generation dimensions from the active preset
            const preset = canvasManager ? canvasManager.getPreset() : { genWidth: 1024, genHeight: 576 };
            const genW = preset.genWidth || 1024;
            const genH = preset.genHeight || 576;

            const response = await fetch('http://127.0.0.1:8085/generate-banner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt, width: genW, height: genH })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to generate image');
            }

            const data = await response.json();
            
            fabric.Image.fromURL(data.image, (img) => {
                const preset = canvasManager ? canvasManager.getPreset() : { width: 2560, height: 1440 };
                const scale = Math.max(preset.width / img.width, preset.height / img.height);
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
                
                // Allow history to save this background addition
                this.canvas.fire('object:added', {target: img});

            }, { crossOrigin: 'anonymous' });
            
            if (toggle.checked) {
                warning.style.color = '#10b981';
                warning.innerText = 'Generation complete! Model loaded and ready.';
            }
        } catch (error) {
            alert('Error: ' + error.message);
            if (toggle.checked) {
                warning.style.color = '#10b981';
                warning.innerText = 'Model loaded successfully! Fast generation is now active.';
            }
        } finally {
            if (progressInterval) clearInterval(progressInterval);
            btn.disabled = false;
            btnText.innerText = originalText;
            btn.style.opacity = '1';
        }
    }
}
