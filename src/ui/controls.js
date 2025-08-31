// UI Controls Module
// Handles creation and management of all UI control elements

export class Controls {
    constructor(audioManager, sonificationModes) {
        this.controlsDiv = null;
        this.modeSelect = null;
        this.startBtn = null;
        this.modeLabel = null;
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
            { value: 'multi-frame-blend', text: 'Multi-frame Blend' }
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
