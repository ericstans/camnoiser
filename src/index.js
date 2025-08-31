 


// Import CSS file
import './style.css';
import { Controls } from './ui/controls.js';
import { AudioManager } from './audio/audioContext.js';
import { SonificationModes } from './audio/sonificationModes.js';

const app = document.getElementById('app');

// Display webcam input in the #app div
const video = document.createElement('video');
video.autoplay = true;
video.className = 'responsive-video';
app.appendChild(video);

// Create and setup UI controls
const controls = new Controls();
const controlsDiv = controls.createControls();
app.appendChild(controlsDiv);

// Get references to control elements
const modeSelect = controls.getModeSelect();
const startBtn = controls.getStartButton();



// Create a hidden canvas for frame analysis
const canvas = document.createElement('canvas');
canvas.width = 160; // smaller for performance
canvas.height = 120;
canvas.style.display = 'none';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');


// Initialize audio manager
const audioManager = new AudioManager(canvas.width);
const audioCtx = audioManager.getAudioContext();
const oscillator = audioManager.getOscillator();
const gain = audioManager.getGain();
const noiseSource = audioManager.getNoiseSource();
const bandGains = audioManager.getBandGains();

// Resume audio context on button click
startBtn.addEventListener('click', () => {
	audioManager.resumeAudioContext();
	startBtn.disabled = true;
	startBtn.textContent = 'Audio Started';
});

// Request webcam access
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
	navigator.mediaDevices.getUserMedia({ video: true })
		.then(function(stream) {
			video.srcObject = stream;
			video.onplay = () => {
				// Start sonification loop
				requestAnimationFrame(sonifyFrame);
			};
		})
		.catch(function(err) {
			app.innerHTML = '<p>Could not access webcam: ' + err.message + '</p>';
		});
} else {
	app.innerHTML = '<p>getUserMedia is not supported in this browser.</p>';
}


// Initialize sonification modes
const sonificationModes = new SonificationModes(audioManager, canvas, ctx);

function sonifyFrame() {
	// Draw current video frame to canvas
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = frame.data;

	// Process frame using the selected sonification mode
	sonificationModes.processFrame(data, modeSelect.value);
	
	// Continue the animation loop
	requestAnimationFrame(sonifyFrame);
}