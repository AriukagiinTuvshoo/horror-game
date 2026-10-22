class HospitalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = .65;

  start() {
    if (this.context) { void this.context.resume(); return; }
    try {
      const ctx = new AudioContext(); this.context = ctx;
      this.master = ctx.createGain(); this.master.gain.value = this.volume * .45; this.master.connect(ctx.destination);
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = previous * 3.5; }
      const source = ctx.createBufferSource(); source.buffer = this.noiseBuffer; source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 540;
      this.ambience = ctx.createGain(); this.ambience.gain.value = .23;
      source.connect(filter); filter.connect(this.ambience); this.ambience.connect(this.master); source.start();
      [49, 50.2, 98].forEach((frequency, i) => {
        const hum = ctx.createOscillator(), gain = ctx.createGain(); hum.frequency.value = frequency; gain.gain.value = i === 2 ? .012 : .035;
        hum.connect(gain); gain.connect(this.ambience!); hum.start();
      });
    } catch { /* The game remains playable if the browser blocks Web Audio. */ }
  }

  setVolume(value: number) {
    this.volume = value / 100;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume * .45, this.context.currentTime, .1);
    if (value === 0 && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  tone(frequency: number, duration = .2, type: OscillatorType = 'sine', volume = .2, endFrequency?: number) {
    if (!this.context || !this.master) return;
    const ctx = this.context, time = ctx.currentTime;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(.001, time); gain.gain.linearRampToValueAtTime(volume, time + .01); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start(); oscillator.stop(time + duration + .02);
  }

  step(enemy = false, pan = 0, intensity = 1) {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const ctx = this.context, time = ctx.currentTime;
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
    noise.buffer = this.noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = enemy ? 330 : 750;
    panner.pan.value = Math.max(-1, Math.min(1, pan)); gain.gain.setValueAtTime((enemy ? .9 : .55) * intensity, time); gain.gain.exponentialRampToValueAtTime(.001, time + .22);
    noise.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(this.master); noise.start(time, Math.random() * 3); noise.stop(time + .25);
    this.tone(enemy ? 43 : 75, .12, 'sine', (enemy ? .3 : .12) * intensity, 30);
  }

  click() { this.tone(580, .055, 'sine', .12, 280); }
  success() { this.tone(440, .22, 'sine', .12); setTimeout(() => this.tone(660, .35, 'sine', .1), 110); }
  error() { this.tone(85, .35, 'sawtooth', .11, 38); }
  danger() { this.tone(46, 1.4, 'sawtooth', .15, 31); this.tone(91, 1.2, 'sine', .1, 65); }
  impact() { this.step(true, 0, 1.3); this.tone(36, .8, 'sine', .3); }

  speak(text: string) {
    if (!('speechSynthesis' in window) || this.volume === 0) return false;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = .82; utterance.pitch = .7; utterance.volume = Math.min(1, this.volume);
    const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith('en') && /female|samantha|zira|karen/i.test(v.name));
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance); return true;
  }
  stopSpeech() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  dispose() { this.stopSpeech(); if (this.context) void this.context.close(); this.context = null; this.master = null; }
}

export const audio = new HospitalAudio();