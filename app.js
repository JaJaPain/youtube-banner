// app.js
let canvasManager;
let historyManager;
let aiManager;
let uiManager;
let guides;

document.addEventListener('DOMContentLoaded', () => {
    // Increase JSON precision to ensure small transformations are captured in Undo History
    fabric.Object.NUM_FRACTION_DIGITS = 6;
    
    canvasManager = new CanvasManager();
    const canvas = canvasManager.canvas;
    
    // Initialize guides
    guides = new BannerGuides(canvas);
    guides.init();

    historyManager = new HistoryManager(canvas, guides);
    aiManager = new AIManager(canvas, guides);
    uiManager = new UIManager(canvasManager, historyManager, aiManager, guides);

    // Global forwards for HTML onclick attributes
    window.historyManager = historyManager;
    window.addText = () => uiManager.addText();
    window.clearCanvas = () => canvasManager.clearCanvas();
    window.exportBanner = () => canvasManager.exportBanner(guides);
    window.generateAIBanner = () => aiManager.generateAIBanner();
    window.toggleLocalModel = () => aiManager.toggleLocalModel();
    window.loadSelectedLocalModel = () => aiManager.loadSelectedLocalModel();
    window.resetView = () => canvasManager.resetView();
    // Expose uiManager globally for HTML buttons
    window.uiManager = uiManager;

    // Global keyboard listeners
    document.addEventListener('keydown', (e) => {
        // Prevent deletion if the user is typing in an input or textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            uiManager.deleteSelected();
        }
    });
});
