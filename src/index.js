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

            // Initialize UI controls
            this.controls = new Controls();
            const controlsDiv = this.controls.createControls();
            this.app.appendChild(controlsDiv);

            // Create canvas for frame analysis
            const canvas = this.videoManager.createCanvas();
            const ctx = this.videoManager.getCanvasContext();

            // Initialize audio manager
            this.audioManager = new AudioManager(canvas.width);

            // Initialize sonification modes
            this.sonificationModes = new SonificationModes(this.audioManager, canvas, ctx);

            // Setup event listeners
            this.setupEventListeners();

            // Initialize webcam and start application
            await this.initializeWebcam();

            this.isInitialized = true;
            console.log('CamNoiser application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError(`Failed to initialize application: ${error.message}`);
        }
    }

    // Setup all event listeners
    setupEventListeners() {
        const startBtn = this.controls.getStartButton();
        startBtn.addEventListener('click', () => {
            this.audioManager.resumeAudioContext();
            startBtn.disabled = true;
            startBtn.textContent = 'Audio Started';
        });
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
            
            if (data) {
                // Process frame using the selected sonification mode
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


