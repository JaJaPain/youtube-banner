class HistoryManager {
    constructor(canvas, guides) {
        this.canvas = canvas;
        this.guides = guides;
        this.undoStack = [];
        this.redoStack = [];
        this.isProcessing = false;
        this.maxHistory = 50;
        
        // Bind events
        this.canvas.on('object:added', (e) => this.onObjectModified(e));
        this.canvas.on('object:modified', (e) => this.onObjectModified(e));
        this.canvas.on('object:removed', (e) => this.onObjectModified(e));
        
        // Bind Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea') return;

            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
                e.preventDefault();
                this.redo();
            }
        });
        
        // Bind UI Buttons
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
        
        // Initial state
        setTimeout(() => this.saveHistory(), 100);
    }

    onObjectModified(e) {
        if (this.isProcessing) return;
        // Ignore guide objects from triggering history changes
        if (e.target && e.target.name && e.target.name.startsWith('guide')) return;
        this.saveHistory();
    }

    saveHistory() {
        if (this.isProcessing) return;
        
        const state = JSON.stringify(this.canvas.toJSON(['name', 'selectable', 'evented']));
        
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === state) {
            return;
        }

        this.undoStack.push(state);
        this.redoStack = []; 
        
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        
        this.updateButtons();
    }

    undo() {
        if (this.undoStack.length <= 1) return;

        this.isProcessing = true;
        const currentState = this.undoStack.pop();
        this.redoStack.push(currentState);
        
        const prevState = this.undoStack[this.undoStack.length - 1];

        this.canvas.loadFromJSON(prevState, () => {
             this.canvas.renderAll();
             this.isProcessing = false;
             this.updateButtons();
             if (this.guides) {
                 this.guides.bringToFront();
             }
        });
    }

    redo() {
        if (this.redoStack.length === 0) return;

        this.isProcessing = true;
        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);

        this.canvas.loadFromJSON(nextState, () => {
             this.canvas.renderAll();
             this.isProcessing = false;
             this.updateButtons();
             if (this.guides) {
                 this.guides.bringToFront();
             }
        });
    }
    
    updateButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) {
            const isDisabled = this.undoStack.length <= 1;
            undoBtn.disabled = isDisabled;
            undoBtn.style.opacity = isDisabled ? '0.5' : '1';
            undoBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
        }
        if (redoBtn) {
            const isDisabled = this.redoStack.length === 0;
            redoBtn.disabled = isDisabled;
            redoBtn.style.opacity = isDisabled ? '0.5' : '1';
            redoBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
        }
    }
}
