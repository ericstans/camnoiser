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
        
        // Clean up harmonic oscillators
        if (this.harmonicOscillators) {
            this.harmonicOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
            this.harmonicOscillators = [];
        }
        
        // Clean up granular grains
        if (this.activeGrains) {
            this.activeGrains.forEach(grain => {
                try { 
                    grain.source.stop(); 
                    grain.gain.gain.value = 0;
                } catch (e) {}
            });
            this.activeGrains = [];
        }
        
        // Clean up spectral oscillators
        if (this.spectralOscillators) {
            this.spectralOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
            this.spectralOscillators = [];
        }
        
        // Clean up MIDI oscillators
        if (this.midiOscillators) {
            this.midiOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
            this.midiOscillators = [];
        }
        
        // Clean up particle system
        if (this.particles) {
            this.particles.forEach(particle => {
                if (particle.oscillator) {
                    try { particle.oscillator.stop(); } catch (e) {}
                }
            });
            this.particles = [];
        }
        
        // Clean up cross-modal oscillators
        if (this.crossModalOscillators) {
            this.crossModalOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
            this.crossModalOscillators = [];
        }
        
        // Clean up rhythm interval
        if (this.rhythmInterval) {
            clearInterval(this.rhythmInterval);
            this.rhythmInterval = null;
        }
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

    // Mode 9: Harmonic Series Mode
    harmonicSeriesMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0.1;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        
        // Calculate average brightness
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i+1] + data[i+2]) / 3;
        }
        const avg = sum / (data.length / 4);
        
        // Map brightness to fundamental frequency (220Hz to 880Hz)
        const baseFreq = 220 + (avg / 255) * 660;
        
        // Create harmonic series based on brightness
        const numHarmonics = Math.floor(1 + (avg / 255) * 8); // 1 to 9 harmonics
        
        // Stop any existing oscillators
        if (this.harmonicOscillators) {
            this.harmonicOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
        }
        
        this.harmonicOscillators = [];
        
        // Create harmonic oscillators
        for (let i = 1; i <= numHarmonics; i++) {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = baseFreq * i;
            
            // Higher harmonics get quieter
            gain.gain.value = 0.1 / i;
            
            osc.connect(gain).connect(this.audioCtx.destination);
            osc.start();
            
            this.harmonicOscillators.push(osc);
        }
    }

    // Mode 10: Granular Synthesis Mode
    granularMode(data) {
        console.log('Granular mode started');
        console.log('Audio context state:', this.audioCtx.state);
        
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        
        // Create granular synthesis parameters
        const grainSize = 2048; // samples per grain (increased for longer, audible grains)
        const numGrains = Math.floor(this.canvas.width / 32); // reduced number of grains for performance
        console.log(`Creating ${numGrains} grains of size ${grainSize}`);
        
        // Stop any existing grains
        if (this.activeGrains) {
            this.activeGrains.forEach(grain => {
                try { 
                    grain.source.stop(); 
                    grain.gain.gain.value = 0;
                } catch (e) {}
            });
        }
        
        this.activeGrains = [];
        
        // Create grains based on video data
        for (let i = 0; i < numGrains; i++) {
            const x = Math.floor((i / numGrains) * this.canvas.width);
            const y = Math.floor(Math.random() * this.canvas.height);
            const idx = (y * this.canvas.width + x) * 4;
            
            // Get brightness at this position
            const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
            
            // Create audio buffer for this grain
            const grainBuffer = this.audioCtx.createBuffer(1, grainSize, this.audioCtx.sampleRate);
            const grainData = grainBuffer.getChannelData(0);
            
            // Fill grain with noise or tone based on brightness
            for (let j = 0; j < grainSize; j++) {
                if (brightness > 128) {
                    // Bright areas = tonal content
                    grainData[j] = Math.sin(2 * Math.PI * (220 + brightness) * j / this.audioCtx.sampleRate) * 0.4;
                } else {
                    // Dark areas = noise content
                    grainData[j] = (Math.random() * 2 - 1) * 0.4;
                }
            }
            
            // Create grain source and gain
            const grain = this.audioCtx.createBufferSource();
            const grainGain = this.audioCtx.createGain();
            
            // CRITICAL: Assign the buffer to the grain source
            grain.buffer = grainBuffer;
            
            // Set grain gain based on brightness (ensure minimum volume)
            grainGain.gain.value = Math.max(0.1, (brightness / 255) * 0.5);
            
            // Connect grain through gain to output
            grain.connect(grainGain).connect(this.audioCtx.destination);
            
            // Position affects timing (ensure positive delay)
            const delay = Math.max(0, (x / this.canvas.width) * 0.1);
            grain.start(this.audioCtx.currentTime + delay);
            
            // Store both grain and gain for cleanup
            this.activeGrains.push({ source: grain, gain: grainGain });
            
            // Debug: Log first few grains
            if (i < 3) {
                console.log(`Grain ${i}: brightness=${brightness}, gain=${grainGain.gain.value}, delay=${delay.toFixed(3)}s`);
            }
        }
        
        console.log(`Created ${this.activeGrains.length} grains`);
        
        // Auto-cleanup grains after they finish (longer duration)
        setTimeout(() => {
            console.log('Cleaning up grains');
            this.activeGrains.forEach(grain => {
                try { 
                    grain.source.stop(); 
                    grain.gain.gain.value = 0;
                } catch (e) {}
            });
            this.activeGrains = [];
        }, 2000);
    }

    // Mode 11: Spectral Analysis Mode
    spectralMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        
        // Simple spectral analysis using FFT-like approach
        const fftSize = 64; // Simplified FFT size
        const spectrum = new Array(fftSize).fill(0);
        
        // Analyze video data in frequency-like manner
        for (let i = 0; i < fftSize; i++) {
            const startIdx = Math.floor((i / fftSize) * data.length);
            const endIdx = Math.floor(((i + 1) / fftSize) * data.length);
            
            let sum = 0;
            for (let j = startIdx; j < endIdx; j += 4) {
                sum += (data[j] + data[j+1] + data[j+2]) / 3;
            }
            spectrum[i] = sum / Math.floor((endIdx - startIdx) / 4);
        }
        
        // Create oscillators for each frequency bin
        if (this.spectralOscillators) {
            this.spectralOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
        }
        
        this.spectralOscillators = [];
        
        for (let i = 0; i < fftSize; i++) {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            
            osc.type = 'sine';
            // Map spectrum index to frequency (50Hz to 5000Hz)
            osc.frequency.value = 50 + (i / fftSize) * 4950;
            
            // Map brightness to gain
            gain.gain.value = (spectrum[i] / 255) * 0.1;
            
            osc.connect(gain).connect(this.audioCtx.destination);
            osc.start();
            
            this.spectralOscillators.push(osc);
        }
    }

    // Mode 12: MIDI-like Mode
    midiMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        
        // Musical scale (C major)
        const scale = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
        
        // Stop any existing MIDI oscillators
        if (this.midiOscillators) {
            this.midiOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
        }
        
        this.midiOscillators = [];
        
        // Create musical notes based on video data
        const numNotes = 8;
        for (let i = 0; i < numNotes; i++) {
            const x = Math.floor((i / numNotes) * this.canvas.width);
            const y = Math.floor(this.canvas.height / 2);
            const idx = (y * this.canvas.width + x) * 4;
            
            const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
            
            if (brightness > 100) { // Only play notes for bright areas
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.value = scale[i % scale.length];
                
                // Brightness affects volume
                gain.gain.value = (brightness / 255) * 0.2;
                
                // Add envelope
                gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(gain.gain.value, this.audioCtx.currentTime + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 1.0);
                
                osc.connect(gain).connect(this.audioCtx.destination);
                osc.start();
                osc.stop(this.audioCtx.currentTime + 1.0);
                
                this.midiOscillators.push(osc);
            }
        }
    }

    // Mode 13: Particle System Mode
    particleMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        
        // Initialize particle system if needed
        if (!this.particles) {
            this.particles = [];
        }
        
        // Stop old particles
        this.particles.forEach(particle => {
            if (particle.oscillator) {
                try { particle.oscillator.stop(); } catch (e) {}
            }
        });
        
        this.particles = [];
        
        // Create new particles based on bright pixels
        const particleCount = 20;
        for (let i = 0; i < particleCount; i++) {
            const x = Math.floor(Math.random() * this.canvas.width);
            const y = Math.floor(Math.random() * this.canvas.height);
            const idx = (y * this.canvas.width + x) * 4;
            
            const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
            
            if (brightness > 150) { // Only create particles for bright areas
                const particle = {
                    x: x,
                    y: y,
                    brightness: brightness,
                    velocity: Math.random() * 2 - 1,
                    lifespan: 2.0, // seconds
                    oscillator: null
                };
                
                // Create audio for particle
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                
                osc.type = 'sine';
                // Position affects frequency
                osc.frequency.value = 200 + (x / this.canvas.width) * 800;
                
                // Brightness affects volume
                gain.gain.value = (brightness / 255) * 0.3;
                
                // Add panning based on X position
                const panner = this.audioCtx.createStereoPanner();
                panner.pan.value = (x / this.canvas.width) * 2 - 1;
                
                osc.connect(gain).connect(panner).connect(this.audioCtx.destination);
                osc.start();
                
                particle.oscillator = osc;
                this.particles.push(particle);
            }
        }
        
        // Update particle lifetimes
        setTimeout(() => {
            this.particles.forEach(particle => {
                if (particle.oscillator) {
                    try { particle.oscillator.stop(); } catch (e) {}
                }
            });
            this.particles = [];
        }, 2000);
    }

    // Mode 14: Cross-Modal Mapping Mode
    crossModalMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        
        // Stop any existing cross-modal oscillators
        if (this.crossModalOscillators) {
            this.crossModalOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
        }
        
        this.crossModalOscillators = [];
        
        // Cross-modal mapping: R→pitch, G→timbre, B→rhythm
        const centerX = Math.floor(this.canvas.width / 2);
        const centerY = Math.floor(this.canvas.height / 2);
        const idx = (centerY * this.canvas.width + centerX) * 4;
        
        const red = data[idx];
        const green = data[idx + 1];
        const blue = data[idx + 2];
        
        // Red channel → Pitch (frequency)
        const pitchOsc = this.audioCtx.createOscillator();
        const pitchGain = this.audioCtx.createGain();
        pitchOsc.type = 'sine';
        pitchOsc.frequency.value = 110 + (red / 255) * 880; // A2 to A5
        pitchGain.gain.value = 0.2;
        pitchOsc.connect(pitchGain).connect(this.audioCtx.destination);
        pitchOsc.start();
        this.crossModalOscillators.push(pitchOsc);
        
        // Green channel → Timbre (waveform)
        const timbreOsc = this.audioCtx.createOscillator();
        const timbreGain = this.audioCtx.createGain();
        timbreOsc.type = green > 128 ? 'square' : 'sawtooth';
        timbreOsc.frequency.value = 220 + (green / 255) * 440; // A3 to A4
        timbreGain.gain.value = 0.15;
        timbreOsc.connect(timbreGain).connect(this.audioCtx.destination);
        timbreOsc.start();
        this.crossModalOscillators.push(timbreOsc);
        
        // Blue channel → Rhythm (pulse)
        const rhythmOsc = this.audioCtx.createOscillator();
        const rhythmGain = this.audioCtx.createGain();
        rhythmOsc.type = 'triangle';
        rhythmOsc.frequency.value = 330 + (blue / 255) * 330; // E4 to E5
        
        // Create rhythmic pattern
        const rhythmPattern = [1, 0, 1, 0, 1, 0, 1, 0]; // 8-beat pattern
        let beatIndex = 0;
        
        const rhythmInterval = setInterval(() => {
            if (rhythmPattern[beatIndex]) {
                rhythmGain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
                rhythmGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.1);
            } else {
                rhythmGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
            }
            beatIndex = (beatIndex + 1) % rhythmPattern.length;
        }, (60 / (blue / 255 * 120 + 60)) * 1000); // BPM based on blue value
        
        rhythmOsc.connect(rhythmGain).connect(this.audioCtx.destination);
        rhythmOsc.start();
        this.crossModalOscillators.push(rhythmOsc);
        
        // Store interval for cleanup
        this.rhythmInterval = rhythmInterval;
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
            case 'harmonic-series':
                this.harmonicSeriesMode(data);
                break;
            case 'granular':
                this.granularMode(data);
                break;
            case 'spectral':
                this.spectralMode(data);
                break;
            case 'midi-like':
                this.midiMode(data);
                break;
            case 'particle-system':
                this.particleMode(data);
                break;
            case 'cross-modal':
                this.crossModalMode(data);
                break;
            default:
                console.warn('Unknown mode:', mode);
        }
    }
}
