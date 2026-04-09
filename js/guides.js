// =============================================================================
// Platform Presets — Canonical dimensions, guide configs, and export constraints
// =============================================================================
const PLATFORM_PRESETS = {
    'yt-banner': {
        label: 'YouTube Banner',
        width: 2560,
        height: 1440,
        genWidth: 1024, genHeight: 576,   // 16:9 landscape
        filePrefix: 'youtube-banner',
        maxFileSize: 6 * 1024 * 1024,  // 6 MB
        defaultFormat: 'image/png',
        hint: 'YouTube crops your banner differently on Desktop, Tablet, and Mobile. The Safe Area (green) is visible on ALL devices — keep text and logos inside it.',
        guides: [
            { id: 'desktop', label: 'Desktop Area (2560×423)',   w: 2560, h: 423, color: 'rgba(59,130,246,0.6)',   fill: 'rgba(59,130,246,0.06)',  strokeWidth: 2, centered: true },
            { id: 'tablet',  label: 'Tablet Area (1855×423)',    w: 1855, h: 423, color: 'rgba(168,85,247,0.7)',   fill: 'rgba(168,85,247,0.06)', strokeWidth: 2, centered: true },
            { id: 'mobile',  label: 'Safe Area (1546×423)',      w: 1546, h: 423, color: 'rgba(34,197,94,0.85)',   fill: 'rgba(34,197,94,0.08)',  strokeWidth: 2, centered: true }
        ]
    },
    'yt-thumbnail': {
        label: 'YouTube Thumbnail',
        width: 1280,
        height: 720,
        genWidth: 1024, genHeight: 576,   // 16:9 landscape
        filePrefix: 'youtube-thumbnail',
        maxFileSize: 2 * 1024 * 1024,
        defaultFormat: 'image/png',
        hint: 'YouTube may slightly crop thumbnail edges on some views. Keep important text and faces inside the Safe Area.',
        guides: [
            { id: 'safe', label: 'Safe Area (1152×648)', w: 1152, h: 648, color: 'rgba(255,255,255,0.6)', fill: 'rgba(255,255,255,0.05)', centered: true }
        ]
    },
    'x-header': {
        label: 'X Header',
        width: 1500,
        height: 500,
        genWidth: 1024, genHeight: 344,   // 3:1 ultra-wide
        filePrefix: 'x-header',
        maxFileSize: 2 * 1024 * 1024,  // X enforces 2 MB
        defaultFormat: 'image/jpeg',
        hint: 'Your X profile picture overlaps the bottom-left (blue circle). Avoid placing text there. The Content Safe Area is where your design will be fully visible.',
        guides: [
            { id: 'avatar', label: 'Profile Avatar Zone', type: 'circle', cx: 210, cy: 425, radius: 75, color: 'rgba(29,155,240,0.7)', fill: 'rgba(29,155,240,0.08)' },
            { id: 'safe',   label: 'Content Safe Area',  w: 1380, h: 420, color: 'rgba(255,255,255,0.4)', fill: 'rgba(255,255,255,0.05)', centered: true }
        ]
    },
    'x-post': {
        label: 'X Post',
        width: 1200,
        height: 675,
        genWidth: 1024, genHeight: 576,   // 16:9 landscape
        filePrefix: 'x-post',
        maxFileSize: 2 * 1024 * 1024,
        defaultFormat: 'image/jpeg',
        hint: 'X may crop post images slightly at the edges. Keep key content inside the Safe Area for best visibility in the timeline.',
        guides: [
            { id: 'safe', label: 'Content Safe Area (1080×607)', w: 1080, h: 607, color: 'rgba(29,155,240,0.5)', fill: 'rgba(29,155,240,0.05)', centered: true }
        ]
    },
    'ig-square': {
        label: 'Instagram Square',
        width: 1080,
        height: 1080,
        genWidth: 1024, genHeight: 1024,  // 1:1 square
        filePrefix: 'instagram-square',
        maxFileSize: null,  // no hard limit
        defaultFormat: 'image/jpeg',
        hint: 'Instagram may crop square posts to a smaller area in profile grid view. The Grid Crop Preview shows what will be visible on your profile page.',
        guides: [
            { id: 'grid', label: 'Grid Crop Preview (810×810)', w: 810, h: 810, color: 'rgba(225,48,108,0.5)', fill: 'rgba(225,48,108,0.05)', centered: true }
        ]
    },
    'ig-story': {
        label: 'Instagram Story / Reel',
        width: 1080,
        height: 1920,
        genWidth: 576, genHeight: 1024,   // 9:16 portrait
        filePrefix: 'instagram-story',
        maxFileSize: null,
        defaultFormat: 'image/jpeg',
        hint: 'The Status Bar (top) and CTA/Swipe Zone (bottom) are covered by the phone UI. Keep text and important visuals inside the Content Safe Area.',
        guides: [
            { id: 'top-safe',    label: 'Status Bar Zone (top 100px)',       type: 'rect', x: 0, y: 0,    w: 1080, h: 100,  color: 'rgba(225,48,108,0.5)', fill: 'rgba(225,48,108,0.08)' },
            { id: 'bottom-safe', label: 'CTA / Swipe Zone (bottom 250px)',   type: 'rect', x: 0, y: 1670, w: 1080, h: 250,  color: 'rgba(225,48,108,0.5)', fill: 'rgba(225,48,108,0.08)' },
            { id: 'content',     label: 'Content Safe Area', w: 960, h: 1520, color: 'rgba(255,255,255,0.3)', fill: 'rgba(255,255,255,0.03)', centered: true }
        ]
    }
};

// =============================================================================
// BannerGuides — Renders platform-specific overlays on the Fabric canvas
// =============================================================================
class BannerGuides {
    constructor(canvas) {
        this.canvas = canvas;
        this.currentPreset = 'yt-banner';
        this.guideObjects = [];            // Fabric objects currently on canvas
        this.visible = {};                 // { guideId: true/false }
        this._initVisibility();
    }

    /** Populate default visibility from current preset */
    _initVisibility() {
        const config = PLATFORM_PRESETS[this.currentPreset];
        this.visible = {};
        config.guides.forEach(g => { this.visible[g.id] = true; });
    }

    init() {
        this.render();
    }

    /** Switch to a new preset, rebuild guides */
    setPreset(presetId) {
        if (!PLATFORM_PRESETS[presetId]) return;
        this.currentPreset = presetId;
        this._initVisibility();
        this.render();
    }

    getPresetConfig() {
        return PLATFORM_PRESETS[this.currentPreset];
    }

    /** Build / rebuild all guide shapes */
    render() {
        // Remove old guide objects
        this.guideObjects.forEach(obj => this.canvas.remove(obj));
        this.guideObjects = [];

        const preset = PLATFORM_PRESETS[this.currentPreset];
        const pw = preset.width;
        const ph = preset.height;

        preset.guides.forEach(g => {
            if (!this.visible[g.id]) return;

            if (g.type === 'circle') {
                // Circle guide (e.g., X Header avatar zone)
                const circle = new fabric.Circle({
                    left: g.cx - g.radius,
                    top: g.cy - g.radius,
                    radius: g.radius,
                    fill: g.fill,
                    stroke: g.color,
                    strokeWidth: 2,
                    strokeDashArray: [6, 4],
                    selectable: false,
                    evented: false,
                    name: 'guide-' + g.id
                });
                this.canvas.add(circle);
                this.guideObjects.push(circle);
            } else {
                // Rectangle guide (default)
                let left, top;
                if (g.centered) {
                    left = (pw - g.w) / 2;
                    top  = (ph - g.h) / 2;
                } else {
                    left = g.x || 0;
                    top  = g.y || 0;
                }

                const rect = new fabric.Rect({
                    left:  left,
                    top:   top,
                    width: g.w,
                    height: g.h,
                    fill: g.fill,
                    stroke: g.color,
                    strokeWidth: g.strokeWidth || 1,
                    strokeDashArray: [5, 5],
                    selectable: false,
                    evented: false,
                    name: 'guide-' + g.id
                });
                this.canvas.add(rect);
                this.guideObjects.push(rect);
            }
        });

        this.canvas.requestRenderAll();
    }

    /** Toggle an individual guide by id */
    toggle(id, isVisible) {
        this.visible[id] = isVisible;
        this.render();
    }

    /** Bring all guides to front (after adding layers) */
    bringToFront() {
        this.guideObjects.forEach(obj => this.canvas.bringToFront(obj));
    }
}
