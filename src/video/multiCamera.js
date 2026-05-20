import { VideoManager } from './webcam.js';

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;

export class MultiCameraManager {
    constructor() {
        this.container = null;
        this.videoManagers = [];
        this.analysisContainer = null;
        this.analysisCanvas = null;
        this.analysisCtx = null;
        this.permissionPrimed = false;
        this.composeMode = 'average'; // 'average' | 'side-by-side' | 'sum' | 'sum-normalize'
        this.invertAnalysis = false;
    }

    createVideosContainer() {
        this.container = document.createElement('div');
        this.container.className = 'videos-container';
        return this.container;
    }

    createAnalysisCanvas() {
        this.analysisContainer = document.createElement('div');
        this.analysisContainer.className = 'video-container';
        this.analysisContainer.style.display = 'none';

        this.analysisCanvas = document.createElement('canvas');
        this.analysisCanvas.width = CANVAS_WIDTH;
        this.analysisCanvas.height = CANVAS_HEIGHT;
        this.analysisCanvas.className = 'responsive-video';

        const fsBtn = document.createElement('button');
        fsBtn.className = 'fullscreen-btn';
        fsBtn.setAttribute('aria-label', 'Toggle Fullscreen');
        fsBtn.title = 'Fullscreen';
        fsBtn.innerHTML = '<span class="fullscreen-icon">⛶</span> Fullscreen';

        fsBtn.addEventListener('click', async () => {
            try {
                if (!document.fullscreenElement) {
                    if (this.analysisContainer.requestFullscreen) {
                        await this.analysisContainer.requestFullscreen();
                    }
                } else if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
            } catch (e) {
                console.warn('Fullscreen toggle failed:', e);
            }
        });

        this.analysisContainer.appendChild(this.analysisCanvas);
        this.analysisContainer.appendChild(fsBtn);

        if (this.container) {
            this.container.appendChild(this.analysisContainer);
        } else {
            document.body.appendChild(this.analysisContainer);
        }

        this.analysisCtx = this.analysisCanvas.getContext('2d');
        return this.analysisCanvas;
    }

    setAnalysisVisible(isVisible) {
        if (!this.analysisContainer) return;
        this.analysisContainer.style.display = isVisible ? '' : 'none';
    }

    setInvertAnalysis(enabled) {
        this.invertAnalysis = !!enabled;
    }

    getAnalysisCanvasContext() {
        return this.analysisCtx;
    }

    async ensurePermission() {
        if (this.permissionPrimed) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser.');
        }
        try {
            const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            tmp.getTracks().forEach(t => t.stop());
            this.permissionPrimed = true;
        } catch (e) {
            throw new Error(`Camera permission denied: ${e.message}`);
        }
    }

    async enumerateCameras() {
        await this.ensurePermission();
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'videoinput');
    }

    async setSelectedDevices(deviceIds) {
        // Stop existing
        this.stopAll();
        this.clearVideos();
        this.setAnalysisVisible(Array.isArray(deviceIds) && deviceIds.length > 1);
        if (this.container && this.analysisContainer) {
            this.container.appendChild(this.analysisContainer);
        }
        if (!deviceIds || deviceIds.length === 0) {
            return;
        }

        // Create a VideoManager per device
        const startPromises = deviceIds.map(async (id) => {
            const vm = new VideoManager();
            const el = vm.createVideoElement();
            if (this.container) {
                if (this.analysisContainer && this.analysisContainer.parentElement === this.container) {
                    this.container.insertBefore(el, this.analysisContainer);
                } else {
                    this.container.appendChild(el);
                }
            }
            vm.createCanvas(); // hidden per-camera canvas for capture downscaled
            await vm.requestWebcamAccess(id, CANVAS_WIDTH, CANVAS_HEIGHT);
            await vm.startVideo();
            this.videoManagers.push(vm);
        });
        await Promise.all(startPromises);
    }

    clearVideos() {
        if (this.container) {
            Array.from(this.container.children).forEach((child) => {
                if (child !== this.analysisContainer) {
                    this.container.removeChild(child);
                }
            });

            if (this.analysisContainer && !this.analysisContainer.isConnected) {
                this.container.appendChild(this.analysisContainer);
            }
        }
        this.videoManagers = [];
    }

    stopAll() {
        this.videoManagers.forEach(vm => vm.stopWebcam());
    }

    // Composite current frames (average) into analysis canvas and return ImageData.data
    getCompositeFrameData() {
        if (!this.analysisCtx || this.videoManagers.length === 0) return null;

        const w = this.analysisCanvas.width;
        const h = this.analysisCanvas.height;
        this.analysisCtx.clearRect(0, 0, w, h);

        if (this.composeMode === 'side-by-side') {
            const N = this.videoManagers.length;
            const segW = Math.floor(w / N);
            for (let i = 0; i < N; i++) {
                const vm = this.videoManagers[i];
                const v = vm.getVideo();
                if (!v || v.readyState < 2 || v.paused) continue;
                const targetW = (i === N - 1) ? (w - segW * (N - 1)) : segW;
                this.analysisCtx.drawImage(v, i * segW, 0, targetW, h);
            }
            const img = this.analysisCtx.getImageData(0, 0, w, h);
            if (this.invertAnalysis) {
                this._invertImageData(img.data);
                this.analysisCtx.putImageData(img, 0, 0);
            }
            return img.data;
        }

        // Sum/average modes
        const sum = new Float32Array(w * h * 4);
        let count = 0;
        for (const vm of this.videoManagers) {
            const v = vm.getVideo();
            if (!v || v.readyState < 2 || v.paused) continue;
            const ctx = vm.getCanvasContext();
            if (!ctx) continue;
            ctx.drawImage(v, 0, 0, vm.getCanvas().width, vm.getCanvas().height);
            const frame = ctx.getImageData(0, 0, w, h).data;
            for (let i = 0; i < frame.length; i++) sum[i] += frame[i];
            count++;
        }
        if (count === 0) return null;

        const outImg = this.analysisCtx.createImageData(w, h);
        const out = outImg.data;

        if (this.composeMode === 'sum' || this.composeMode === 'sum-normalize') {
            if (this.composeMode === 'sum-normalize') {
                let maxVal = 0;
                // Consider only RGB channels for scaling
                for (let i = 0; i < sum.length; i += 4) {
                    maxVal = Math.max(maxVal, sum[i], sum[i + 1], sum[i + 2]);
                }
                const scale = maxVal > 0 ? 255 / maxVal : 1;
                for (let i = 0; i < out.length; i += 4) {
                    out[i] = Math.min(255, Math.round(sum[i] * scale));
                    out[i + 1] = Math.min(255, Math.round(sum[i + 1] * scale));
                    out[i + 2] = Math.min(255, Math.round(sum[i + 2] * scale));
                    out[i + 3] = 255;
                }
            } else {
                for (let i = 0; i < out.length; i += 4) {
                    out[i] = Math.min(255, Math.round(sum[i]));
                    out[i + 1] = Math.min(255, Math.round(sum[i + 1]));
                    out[i + 2] = Math.min(255, Math.round(sum[i + 2]));
                    out[i + 3] = 255;
                }
            }
        } else {
            // average
            for (let i = 0; i < out.length; i += 4) {
                out[i] = Math.min(255, Math.round(sum[i] / count));
                out[i + 1] = Math.min(255, Math.round(sum[i + 1] / count));
                out[i + 2] = Math.min(255, Math.round(sum[i + 2] / count));
                out[i + 3] = 255;
            }
        }

        if (this.invertAnalysis) {
            this._invertImageData(out);
        }

        this.analysisCtx.putImageData(outImg, 0, 0);
        return out;
    }

    _invertImageData(data) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
        }
    }

    setComposeMode(mode) {
        this.composeMode = mode;
    }
}
