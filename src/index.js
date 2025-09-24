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
            // Start sonification loop when first video starts playing
            this.startSonificationLoop();
        } catch (error) {
            throw new Error(`Camera initialization failed: ${error.message}`);
        }
    }

    // Start the main sonification loop
    startSonificationLoop() {
        const modeSelect = this.controls.getModeSelect();
        
        const sonifyFrame = () => {
            // Get composite frame data from multi-camera
            const data = this.multiCamera.getCompositeFrameData();
            
            if (data && this.controls.audioStarted) {
                // Only process frame if audio has been started by user
                this.sonificationModes.processFrame(data, modeSelect.value);
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


