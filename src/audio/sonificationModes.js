const NOTE_ATTACK_TIME = 2;
const NOTE_RELEASE_TIME = 2;
const FRAME_RATE = 60; // target frame rate for scheduling
const FRAME_DURATION = 1 / FRAME_RATE;
const BUF_ATTACK = 0.005; // 5ms fade in for one-shot buffers
const BUF_RELEASE = 0.005; // 5ms fade out
export class SonificationModes {
        // For Separate Streams: convert selected mode into a per-frame audio buffer.
        getAudioBufferForMode(data, mode, streamId = 'default', options = {}) {
            const disableTransition = !!options.disableTransition;
            const streamKey = String(streamId);

            if (!disableTransition) {
                const now = this.audioCtx.currentTime;
                const prev = this.lastModeByStream[streamKey];
                if (this.crossfadeTimeMs > 0 && prev && prev !== mode) {
                    const duration = this.crossfadeTimeMs / 1000;
                    this.streamTransitions[streamKey] = {
                        from: prev,
                        to: mode,
                        startTime: now,
                        endTime: now + duration
                    };
                }
                this.lastModeByStream[streamKey] = mode;

                const transition = this.streamTransitions[streamKey];
                if (transition && transition.to === mode) {
                    const total = Math.max(0.0001, transition.endTime - transition.startTime);
                    const progress = Math.max(0, Math.min(1, (now - transition.startTime) / total));
                    if (progress < 1) {
                        const blended = this._buildCrossfadeSamples(
                            data,
                            transition.from,
                            transition.to,
                            progress,
                            `stream:${streamKey}`
                        );
                        if (blended) return blended;
                    } else {
                        delete this.streamTransitions[streamKey];
                    }
                }
            }

            let samples = null;
            switch (mode) {
                case 'avg-brightness':
                    samples = this._samplesBrightness(data);
                    break;
                case 'white-noise-filtering': {
                    const w = this.canvas.width, h = this.canvas.height;
                    const cols = new Float32Array(w);
                    for (let x = 0; x < w; x++) {
                        let sum = 0;
                        for (let y = 0; y < h; y++) {
                            const idx = (y * w + x) * 4;
                            sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                        }
                        cols[x] = (sum / h) / 127.5 - 1;
                    }
                    samples = this._samplesFromMinus1To1(cols);
                    break;
                }
                case 'frame-audio-buffer':
                    samples = this._samplesBrightness(data);
                    break;
                case 'chrominance-buffer': {
                    const w = this.canvas.width, h = this.canvas.height, total = w * h;
                    samples = this._downsample(total, (i) => {
                        const idx = i * 4;
                        return -0.168736 * data[idx] - 0.331264 * data[idx + 1] + 0.5 * data[idx + 2] + 128;
                    }, { scale255: true });
                    break;
                }
                case 'frame-diff-buffer': {
                    if (!this._separatePrevFrames) this._separatePrevFrames = {};
                    const w = this.canvas.width, h = this.canvas.height, total = w * h;
                    const prev = this._separatePrevFrames[streamId];
                    const diffVals = new Float32Array(total);
                    if (prev) {
                        for (let p = 0; p < total; p++) {
                            const i = p * 4;
                            const currGray = (data[i] + data[i + 1] + data[i + 2]) / 3;
                            const prevGray = (prev[i] + prev[i + 1] + prev[i + 2]) / 3;
                            diffVals[p] = (currGray - prevGray) / 255;
                        }
                    }
                    this._separatePrevFrames[streamId] = new Uint8ClampedArray(data);
                    samples = this._samplesFromMinus1To1(diffVals);
                    break;
                }
                case 'edge-detect-buffer': {
                    const w = this.canvas.width, h = this.canvas.height, total = w * h;
                    const gray = new Float32Array(total);
                    for (let p = 0; p < total; p++) {
                        const i = p * 4;
                        gray[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    }
                    const sobel = new Float32Array(total);
                    const kx = [[-1,0,1],[-2,0,2],[-1,0,1]];
                    const ky = [[-1,-2,-1],[0,0,0],[1,2,1]];
                    for (let y = 1; y < h - 1; y++) {
                        for (let x = 1; x < w - 1; x++) {
                            let gx = 0, gy = 0;
                            for (let yy = -1; yy <= 1; yy++) {
                                for (let xx = -1; xx <= 1; xx++) {
                                    const v = gray[(y + yy) * w + (x + xx)];
                                    gx += kx[yy + 1][xx + 1] * v;
                                    gy += ky[yy + 1][xx + 1] * v;
                                }
                            }
                            sobel[y * w + x] = (Math.sqrt(gx * gx + gy * gy) / 255) * 2 - 1;
                        }
                    }
                    samples = this._samplesFromMinus1To1(sobel);
                    break;
                }
                case 'rows-audio-buffers': {
                    const w = this.canvas.width, h = this.canvas.height;
                    const L = this._getFrameSampleCount();
                    const perRow = Math.max(1, Math.floor(L / h));
                    const scratch = new Float32Array(L);
                    for (let y = 0; y < h; y++) {
                        let rowSum = 0;
                        for (let x = 0; x < w; x++) {
                            const idx = (y * w + x) * 4;
                            rowSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                        }
                        const avg = (rowSum / w) / 127.5 - 1;
                        const start = y * perRow;
                        for (let i = 0; i < perRow && (start + i) < L; i++) scratch[start + i] = avg;
                    }
                    samples = scratch;
                    break;
                }
                case 'red-channel-buffer':
                    samples = this._samplesChannel(data, 0);
                    break;
                case 'green-channel-buffer':
                    samples = this._samplesChannel(data, 1);
                    break;
                case 'blue-channel-buffer':
                    samples = this._samplesChannel(data, 2);
                    break;
                case 'rgb-split-panned': {
                    const r = this._samplesChannel(data, 0);
                    const g = this._samplesChannel(data, 1);
                    const b = this._samplesChannel(data, 2);
                    const L = Math.min(r.length, g.length, b.length);
                    samples = new Float32Array(L);
                    for (let i = 0; i < L; i++) samples[i] = (r[i] + g[i] + b[i]) / 3;
                    break;
                }
                case 'frame-buffer-loop':
                    samples = this._samplesBrightness(data);
                    break;
                case 'center-region-buffer': {
                    const regionW = Math.floor(this.canvas.width / 2);
                    const regionH = Math.floor(this.canvas.height / 2);
                    const startX = Math.floor(this.canvas.width / 4);
                    const startY = Math.floor(this.canvas.height / 4);
                    samples = this._samplesRegionBrightness(data, startX, startY, regionW, regionH);
                    break;
                }
                case 'multi-frame-blend': {
                    if (!this._separateBlendFrames) this._separateBlendFrames = {};
                    const key = String(streamId);
                    const frames = this._separateBlendFrames[key] || [];
                    if (frames.length >= 5) frames.shift();
                    frames.push(new Uint8ClampedArray(data));
                    this._separateBlendFrames[key] = frames;
                    const w = this.canvas.width, h = this.canvas.height, total = w * h;
                    const L = this._getFrameSampleCount();
                    this._ensureScratch(L);
                    const out = this._scratchFrame, counts = this._scratchCounts;
                    for (let p = 0; p < total; p++) {
                        const bin = Math.floor(p * L / total);
                        let sum = 0;
                        const base = p * 4;
                        for (let f = 0; f < frames.length; f++) {
                            const fr = frames[f];
                            sum += (fr[base] + fr[base + 1] + fr[base + 2]) / 3;
                        }
                        out[bin] += sum / Math.max(1, frames.length);
                        counts[bin]++;
                    }
                    for (let i = 0; i < L; i++) out[i] = counts[i] ? (out[i] / counts[i]) / 127.5 - 1 : 0;
                    samples = Float32Array.from(out);
                    break;
                }
                case 'chrominance-3frame-buffer':
                case 'chrominance-3frame-buffer-old': {
                    if (!this._separateChromCycle) this._separateChromCycle = {};
                    const cycle = this._separateChromCycle[streamId] || 0;
                    const ordered = mode === 'chrominance-3frame-buffer'
                        ? [0, 1, 2]
                        : [2, 1, 0];
                    const chan = ordered[cycle % 3];
                    this._separateChromCycle[streamId] = (cycle + 1) % 3;
                    samples = this._samplesChannel(data, chan);
                    break;
                }
                case 'harmonic-series': {
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    let sum = 0;
                    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
                    const avg = sum / (data.length / 4);
                    const baseFreq = 220 + (avg / 255) * 660;
                    const harmonics = Math.floor(1 + (avg / 255) * 8);
                    for (let i = 0; i < L; i++) {
                        const t = i / this.audioCtx.sampleRate;
                        let v = 0;
                        for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * baseFreq * h * t) / h;
                        out[i] = v / harmonics;
                    }
                    samples = out;
                    break;
                }
                case 'granular': {
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    const bright = this._samplesBrightness(data);
                    for (let i = 0; i < L; i++) {
                        const gate = Math.max(0, bright[i]);
                        out[i] = (Math.random() * 2 - 1) * gate;
                    }
                    samples = out;
                    break;
                }
                case 'spectral': {
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    const bins = 32;
                    for (let b = 0; b < bins; b++) {
                        const idx = Math.floor((b / bins) * (data.length - 4));
                        const mag = ((data[idx] + data[idx + 1] + data[idx + 2]) / 3) / 255;
                        const f = 80 + (b / bins) * 4000;
                        for (let i = 0; i < L; i++) {
                            const t = i / this.audioCtx.sampleRate;
                            out[i] += Math.sin(2 * Math.PI * f * t) * mag * (1 / bins);
                        }
                    }
                    samples = out;
                    break;
                }
                case 'midi-like': {
                    const scale = [261.63, 294.33, 327.04, 348.84, 392.45, 436.05, 490.56, 523.26];
                    let sum = 0;
                    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
                    const avg = sum / (data.length / 4);
                    const note = scale[Math.floor((avg / 255) * (scale.length - 1))];
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    for (let i = 0; i < L; i++) {
                        const t = i / this.audioCtx.sampleRate;
                        out[i] = Math.sin(2 * Math.PI * note * t) * 0.6;
                    }
                    samples = out;
                    break;
                }
                case 'particle-system': {
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    for (let i = 0; i < L; i++) {
                        const hit = Math.random() < 0.08 ? 1 : 0;
                        out[i] = hit ? (Math.random() * 2 - 1) : 0;
                    }
                    samples = out;
                    break;
                }
                case 'cross-modal': {
                    const centerX = Math.floor(this.canvas.width / 2);
                    const centerY = Math.floor(this.canvas.height / 2);
                    const idx = (centerY * this.canvas.width + centerX) * 4;
                    const r = data[idx] / 255;
                    const g = data[idx + 1] / 255;
                    const b = data[idx + 2] / 255;
                    const f1 = 110 + r * 880;
                    const f2 = 220 + g * 440;
                    const amp = 0.2 + b * 0.4;
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    for (let i = 0; i < L; i++) {
                        const t = i / this.audioCtx.sampleRate;
                        out[i] = (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t)) * 0.5 * amp;
                    }
                    samples = out;
                    break;
                }
                case 'column-row-sine-bank': {
                    const w = this.canvas.width, h = this.canvas.height;
                    const rows = 64;
                    const L = this._getFrameSampleCount();
                    const out = new Float32Array(L);
                    for (let r = 0; r < rows; r++) {
                        const y = Math.floor(r * h / rows);
                        let rowSum = 0;
                        const base = y * w * 4;
                        for (let x = 0; x < w; x++) {
                            const i = base + x * 4;
                            rowSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
                        }
                        const norm = (rowSum / w) / 255;
                        const freq = 50 + (r / (rows - 1)) * 9950;
                        for (let i = 0; i < L; i++) {
                            const t = i / this.audioCtx.sampleRate;
                            out[i] += Math.sin(2 * Math.PI * freq * t) * norm * (1 / rows);
                        }
                    }
                    samples = out;
                    break;
                }
                default:
                    // Fallback should still produce audible, mode-varying output.
                    samples = this._samplesBrightness(data);
            }
            // Return a copy to avoid mutation
            return samples ? Float32Array.from(samples) : null;
        }

        _blendSampleBuffers(fromSamples, toSamples, progress) {
            if (!fromSamples && !toSamples) return null;
            if (!fromSamples) return toSamples ? Float32Array.from(toSamples) : null;
            if (!toSamples) return fromSamples ? Float32Array.from(fromSamples) : null;

            const len = Math.min(fromSamples.length, toSamples.length);
            if (!len || len <= 0) return null;

            const out = new Float32Array(len);
            const a = Math.max(0, Math.min(1, progress));
            const inv = 1 - a;
            for (let i = 0; i < len; i++) {
                out[i] = fromSamples[i] * inv + toSamples[i] * a;
            }
            return out;
        }

        _scaleSamples(samples, gain) {
            if (!samples) return null;
            const len = samples.length;
            if (!len || len <= 0) return null;
            const g = Math.max(0, Math.min(1, gain));
            if (g === 1) return Float32Array.from(samples);
            const out = new Float32Array(len);
            for (let i = 0; i < len; i++) out[i] = samples[i] * g;
            return out;
        }

        _buildCrossfadeSamples(data, fromMode, toMode, progress, streamKey = 'default') {
            const fromSamples = this.getAudioBufferForMode(
                data,
                fromMode,
                `${streamKey}:from`,
                { disableTransition: true }
            );
            const toSamples = this.getAudioBufferForMode(
                data,
                toMode,
                `${streamKey}:to`,
                { disableTransition: true }
            );
            return this._blendSampleBuffers(fromSamples, toSamples, progress);
        }

        // For Separate Streams: play a mixed buffer (Float32Array)
        playMixedBuffer(buffer) {
            if (!buffer || !buffer.length) return;
            const audioBuffer = this.audioManager.createAudioBuffer(buffer.length);
            audioBuffer.copyToChannel(buffer, 0, 0);
            const src = this.audioManager.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(this._getOutputNode());
            src.start();
        }

        // For Separate Streams: pan each stream first, then apply a final/global pan.
        playSeparateStreams(buffers, perStreamPans = [], globalPan = 0) {
            if (!Array.isArray(buffers) || buffers.length === 0) return;

            let minLen = Number.MAX_SAFE_INTEGER;
            for (const buf of buffers) {
                if (!buf || !buf.length) continue;
                minLen = Math.min(minLen, buf.length);
            }
            if (!Number.isFinite(minLen) || minLen <= 0) return;

            const now = this.audioCtx.currentTime;
            const mixGain = this.audioCtx.createGain();
            const globalPanner = this.audioCtx.createStereoPanner();
            globalPanner.pan.value = Math.max(-1, Math.min(1, globalPan || 0));
            // Keep mix energy in check as stream count grows.
            mixGain.gain.value = 1 / Math.max(1, buffers.length);

            mixGain.connect(globalPanner).connect(this._getOutputNode());

            for (let i = 0; i < buffers.length; i++) {
                const raw = buffers[i];
                if (!raw || !raw.length) continue;

                const truncated = new Float32Array(minLen);
                truncated.set(raw.subarray(0, minLen));

                const bufferNode = this._createBufferFromSamples(truncated);
                const streamPanner = this.audioCtx.createStereoPanner();
                const streamPan = perStreamPans[i] ?? 0;
                streamPanner.pan.value = Math.max(-1, Math.min(1, streamPan));
                streamPanner.connect(mixGain);
                this._scheduleOneShot(bufferNode, streamPanner, { startTime: now, duration: FRAME_DURATION });
            }
        }
    constructor(audioManager, canvas, ctx) {
        this.audioManager = audioManager;
        this.canvas = canvas;
        this.ctx = ctx;
        this.audioCtx = audioManager.getAudioContext();
        this.oscillator = audioManager.getOscillator();
        this.gain = audioManager.getGain();
        this.bandGains = audioManager.getBandGains();
        this.outputNode = audioManager.getOutputNode ? audioManager.getOutputNode() : this.audioCtx.destination;

        this.crossfadeTimeMs = 0;
        this.lastMode = null;
        this.lastModeByStream = {};
        this.streamTransitions = {};
        this.singleTransition = null;
        this.crossfadeGain = this.audioCtx.createGain();
        this.crossfadeGain.gain.value = 1;
        this.crossfadeGain.connect(this.outputNode);

        // For multi-frame blend mode
        this.blendFrameCount = 5;
        this.blendFrames = [];

        // For frame/row audio buffer playback
        this.lastFrameBufferSource = null;
        this.lastRowBufferSources = [];
    }

    setCrossfadeTimeMs(ms) {
        const parsed = Number(ms);
        const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(10000, parsed)) : 0;
        this.crossfadeTimeMs = clamped;
        if (clamped <= 0) {
            this.streamTransitions = {};
            this.singleTransition = null;
        }
    }

    _fadeLegacyVoicesOut(durationSecs) {
        const now = this.audioCtx.currentTime;
        const end = now + Math.max(0.001, durationSecs);

        const mainGain = this.gain && this.gain.gain;
        if (mainGain) {
            if (mainGain.cancelAndHoldAtTime) mainGain.cancelAndHoldAtTime(now);
            else mainGain.cancelScheduledValues(now);
            mainGain.setValueAtTime(mainGain.value, now);
            mainGain.linearRampToValueAtTime(0, end);
        }

        for (let i = 0; i < this.bandGains.length; i++) {
            const g = this.bandGains[i] && this.bandGains[i].gain;
            if (!g) continue;
            if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
            else g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            g.linearRampToValueAtTime(0, end);
        }
    }

    _getOutputNode() {
        return this.crossfadeGain || this.outputNode || this.audioCtx.destination;
    }

    // ---------------- Frame-duration sample helpers ----------------
    _getFrameSampleCount() {
        return Math.max(32, Math.round(this.audioCtx.sampleRate / FRAME_RATE));
    }
    _ensureScratch(len) {
        if (!this._scratchFrame || this._scratchFrame.length !== len) {
            this._scratchFrame = new Float32Array(len);
            this._scratchCounts = new Uint32Array(len);
        } else {
            this._scratchFrame.fill(0);
            this._scratchCounts.fill(0);
        }
    }
    _downsample(totalUnits, valueFn, { scale255 = true } = {}) {
        const L = this._getFrameSampleCount();
        this._ensureScratch(L);
        const out = this._scratchFrame;
        const counts = this._scratchCounts;
        for (let i = 0; i < totalUnits; i++) {
            const bin = Math.floor(i * L / totalUnits);
            out[bin] += valueFn(i);
            counts[bin]++;
        }
        for (let i = 0; i < L; i++) {
            if (counts[i] > 0) {
                let v = out[i] / counts[i];
                out[i] = scale255 ? (v / 127.5) - 1 : v; // map 0..255 to -1..1
            } else out[i] = 0;
        }
        return out;
    }
    _createBufferFromSamples(samples) {
        const buf = this.audioManager.createAudioBuffer(samples.length);
        buf.copyToChannel(samples, 0, 0);
        return buf;
    }
    _samplesBrightness(data) {
        const w = this.canvas.width, h = this.canvas.height, total = w * h;
        return this._downsample(total, (i) => {
            const idx = i * 4; return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        }, { scale255: true });
    }
    _samplesChannel(data, chan) {
        const w = this.canvas.width, h = this.canvas.height, total = w * h;
        return this._downsample(total, (i) => data[i * 4 + chan], { scale255: true });
    }
    _samplesRegionBrightness(data, startX, startY, regionW, regionH) {
        const w = this.canvas.width;
        const total = regionW * regionH;
        return this._downsample(total, (n) => {
            const yLocal = Math.floor(n / regionW);
            const xLocal = n - yLocal * regionW;
            const x = startX + xLocal; const y = startY + yLocal;
            const idx = (y * w + x) * 4;
            return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        }, { scale255: true });
    }
    _samplesFromMinus1To1(array) {
        const total = array.length;
        const L = this._getFrameSampleCount();
        this._ensureScratch(L);
        const out = this._scratchFrame, counts = this._scratchCounts;
        for (let i = 0; i < total; i++) { const bin = Math.floor(i * L / total); out[bin] += array[i]; counts[bin]++; }
        for (let i = 0; i < L; i++) out[i] = counts[i] ? out[i] / counts[i] : 0;
        return out;
    }

    // Schedule a one-shot buffer with a short fade envelope using the audio clock
    // targetNode: where to connect after the envelope (e.g., destination or a panner)
    // returns the created BufferSource
    _scheduleOneShot(buffer, targetNode, { startTime = this.audioCtx.currentTime, duration = FRAME_DURATION, loop = false } = {}) {
        const src = this.audioCtx.createBufferSource();
        src.buffer = buffer;
        src.loop = !!loop;

        const gain = this.audioCtx.createGain();
        // Envelope: 0 -> 1 over BUF_ATTACK, then sustain, then fade to 0 over BUF_RELEASE
        const sustainEnd = Math.max(startTime + BUF_ATTACK, startTime + Math.max(0, duration - BUF_RELEASE));
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(1, startTime + BUF_ATTACK);
        gain.gain.setValueAtTime(1, sustainEnd);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);

        src.connect(gain).connect(targetNode || this._getOutputNode());
        src.start(startTime);
        // Stop slightly after envelope ends to ensure cleanup
        src.stop(startTime + duration);
        return src;
    }

    // Helper functions for stopping playback
    stopFrameBufferPlayback() {
        if (this.lastFrameBufferSource) {
            try { this.lastFrameBufferSource.stop(); } catch (e) { }
            this.lastFrameBufferSource = null;
        }
    }

    stopRowBufferPlayback() {
        for (const src of this.lastRowBufferSources) {
            try { src.stop(); } catch (e) { }
        }
        this.lastRowBufferSources = [];
    }

    stopAllBuffers() {
        this.stopFrameBufferPlayback();
        this.stopRowBufferPlayback();

        // Clean up harmonic oscillators
        if (this.harmonicOscillators) {
            this.harmonicOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) { }
            });
            this.harmonicOscillators = [];
        }

        // Clean up granular grains
        if (this.activeGrains) {
            this.activeGrains.forEach(grain => {
                try {
                    grain.source.stop();
                    grain.gain.gain.value = 0;
                } catch (e) { }
            });
            this.activeGrains = [];
        }

        // Clean up spectral oscillators
        if (this.spectralOscillators) {
            this.spectralOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) { }
            });
            this.spectralOscillators = [];
        }

        // Clean up MIDI oscillators
        if (this.midiNoteStates) {
            this.midiNoteStates.forEach(noteState => {
                if (noteState.isPlaying) {
                    this.stopNote(noteState);
                }
            });
        }

        // Clean up particle system
        if (this.particles) {
            this.particles.forEach(particle => {
                if (particle.oscillator) {
                    try { particle.oscillator.stop(); } catch (e) { }
                }
            });
            this.particles = [];
        }

        // Clean up cross-modal oscillators
        if (this.crossModalOscillators) {
            this.crossModalOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) { }
            });
            this.crossModalOscillators = [];
        }

        // Clean up row sine bank oscillators
        if (this.rowSineBankOscillators) {
            this.rowSineBankOscillators.forEach(obj => {
                if (obj && obj.osc) {
                    try { obj.osc.stop(); } catch (e) { }
                }
            });
            this.rowSineBankOscillators = null;
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
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
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
                colSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            }
            const avg = colSum / this.canvas.height;
            this.bandGains[x].gain.value = (avg / 255) * 0.2;
        }
    }

    // Mode 3: Frame as Audio Buffer
    frameAudioBufferMode(data) {
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        this.stopRowBufferPlayback();
        const samples = this._samplesBrightness(data);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Mode 4: Rows as Audio Buffers
    rowsAudioBuffersMode(data) {
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        this.stopFrameBufferPlayback();
        this.stopRowBufferPlayback();
        // reinterpret rows: accumulate each row to a proportional slice of frame samples
        const L = this._getFrameSampleCount();
        const w = this.canvas.width, h = this.canvas.height;
        const perRow = Math.max(1, Math.floor(L / h));
        const scratch = new Float32Array(L);
        for (let y = 0; y < h; y++) {
            let rowSum = 0;
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                rowSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            }
            const avg = (rowSum / w) / 127.5 - 1;
            const start = y * perRow;
            for (let i = 0; i < perRow && (start + i) < L; i++) scratch[start + i] = avg;
        }
        const buffer = this._createBufferFromSamples(scratch);
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastRowBufferSources.push(src);
    }

    // Mode 5: Red Channel Only
    redChannelBufferMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        const samples = this._samplesChannel(data, 0);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Mode 5b: Green Channel Only
    greenChannelBufferMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        const samples = this._samplesChannel(data, 1);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Mode 5c: Blue Channel Only
    blueChannelBufferMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        const samples = this._samplesChannel(data, 2);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Mode 5d: RGB Split Panned (R left, G center, B right)
    rgbSplitPannedMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        const rs = this._samplesChannel(data, 0);
        const gs = this._samplesChannel(data, 1);
        const bs = this._samplesChannel(data, 2);
        const rBuf = this._createBufferFromSamples(rs);
        const gBuf = this._createBufferFromSamples(gs);
        const bBuf = this._createBufferFromSamples(bs);
        const redPanner = this.audioCtx.createStereoPanner(); redPanner.pan.value = -1;
        const greenPanner = this.audioCtx.createStereoPanner(); greenPanner.pan.value = 0;
        const bluePanner = this.audioCtx.createStereoPanner(); bluePanner.pan.value = 1;
        this.stopRowBufferPlayback();
        const now = this.audioCtx.currentTime;
        const redSrc = this._scheduleOneShot(rBuf, redPanner, { startTime: now, duration: FRAME_DURATION });
        const greenSrc = this._scheduleOneShot(gBuf, greenPanner, { startTime: now, duration: FRAME_DURATION });
        const blueSrc = this._scheduleOneShot(bBuf, bluePanner, { startTime: now, duration: FRAME_DURATION });
        redPanner.connect(this._getOutputNode());
        greenPanner.connect(this._getOutputNode());
        bluePanner.connect(this._getOutputNode());
        this.lastRowBufferSources.push(redSrc, greenSrc, blueSrc);
    }

    // Mode 6: Frame Buffer Loop
    frameBufferLoopMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        const samples = this._samplesBrightness(data);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const now = this.audioCtx.currentTime;
        const duration = 0.5; // maintain loop feature
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { startTime: now, duration, loop: true });
        this.lastFrameBufferSource = src;
    }

    // Mode 7: Center Region Only
    centerRegionBufferMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        const regionW = Math.floor(this.canvas.width / 2);
        const regionH = Math.floor(this.canvas.height / 2);
        const startX = Math.floor(this.canvas.width / 4);
        const startY = Math.floor(this.canvas.height / 4);
        const samples = this._samplesRegionBrightness(data, startX, startY, regionW, regionH);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Mode 8: Multi-frame Blend
    multiFrameBlendMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
        if (this.blendFrames.length >= this.blendFrameCount) this.blendFrames.shift();
        this.blendFrames.push(new Uint8ClampedArray(data));
        // Average brightness across stored frames per pixel then downsample
        const w = this.canvas.width, h = this.canvas.height, total = w * h;
        const L = this._getFrameSampleCount();
        this._ensureScratch(L);
        const out = this._scratchFrame, counts = this._scratchCounts;
        for (let p = 0; p < total; p++) {
            const bin = Math.floor(p * L / total);
            let sum = 0;
            const base = p * 4;
            for (let f = 0; f < this.blendFrames.length; f++) {
                const fr = this.blendFrames[f];
                sum += (fr[base] + fr[base + 1] + fr[base + 2]) / 3;
            }
            out[bin] += sum / this.blendFrames.length;
            counts[bin]++;
        }
        for (let i = 0; i < L; i++) out[i] = counts[i] ? (out[i] / counts[i]) / 127.5 - 1 : 0;
        const buffer = this._createBufferFromSamples(out);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Mode 9: Harmonic Series Mode
    harmonicSeriesMode(data) {
        this.stopAllBuffers();
        this.gain.gain.value = 0.1;
        for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;

        // Calculate average brightness
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avg = sum / (data.length / 4);

        // Map brightness to fundamental frequency (220Hz to 880Hz)
        const baseFreq = 220 + (avg / 255) * 660;

        // Create harmonic series based on brightness
        const numHarmonics = Math.floor(1 + (avg / 255) * 8); // 1 to 9 harmonics

        // Stop any existing oscillators
        if (this.harmonicOscillators) {
            this.harmonicOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) { }
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

            osc.connect(gain).connect(this._getOutputNode());
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
                } catch (e) { }
            });
        }

        this.activeGrains = [];

        // Create grains based on video data
        for (let i = 0; i < numGrains; i++) {
            const x = Math.floor((i / numGrains) * this.canvas.width);
            const y = Math.floor(Math.random() * this.canvas.height);
            const idx = (y * this.canvas.width + x) * 4;

            // Get brightness at this position
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

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
            grain.connect(grainGain).connect(this._getOutputNode());

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
                } catch (e) { }
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
                sum += (data[j] + data[j + 1] + data[j + 2]) / 3;
            }
            spectrum[i] = sum / Math.floor((endIdx - startIdx) / 4);
        }

        // Create oscillators for each frequency bin
        if (this.spectralOscillators) {
            this.spectralOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) { }
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

            osc.connect(gain).connect(this._getOutputNode());
            osc.start();

            this.spectralOscillators.push(osc);
        }
    }

    // Mode 12: MIDI-like Mode
    midiMode(data) {
        // Initialize note tracking on first call
        if (!this.midiNoteStates) {
            this.midiNoteStates = new Array(8).fill(null).map(() => ({
                isPlaying: false,
                oscillator: null,
                gain: null,
                lastBrightness: 0,
                triggerThreshold: 20, // Brightness change needed to trigger note
                sustainThreshold: 80   // Brightness below this will release the note
            }));
        }

        // Musical scale (C major - proper frequencies)
        // C4 = 261.63 Hz (base)
        // D4 = C4 * 9/8 = 294.33 Hz
        // E4 = C4 * 5/4 = 327.04 Hz  
        // F4 = C4 * 4/3 = 348.84 Hz
        // G4 = C4 * 3/2 = 392.45 Hz
        // A4 = C4 * 5/3 = 436.05 Hz
        // B4 = C4 * 15/8 = 490.56 Hz
        // C5 = C4 * 2 = 523.26 Hz
        const scale = [261.63, 294.33, 327.04, 348.84, 392.45, 436.05, 490.56, 523.26];

        // Process each note position
        const numNotes = 8;
        let notesPlaying = 0;

        for (let i = 0; i < numNotes; i++) {
            const x = Math.floor((i / numNotes) * this.canvas.width);
            const y = Math.floor(this.canvas.height / 2);
            const idx = (y * this.canvas.width + x) * 4;

            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            const noteState = this.midiNoteStates[i];
            const brightnessChange = Math.abs(brightness - noteState.lastBrightness);

            // Check if we should trigger a new note
            if (brightness > 100 && brightnessChange > noteState.triggerThreshold) {
                // Stop existing note if playing
                if (noteState.isPlaying) {
                    this.stopNote(noteState);
                }

                // Create new note with smooth envelope
                this.createNote(noteState, scale[i % scale.length], brightness, i);
                notesPlaying++;
            }

            // Check if we should release a sustained note
            if (noteState.isPlaying && brightness < noteState.sustainThreshold) {
                console.log(`Releasing note ${i}: brightness ${brightness} < threshold ${noteState.sustainThreshold}`);
                this.stopNote(noteState);
            }

            // Update last brightness for next frame
            noteState.lastBrightness = brightness;
        }

        // Log only when notes change
        if (notesPlaying > 0) {
            console.log(`Playing ${notesPlaying} musical notes`);
        }
    }


    // Helper method to create a note with smooth envelope
    createNote(noteState, frequency, brightness, noteIndex) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = frequency;

        // Calculate note volume based on brightness
        const noteGain = Math.max(0.1, (brightness / 255) * 0.4);

        // Smooth envelope: fade in, then sustain indefinitely
        const now = this.audioCtx.currentTime;
        const attackTime = 0.5;    // 500ms fade in

        // Start at 0, fade in to full volume
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(noteGain, now + attackTime);

        // Sustain indefinitely (no automatic stop)
        osc.connect(gain).connect(this._getOutputNode());
        osc.start(now);

        // Store note state
        noteState.oscillator = osc;
        noteState.gain = gain;
        noteState.isPlaying = true;

        console.log(`Note ${noteIndex}: ${frequency.toFixed(1)}Hz, brightness=${brightness}, gain=${noteGain.toFixed(3)} - SUSTAINING`);
    }

    // Helper method to stop a note
    stopNote(noteState) {
        if (noteState.gain) {
            // Smooth fade out
            const now = this.audioCtx.currentTime;
            noteState.gain.gain.linearRampToValueAtTime(0, now + NOTE_RELEASE_TIME);

            // Stop oscillator after fade
            setTimeout(() => {
                if (noteState.oscillator) {
                    try { noteState.oscillator.stop(); } catch (e) { }
                }
            }, 100);
        }

        noteState.isPlaying = false;
        noteState.oscillator = null;
        noteState.gain = null;
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
                try { particle.oscillator.stop(); } catch (e) { }
            }
        });

        this.particles = [];

        // Create new particles based on bright pixels
        const particleCount = 20;
        for (let i = 0; i < particleCount; i++) {
            const x = Math.floor(Math.random() * this.canvas.width);
            const y = Math.floor(Math.random() * this.canvas.height);
            const idx = (y * this.canvas.width + x) * 4;

            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

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

                osc.connect(gain).connect(panner).connect(this._getOutputNode());
                osc.start();

                particle.oscillator = osc;
                this.particles.push(particle);
            }
        }

        // Update particle lifetimes
        setTimeout(() => {
            this.particles.forEach(particle => {
                if (particle.oscillator) {
                    try { particle.oscillator.stop(); } catch (e) { }
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
                try { osc.stop(); } catch (e) { }
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
        pitchOsc.connect(pitchGain).connect(this._getOutputNode());
        pitchOsc.start();
        this.crossModalOscillators.push(pitchOsc);

        // Green channel → Timbre (waveform)
        const timbreOsc = this.audioCtx.createOscillator();
        const timbreGain = this.audioCtx.createGain();
        timbreOsc.type = green > 128 ? 'square' : 'sawtooth';
        timbreOsc.frequency.value = 220 + (green / 255) * 440; // A3 to A4
        timbreGain.gain.value = 0.15;
        timbreOsc.connect(timbreGain).connect(this._getOutputNode());
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

        rhythmOsc.connect(rhythmGain).connect(this._getOutputNode());
        rhythmOsc.start();
        this.crossModalOscillators.push(rhythmOsc);

        // Store interval for cleanup
        this.rhythmInterval = rhythmInterval;
    }

    // Chrominance as Audio Buffer (Cb channel)
    chrominanceBufferMode(data) {
        this.stopAllBuffers();
        const w = this.canvas.width, h = this.canvas.height, total = w * h;
        const samples = this._downsample(total, (i) => {
            const idx = i * 4;
            return -0.168736 * data[idx] - 0.331264 * data[idx + 1] + 0.5 * data[idx + 2] + 128;
        }, { scale255: true });
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Frame Difference Buffer (motion)
    frameDiffBufferMode(data) {
        this.stopAllBuffers();
        const w = this.canvas.width, h = this.canvas.height, total = w * h;
        const diffVals = new Float32Array(total);
        if (!this._prevFrameData) {
            this._prevFrameData = new Uint8ClampedArray(data.length);
        } else {
            for (let p = 0; p < total; p++) {
                const i = p * 4;
                const currGray = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const prevGray = (this._prevFrameData[i] + this._prevFrameData[i + 1] + this._prevFrameData[i + 2]) / 3;
                diffVals[p] = (currGray - prevGray) / 255; // already roughly -1..1 range
            }
        }
        this._prevFrameData = new Uint8ClampedArray(data);
        const samples = this._samplesFromMinus1To1(diffVals);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // Edge Detection Buffer (Sobel)
    edgeDetectBufferMode(data) {
        this.stopAllBuffers();
        const w = this.canvas.width, h = this.canvas.height, total = w * h;
        const gray = new Float32Array(total);
        for (let p = 0; p < total; p++) {
            const i = p * 4; gray[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const sobel = new Float32Array(total);
        const kx = [[-1,0,1],[-2,0,2],[-1,0,1]]; const ky = [[-1,-2,-1],[0,0,0],[1,2,1]];
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let gx = 0, gy = 0;
                for (let yy = -1; yy <= 1; yy++) {
                    for (let xx = -1; xx <= 1; xx++) {
                        const val = gray[(y + yy) * w + (x + xx)];
                        gx += kx[yy + 1][xx + 1] * val;
                        gy += ky[yy + 1][xx + 1] * val;
                    }
                }
                const mag = Math.sqrt(gx * gx + gy * gy);
                sobel[y * w + x] = (mag / 255) * 2 - 1;
            }
        }
        const samples = this._samplesFromMinus1To1(sobel);
        const buffer = this._createBufferFromSamples(samples);
        this.stopFrameBufferPlayback();
        const src = this._scheduleOneShot(buffer, this._getOutputNode(), { duration: FRAME_DURATION });
        this.lastFrameBufferSource = src;
    }

    // New Mode: Column Brightness driving Row Sine Bank
    // For each column, compute average brightness across rows. Treat the horizontal axis as time (scanned left->right).
    // Each canvas row owns a sine oscillator whose frequency is linearly spaced 50Hz..10kHz.
    // Column brightness controls instantaneous amplitude ("velocity" interpreted as amplitude driver) at the corresponding time slice.
    // We synthesize a short frame-duration buffer by summing all row sines with that shared per-column amplitude envelope.
    // Finally we normalize to prevent clipping and schedule as a one-shot buffer.
    columnRowSineBankBufferMode(data) {
        // Continuous oscillator bank (one per selected row sample) to avoid clicks from ultra-short buffers.
        // 1. Setup oscillator bank on first call.
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w === 0 || h === 0) return;

        // Limit number of oscillators for performance; sample rows uniformly.
        const TARGET_ROWS = 64; // adjust as needed
        if (!this.rowSineBankOscillators) {
            this.stopAllBuffers(); // ensure clean slate (will not recurse due to null check after deletion)
            this.gain.gain.value = 0;
            for (let i = 0; i < this.bandGains.length; i++) this.bandGains[i].gain.value = 0;
            this.rowSineBankOscillators = [];
            const fMin = 50;
            const fMax = 10000;
            for (let i = 0; i < TARGET_ROWS; i++) {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                const rowY = Math.floor(i * h / TARGET_ROWS);
                // Linear distribution as requested
                const freq = fMin + (fMax - fMin) * (i / Math.max(1, TARGET_ROWS - 1));
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.value = 0; // start silent
                osc.connect(gain).connect(this._getOutputNode());
                osc.start();
                this.rowSineBankOscillators.push({ osc, gain, rowY });
            }
        }

        // 2. Compute average brightness for each sampled row and update gains smoothly.
        const now = this.audioCtx.currentTime;
        const rampTime = FRAME_DURATION * 0.9; // smooth within frame
        const widthInv = 1 / Math.max(1, w);
        for (let i = 0; i < this.rowSineBankOscillators.length; i++) {
            const obj = this.rowSineBankOscillators[i];
            const y = obj.rowY;
            let sum = 0;
            const base = y * w * 4;
            for (let x = 0; x < w; x++) {
                const idx = base + x * 4;
                sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            }
            const avg = sum * widthInv; // 0..255
            // Gate: require at least 50% brightness for audibility.
            // Map avg (0..255) -> norm (0..1), then threshold at 0.5.
            // Below 0.5 => 0. Above 0.5 => re-normalize so 0.5->0, 1.0->1.
            const norm = avg / 255;
            const gated = norm <= 0.5 ? 0 : (norm - 0.5) / 0.5; // 0..1 after threshold
            const targetGain = gated * 0.25; // apply overall level scaling
            const g = obj.gain.gain;
            // Cancel future automation to avoid buildup
            if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            g.linearRampToValueAtTime(targetGain, now + rampTime);
        }
    }

    // Main method to process frame based on selected mode
    processFrame(data, mode) {
        const now = this.audioCtx.currentTime;
        if (this.crossfadeTimeMs > 0 && this.lastMode && this.lastMode !== mode) {
            const duration = this.crossfadeTimeMs / 1000;
            this.singleTransition = {
                from: this.lastMode,
                to: mode,
                startTime: now,
                endTime: now + duration
            };

            // Let old voices decay over the full crossfade instead of dropping immediately.
            this._fadeLegacyVoicesOut(duration);
        }
        this.lastMode = mode;

        if (this.singleTransition && this.singleTransition.to === mode) {
            const total = Math.max(0.0001, this.singleTransition.endTime - this.singleTransition.startTime);
            const progress = Math.max(0, Math.min(1, (now - this.singleTransition.startTime) / total));
            if (progress < 1) {
                const toSamples = this.getAudioBufferForMode(
                    data,
                    this.singleTransition.to,
                    'single-main:to',
                    { disableTransition: true }
                );
                const fadedIn = this._scaleSamples(toSamples, progress);
                if (fadedIn) {
                    this.playMixedBuffer(fadedIn);
                    return;
                }
            } else {
                this.singleTransition = null;
            }
        }

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
            case 'chrominance-buffer':
                this.chrominanceBufferMode(data);
                break;
            case 'frame-diff-buffer':
                this.frameDiffBufferMode(data);
                break;
            case 'edge-detect-buffer':
                this.edgeDetectBufferMode(data);
                break;
            case 'rows-audio-buffers':
                this.rowsAudioBuffersMode(data);
                break;
            case 'red-channel-buffer':
                this.redChannelBufferMode(data);
                break;
            case 'green-channel-buffer':
                this.greenChannelBufferMode(data);
                break;
            case 'blue-channel-buffer':
                this.blueChannelBufferMode(data);
                break;
            case 'rgb-split-panned':
                this.rgbSplitPannedMode(data);
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
            case 'column-row-sine-bank':
                this.columnRowSineBankBufferMode(data);
                break;
            default:
                console.warn('Unknown mode:', mode);
        }
    }
}
