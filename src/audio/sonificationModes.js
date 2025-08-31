// Sonification Modes Module
// Contains all the different sonification algorithms

export class SonificationModes {
    constructor(audioManager, canvas, ctx) {
        this.audioManager = audioManager;
        this.canvas = canvas;
        this.ctx = ctx;
        this.audioCtx = audioManager.getAudioContext();
        this.oscillator = audioManager.getOscillator();
        this.gain = audioManager.getGain();
        this.bandGains = audioManager.getBandGains();
        
        // For multi-frame blend mode
        this.blendFrameCount = 5;
        this.blendFrames = [];
        
        // For frame/row audio buffer playback
        this.lastFrameBufferSource = null;
        this.lastRowBufferSources = [];
    }

    // Helper functions for stopping playback
    stopFrameBufferPlayback() {
        if (this.lastFrameBufferSource) {
            try { this.lastFrameBufferSource.stop(); } catch (e) {}
            this.lastFrameBufferSource = null;
        }
    }

    stopRowBufferPlayback() {
        for (const src of this.lastRowBufferSources) {
            try { src.stop(); } catch (e) {}
        }
        this.lastRowBufferSources = [];
    }

    stopAllBuffers() {
        this.stopFrameBufferPlayback();
        this.stopRowBufferPlayback();
    }

    // Mode 1: Average Brightness to Pitch
    avgBrightnessMode(data) {
        this.stopAllBuffers();
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i+1] + data[i+2]) / 3;
        }
        const avg = sum / (data.length / 4);
        const minFreq = 220, maxFreq = 1760;
        const freq = minFreq + (maxFreq - minFreq) * (avg / 255);
        this.oscillator.frequency.value = freq;
        this.gain.gain.value = 0.1;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
    }

    // Mode 2: White Noise Filtering
    whiteNoiseFilteringMode(data) {
        this.stopAllBuffers();
        // Start noise if not already running
        this.audioManager.startNoise();
        this.gain.gain.value = 0;
        for (let x = 0; x < this.canvas.width; x++) {
            let colSum = 0;
            for (let y = 0; y < this.canvas.height; y++) {
                const idx = (y * this.canvas.width + x) * 4;
                colSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
            }
            const avg = colSum / this.canvas.height;
            this.bandGains[x].gain.value = (avg / 255) * 0.2;
        }
    }

    // Mode 3: Frame as Audio Buffer
    frameAudioBufferMode(data) {
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
        this.stopRowBufferPlayback();
        
        const numSamples = this.canvas.width * this.canvas.height;
        const audioBuffer = this.audioManager.createAudioBuffer(numSamples);
        const buf = audioBuffer.getChannelData(0);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            buf[j] = ((data[i] + data[i+1] + data[i+2]) / 3) / 127.5 - 1;
        }
        
        this.stopFrameBufferPlayback();
        const src = this.audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(this.audioCtx.destination);
        src.start();
        this.lastFrameBufferSource = src;
        setTimeout(() => this.stopFrameBufferPlayback(), 33);
    }

    // Mode 4: Rows as Audio Buffers
    rowsAudioBuffersMode(data) {
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
        this.stopFrameBufferPlayback();
        this.stopRowBufferPlayback();
        
        for (let y = 0; y < this.canvas.height; y++) {
            const rowBuffer = this.audioManager.createAudioBuffer(this.canvas.width);
            const rowData = rowBuffer.getChannelData(0);
            for (let x = 0; x < this.canvas.width; x++) {
                const idx = (y * this.canvas.width + x) * 4;
                rowData[x] = ((data[idx] + data[idx+1] + data[idx+2]) / 3) / 127.5 - 1;
            }
            const src = this.audioCtx.createBufferSource();
            src.buffer = rowBuffer;
            src.connect(this.audioCtx.destination);
            src.start(this.audioCtx.currentTime + y * 0.001);
            this.lastRowBufferSources.push(src);
        }
        setTimeout(() => this.stopRowBufferPlayback(), 33);
    }

    // Mode 5: Red Channel Only
    redChannelBufferMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
        
        const numSamples = this.canvas.width * this.canvas.height;
        const audioBuffer = this.audioManager.createAudioBuffer(numSamples);
        const buf = audioBuffer.getChannelData(0);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            buf[j] = (data[i] / 127.5) - 1;
        }
        
        this.stopFrameBufferPlayback();
        const src = this.audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(this.audioCtx.destination);
        src.start();
        this.lastFrameBufferSource = src;
        setTimeout(() => this.stopFrameBufferPlayback(), 33);
    }

    // Mode 6: Frame Buffer Loop
    frameBufferLoopMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
        
        const numSamples = this.canvas.width * this.canvas.height;
        const audioBuffer = this.audioManager.createAudioBuffer(numSamples);
        const buf = audioBuffer.getChannelData(0);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            buf[j] = ((data[i] + data[i+1] + data[i+2]) / 3) / 127.5 - 1;
        }
        
        this.stopFrameBufferPlayback();
        const src = this.audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.loop = true;
        src.connect(this.audioCtx.destination);
        src.start();
        this.lastFrameBufferSource = src;
        // Let it loop for 0.5s, then stop
        setTimeout(() => this.stopFrameBufferPlayback(), 500);
    }

    // Mode 7: Center Region Only
    centerRegionBufferMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
        
        // Use only the center region (e.g., 1/4 of the frame)
        const regionW = Math.floor(this.canvas.width / 2);
        const regionH = Math.floor(this.canvas.height / 2);
        const startX = Math.floor(this.canvas.width / 4);
        const startY = Math.floor(this.canvas.height / 4);
        const numSamples = regionW * regionH;
        const audioBuffer = this.audioManager.createAudioBuffer(numSamples);
        const buf = audioBuffer.getChannelData(0);
        let j = 0;
        for (let y = startY; y < startY + regionH; y++) {
            for (let x = startX; x < startX + regionW; x++) {
                const idx = (y * this.canvas.width + x) * 4;
                buf[j++] = ((data[idx] + data[idx+1] + data[idx+2]) / 3) / 127.5 - 1;
            }
        }
        
        this.stopFrameBufferPlayback();
        const src = this.audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(this.audioCtx.destination);
        src.start();
        this.lastFrameBufferSource = src;
        setTimeout(() => this.stopFrameBufferPlayback(), 33);
    }

    // Mode 8: Multi-frame Blend
    multiFrameBlendMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        // Don't stop noise - just mute the band gains instead
        
        // Keep a buffer of the last N frames
        if (this.blendFrames.length >= this.blendFrameCount) this.blendFrames.shift();
        this.blendFrames.push(new Uint8ClampedArray(data));
        
        // Blend frames (average)
        const numSamples = this.canvas.width * this.canvas.height;
        const audioBuffer = this.audioManager.createAudioBuffer(numSamples);
        const buf = audioBuffer.getChannelData(0);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            let sum = 0;
            for (let f = 0; f < this.blendFrames.length; f++) {
                sum += (this.blendFrames[f][i] + this.blendFrames[f][i+1] + this.blendFrames[f][i+2]) / 3;
            }
            buf[j] = (sum / this.blendFrames.length) / 127.5 - 1;
        }
        
        this.stopFrameBufferPlayback();
        const src = this.audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(this.audioCtx.destination);
        src.start();
        this.lastFrameBufferSource = src;
        setTimeout(() => this.stopFrameBufferPlayback(), 33);
    }

    // Main method to process frame based on selected mode
    processFrame(data, mode) {
        switch (mode) {
            case 'avg-brightness':
                this.avgBrightnessMode(data);
                break;
            case 'white-noise-filtering':
                this.whiteNoiseFilteringMode(data);
                break;
            case 'frame-audio-buffer':
                this.frameAudioBufferMode(data);
                break;
            case 'rows-audio-buffers':
                this.rowsAudioBuffersMode(data);
                break;
            case 'red-channel-buffer':
                this.redChannelBufferMode(data);
                break;
            case 'frame-buffer-loop':
                this.frameBufferLoopMode(data);
                break;
            case 'center-region-buffer':
                this.centerRegionBufferMode(data);
                break;
            case 'multi-frame-blend':
                this.multiFrameBlendMode(data);
                break;
            default:
                console.warn('Unknown mode:', mode);
        }
    }
}
