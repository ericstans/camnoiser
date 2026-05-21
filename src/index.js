// Import CSS file
import './style.css';
import { Controls } from './ui/controls.js';
import { AudioManager } from './audio/audioContext.js';
import { SonificationModes } from './audio/sonificationModes.js';
import { MultiCameraManager } from './video/multiCamera.js';

// Main Application Class
class CamNoiserApp {
    constructor() {
        this.app = document.getElementById('app');
    this.multiCamera = null;
        this.controls = null;
        this.audioManager = null;
        this.sonificationModes = null;
        this.isInitialized = false;
    }

    // Initialize all application components
    async initialize() {
        try {
            // Initialize multi-camera manager
            this.multiCamera = new MultiCameraManager();
            const videosContainer = this.multiCamera.createVideosContainer();
            this.app.appendChild(videosContainer);

            // Create analysis canvas (shared composite)
            const canvas = this.multiCamera.createAnalysisCanvas();
            const ctx = this.multiCamera.getAnalysisCanvasContext();

            // Initialize audio manager
            this.audioManager = new AudioManager(canvas.width);

            // Initialize sonification modes
            this.sonificationModes = new SonificationModes(this.audioManager, canvas, ctx);

            // Initialize UI controls (after audio and sonification are ready)
            this.controls = new Controls(this.audioManager, this.sonificationModes);
            const controlsDiv = this.controls.createControls();
            this.app.appendChild(controlsDiv);

            // Setup event listeners
            this.controls.setupEventListeners();

            // Populate and wire camera selection
            await this.populateCameras();
            this.controls.onRefreshCameras(() => this.populateCameras());
            this.controls.onCameraSelectionChange(async (ids) => {
                try {
                    await this.multiCamera.setSelectedDevices(ids);
                } catch (e) {
                    console.error('Failed to switch cameras:', e);
                }
            });
            this.controls.onComposeModeChange((mode) => this.multiCamera.setComposeMode(mode));
            this.controls.onInvertAnalysisChange((enabled) => this.multiCamera.setInvertAnalysis(enabled));

            // Request initial cameras (default: first available)
            await this.initializeCameras();

            this.isInitialized = true;
            console.log('CamNoiser application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError(`Failed to initialize application: ${error.message}`);
        }
    }



    async populateCameras() {
        try {
            const devices = await this.multiCamera.enumerateCameras();
            this.controls.setCameraOptions(devices);
        } catch (e) {
            this.showError(`Could not enumerate cameras: ${e.message}`);
        }
    }

    // Initialize selected cameras and start processing
    async initializeCameras() {
        try {
            const devices = await this.multiCamera.enumerateCameras();
            const defaultIds = devices.slice(0, 1).map(d => d.deviceId);
            await this.multiCamera.setSelectedDevices(defaultIds);
            this.controls.selectCameraIds(defaultIds);
            this.multiCamera.setComposeMode('average');
            this.controls.setComposeModeValue('average');
            this.multiCamera.setInvertAnalysis(false);
            this.controls.setInvertAnalysisChecked(false);
            // Start sonification loop when first video starts playing
            this.startSonificationLoop();
        } catch (error) {
            throw new Error(`Camera initialization failed: ${error.message}`);
        }
    }

    // Start the main sonification loop
    startSonificationLoop() {
        const modeSelect = this.controls.getModeSelect();
        const getWebcamIds = () => this.controls.getSelectedCameraIds();
        const getWebcamModes = () => this.controls.getWebcamModeSelections();
        const getWebcamPans = () => this.controls.getWebcamPanSelections();
        const composeSelect = this.controls.composeSelect;
        const multiCamera = this.multiCamera;
        const sonificationModes = this.sonificationModes;
        const videoManagers = () => multiCamera.videoManagers;

        const sonifyFrame = () => {
            const composeMode = composeSelect ? composeSelect.value : 'average';
            if (composeMode === 'separate-streams' && this.controls.audioStarted) {
                // Per-webcam sonicification and mixing
                const ids = getWebcamIds();
                const modeMap = getWebcamModes();
                const panMap = getWebcamPans();
                const vms = videoManagers();
                const perBuffers = [];
                const perPans = [];
                // For each webcam, process individually
                vms.forEach((vm, idx) => {
                    const id = ids[idx];
                    if (!id) return;
                    const v = vm.getVideo();
                    if (!v || v.readyState < 2 || v.paused) return;
                    const ctx = vm.getCanvasContext();
                    if (!ctx) return;
                    ctx.drawImage(v, 0, 0, vm.getCanvas().width, vm.getCanvas().height);
                    const frame = ctx.getImageData(0, 0, vm.getCanvas().width, vm.getCanvas().height).data;
                    // Use selected mode for this webcam
                    const mode = modeMap[id] || modeSelect.value;
                    // Synthesize audio buffer for this frame and mode
                    // We'll use frameAudioBufferMode as a template for all modes
                    // (Assume processFrame returns a buffer for this context)
                    if (sonificationModes.getAudioBufferForMode) {
                        const buf = sonificationModes.getAudioBufferForMode(frame, mode, id);
                        if (buf) {
                            perBuffers.push(buf);
                            perPans.push(panMap[id] ?? 0);
                        }
                    }
                });
                const globalPan = parseFloat(this.controls.getPanSlider().value || '0');
                if (perBuffers.length > 0) {
                    if (sonificationModes.playSeparateStreams) {
                        sonificationModes.playSeparateStreams(perBuffers, perPans, globalPan);
                    } else if (sonificationModes.playMixedBuffer) {
                        // Fallback for older builds
                        sonificationModes.playMixedBuffer(perBuffers[0]);
                    }
                }
            } else {
                // Get composite frame data from multi-camera
                const data = this.multiCamera.getCompositeFrameData();
                if (data && this.controls.audioStarted) {
                    // Only process frame if audio has been started by user
                    this.sonificationModes.processFrame(data, modeSelect.value);
                }
            }
            // Continue the animation loop
            requestAnimationFrame(sonifyFrame);
        };
        // Start the loop
        requestAnimationFrame(sonifyFrame);
    }

    // Show error message to user
    showError(message) {
        this.app.innerHTML = `<div class="error-message"><p>Error: ${message}</p></div>`;
    }

    // Cleanup resources when needed
    cleanup() {
        if (this.videoManager) {
            this.videoManager.stopWebcam();
        }
        // Add other cleanup as needed
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new CamNoiserApp();
    app.initialize().catch(error => {
        console.error('Application failed to start:', error);
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
}); 


