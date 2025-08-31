// Import CSS file
import './style.css';
import { Controls } from './ui/controls.js';
import { AudioManager } from './audio/audioContext.js';
import { SonificationModes } from './audio/sonificationModes.js';
import { VideoManager } from './video/webcam.js';

// Main Application Class
class CamNoiserApp {
    constructor() {
        this.app = document.getElementById('app');
        this.videoManager = null;
        this.controls = null;
        this.audioManager = null;
        this.sonificationModes = null;
        this.isInitialized = false;
    }

    // Initialize all application components
    async initialize() {
        try {
            // Initialize video manager
            this.videoManager = new VideoManager();
            const video = this.videoManager.createVideoElement();
            this.app.appendChild(video);

            // Create canvas for frame analysis
            const canvas = this.videoManager.createCanvas();
            const ctx = this.videoManager.getCanvasContext();

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

            // Initialize webcam and start application
            await this.initializeWebcam();

            this.isInitialized = true;
            console.log('CamNoiser application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError(`Failed to initialize application: ${error.message}`);
        }
    }



    // Initialize webcam and start video processing
    async initializeWebcam() {
        try {
            await this.videoManager.requestWebcamAccess();
            await this.videoManager.startVideo(() => {
                // Start sonification loop when video starts playing
                this.startSonificationLoop();
            });
        } catch (error) {
            throw new Error(`Webcam initialization failed: ${error.message}`);
        }
    }

    // Start the main sonification loop
    startSonificationLoop() {
        const modeSelect = this.controls.getModeSelect();
        
        const sonifyFrame = () => {
            // Get current frame data from video manager
            const data = this.videoManager.getCurrentFrameData();
            
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


