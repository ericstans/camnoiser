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
        this.cameraSelect = null;
        this.refreshBtn = null;
        this.composeSelect = null;
        this.hotkeysBound = false;
        this.hotkeyHandler = null;
    }

    createControls() {
        // Create controls container
        this.controlsDiv = document.createElement('div');
        this.controlsDiv.className = 'controls';

    // Create camera selection first (so users can pick devices early)
    this.createCameraSelection();

    // Create mode selection
        this.createModeSelection();
        
    // Create compose mode selection
    this.createComposeSelection();

        // Create panning slider
        this.createPanningSlider();
        
        // Create start button
        this.createStartButton();

        return this.controlsDiv;
    }

    createCameraSelection() {
        const wrapper = document.createElement('div');
        wrapper.className = 'camera-controls';

        const label = document.createElement('label');
        label.textContent = 'Cameras: ';

        this.cameraSelect = document.createElement('select');
        this.cameraSelect.multiple = true;
        this.cameraSelect.size = 3;
        this.cameraSelect.style.minWidth = '220px';

        this.refreshBtn = document.createElement('button');
        this.refreshBtn.textContent = 'Refresh Cameras';
        this.refreshBtn.type = 'button';

        wrapper.appendChild(label);
        wrapper.appendChild(this.cameraSelect);
        wrapper.appendChild(this.refreshBtn);
        this.controlsDiv.appendChild(wrapper);
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
            { value: 'column-row-sine-bank', text: 'Column->Row Sine Bank' },
            { value: 'red-channel-buffer', text: 'Red Channel Only' },
            { value: 'green-channel-buffer', text: 'Green Channel Only' },
            { value: 'blue-channel-buffer', text: 'Blue Channel Only' },
            { value: 'rgb-split-panned', text: 'RGB Split Panned' },
            { value: 'frame-buffer-loop', text: 'Frame Buffer Loop' },
            { value: 'center-region-buffer', text: 'Center Region Only' },
            { value: 'multi-frame-blend', text: 'Multi-frame Blend' },
            { value: 'chrominance-buffer', text: 'Chrominance as Audio Buffer' },
            { value: 'chrominance-3frame-buffer', text: 'Chrominance 3-Frame Cycle' },
            { value: 'chrominance-3frame-buffer-old', text: 'Chrominance 3-Frame Cycle (Old)' },
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

        // Listen for mode changes to disable/enable panning slider
        this.modeSelect.addEventListener('change', () => {
            const selectedMode = this.modeSelect.value;
            if (selectedMode === 'chrominance-3frame-buffer' || selectedMode === 'chrominance-3frame-buffer-old') {
                // Disable panning slider for 3-frame modes
                this.panSlider.disabled = true;
                this.panSlider.value = '0';
                panValue.textContent = '0.0';
                this.panSlider.style.opacity = '0.5';
                this.panLabel.style.opacity = '0.5';
                panValue.style.opacity = '0.5';
            } else {
                // Enable panning slider for other modes
                this.panSlider.disabled = false;
                this.panSlider.style.opacity = '1';
                this.panLabel.style.opacity = '1';
                panValue.style.opacity = '1';
            }
        });

        // Append panning controls to main controls
        this.controlsDiv.appendChild(this.panLabel);
        this.controlsDiv.appendChild(this.panSlider);
        this.controlsDiv.appendChild(panValue);
    }

    createComposeSelection() {
        const label = document.createElement('label');
        label.textContent = 'Compose: ';

        this.composeSelect = document.createElement('select');
        const options = [
            { value: 'average', text: 'Average' },
            { value: 'side-by-side', text: 'Side-by-side' },
            { value: 'sum', text: 'Sum (Clamp)' },
            { value: 'sum-normalize', text: 'Sum (Normalize)' },
        ];
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.text;
            this.composeSelect.appendChild(opt);
        });
        this.composeSelect.value = 'average';

        this.controlsDiv.appendChild(label);
        this.controlsDiv.appendChild(this.composeSelect);
    }

    createStartButton() {
        this.startBtn = document.createElement('button');
        this.startBtn.textContent = 'Start Audio';
        this.controlsDiv.appendChild(this.startBtn);
    }

    getModeSelect() {
        return this.modeSelect;
    }

    getSelectedCameraIds() {
        if (!this.cameraSelect) return [];
        return Array.from(this.cameraSelect.selectedOptions).map(o => o.value);
    }

    setCameraOptions(devices) {
        if (!this.cameraSelect) return;
        this.cameraSelect.innerHTML = '';
        devices.forEach((d, idx) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Camera ${idx + 1}`;
            this.cameraSelect.appendChild(opt);
        });
    }

    onRefreshCameras(handler) {
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', handler);
        }
    }

    onCameraSelectionChange(handler) {
        if (this.cameraSelect) {
            this.cameraSelect.addEventListener('change', () => {
                handler(this.getSelectedCameraIds());
            });
        }
    }

    selectCameraIds(deviceIds) {
        if (!this.cameraSelect) return;
        const set = new Set(deviceIds);
        Array.from(this.cameraSelect.options).forEach(opt => {
            opt.selected = set.has(opt.value);
        });
    }

    onComposeModeChange(handler) {
        if (this.composeSelect) {
            this.composeSelect.addEventListener('change', () => handler(this.composeSelect.value));
        }
    }

    setComposeModeValue(value) {
        if (this.composeSelect) this.composeSelect.value = value;
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

    cycleMode(delta) {
        if (!this.modeSelect || this.modeSelect.options.length === 0) return;
        const optionsLength = this.modeSelect.options.length;
        const currentIndex = this.modeSelect.selectedIndex < 0 ? 0 : this.modeSelect.selectedIndex;
        const nextIndex = (currentIndex + delta + optionsLength) % optionsLength;
        this.modeSelect.selectedIndex = nextIndex;
        this.modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Setup event listeners for the controls
    setupEventListeners() {
        if (!this.hotkeysBound) {
            this.hotkeyHandler = (event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
                    return;
                }

                const target = event.target;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                    return;
                }

                const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
                const code = event.code || '';
                if (key === 'z' || code === 'KeyZ') {
                    event.preventDefault();
                    this.cycleMode(-1);
                } else if (key === 'x' || code === 'KeyX') {
                    event.preventDefault();
                    this.cycleMode(1);
                }
            };
            window.addEventListener('keydown', this.hotkeyHandler, true);
            document.addEventListener('keydown', this.hotkeyHandler, true);
            this.hotkeysBound = true;
        }

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
