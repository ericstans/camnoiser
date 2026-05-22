// Video/Webcam Module
// Handles video element setup, webcam access, and canvas management
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;

export class VideoManager {
    
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.stream = null;
    }

    createVideoElement() {
        // Create container to hold video and overlays
        const container = document.createElement('div');
        container.className = 'video-container';

        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.className = 'responsive-video';

        // Fullscreen button
        const fsBtn = document.createElement('button');
        fsBtn.className = 'fullscreen-btn';
        fsBtn.setAttribute('aria-label', 'Toggle Fullscreen');
        fsBtn.title = 'Fullscreen';
        // Simple unicode icon ⛶ (U+26F6) as fallback
        fsBtn.innerHTML = '<span class="fullscreen-icon">⛶</span> Fullscreen';

        // Fullscreen toggle handler
        const toggleFullscreen = async () => {
            try {
                if (!document.fullscreenElement) {
                    // Prefer making the container fullscreen for overlays to stay positioned
                    if (container.requestFullscreen) await container.requestFullscreen();
                } else {
                    if (document.exitFullscreen) await document.exitFullscreen();
                }
            } catch (e) {
                console.warn('Fullscreen toggle failed:', e);
            }
        };
        fsBtn.addEventListener('click', toggleFullscreen);

        // Assemble
        container.appendChild(this.video);
        container.appendChild(fsBtn);
        return container;
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        this.canvas.style.display = 'none';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        return this.canvas;
    }

    async requestWebcamAccess(deviceId = null, width = CANVAS_WIDTH, height = CANVAS_HEIGHT) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser.');
        }

        try {
            const constraints = deviceId
                ? { video: { deviceId: { exact: deviceId }, width, height } }
                : { video: { width, height } };
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            return this.stream;
        } catch (err) {
            throw new Error(`Could not access webcam: ${err.message}`);
        }
    }

    getVideo() {
        return this.video;
    }

    getCanvas() {
        return this.canvas;
    }

    getCanvasContext() {
        return this.ctx;
    }

    getStream() {
        return this.stream;
    }

    // Method to start the video and return a promise that resolves when video starts playing
    startVideo(onVideoStart) {
        return new Promise((resolve, reject) => {
            if (!this.video) {
                reject(new Error('Video element not created'));
                return;
            }

            // If already playing, resolve immediately
            if (this.video.readyState >= 2 && !this.video.paused) {
                if (onVideoStart) onVideoStart();
                resolve();
                return;
            }

            this.video.onplay = () => {
                if (onVideoStart) {
                    onVideoStart();
                }
                resolve();
            };

            this.video.onerror = (error) => {
                reject(new Error(`Video error: ${error.message}`));
            };
        });
    }

    // Method to stop the webcam stream and clean up resources
    stopWebcam() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
    }

    // Method to get current frame data from canvas
    getCurrentFrameData() {
        if (!this.ctx || !this.video) {
            return null;
        }

        // Draw current video frame to canvas
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        return frame.data;
    }
}
