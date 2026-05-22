// UI Controls Module
// Handles creation and management of all UI control elements

const ALL_MODES = [
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
    { value: 'cross-modal', text: 'Cross-Modal Mapping' },
];

const MODES_STORAGE_KEY = 'camnoiser-enabled-modes';

export class Controls {
    constructor(audioManager, sonificationModes) {
        this.controlsDiv = null;
        this.modeSelect = null;
        this.startBtn = null;
        this.modeLabel = null;
        this.panSlider = null;
        this.panLabel = null;
        this.crossfadeSlider = null;
        this.crossfadeLabel = null;
        this.audioStarted = false;
        this.audioManager = audioManager;
        this.sonificationModes = sonificationModes;
        this.cameraSelect = null;
        this.refreshBtn = null;
        this.composeSelect = null;
        this.invertAnalysisCheckbox = null;
        this.invertAnalysisLabel = null;
        this.hotkeysBound = false;
        this.hotkeyHandler = null;
        this.enabledModes = this._loadEnabledModes();
    }

    _loadEnabledModes() {
        try {
            const stored = localStorage.getItem(MODES_STORAGE_KEY);
            if (stored) {
                const saved = new Set(JSON.parse(stored));
                // Keep only values still present in ALL_MODES; re-add any new ones
                const result = new Set(ALL_MODES.map(m => m.value).filter(v => saved.has(v)));
                // If nothing survived (e.g. empty save), fall back to all
                return result.size > 0 ? result : new Set(ALL_MODES.map(m => m.value));
            }
        } catch (e) { /* ignore corrupt storage */ }
        return new Set(ALL_MODES.map(m => m.value));
    }

    _saveEnabledModes() {
        try {
            localStorage.setItem(MODES_STORAGE_KEY, JSON.stringify([...this.enabledModes]));
        } catch (e) { /* ignore */ }
    }

    _getActiveModeOptions() {
        return ALL_MODES.filter(m => this.enabledModes.has(m.value));
    }

    _populateSelect(selectEl, activeOptions, currentValue) {
        selectEl.innerHTML = '';
        activeOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.text;
            selectEl.appendChild(opt);
        });
        // Restore previous value, fall back to first option
        if (currentValue && activeOptions.some(o => o.value === currentValue)) {
            selectEl.value = currentValue;
        } else if (activeOptions.length > 0) {
            selectEl.value = activeOptions[0].value;
        }
    }

    _rebuildAllModeSelects() {
        const activeOptions = this._getActiveModeOptions();
        // Rebuild global mode select
        if (this.modeSelect) {
            const current = this.modeSelect.value;
            this._populateSelect(this.modeSelect, activeOptions, current);
            this.modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Rebuild per-webcam selects
        for (const [id, sel] of Object.entries(this.webcamModeSelects || {})) {
            const current = sel.value;
            this._populateSelect(sel, activeOptions, current);
        }
    }

    openEditModesModal() {
        // Remove any existing modal
        const existing = document.getElementById('edit-modes-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'edit-modes-modal-overlay';
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const title = document.createElement('h3');
        title.textContent = 'Edit Modes';
        title.className = 'modal-title';
        modal.appendChild(title);

        const desc = document.createElement('p');
        desc.className = 'modal-desc';
        desc.textContent = 'Uncheck modes to hide them from all dropdowns.';
        modal.appendChild(desc);

        const list = document.createElement('div');
        list.className = 'modal-mode-list';

        const checkboxes = new Map();
        ALL_MODES.forEach(mode => {
            const item = document.createElement('label');
            item.className = 'modal-mode-item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = mode.value;
            cb.checked = this.enabledModes.has(mode.value);
            checkboxes.set(mode.value, cb);

            item.appendChild(cb);
            item.appendChild(document.createTextNode(' ' + mode.text));
            list.appendChild(item);
        });
        modal.appendChild(list);

        const btnRow = document.createElement('div');
        btnRow.className = 'modal-btn-row';

        const selectAll = document.createElement('button');
        selectAll.textContent = 'Select All';
        selectAll.type = 'button';
        selectAll.className = 'modal-btn-secondary';
        selectAll.addEventListener('click', () => {
            checkboxes.forEach(cb => { cb.checked = true; });
        });

        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply';
        applyBtn.type = 'button';
        applyBtn.className = 'modal-btn-primary';
        applyBtn.addEventListener('click', () => {
            const newEnabled = new Set();
            checkboxes.forEach((cb, value) => {
                if (cb.checked) newEnabled.add(value);
            });
            // Require at least one mode enabled
            if (newEnabled.size === 0) {
                ALL_MODES.forEach(m => newEnabled.add(m.value));
            }
            this.enabledModes = newEnabled;
            this._saveEnabledModes();
            this._rebuildAllModeSelects();
            overlay.remove();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.type = 'button';
        cancelBtn.className = 'modal-btn-secondary';
        cancelBtn.addEventListener('click', () => overlay.remove());

        btnRow.appendChild(selectAll);
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(applyBtn);
        modal.appendChild(btnRow);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close on overlay click outside modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        // Close on Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);
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

        // Create analysis inversion toggle
        this.createInvertAnalysisToggle();

        // Create panning slider
        this.createPanningSlider();

        // Create global crossfade slider
        this.createCrossfadeSlider();
        
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
        this.modeLabel = document.createElement('label');
        this.modeLabel.textContent = 'Mode: ';

        this.modeSelect = document.createElement('select');
        this._populateSelect(this.modeSelect, this._getActiveModeOptions(), null);

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit Modes';
        editBtn.type = 'button';
        editBtn.className = 'edit-modes-btn';
        editBtn.addEventListener('click', () => this.openEditModesModal());

        this.modeRow = document.createElement('div');
        this.modeRow.className = 'control-row';
        this.modeRow.appendChild(this.modeLabel);
        this.modeRow.appendChild(this.modeSelect);
        this.modeRow.appendChild(editBtn);
        this.controlsDiv.appendChild(this.modeRow);
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
        const panRow = document.createElement('div');
        panRow.className = 'control-row';
        panRow.appendChild(this.panLabel);
        panRow.appendChild(this.panSlider);
        panRow.appendChild(panValue);
        this.controlsDiv.appendChild(panRow);
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
            { value: 'separate-streams', text: 'Separate Streams' },
        ];
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.text;
            this.composeSelect.appendChild(opt);
        });
        this.composeSelect.value = 'average';

        this.composeRow = document.createElement('div');
        this.composeRow.className = 'control-row';
        this.composeRow.appendChild(label);
        this.composeRow.appendChild(this.composeSelect);
        this.controlsDiv.appendChild(this.composeRow);

        // Container for per-webcam mode dropdowns
        this.webcamModesContainer = document.createElement('div');
        this.webcamModesContainer.className = 'webcam-modes-container';
        this.controlsDiv.appendChild(this.webcamModesContainer);

        // Track per-webcam mode selections
        this.webcamModeSelects = {};
        this.webcamPanSliders = {};

        // Listen for compose mode changes
        this.composeSelect.addEventListener('change', () => {
            this.updateModeSelectionVisibility();
            this.updateWebcamModeDropdowns(this.getSelectedCameraIds());
        });

        this.updateModeSelectionVisibility();
    }

    createCrossfadeSlider() {
        this.crossfadeLabel = document.createElement('label');
        this.crossfadeLabel.textContent = 'Crossfade Time: ';
        this.crossfadeLabel.setAttribute('for', 'crossfade-slider');

        this.crossfadeSlider = document.createElement('input');
        this.crossfadeSlider.type = 'range';
        this.crossfadeSlider.id = 'crossfade-slider';
        this.crossfadeSlider.min = '0';
        this.crossfadeSlider.max = '10000';
        this.crossfadeSlider.step = '10';
        this.crossfadeSlider.value = '0';
        this.crossfadeSlider.className = 'pan-slider';

        const crossfadeValue = document.createElement('span');
        crossfadeValue.textContent = '0ms';
        crossfadeValue.className = 'pan-value';

        this.crossfadeSlider.addEventListener('input', () => {
            const ms = parseInt(this.crossfadeSlider.value, 10) || 0;
            crossfadeValue.textContent = `${ms}ms`;
        });

        const row = document.createElement('div');
        row.className = 'control-row';
        row.appendChild(this.crossfadeLabel);
        row.appendChild(this.crossfadeSlider);
        row.appendChild(crossfadeValue);
        this.controlsDiv.appendChild(row);
    }

    updateModeSelectionVisibility() {
        if (!this.modeRow || !this.composeSelect) return;
        this.modeRow.style.display = this.composeSelect.value === 'separate-streams' ? 'none' : '';
    }

    // Call this whenever webcams or compose mode changes
    updateWebcamModeDropdowns(webcamIds = []) {
        const composeMode = this.composeSelect ? this.composeSelect.value : 'average';
        const previousModes = this.getWebcamModeSelections();
        const previousPans = this.getWebcamPanSelections();
        const defaultMode = this.modeSelect ? this.modeSelect.value : 'avg-brightness';
        // Remove old dropdowns
        this.webcamModesContainer.innerHTML = '';
        this.webcamModeSelects = {};
        this.webcamPanSliders = {};
        if (composeMode === 'separate-streams' && Array.isArray(webcamIds) && webcamIds.length > 0) {
            const modeOptions = this._getActiveModeOptions();
            webcamIds.slice(0, 10).forEach((id, idx) => {
                const row = document.createElement('div');
                row.className = 'webcam-mode-row';

                const label = document.createElement('label');
                label.textContent = `Webcam ${idx + 1} Mode:`;

                const select = document.createElement('select');
                this._populateSelect(select, modeOptions, previousModes[id] || defaultMode);

                const panLabel = document.createElement('label');
                panLabel.textContent = 'Pan:';

                const panSlider = document.createElement('input');
                panSlider.type = 'range';
                panSlider.min = '-1';
                panSlider.max = '1';
                panSlider.step = '0.1';
                panSlider.value = previousPans[id] !== undefined ? String(previousPans[id]) : '0';
                panSlider.className = 'pan-slider';

                const panValue = document.createElement('span');
                panValue.className = 'pan-value';
                panValue.textContent = parseFloat(panSlider.value).toFixed(1);

                panSlider.addEventListener('input', () => {
                    panValue.textContent = parseFloat(panSlider.value).toFixed(1);
                });

                row.appendChild(label);
                row.appendChild(select);
                row.appendChild(panLabel);
                row.appendChild(panSlider);
                row.appendChild(panValue);
                this.webcamModesContainer.appendChild(row);
                this.webcamModeSelects[id] = select;
                this.webcamPanSliders[id] = panSlider;
            });
        }
    }

    createInvertAnalysisToggle() {
        const row = document.createElement('div');
        row.className = 'control-row';

        this.invertAnalysisLabel = document.createElement('label');
        this.invertAnalysisLabel.textContent = 'Invert Analysis Colors: ';

        this.invertAnalysisCheckbox = document.createElement('input');
        this.invertAnalysisCheckbox.type = 'checkbox';

        this.invertAnalysisLabel.appendChild(this.invertAnalysisCheckbox);
        row.appendChild(this.invertAnalysisLabel);
        this.controlsDiv.appendChild(row);
    }

    createStartButton() {
        this.startBtn = document.createElement('button');
        this.startBtn.textContent = 'Start Audio';
        const startRow = document.createElement('div');
        startRow.className = 'control-row';
        startRow.appendChild(this.startBtn);
        this.controlsDiv.appendChild(startRow);
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
        // Update per-webcam mode dropdowns if in separate-streams mode
        this.updateWebcamModeDropdowns(this.getSelectedCameraIds());
    }

    onRefreshCameras(handler) {
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', handler);
        }
    }

    onCameraSelectionChange(handler) {
        if (this.cameraSelect) {
            this.cameraSelect.addEventListener('change', () => {
                const ids = this.getSelectedCameraIds();
                handler(ids);
                // Update per-webcam mode dropdowns if in separate-streams mode
                this.updateWebcamModeDropdowns(ids);
            });
        }
    }

    // Get the selected mode for each webcam (id: mode)
    getWebcamModeSelections() {
        const result = {};
        for (const [id, select] of Object.entries(this.webcamModeSelects || {})) {
            result[id] = select.value;
        }
        return result;
    }

    getWebcamPanSelections() {
        const result = {};
        for (const [id, slider] of Object.entries(this.webcamPanSliders || {})) {
            result[id] = parseFloat(slider.value);
        }
        return result;
    }

    selectCameraIds(deviceIds) {
        if (!this.cameraSelect) return;
        const set = new Set(deviceIds);
        Array.from(this.cameraSelect.options).forEach(opt => {
            opt.selected = set.has(opt.value);
        });
        this.updateWebcamModeDropdowns(this.getSelectedCameraIds());
    }

    onComposeModeChange(handler) {
        if (this.composeSelect) {
            this.composeSelect.addEventListener('change', () => handler(this.composeSelect.value));
        }
    }

    onInvertAnalysisChange(handler) {
        if (this.invertAnalysisCheckbox) {
            this.invertAnalysisCheckbox.addEventListener('change', () => handler(this.invertAnalysisCheckbox.checked));
        }
    }

    setComposeModeValue(value) {
        if (this.composeSelect) {
            this.composeSelect.value = value;
            this.updateModeSelectionVisibility();
            this.updateWebcamModeDropdowns(this.getSelectedCameraIds());
        }
    }

    setInvertAnalysisChecked(checked) {
        if (this.invertAnalysisCheckbox) this.invertAnalysisCheckbox.checked = checked;
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

    getCrossfadeMs() {
        if (!this.crossfadeSlider) return 0;
        return parseInt(this.crossfadeSlider.value, 10) || 0;
    }

    onCrossfadeChange(handler) {
        if (!this.crossfadeSlider) return;
        this.crossfadeSlider.addEventListener('input', () => {
            handler(this.getCrossfadeMs());
        });
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
