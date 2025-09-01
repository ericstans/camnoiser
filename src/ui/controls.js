// UI Controls Module
// Handles creation and management of all UI control elements

export class Controls {
    constructor(audioManager, sonificationModes) {
        this.controlsDiv = null;
        this.modeSelect = null;
        this.startBtn = null;
        this.modeLabel = null;
        this.panSlider = null;
        this.panLabel = null;
        this.audioStarted = false;
        this.audioManager = audioManager;
        this.sonificationModes = sonificationModes;
    }

    createControls() {
        // Create controls container
        this.controlsDiv = document.createElement('div');
        this.controlsDiv.className = 'controls';

        // Create mode selection
        this.createModeSelection();
        
        // Create panning slider
        this.createPanningSlider();
        
        // Create start button
        this.createStartButton();

        return this.controlsDiv;
    }

    createModeSelection() {
        // Create mode label
        this.modeLabel = document.createElement('label');
        this.modeLabel.textContent = 'Mode: ';

        // Create mode select dropdown
        this.modeSelect = document.createElement('select');

        // Define all mode options
        const modeOptions = [
            { value: 'avg-brightness', text: 'Avg Brightness to Pitch' },
            { value: 'white-noise-filtering', text: 'White Noise Filtering' },
            { value: 'frame-audio-buffer', text: 'Frame as Audio Buffer' },
            { value: 'rows-audio-buffers', text: 'Rows as Audio Buffers' },
            { value: 'red-channel-buffer', text: 'Red Channel Only' },
            { value: 'frame-buffer-loop', text: 'Frame Buffer Loop' },
            { value: 'center-region-buffer', text: 'Center Region Only' },
            { value: 'multi-frame-blend', text: 'Multi-frame Blend' },
            { value: 'chrominance-buffer', text: 'Chrominance as Audio Buffer' },
            { value: 'frame-diff-buffer', text: 'Frame Difference Buffer' },
            { value: 'edge-detect-buffer', text: 'Edge Detection Buffer' },
            { value: 'harmonic-series', text: 'Harmonic Series' },
            { value: 'granular', text: 'Granular Synthesis' },
            { value: 'spectral', text: 'Spectral Analysis' },
            { value: 'midi-like', text: 'MIDI-like Musical' },
            { value: 'particle-system', text: 'Particle System' },
            { value: 'cross-modal', text: 'Cross-Modal Mapping' }
        ];

        // Create and append all mode options
        modeOptions.forEach(option => {
            const modeOption = document.createElement('option');
            modeOption.value = option.value;
            modeOption.textContent = option.text;
            this.modeSelect.appendChild(modeOption);
        });

        // Append mode selection to controls
        this.modeLabel.appendChild(this.modeSelect);
        this.controlsDiv.appendChild(this.modeLabel);
        this.controlsDiv.appendChild(this.modeSelect);
    }

    createPanningSlider() {
        // Create panning label
        this.panLabel = document.createElement('label');
        this.panLabel.textContent = 'Pan: ';
        this.panLabel.setAttribute('for', 'pan-slider');

        // Create panning slider
        this.panSlider = document.createElement('input');
        this.panSlider.type = 'range';
        this.panSlider.id = 'pan-slider';
        this.panSlider.min = '-1';
        this.panSlider.max = '1';
        this.panSlider.step = '0.1';
        this.panSlider.value = '0';
        this.panSlider.className = 'pan-slider';

        // Create value display
        const panValue = document.createElement('span');
        panValue.textContent = '0.0';
        panValue.className = 'pan-value';

        // Update value display when slider changes
        this.panSlider.addEventListener('input', () => {
            const panValue_num = parseFloat(this.panSlider.value);
            panValue.textContent = panValue_num.toFixed(1);
            
            // Update main oscillator panning
            if (this.audioManager && this.audioManager.getStereoPanner) {
                const panner = this.audioManager.getStereoPanner();
                if (panner) {
                    panner.pan.value = panValue_num;
                }
            }
            
            // Update band panners for white noise filtering mode
            if (this.audioManager && this.audioManager.getBandPanners) {
                const bandPanners = this.audioManager.getBandPanners();
                bandPanners.forEach(bandPanner => {
                    bandPanner.pan.value = panValue_num;
                });
            }
        });

        // Append panning controls to main controls
        this.controlsDiv.appendChild(this.panLabel);
        this.controlsDiv.appendChild(this.panSlider);
        this.controlsDiv.appendChild(panValue);
    }

    createStartButton() {
        this.startBtn = document.createElement('button');
        this.startBtn.textContent = 'Start Audio';
        this.controlsDiv.appendChild(this.startBtn);
    }

    getModeSelect() {
        return this.modeSelect;
    }

    getStartButton() {
        return this.startBtn;
    }

    getControlsDiv() {
        return this.controlsDiv;
    }

    getPanSlider() {
        return this.panSlider;
    }

    // Setup event listeners for the controls
    setupEventListeners() {
        if (this.startBtn && this.audioManager && this.sonificationModes) {
            this.startBtn.addEventListener('click', () => {
                if (!this.audioStarted) {
                    // Start audio
                    this.audioManager.resumeAudioContext();
                    this.startBtn.textContent = 'Stop Audio';
                    this.audioStarted = true;
                } else {
                    // Stop audio
                    // Don't call stopNoise() as it permanently stops the white noise source
                    // Just mute the gains instead
                    // Stop all sonification
                    this.sonificationModes.stopAllBuffers();
                    // Mute the main oscillator and gain
                    this.audioManager.getGain().gain.value = 0;
                    // Mute all band gains
                    this.audioManager.getBandGains().forEach(bandGain => {
                        bandGain.gain.value = 0;
                    });
                    this.startBtn.textContent = 'Start Audio';
                    this.audioStarted = false;
                }
            });
        }
    }
}
