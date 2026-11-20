// Procedural WebAudio sound + music. Every PRD event has a voice here.
// Swap any function for a recorded sample later without touching game code.

type Track = 'normal' | 'fever' | 'rain' | 'none';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  muted = localStorage.getItem('cosmicPachinko.muted') === '1';
  private noiseBuf!: AudioBuffer;
  private charge: { osc: OscillatorNode; osc2: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;
  private track: Track = 'none';
  private nextBeat = 0;
  private step = 0;
  private humNodes: { stop: () => void } | null = null;
  private lastTick = 0;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.7;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.22;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem('cosmicPachinko.muted', m ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, bus?: AudioNode, slideTo?: number) {
    if (!this.ctx) return;
    const t = this.t + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, when = 0, type: BiquadFilterType = 'bandpass', bus?: AudioNode, q = 1.2) {
    if (!this.ctx) return;
    const t = this.t + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus ?? this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // ---- charge (hold Space) ----
  chargeStart() {
    if (!this.ctx) return;
    this.chargeStop();
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.value = 140;
    o2.frequency.value = 280;
    lfo.frequency.value = 9;
    lg.gain.value = 0;
    lfo.connect(lg).connect(g.gain);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.09, this.t + 0.05);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.sfxBus);
    o.start();
    o2.start();
    lfo.start();
    this.charge = { osc: o, osc2: o2, g, lfo };
    (this.charge as any).lg = lg;
  }
  chargeUpdate(frac: number) {
    if (!this.charge || !this.ctx) return;
    const f = 140 * Math.pow(2, frac * 2.2);
    this.charge.osc.frequency.setTargetAtTime(f, this.t, 0.02);
    this.charge.osc2.frequency.setTargetAtTime(f * 2, this.t, 0.02);
    (this.charge as any).lg.gain.setTargetAtTime(frac >= 1 ? 0.05 : 0, this.t, 0.03);
  }
  chargeStop() {
    if (!this.charge || !this.ctx) return;
    const c = this.charge;
    c.g.gain.cancelScheduledValues(this.t);
    c.g.gain.setTargetAtTime(0.0001, this.t, 0.02);
    c.osc.stop(this.t + 0.1);
    c.osc2.stop(this.t + 0.1);
    c.lfo.stop(this.t + 0.1);
    this.charge = null;
  }

  /** Launch: soft spring "thunk" + a metallic tick + the ball rolling up the rail. */
  shoot(strength: number) {
    this.tone(170, 0.14, 'sine', 0.32, 0, undefined, 70);
    this.tone(95, 0.1, 'triangle', 0.12, 0.005, undefined, 60);
    this.tone(1900 + strength * 500, 0.05, 'sine', 0.035, 0.01);
    this.noise(0.25 + strength * 0.35, 0.05, 900, 500, 0.03, 'lowpass', undefined, 0.7);
  }

  /** Hopeful arpeggio when the Last Chance Wheel appears. */
  lastChance() {
    [0, 4, 7, 11, 14].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.5, 'triangle', 0.09, i * 0.09));
  }

  /** Golden alien hit: coin + a note that climbs with the combo. */
  goldHit(combo: number) {
    const semis = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.min(10, Math.floor(combo / 2))];
    const f = 784 * Math.pow(2, semis / 12);
    this.tone(f, 0.18, 'square', 0.06);
    this.tone(f * 1.5, 0.25, 'triangle', 0.07, 0.04);
    this.tone(2637, 0.12, 'sine', 0.04, 0.02);
  }

  warp() {
    this.tone(300, 0.7, 'sawtooth', 0.08, 0, undefined, 1800);
    this.tone(600, 0.7, 'sine', 0.1, 0.02, undefined, 2400);
    this.noise(0.6, 0.12, 400, 4000, 0, 'bandpass');
  }

  crownHole() {
    [0, 7, 12].forEach((s, i) => this.tone(988 * Math.pow(2, s / 12), 0.16, 'triangle', 0.1, i * 0.05));
  }

  kicker() {
    this.tone(260, 0.08, 'square', 0.06, 0, undefined, 520);
    this.noise(0.08, 0.08, 3000, 1500, 0, 'bandpass');
  }

  orb() {
    this.tone(520, 0.18, 'sine', 0.1, 0, undefined, 1040);
    this.tone(1040, 0.12, 'triangle', 0.04, 0.02);
  }

  shipDing(kind: string) {
    const f = kind === 'ufo' ? 1320 : kind === 'rocket' ? 990 : 1180;
    this.tone(f, 0.12, 'square', 0.03);
    this.tone(f * 1.5, 0.18, 'sine', 0.05, 0.02);
  }

  pin(chain: number) {
    const semis = PENTA[Math.min(chain, PENTA.length - 1)];
    const f = 660 * Math.pow(2, semis / 12);
    this.tone(f, 0.09, 'triangle', 0.08);
    this.tone(f * 2, 0.05, 'sine', 0.025);
  }

  multiplier(n: number) {
    this.noise(0.5, 0.3, 300, 5000, 0, 'bandpass');
    [0, 4, 7, 12].forEach((s, i) => this.tone(880 * Math.pow(2, (s + (n - 2) * 2) / 12), 0.35, 'sine', 0.12, 0.25 + i * 0.05));
  }

  cup() {
    this.tone(2093, 0.12, 'square', 0.06);
    this.tone(3136, 0.25, 'square', 0.05, 0.06);
    this.tone(4186, 0.3, 'sine', 0.05, 0.06);
  }

  alienOuch() {
    if (!this.ctx) return;
    // "ow" formant blip: saw with falling pitch through sweeping bandpass
    const t = this.t;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const p = 420 + Math.random() * 80;
    o.frequency.setValueAtTime(p, t);
    o.frequency.exponentialRampToValueAtTime(p * 0.55, t + 0.22);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(1300, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  explosion() {
    this.noise(1.4, 0.7, 2000, 60, 0, 'lowpass');
    this.tone(120, 0.9, 'sine', 0.5, 0, undefined, 30);
    this.tone(60, 1.2, 'triangle', 0.4, 0.05, undefined, 25);
  }

  humStart() {
    if (!this.ctx) return;
    this.humStop();
    const t = this.t;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 2);
    o2.frequency.value = 41;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 8;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 3;
    const lg = this.ctx.createGain();
    lg.gain.value = 250;
    f.frequency.value = 350;
    lfo.connect(lg).connect(f.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.3);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.sfxBus);
    o.start();
    o2.start();
    lfo.start();
    this.humNodes = {
      stop: () => {
        const n = this.t;
        g.gain.cancelScheduledValues(n);
        g.gain.setTargetAtTime(0.0001, n, 0.15);
        o.stop(n + 0.8);
        o2.stop(n + 0.8);
        lfo.stop(n + 0.8);
      },
    };
  }
  humStop() {
    this.humNodes?.stop();
    this.humNodes = null;
  }

  wheelTick() {
    this.tone(1800, 0.03, 'square', 0.07);
    this.noise(0.03, 0.12, 4000, 3000, 0, 'highpass');
  }

  fanfare() {
    const notes = [0, 4, 7, 12, 7, 12, 16];
    notes.forEach((s, i) => {
      const f = 523 * Math.pow(2, s / 12);
      this.tone(f, i === notes.length - 1 ? 0.8 : 0.16, 'square', 0.07, i * 0.11);
      this.tone(f / 2, i === notes.length - 1 ? 0.8 : 0.16, 'triangle', 0.08, i * 0.11);
    });
  }

  ufoWarble() {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 700;
    lfo.frequency.value = 7;
    lg.gain.value = 180;
    lfo.connect(lg).connect(o.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
    g.gain.setValueAtTime(0.12, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.9);
    lfo.stop(t + 1.9);
  }

  laserCheer() {
    this.tone(2400, 0.35, 'sawtooth', 0.12, 0, undefined, 120);
    this.tone(1800, 0.3, 'square', 0.06, 0.05, undefined, 200);
    // "cheer": rising band noise + chord
    this.noise(1.0, 0.25, 800, 2500, 0.25, 'bandpass', undefined, 0.8);
    [0, 4, 7].forEach((s) => this.tone(660 * Math.pow(2, s / 12), 0.7, 'triangle', 0.06, 0.3));
  }

  jingle() {
    const mel = [12, 16, 19, 24, 19, 24, 28, 31, 36];
    mel.forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.22, 'triangle', 0.12, i * 0.12));
    mel.forEach((s, i) => this.tone(392 * Math.pow(2, (s - 12) / 12), 0.22, 'square', 0.04, i * 0.12));
  }

  countTick(up: boolean) {
    const now = performance.now();
    if (now - this.lastTick < 35) return;
    this.lastTick = now;
    this.tone(up ? 2600 : 1400, 0.025, 'sine', 0.035);
  }

  outOfBalls() {
    [12, 7, 4, 0].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 0.9, 'sine', 0.1, i * 0.35));
  }

  drain() {
    this.tone(180, 0.12, 'sine', 0.04, 0, undefined, 90);
  }

  // ---- music: tiny step sequencer ----
  setTrack(tr: Track) {
    if (tr === this.track) return;
    this.track = tr;
    if (this.ctx) this.nextBeat = this.t + 0.05;
    this.step = 0;
  }

  private schedule() {
    if (!this.ctx || this.track === 'none') return;
    const bpm = this.track === 'fever' ? 152 : this.track === 'rain' ? 132 : 96;
    const sixteenth = 60 / bpm / 4;
    if (this.nextBeat < this.t) this.nextBeat = this.t + 0.02;
    while (this.nextBeat < this.t + 0.12) {
      this.playStep(this.step, this.nextBeat - this.t, sixteenth);
      this.step = (this.step + 1) % 64;
      this.nextBeat += sixteenth;
    }
  }

  private playStep(s: number, when: number, len: number) {
    const bus = this.musicBus;
    const tr = this.track;
    const prog = tr === 'normal' ? [0, -4, -7, -2] : [0, 5, -2, 3];
    const root = prog[Math.floor(s / 16) % 4];
    const base = tr === 'fever' ? 220 : 196;
    const fr = (semi: number) => base * Math.pow(2, semi / 12);
    // bass
    if (s % 4 === 0 || (tr !== 'normal' && s % 4 === 2)) this.tone(fr(root - 24), len * 1.8, 'triangle', tr === 'normal' ? 0.5 : 0.6, when, bus);
    // arp
    const arp = [0, 7, 12, 16, 12, 7, 3, 7];
    if (tr === 'normal' ? s % 2 === 0 : true) {
      const n = arp[(s >> (tr === 'normal' ? 1 : 0)) % arp.length];
      this.tone(fr(root + n), len * 0.9, tr === 'normal' ? 'sine' : 'square', tr === 'normal' ? 0.14 : 0.07, when, bus);
    }
    // drums
    if (tr !== 'normal') {
      if (s % 4 === 0) this.tone(150, 0.12, 'sine', 0.7, when, bus, 45);
      if (s % 8 === 4) this.noise(0.12, 0.35, 1800, 1200, when, 'bandpass', bus);
      this.noise(0.03, s % 2 ? 0.08 : 0.15, 8000, 7000, when, 'highpass', bus);
    } else if (s % 8 === 4) {
      this.noise(0.05, 0.06, 7000, 6000, when, 'highpass', bus);
    }
  }
}

export const sfx = new Sfx();
