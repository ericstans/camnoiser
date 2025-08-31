// UI Controls Module
// Handles creation and management of all UI control elements

export class Controls {
    constructor() {
        this.controlsDiv = null;
        this.modeSelect = null;
        this.startBtn = null;
        this.modeLabel = null;
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
}
