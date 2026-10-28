// Procedural WebAudio Liquid Drum & Bass Synth + High-Speed Wind & Landing SFX
// Also supports dropping in custom Gemini Lyria MP3/WAV tracks via Drag & Drop or file picker!

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.playing = false;
    this.step = 0;
    this.timer = null;
    this.customAudio = null;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Continuous rushing wind noise modulated by speed
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 350;
    this.windFilter.Q.value = 1.4;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;

    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    noise.start();

    this.startBreakbeat();
  }

  loadCustomTrack(file) {
    this.init();
    if (this.customAudio) {
      this.customAudio.pause();
    }
    const url = URL.createObjectURL(file);
    this.customAudio = new Audio(url);
    this.customAudio.loop = true;
    this.customAudio.volume = 0.75;
    this.customAudio.play();
  }

  startBreakbeat() {
    if (this.timer) clearInterval(this.timer);
    // 174 BPM 16th-note liquid DnB sequencer
    const stepMs = (60 / 174 / 4) * 1000;
    const bassNotes = [55, 55, 65.41, 55, 73.42, 65.41, 82.41, 73.42];
    const arpNotes = [440, 523.25, 659.25, 783.99, 880, 659.25, 587.33, 523.25];

    this.timer = setInterval(() => {
      if (!this.ctx || this.muted || !this.playing || this.customAudio) return;
      const now = this.ctx.currentTime;
      const s = this.step % 16;

      // Kick on 0 and 10 (classic DnB 2-step pattern)
      if (s === 0 || s === 10) this._kick(now);
      // Crisp Snare on 4 and 12
      if (s === 4 || s === 12) this._snare(now);
      // Fast Ghost Hi-hat every 2 steps
      if (s % 2 === 0) this._hat(now, s % 4 === 0 ? 0.06 : 0.03);

      // Rolling Reese Sub-Bass on eighths
      if (s % 4 === 0) {
        const freq = bassNotes[Math.floor(this.step / 16) % bassNotes.length];
        this._sub(now, freq, 0.24);
      }

      // Euphoric Liquid Arpeggio Lead
      if (s % 2 === 0) {
        const note = arpNotes[(s / 2 + Math.floor(this.step / 16)) % arpNotes.length];
        this._synth(now, note, 0.035);
      }

      this.step++;
    }, stepMs);
  }

  updateSpeed(speed) {
    if (!this.ctx || !this.windGain) return;
    const t = Math.max(0, Math.min(1, (speed - 45) / 130));
    this.windFilter.frequency.setTargetAtTime(260 + t * 1400, this.ctx.currentTime, 0.08);
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : t * 0.14, this.ctx.currentTime, 0.08);
  }

  _kick(t) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.11);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  _snare(t) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(95, t + 0.08);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  _hat(t, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(6800, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  _sub(t, freq, dur) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(280, t);

    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _synth(t, freq, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playLanding(grade) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (grade === 'perfect') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(1180, t + 0.22);
      g.gain.setValueAtTime(0.24, t);
    } else if (grade === 'good') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, t);
      osc.frequency.exponentialRampToValueAtTime(720, t + 0.16);
      g.gain.setValueAtTime(0.16, t);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.2);
      g.gain.setValueAtTime(0.2, t);
    }
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  playJump() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(580, t + 0.12);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  playBoost() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.28);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  playSpark() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980 + Math.random() * 260, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.07);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  playHit() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.32);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  playBossHit() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [330, 495, 660, 990].forEach((f, i) => {
      this._synth(t + i * 0.04, f, 0.14);
    });
  }
}
