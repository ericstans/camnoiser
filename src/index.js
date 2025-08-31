 


// Import CSS file
import './style.css';

const app = document.getElementById('app');

// Display webcam input in the #app div


const video = document.createElement('video');
video.autoplay = true;
video.className = 'responsive-video';
app.appendChild(video);

// Controls container

const controlsDiv = document.createElement('div');
controlsDiv.className = 'controls';
app.appendChild(controlsDiv);


// Add Mode picklist
const modeLabel = document.createElement('label');
modeLabel.textContent = 'Mode: ';
const modeSelect = document.createElement('select');

const modeOption1 = document.createElement('option');
modeOption1.value = 'avg-brightness';
modeOption1.textContent = 'Avg Brightness to Pitch';
modeSelect.appendChild(modeOption1);

const modeOption2 = document.createElement('option');
modeOption2.value = 'white-noise-filtering';
modeOption2.textContent = 'White Noise Filtering';
modeSelect.appendChild(modeOption2);

const modeOption3 = document.createElement('option');
modeOption3.value = 'frame-audio-buffer';
modeOption3.textContent = 'Frame as Audio Buffer';
modeSelect.appendChild(modeOption3);

const modeOption4 = document.createElement('option');
modeOption4.value = 'rows-audio-buffers';
modeOption4.textContent = 'Rows as Audio Buffers';
modeSelect.appendChild(modeOption4);



modeLabel.appendChild(modeSelect);
controlsDiv.appendChild(modeLabel);
controlsDiv.appendChild(modeSelect);

const modeOption5 = document.createElement('option');
modeOption5.value = 'red-channel-buffer';
modeOption5.textContent = 'Red Channel Only';
modeSelect.appendChild(modeOption5);

const modeOption6 = document.createElement('option');
modeOption6.value = 'frame-buffer-loop';
modeOption6.textContent = 'Frame Buffer Loop';
modeSelect.appendChild(modeOption6);

const modeOption7 = document.createElement('option');
modeOption7.value = 'center-region-buffer';
modeOption7.textContent = 'Center Region Only';
modeSelect.appendChild(modeOption7);

const modeOption8 = document.createElement('option');
modeOption8.value = 'multi-frame-blend';
modeOption8.textContent = 'Multi-frame Blend';
modeSelect.appendChild(modeOption8);
// For multi-frame blend mode
const blendFrameCount = 5;
let blendFrames = [];


// Add Start Audio button


const startBtn = document.createElement('button');
startBtn.textContent = 'Start Audio';
controlsDiv.appendChild(startBtn);

// Create a hidden canvas for frame analysis
const canvas = document.createElement('canvas');
canvas.width = 160; // smaller for performance
canvas.height = 120;
canvas.style.display = 'none';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');


// Web Audio API setup
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// For mode 1
const oscillator = audioCtx.createOscillator();
const gain = audioCtx.createGain();
oscillator.type = 'sine';
oscillator.frequency.value = 440; // default
gain.gain.value = 0.1; // low volume
oscillator.connect(gain).connect(audioCtx.destination);
oscillator.start();

// For mode 2: white noise filtering
const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
const noiseData = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseData.length; i++) {
	noiseData[i] = Math.random() * 2 - 1;
}
const noiseSource = audioCtx.createBufferSource();
noiseSource.buffer = noiseBuffer;
noiseSource.loop = true;

// Bandpass filter bank setup
const numBands = canvas.width; // one per column
const minFreq = 50, maxFreq = 20000;
const bandFilters = [];
const bandGains = [];
for (let i = 0; i < numBands; i++) {
	const filter = audioCtx.createBiquadFilter();
	filter.type = 'bandpass';
	// Logarithmic spacing for better perceptual mapping
	const freq = minFreq * Math.pow(maxFreq / minFreq, i / (numBands - 1));
	filter.frequency.value = freq;
	filter.Q.value = 10; // moderate Q
	const bandGain = audioCtx.createGain();
	bandGain.gain.value = 0;
	noiseSource.connect(filter).connect(bandGain).connect(audioCtx.destination);
	bandFilters.push(filter);
	bandGains.push(bandGain);
}
let noiseStarted = false;

// Resume audio context on button click
startBtn.addEventListener('click', () => {
	if (audioCtx.state === 'suspended') {
		audioCtx.resume();
	}
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


// For frame/row audio buffer playback
let lastFrameBufferSource = null;
let lastRowBufferSources = [];

function stopFrameBufferPlayback() {
	if (lastFrameBufferSource) {
		try { lastFrameBufferSource.stop(); } catch (e) {}
		lastFrameBufferSource = null;
	}
}
function stopRowBufferPlayback() {
	for (const src of lastRowBufferSources) {
		try { src.stop(); } catch (e) {}
	}
	lastRowBufferSources = [];
}

function sonifyFrame() {
	// Draw current video frame to canvas
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = frame.data;

	// Helper for stopping playback
	function stopAllBuffers() {
		stopFrameBufferPlayback();
		stopRowBufferPlayback();
	}

		if (modeSelect.value === 'avg-brightness') {
			stopAllBuffers();
			let sum = 0;
			for (let i = 0; i < data.length; i += 4) {
				sum += (data[i] + data[i+1] + data[i+2]) / 3;
			}
			const avg = sum / (data.length / 4);
			const minFreq = 220, maxFreq = 1760;
			const freq = minFreq + (maxFreq - minFreq) * (avg / 255);
			oscillator.frequency.value = freq;
			gain.gain.value = 0.1;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) noiseSource.stop();
			noiseStarted = false;
		} else if (modeSelect.value === 'white-noise-filtering') {
			stopAllBuffers();
			if (!noiseStarted) {
				try { noiseSource.start(); } catch (e) {}
				noiseStarted = true;
			}
			gain.gain.value = 0;
			for (let x = 0; x < canvas.width; x++) {
				let colSum = 0;
				for (let y = 0; y < canvas.height; y++) {
					const idx = (y * canvas.width + x) * 4;
					colSum += (data[idx] + data[idx+1] + data[idx+2]) / 3;
				}
				const avg = colSum / canvas.height;
				bandGains[x].gain.value = (avg / 255) * 0.2;
			}
		} else if (modeSelect.value === 'frame-audio-buffer') {
			gain.gain.value = 0;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) { try { noiseSource.stop(); } catch (e) {} noiseStarted = false; }
			stopRowBufferPlayback();
			const numSamples = canvas.width * canvas.height;
			const audioBuffer = audioCtx.createBuffer(1, numSamples, audioCtx.sampleRate);
			const buf = audioBuffer.getChannelData(0);
			for (let i = 0, j = 0; i < data.length; i += 4, j++) {
				buf[j] = ((data[i] + data[i+1] + data[i+2]) / 3) / 127.5 - 1;
			}
			stopFrameBufferPlayback();
			const src = audioCtx.createBufferSource();
			src.buffer = audioBuffer;
			src.connect(audioCtx.destination);
			src.start();
			lastFrameBufferSource = src;
			setTimeout(() => stopFrameBufferPlayback(), 33);
		} else if (modeSelect.value === 'rows-audio-buffers') {
			gain.gain.value = 0;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) { try { noiseSource.stop(); } catch (e) {} noiseStarted = false; }
			stopFrameBufferPlayback();
			stopRowBufferPlayback();
			for (let y = 0; y < canvas.height; y++) {
				const rowBuffer = audioCtx.createBuffer(1, canvas.width, audioCtx.sampleRate);
				const rowData = rowBuffer.getChannelData(0);
				for (let x = 0; x < canvas.width; x++) {
					const idx = (y * canvas.width + x) * 4;
					rowData[x] = ((data[idx] + data[idx+1] + data[idx+2]) / 3) / 127.5 - 1;
				}
				const src = audioCtx.createBufferSource();
				src.buffer = rowBuffer;
				src.connect(audioCtx.destination);
				src.start(audioCtx.currentTime + y * 0.001);
				lastRowBufferSources.push(src);
			}
			setTimeout(() => stopRowBufferPlayback(), 33);
		} else if (modeSelect.value === 'red-channel-buffer') {
			stopAllBuffers();
			gain.gain.value = 0;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) { try { noiseSource.stop(); } catch (e) {} noiseStarted = false; }
			const numSamples = canvas.width * canvas.height;
			const audioBuffer = audioCtx.createBuffer(1, numSamples, audioCtx.sampleRate);
			const buf = audioBuffer.getChannelData(0);
			for (let i = 0, j = 0; i < data.length; i += 4, j++) {
				buf[j] = (data[i] / 127.5) - 1;
			}
			stopFrameBufferPlayback();
			const src = audioCtx.createBufferSource();
			src.buffer = audioBuffer;
			src.connect(audioCtx.destination);
			src.start();
			lastFrameBufferSource = src;
			setTimeout(() => stopFrameBufferPlayback(), 33);
		} else if (modeSelect.value === 'frame-buffer-loop') {
			stopAllBuffers();
			gain.gain.value = 0;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) { try { noiseSource.stop(); } catch (e) {} noiseStarted = false; }
			const numSamples = canvas.width * canvas.height;
			const audioBuffer = audioCtx.createBuffer(1, numSamples, audioCtx.sampleRate);
			const buf = audioBuffer.getChannelData(0);
			for (let i = 0, j = 0; i < data.length; i += 4, j++) {
				buf[j] = ((data[i] + data[i+1] + data[i+2]) / 3) / 127.5 - 1;
			}
			stopFrameBufferPlayback();
			const src = audioCtx.createBufferSource();
			src.buffer = audioBuffer;
			src.loop = true;
			src.connect(audioCtx.destination);
			src.start();
			lastFrameBufferSource = src;
			// Let it loop for 0.5s, then stop
			setTimeout(() => stopFrameBufferPlayback(), 500);
		} else if (modeSelect.value === 'center-region-buffer') {
			stopAllBuffers();
			gain.gain.value = 0;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) { try { noiseSource.stop(); } catch (e) {} noiseStarted = false; }
			// Use only the center region (e.g., 1/4 of the frame)
			const regionW = Math.floor(canvas.width / 2);
			const regionH = Math.floor(canvas.height / 2);
			const startX = Math.floor(canvas.width / 4);
			const startY = Math.floor(canvas.height / 4);
			const numSamples = regionW * regionH;
			const audioBuffer = audioCtx.createBuffer(1, numSamples, audioCtx.sampleRate);
			const buf = audioBuffer.getChannelData(0);
			let j = 0;
			for (let y = startY; y < startY + regionH; y++) {
				for (let x = startX; x < startX + regionW; x++) {
					const idx = (y * canvas.width + x) * 4;
					buf[j++] = ((data[idx] + data[idx+1] + data[idx+2]) / 3) / 127.5 - 1;
				}
			}
			stopFrameBufferPlayback();
			const src = audioCtx.createBufferSource();
			src.buffer = audioBuffer;
			src.connect(audioCtx.destination);
			src.start();
			lastFrameBufferSource = src;
			setTimeout(() => stopFrameBufferPlayback(), 33);
		} else if (modeSelect.value === 'multi-frame-blend') {
			stopAllBuffers();
			gain.gain.value = 0;
			for (let i = 0; i < bandGains.length; i++) bandGains[i].gain.value = 0;
			if (noiseStarted) { try { noiseSource.stop(); } catch (e) {} noiseStarted = false; }
			// Keep a buffer of the last N frames
			if (blendFrames.length >= blendFrameCount) blendFrames.shift();
			blendFrames.push(new Uint8ClampedArray(data));
			// Blend frames (average)
			const numSamples = canvas.width * canvas.height;
			const audioBuffer = audioCtx.createBuffer(1, numSamples, audioCtx.sampleRate);
			const buf = audioBuffer.getChannelData(0);
			for (let i = 0, j = 0; i < data.length; i += 4, j++) {
				let sum = 0;
				for (let f = 0; f < blendFrames.length; f++) {
					sum += (blendFrames[f][i] + blendFrames[f][i+1] + blendFrames[f][i+2]) / 3;
				}
				buf[j] = (sum / blendFrames.length) / 127.5 - 1;
			}
			stopFrameBufferPlayback();
			const src = audioCtx.createBufferSource();
			src.buffer = audioBuffer;
			src.connect(audioCtx.destination);
			src.start();
			lastFrameBufferSource = src;
			setTimeout(() => stopFrameBufferPlayback(), 33);
		}
		requestAnimationFrame(sonifyFrame);
	}