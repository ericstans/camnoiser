// Video/Webcam Module
// Handles video element setup, webcam access, and canvas management

export class VideoManager {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.stream = null;
    }

    createVideoElement() {
        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.className = 'responsive-video';
        return this.video;
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 160; // smaller for performance
        this.canvas.height = 120;
        this.canvas.style.display = 'none';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        return this.canvas;
    }

    async requestWebcamAccess() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser.');
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
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

    // Method to stop the webcam stream
    stopWebcam() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
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
