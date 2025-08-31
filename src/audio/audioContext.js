// Audio Context Module
// Handles Web Audio API setup and management

export class AudioManager {
    constructor(canvasWidth) {
        this.audioCtx = null;
        this.oscillator = null;
        this.gain = null;
        this.noiseBuffer = null;
        this.noiseSource = null;
        this.bandFilters = [];
        this.bandGains = [];
        this.noiseStarted = false;
        this.numBands = canvasWidth;
        this.minFreq = 50;
        this.maxFreq = 20000;
        
        this.initializeAudioContext();
        this.setupOscillator();
        this.setupNoiseSystem();
        this.setupFilterBank();
    }

    initializeAudioContext() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    setupOscillator() {
        // For mode 1: avg-brightness
        this.oscillator = this.audioCtx.createOscillator();
        this.gain = this.audioCtx.createGain();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.value = 440; // default
        this.gain.gain.value = 0.1; // low volume
        this.oscillator.connect(this.gain).connect(this.audioCtx.destination);
        this.oscillator.start();
    }

    setupNoiseSystem() {
        // For mode 2: white noise filtering
        this.noiseBuffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * 2, this.audioCtx.sampleRate);
        const noiseData = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        this.noiseSource = this.audioCtx.createBufferSource();
        this.noiseSource.buffer = this.noiseBuffer;
        this.noiseSource.loop = true;
    }

    setupFilterBank() {
        // Bandpass filter bank setup
        for (let i = 0; i < this.numBands; i++) {
            const filter = this.audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            // Logarithmic spacing for better perceptual mapping
            const freq = this.minFreq * Math.pow(this.maxFreq / this.minFreq, i / (this.numBands - 1));
            filter.frequency.value = freq;
            filter.Q.value = 10; // moderate Q
            
            const bandGain = this.audioCtx.createGain();
            bandGain.gain.value = 0;
            
            this.noiseSource.connect(filter).connect(bandGain).connect(this.audioCtx.destination);
            this.bandFilters.push(filter);
            this.bandGains.push(bandGain);
        }
    }

    resumeAudioContext() {
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    getAudioContext() {
        return this.audioCtx;
    }

    getOscillator() {
        return this.oscillator;
    }

    getGain() {
        return this.gain;
    }

    getNoiseSource() {
        return this.noiseSource;
    }

    getBandGains() {
        return this.bandGains;
    }

    isNoiseStarted() {
        return this.noiseStarted;
    }

    setNoiseStarted(started) {
        this.noiseStarted = started;
    }

    stopNoise() {
        if (this.noiseStarted && this.noiseSource) {
            try {
                this.noiseSource.stop();
            } catch (e) {
                // Ignore errors if already stopped
            }
            this.noiseStarted = false;
        }
    }

    startNoise() {
        if (!this.noiseStarted && this.noiseSource) {
            try {
                this.noiseSource.start();
                this.noiseStarted = true;
            } catch (e) {
                // Ignore errors if already started
            }
        }
    }

    createAudioBuffer(numSamples) {
        return this.audioCtx.createBuffer(1, numSamples, this.audioCtx.sampleRate);
    }

    createBufferSource() {
        return this.audioCtx.createBufferSource();
    }
}
