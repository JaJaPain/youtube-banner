class BannerGuides {
    constructor(canvas) {
        this.canvas = canvas;
        this.guides = {
            desktop: null,
            tablet: null,
            mobile: null
        };
        this.visible = {
            desktop: true,
            tablet: true,
            mobile: true
        };
        
        // Dimensions based on 2560x1440 
        this.dims = {
            full: { w: 2560, h: 1440 },
            desktop: { w: 2560, h: 423 },
            tablet: { w: 1855, h: 423 },
            mobile: { w: 1546, h: 423 }
        };
    }

    init() {
        this.render();
    }

    render() {
        // Remove existing guides
        if (this.guides.desktop) this.canvas.remove(this.guides.desktop);
        if (this.guides.tablet) this.canvas.remove(this.guides.tablet);
        if (this.guides.mobile) this.canvas.remove(this.guides.mobile);

        const centerY = (this.dims.full.h - 423) / 2;

        // Desktop (Max width, 423 height)
        if (this.visible.desktop) {
            this.guides.desktop = new fabric.Rect({
                left: 0,
                top: centerY,
                width: 2560,
                height: 423,
                fill: 'rgba(255, 255, 255, 0.05)',
                stroke: 'rgba(255, 255, 255, 0.2)',
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
                name: 'guide-desktop'
            });
            this.canvas.add(this.guides.desktop);
        }

        // Tablet (1855 width, centered)
        if (this.visible.tablet) {
            const tabletX = (2560 - 1855) / 2;
            this.guides.tablet = new fabric.Rect({
                left: tabletX,
                top: centerY,
                width: 1855,
                height: 423,
                fill: 'rgba(255, 255, 255, 0.05)',
                stroke: 'rgba(255, 255, 255, 0.4)',
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
                name: 'guide-tablet'
            });
            this.canvas.add(this.guides.tablet);
        }

        // Mobile Safe Area (1546 width, centered)
        if (this.visible.mobile) {
            const mobileX = (2560 - 1546) / 2;
            this.guides.mobile = new fabric.Rect({
                left: mobileX,
                top: centerY,
                width: 1546,
                height: 423,
                fill: 'rgba(255, 255, 255, 0.1)',
                stroke: 'rgba(255, 255, 255, 0.8)',
                strokeWidth: 1,
                selectable: false,
                evented: false,
                name: 'guide-mobile'
            });
            this.canvas.add(this.guides.mobile);
        }

        this.canvas.requestRenderAll();
    }

    toggle(type, isVisible) {
        this.visible[type] = isVisible;
        this.render();
    }

    bringToFront() {
        if (this.guides.desktop) this.canvas.bringToFront(this.guides.desktop);
        if (this.guides.tablet) this.canvas.bringToFront(this.guides.tablet);
        if (this.guides.mobile) this.canvas.bringToFront(this.guides.mobile);
    }
}
