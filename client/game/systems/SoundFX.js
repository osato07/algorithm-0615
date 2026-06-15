class SoundFX {
  constructor() {
    this._ctx = null;
  }

  resume() {
    if (!this._ctx) this._ctx = new AudioContext();
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  get _ready() {
    return this._ctx && this._ctx.state === 'running';
  }

  // ─── 公開メソッド ────────────────────────────────────────

  shoot(weaponId) {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    if (weaponId === 'shotgun') {
      this._noise(t, 1800, 0.04, 0.22, 0.55);
      this._tone(t, 'sawtooth', 120, 55,  0.03, 0.24, 0.30);
    } else if (weaponId === 'rifle') {
      this._noise(t, 4500, 0.015, 0.08, 0.65);
      this._tone(t, 'sawtooth', 300, 80,  0.015, 0.09, 0.35);
    } else {
      this._noise(t, 3200, 0.02, 0.13, 0.50);
      this._tone(t, 'sawtooth', 210, 70,  0.02,  0.13, 0.28);
    }
  }

  emptyClick() {
    if (!this._ready) return;
    this._tone(this._ctx.currentTime, 'square', 900, 700, 0.004, 0.05, 0.15);
  }

  reloadStart() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._noise(t,        1800, 0.003, 0.045, 0.26);
    this._noise(t + 0.04, 5200, 0.002, 0.050, 0.20);
    this._tone(t,        'square',   190, 95,  0.002, 0.055, 0.20);
    this._tone(t + 0.035,'sawtooth', 880, 420, 0.001, 0.045, 0.12);
    this._tone(t + 0.070,'square',   320, 150, 0.002, 0.060, 0.16);
  }

  reloadDone() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._noise(t,        6500, 0.002, 0.035, 0.22);
    this._noise(t + 0.055,3600, 0.002, 0.060, 0.20);
    this._tone(t,        'square', 760, 1180, 0.001, 0.040, 0.22);
    this._tone(t + 0.035,'square', 420,  260, 0.001, 0.055, 0.18);
    this._tone(t + 0.080,'square', 980, 1320, 0.001, 0.035, 0.14);
  }

  enemyKilled() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._noise(t, 700, 0.03, 0.38, 0.45);
    this._tone(t,  'sawtooth', 420, 75, 0.02, 0.38, 0.38);
  }

  damage() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._noise(t, 1400, 0.02, 0.22, 0.50);
    this._tone(t,  'sawtooth', 175, 95, 0.02, 0.22, 0.40);
  }

  levelUp() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    const freqs = [330, 392, 523, 659, 880];
    freqs.forEach((f, i) => {
      this._tone(t + i * 0.10, 'sine', f, f, 0.01, 0.16, 0.30 - i * 0.01);
    });
  }

  weaponSwitch() {
    if (!this._ready) return;
    this._tone(this._ctx.currentTime, 'square', 460, 560, 0.005, 0.07, 0.18);
  }

  buySuccess() {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    this._tone(t,        'sine', 660, 660, 0.01, 0.10, 0.28);
    this._tone(t + 0.11, 'sine', 880, 880, 0.01, 0.13, 0.28);
  }

  // ─── プリミティブ ─────────────────────────────────────────

  _noise(when, filterFreq, attack, decay, vol) {
    const ctx  = this._ctx;
    const rate = ctx.sampleRate;
    const len  = Math.ceil((attack + decay) * rate);
    const buf  = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src  = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    filt.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);

    src.connect(filt).connect(gain).connect(ctx.destination);
    src.start(when);
    src.stop(when + attack + decay + 0.02);
  }

  _tone(when, type, freqStart, freqEnd, attack, decay, vol) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), when + attack + decay);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);

    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + attack + decay + 0.02);
  }

  destroy() {
    this._ctx?.close();
  }
}
