// Procedural WebAudio Liquid Drum & Bass Synth + High-Speed Wind & Dynamic SFX
// 174 BPM Liquid DnB Sequencer with Reese Bass, Breakbeat, and Euphoric Atmospheric Chords

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterFilter = null;
    this.masterComp = null;
    this.muted = false;
    this.playing = false;
    this.inMenu = true;
    this.step = 0;
    this.timer = null;
    this.customAudio = null;

    // Consecutive spark pickup combo
    this.sparkIndex = 0;
    this.lastSparkTime = 0;

    // Wind noise nodes
    this.windGain = null;
    this.windFilter = null;
    this.chords = [
      [293.66, 349.23, 440.0, 523.25, 659.25], // Dm9: D4, F4, A4, C5, E5
      [233.08, 293.66, 349.23, 440.0, 587.33], // Bbmaj7: Bb3, D4, F4, A4, D5
      [174.61, 261.63, 349.23, 440.0, 523.25], // Fmaj9: F3, C4, F4, A4, C5
      [261.63, 329.63, 392.0, 493.88, 587.33], // C9/G: C4, E4, G4, B4, D5
    ];
    this.bassNotes = [73.42, 58.27, 43.65, 65.41]; // D2, Bb1, F1, C2
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.playing = true;

    // Master Dynamics Compressor to prevent clipping and give punch
    this.masterComp = this.ctx.createDynamicsCompressor();
    this.masterComp.threshold.setValueAtTime(-14, this.ctx.currentTime);
    this.masterComp.knee.setValueAtTime(10, this.ctx.currentTime);
    this.masterComp.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.masterComp.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterComp.release.setValueAtTime(0.15, this.ctx.currentTime);

    // Master Filter (opens up with speed, smooth low-pass in menus)
    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(this.inMenu ? 850 : 3800, this.ctx.currentTime);
    this.masterFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.88, this.ctx.currentTime);

    this.masterFilter.connect(this.masterComp);
    this.masterComp.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Shared Noise Buffer (reused across wind, snares, hats, and boost roar to eliminate GC churn)
    const bufSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.25;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    this.windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    // High-altitude / Dive Whistle filter
    this.diveWhistleFilter = this.ctx.createBiquadFilter();
    this.diveWhistleFilter.type = 'bandpass';
    this.diveWhistleFilter.frequency.setValueAtTime(2400, this.ctx.currentTime);
    this.diveWhistleFilter.Q.setValueAtTime(4.5, this.ctx.currentTime);

    this.diveWhistleGain = this.ctx.createGain();
    this.diveWhistleGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterComp);

    noise.connect(this.diveWhistleFilter);
    this.diveWhistleFilter.connect(this.diveWhistleGain);
    this.diveWhistleGain.connect(this.masterComp);

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

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.88, this.ctx.currentTime, 0.05);
    }
    if (this.customAudio) {
      this.customAudio.muted = this.muted;
    }
  }

  setMenuMode(inMenu) {
    this.inMenu = inMenu;
    if (!this.ctx || !this.masterFilter) return;
    const targetFreq = inMenu ? 850 : 3800;
    this.masterFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.2);
  }

  startBreakbeat() {
    if (this.timer) clearInterval(this.timer);
    // 174 BPM 16th-note Liquid DnB Sample-Accurate Lookahead Scheduler
    const stepDuration = 60 / 174 / 4;
    let nextStepTime = this.ctx.currentTime + 0.05;

    this.timer = setInterval(() => {
      if (!this.ctx || this.muted || !this.playing || this.customAudio) return;
      while (nextStepTime < this.ctx.currentTime + 0.12) {
        this._scheduleStep(nextStepTime);
        nextStepTime += stepDuration;
      }
    }, 25);
  }

  _scheduleStep(time) {
    const s = this.step % 16;
    const bar = Math.floor(this.step / 16) % this.chords.length;
    const vol = this.inMenu ? 0.42 : 1.0;

    // KICK: Step 0 & Step 10 (Classic syncopated liquid 2-step)
    if (s === 0 || s === 10) {
      this._kick(time, vol);
    }

    // SNARE: Step 4 & Step 12 (Hard 2 and 4 backbeats)
    if (s === 4 || s === 12) {
      this._snare(time, 1.0 * vol);
    }
    // GHOST SNARES: Steps 7 & 15 (Liquid breakbeat shuffle)
    if (s === 7 || s === 15) {
      this._snare(time, 0.22 * vol, true);
    }

    // HI-HATS: Shuffling 16ths
    if (s % 2 === 0) {
      const isOpen = s === 2 || s === 6 || s === 14;
      this._hat(time, (isOpen ? 0.08 : 0.04) * vol, isOpen);
    } else if (!this.inMenu) {
      this._hat(time, 0.02 * vol, false);
    }

    // ROLLING REESE SUB-BASS (8th notes)
    if (s % 4 === 0) {
      const freq = this.bassNotes[bar];
      this._reeseBass(time, freq, 0.24, 0.18 * vol);
    }

    // LUSH ATMOSPHERIC LIQUID CHORD PAD
    if (s === 0 || s === 8) {
      const chord = this.chords[bar];
      this._liquidChord(time, chord, 0.65, 0.038 * vol);
    }

    // SPARKLE ARPEGGIO ACCENTS
    if (s % 2 === 1 && !this.inMenu) {
      const chord = this.chords[bar];
      const note = chord[(s + bar) % chord.length];
      this._synthPluck(time, note * 1.5, 0.025 * vol);
    }

    this.step++;
  }

  updateSpeed(speed, isDiving = false) {
    if (!this.ctx || !this.windGain || !this.masterFilter) return;
    const t = Math.max(0, Math.min(1, (speed - 40) / 140));

    // Wind filter responds dynamically to speed
    this.windFilter.frequency.setTargetAtTime(280 + t * 1800, this.ctx.currentTime, 0.06);
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : t * 0.16, this.ctx.currentTime, 0.06);

    // Fast-fall dive high-speed whistling slipstream
    const whistleVol = isDiving ? 0.18 : 0.0;
    this.diveWhistleGain.gain.setTargetAtTime(this.muted ? 0 : whistleVol, this.ctx.currentTime, 0.05);

    // Dynamic music filter sweeps open at high velocity
    if (!this.inMenu) {
      const musicCutoff = 1600 + t * 4500;
      this.masterFilter.frequency.setTargetAtTime(musicCutoff, this.ctx.currentTime, 0.08);
    }
  }

  // --- SYNTHESIZED SOUND MODULES ---

  _kick(t, volMult = 1) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.28 * volMult, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g);
    g.connect(this.masterFilter);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  _snare(t, volMult = 1, isGhost = false) {
    // Tonal body
    const osc = this.ctx.createOscillator();
    const gOsc = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isGhost ? 180 : 230, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.06);
    gOsc.gain.setValueAtTime(0.14 * volMult, t);
    gOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gOsc);
    gOsc.connect(this.masterFilter);
    osc.start(t);
    osc.stop(t + 0.09);

    // Snappy noise burst
    const dur = isGhost ? 0.04 : 0.11;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer || this.ctx.createBuffer(1, 100, this.ctx.sampleRate);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.setValueAtTime(900, t);
    const gNoise = this.ctx.createGain();
    gNoise.gain.setValueAtTime((isGhost ? 0.08 : 0.22) * volMult, t);
    gNoise.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(flt);
    flt.connect(gNoise);
    gNoise.connect(this.masterFilter);
    noise.start(t, Math.random() * 0.5, dur);
  }

  _hat(t, vol = 0.04, isOpen = false) {
    const dur = isOpen ? 0.09 : 0.035;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer || this.ctx.createBuffer(1, 100, this.ctx.sampleRate);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.setValueAtTime(6500, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(flt);
    flt.connect(g);
    g.connect(this.masterFilter);
    noise.start(t, Math.random() * 0.5, dur);
  }

  _reeseBass(t, freq, dur, vol = 0.16) {
    // Dual detuned sawtooths for thick warm Reese bass
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const flt = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 1.008, t);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(260, t);
    flt.Q.setValueAtTime(2.2, t);

    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc1.connect(flt);
    osc2.connect(flt);
    flt.connect(g);
    g.connect(this.masterFilter);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
  }

  _liquidChord(t, chordNotes, dur, vol = 0.03) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    chordNotes.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur);
    });

    g.connect(this.masterFilter);
  }

  _synthPluck(t, freq, vol = 0.03) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(this.masterFilter);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // --- GAMEPLAY SOUND EFFECTS ---

  playLanding(grade) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;

    if (grade === 'perfect') {
      // Dazzling euphoric pentatonic chime cascade + heavy sub boom!
      const chimeFreqs = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      chimeFreqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t + i * 0.022);
        g.gain.setValueAtTime(0.16, t + i * 0.022);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.022 + 0.38);
        osc.connect(g);
        g.connect(this.masterComp);
        osc.start(t + i * 0.022);
        osc.stop(t + i * 0.022 + 0.4);
      });

      // Sub sonic boom
      const boom = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      boom.frequency.setValueAtTime(110, t);
      boom.frequency.exponentialRampToValueAtTime(45, t + 0.32);
      bGain.gain.setValueAtTime(0.42, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      boom.connect(bGain);
      bGain.connect(this.masterComp);
      boom.start(t);
      boom.stop(t + 0.38);

    } else if (grade === 'good') {
      // Clean rising chime + smooth whoosh
      [440.0, 554.37, 659.25, 880.0].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t + i * 0.025);
        g.gain.setValueAtTime(0.14, t + i * 0.025);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.025 + 0.25);
        osc.connect(g);
        g.connect(this.masterComp);
        osc.start(t + i * 0.025);
        osc.stop(t + i * 0.025 + 0.28);
      });

    } else if (grade === 'sloppy' || grade === 'ok') {
      // Mild dull thud
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.14);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(this.masterComp);
      osc.start(t);
      osc.stop(t + 0.18);

    } else {
      // BAD: Heavy distorted impact crunch & stall thud
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(g);
      g.connect(this.masterComp);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  playJump() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.14);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(this.masterComp);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  playBoost() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;

    // Ascending supersonic turbine surge
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(1450, t + 0.35);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g);
    g.connect(this.masterComp);
    osc.start(t);
    osc.stop(t + 0.4);

    // Jet thrust roar
    const dur = 0.3;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer || this.ctx.createBuffer(1, 100, this.ctx.sampleRate);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(650, t);
    flt.Q.setValueAtTime(1.8, t);
    const gNoise = this.ctx.createGain();
    gNoise.gain.setValueAtTime(0.22, t);
    gNoise.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(flt);
    flt.connect(gNoise);
    gNoise.connect(this.masterComp);
    noise.start(t, Math.random() * 0.5, dur);
  }

  playSpark() {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastSparkTime > 750) {
      this.sparkIndex = 0;
    }
    this.lastSparkTime = now;

    // Ascending crystal pentatonic scale: C5, D5, E5, G5, A5, C6
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    const freq = pentatonic[this.sparkIndex % pentatonic.length];
    this.sparkIndex++;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.08);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g);
    g.connect(this.masterComp);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playObjectiveSuccess() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.06);
      g.gain.setValueAtTime(0.18, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.28);
      osc.connect(g);
      g.connect(this.masterComp);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.3);
    });
  }

  playHit() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.32);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    osc.connect(g);
    g.connect(this.masterComp);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  playBossHit() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [330, 495, 660, 990].forEach((f, i) => {
      this._synthPluck(t + i * 0.04, f, 0.16);
    });
  }
}
