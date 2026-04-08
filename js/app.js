// app.js
let canvasManager;
let historyManager;
let aiManager;
let uiManager;
let guides;

document.addEventListener('DOMContentLoaded', () => {
    // Increase JSON precision to ensure small transformations are captured in Undo History
    fabric.Object.NUM_FRACTION_DIGITS = 6;

    // Apply global non-destructive context filter mask
    const originalRender = fabric.Object.prototype.render;
    fabric.Object.prototype.render = function(ctx) {
        let hasFilter = false;
        if (this.effects) {
            const { brightness = 100, contrast = 100, blur = 0 } = this.effects;
            if (brightness !== 100 || contrast !== 100 || blur !== 0) {
                ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) blur(${blur}px)`;
                hasFilter = true;
            }
        }
        originalRender.call(this, ctx);
        if (hasFilter) {
            ctx.filter = 'none';
        }
    };
    
    canvasManager = new CanvasManager();
    const canvas = canvasManager.canvas;
    
    // Initialize guides (defaults to yt-banner preset)
    guides = new BannerGuides(canvas);
    guides.init();

    historyManager = new HistoryManager(canvas, guides);
    aiManager = new AIManager(canvas, guides);
    uiManager = new UIManager(canvasManager, historyManager, aiManager, guides);

    // Global forwards for HTML onclick/onchange attributes
    window.historyManager = historyManager;
    window.addText = () => uiManager.addText();
    window.clearCanvas = () => canvasManager.clearCanvas();
    window.exportBanner = () => canvasManager.exportBanner(guides);
    window.generateAIBanner = () => aiManager.generateAIBanner();
    window.toggleLocalModel = () => aiManager.toggleLocalModel();
    window.loadSelectedLocalModel = () => aiManager.loadSelectedLocalModel();
    window.resetView = () => canvasManager.resetView();
    window.uiManager = uiManager;

    /** Called when the Canvas Preset dropdown changes */
    window.applyPreset = (selectElement) => {
        const presetId = selectElement.value;
        canvasManager.applyPreset(presetId, guides);
        canvasManager.resetView();
    };

    /** Quality slider display sync */
    const qSlider = document.getElementById('exportQuality');
    const qVal = document.getElementById('qualityVal');
    if (qSlider && qVal) {
        qSlider.addEventListener('input', () => {
            qVal.innerText = parseFloat(qSlider.value).toFixed(1);
        });
    }

    // Initialize overlay controls for the default preset
    canvasManager._updateOverlayControls(guides);
    canvasManager._updateExportHint();

    // Global keyboard listeners
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            uiManager.deleteSelected();
        }
    });
});
