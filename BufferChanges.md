Next improvements (optional)

Produce exactly L samples per frame (L ≈ sampleRate/60) instead of creating large buffers and truncating them. This reduces work and produces more consistent timbre.
Use an AudioWorklet with a ring buffer for the cleanest streaming behavior if you want fully continuous buffer-driven synthesis.