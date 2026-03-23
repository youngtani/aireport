class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputRate = options.processorOptions?.sampleRate || sampleRate;
    this.outputRate = 24000;
    this.buffer = [];
    // Flush every ~100ms of audio at output rate
    this.threshold = Math.floor(this.outputRate * 0.1);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    const ratio = this.outputRate / this.inputRate;

    if (Math.abs(ratio - 1.0) < 0.01) {
      // No resampling needed — input is already ~24kHz
      for (let i = 0; i < input.length; i++) {
        this.buffer.push(Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767))));
      }
    } else {
      // Resample via linear interpolation
      const len = Math.round(input.length * ratio);
      for (let i = 0; i < len; i++) {
        const src = i / ratio;
        const idx = Math.floor(src);
        const frac = src - idx;
        const sample =
          idx + 1 < input.length
            ? input[idx] * (1 - frac) + input[idx + 1] * frac
            : input[idx] || 0;
        this.buffer.push(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))));
      }
    }

    if (this.buffer.length >= this.threshold) {
      const pcm = new Int16Array(this.buffer);
      this.port.postMessage({ pcm: pcm.buffer }, [pcm.buffer]);
      this.buffer = [];
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
