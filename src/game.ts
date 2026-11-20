import { T, WHEEL_PRIZES, PrizeId, LAST_CHANCE_SLICES, LastChanceId } from './tuning';
import { sfx } from './audio';
import { loadSave, writeSave, applyRefill, msToMidnight, SaveData, todayStr } from './save';
import type { Art } from './assets';
import { Hoops, HoopsResult } from './hoops';
import {
  W, H, CX, CY, R, BALL_R, PIN_R, SIDE_BOTTOM, DRAIN_Y, LEFT_X, RIGHT_X,
  PINS, SHIPS, ORBS, SEGS, ALIEN, BLACK_HOLE, HIDDEN, CUP_Y, CUP_HALF, CUP_MIN_X, CUP_MAX_X,
  LAUNCH, UFO_Y, pinsNear, Ship, Circle, CROWN, CROWN_HOLES, CONSOLE, TRAY, HANDLE,
} from './board';

const G_BASE = 1000; // px/s² at gravity 1.0
const DT = 1 / 240;
const FRAME_M = 46; // logical margin around the board for the frame/launcher
const CONSOLE_EXTRA = CONSOLE.y - H + CONSOLE.h; // extra logical height below the board
const TRAY_D = 17.5; // tray ball spacing (tray balls are drawn bigger, like the real tray)
const TRAY_PER_ROW = Math.floor((TRAY.x1 - TRAY.x0) / TRAY_D);
const TRAY_ROWS = 4;
const TRAY_CAP = TRAY_PER_ROW * TRAY_ROWS - Math.floor(TRAY_ROWS / 2);
const TRAY_BR = TRAY_D / 2;

interface Ball {
  x: number; y: number; vx: number; vy: number;
  free: boolean; // rain/split ball (cost nothing)
  chain: number; lastPinT: number; lastPin: number;
  alienCd: number; ufoCd: number; goldDone?: boolean;
  ignoreHole: Ship | null; ignoreT: number;
  slowT: number; stuckT?: number; dead: boolean; age: number;
  trail: { x: number; y: number }[];
}
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number; g: number; kind: 'dot' | 'spark' | 'ring' | 'star';
}
interface Popup { x: number; y: number; text: string; color: string; life: number; size: number }
interface Wheel {
  angle: number; start: number; total: number; t: number; dur: number;
  result: number; phase: 'ready' | 'in' | 'spin' | 'result'; resultT: number; lastSlice: number; appear: number; sup: boolean;
  kind: 'normal' | 'super' | 'last' | 'welcome';
  slices: { id: string; label: string; color: string; result: string }[];
}

export type GameEvent = { type: string; text: string; color?: string };

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  art: Art;
  save: SaveData;
  balls: Ball[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];
  shownBalls: number;
  // input
  charging = false;
  chargeT = 0;
  lastShotStrength = 0;
  // world
  time = 0;
  realTime = 0;
  acc = 0;
  timeScale = 1;
  zoom = 1;
  zoomTarget = 1;
  shake = 0;
  cupX = (CUP_MIN_X + CUP_MAX_X) / 2;
  cupDir = 1;
  cupGlow = 0;
  alienHits = 0;
  /** Hits needed for the next alien Ball Rain (grows each time it's earned). */
  get alienNeed() {
    return Math.max(1, Math.round(T.alienHitsForRain + (this.save.alienLevel || 0) * T.alienRainStep));
  }
  /** Balls the black hole needs before the next wheel (grows each time it opens). */
  get bhNeed() {
    return Math.max(1, Math.round(T.blackHoleBallsForWheel + (this.save.bhLevel || 0) * T.bhWheelStep));
  }
  lastBallsNotice = false;
  alienWobble = 0;
  alienGone = 0; // >0 while exploded (brief, during the Ball Rain transformation)
  goldCombo = 0; // golden-alien hits this Ball Rain
  alienScale = 1; // grows during Fever / Ball Rain (top stays under the crown)
  /** Current alien body circle. */
  get al() {
    const r = ALIEN.r * this.alienScale;
    return { x: ALIEN.x, y: ALIEN.y + (r - ALIEN.r), r };
  }
  goldWon = 0;
  alienPop = 0;
  feverT = 0;
  rainT = 0;
  rainToSpawn = 0;
  rainSpawnAcc = 0;
  bhSeq: { t: number; x: number; y: number; sup: boolean } | null = null;
  bhPulse = 0;
  wheel: Wheel | null = null;
  wheelQueue: boolean[] = []; // pending wheel spins (true = super wheel)
  ufo = { active: false, x: 0, dir: 1, t: 0, hit: false, hitT: 0, spin: 0, y: UFO_Y, beam: 0 };
  ufoTimer = 0;
  astroT = 0;
  pendingHoops = false; // secret hole → Space Hoops after the astronaut dance
  jackpotT = 0;
  showHitAreas = false;
  // spectacle layer
  rocks: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; screen: boolean }[] = [];
  comets: { x: number; y: number; vx: number; vy: number; life: number; hue: number }[] = [];
  flashA = 0;
  kickFlash = 0;
  bhCharge = 0; // balls swallowed toward the next Wheel of Fortune
  bhGlow = 0;
  hoops: Hoops | null = null;
  lastFrac = -1; // power-meter position of the previous shot
  lastFracT = 0;
  rainSuperUsed = false; // one Super Wheel per Ball Rain
  warp: { t: number; sup: boolean } | null = null;
  // console
  trayCount = 0; // balls resting in the tray
  trayIn: { t: number; slot: number; x0: number; y0: number }[] = [];
  trayOut: { t: number; x: number; y: number }[] = [];
  trayInAcc = 0;
  handleA = 0; // radians, negative = turned
  handleV = 0;
  flashColor = '#fff';
  bulbs: { x: number; y: number }[] = [];
  autoPlay = false;
  autoT = 0;
  outOfBalls = false;
  starfield: { x: number; y: number; z: number }[] = [];
  stats = { warp: 0, crown: 0, shots: 0, x2: 0, x3: 0, cup: 0, alien: 0, bh: 0, ufo: 0, hidden: 0, drained: 0, rain: 0, fever: 0, won: 0 };
  events: GameEvent[] = [];
  onEvent: (e: GameEvent) => void = () => {};
  // layout (css px)
  view = { w: 1, h: 1, dpr: 1, bx: 0, by: 0, s: 1 };
  private near: number[] = [];
  private pinSprite: HTMLCanvasElement;
  private glowSprites: HTMLCanvasElement[] = [];
  private ballSprite: HTMLCanvasElement;
  private beat = 0;

  constructor(canvas: HTMLCanvasElement, art: Art) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.art = art;
    this.save = loadSave();
    this.shownBalls = this.save.balls;
    this.pinSprite = makePinSprite();
    for (let i = 0; i < 12; i++) this.glowSprites.push(makeGlow(`hsl(${i * 30},100%,65%)`));
    this.glowSprites.push(makeGlow('#fff6c8'));
    this.ballSprite = makeBallSprite();
    for (let i = 0; i < 160; i++) this.starfield.push({ x: Math.random(), y: Math.random(), z: Math.random() });
    this.ufoTimer = T.ufoInterval;
    this.bulbs = makeBulbs();
    this.trayCount = Math.min(this.save.balls, TRAY_CAP);
    if (T.welcomeOn && !this.save.welcomed) this.openWelcome();
  }

  /** 0 calm, 1 fever, 2 rain / super wheel / jackpot */
  get hype() {
    if (this.rainT > 0 || this.jackpotT > 0 || this.wheel?.sup) return 2;
    if (this.feverT > 0 || this.wheel) return 1;
    return 0;
  }
  screenFlash(color: string, a = 0.6) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }
  private spawnRock(screen: boolean, big = false) {
    const fromLeft = Math.random() < 0.5;
    const sp = (screen ? 0.25 : 260) * (0.6 + Math.random() * 0.8);
    this.rocks.push({
      x: screen ? (fromLeft ? -0.1 : 1.1) : fromLeft ? -40 : W + 40,
      y: screen ? Math.random() * 0.8 : 60 + Math.random() * 500,
      vx: (fromLeft ? 1 : -1) * sp, vy: sp * (0.15 + Math.random() * 0.35),
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3,
      size: screen ? (big ? 120 : 40 + Math.random() * 60) : 22 + Math.random() * 26, screen,
    });
  }
  private updateSpectacle(dt: number) {
    const hype = this.hype;
    const rockRate = hype === 2 ? 2.2 : hype === 1 ? 0.9 : 0.04;
    if (Math.random() < rockRate * dt) this.spawnRock(Math.random() < 0.5);
    const cometRate = hype === 2 ? 5 : hype === 1 ? 2 : 0.15;
    if (Math.random() < cometRate * dt) {
      const a = Math.PI * (0.15 + Math.random() * 0.2);
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.comets.push({ x: dir > 0 ? Math.random() * W * 0.5 : W - Math.random() * W * 0.5, y: -20, vx: Math.cos(a) * 900 * dir, vy: Math.sin(a) * 900, life: 1.2, hue: hype === 1 ? Math.random() * 360 : hype === 2 ? 100 + Math.random() * 60 : 200 });
    }
    for (const r of this.rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt; }
    this.rocks = this.rocks.filter((r) => (r.screen ? r.x > -0.3 && r.x < 1.3 && r.y < 1.3 : r.x > -80 && r.x < W + 80 && r.y < H + 80));
    for (const cm of this.comets) { cm.x += cm.vx * dt; cm.y += cm.vy * dt; cm.life -= dt; }
    this.comets = this.comets.filter((cm) => cm.life > 0);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.kickFlash = Math.max(0, this.kickFlash - dt * 4);
    this.bhGlow = Math.max(0, this.bhGlow - dt * 2);
  }

  // ---------------- economy ----------------
  get mult() {
    return this.feverT > 0 ? T.feverMultiplier : 1;
  }
  award(n: number, x: number, y: number, color = '#ffe066', label?: string) {
    const total = Math.round(n * this.mult);
    this.save.balls += total;
    this.stats.won += total;
    writeSave(this.save);
    this.popups.push({ x, y, text: label ?? `+${total}${this.mult > 1 ? ' ×' + this.mult : ''}`, color, life: 1.4, size: total >= 25 ? 44 : total >= 10 ? 34 : 24 });
    return total;
  }
  emit(type: string, text: string, color?: string) {
    const e = { type, text, color };
    this.events.unshift(e);
    if (this.events.length > 8) this.events.pop();
    this.onEvent(e);
  }

  // ---------------- input ----------------
  pressStart() {
    sfx.unlock();
    sfx.setTrack(this.feverT > 0 ? 'fever' : this.rainT > 0 ? 'rain' : 'normal');
    if (this.hoops) {
      this.hoops.press();
      return;
    }
    if (this.wheel?.phase === 'ready') {
      if (this.wheel.kind === 'welcome') this.spinWelcome();
      else this.spinLastChance();
      return;
    }
    if (this.charging || this.wheel || this.bhSeq) return;
    if (this.save.balls <= 0) {
      sfx.drain();
      if (!this.outOfBalls) this.popups.push({ x: W / 2, y: 470, text: 'NO BALLS LEFT', color: '#ff7b9c', life: 1.2, size: 30 });
      return;
    }
    this.charging = true;
    this.chargeT = 0;
    sfx.chargeStart();
  }
  pressEnd() {
    if (this.hoops) {
      this.hoops.release();
      return;
    }
    if (!this.charging) return;
    this.charging = false;
    sfx.chargeStop();
    if (this.wheel || this.bhSeq || this.save.balls <= 0) return;
    const t = Math.min(1, this.chargeT / T.maxChargeTime);
    const f = 1 - Math.pow(1 - t, T.chargeCurve); // ease-out: short presses already give real power
    this.lastFrac = f;
    this.lastFracT = 0;
    const strength = T.minStrength + (T.maxStrength - T.minStrength) * f;
    this.fire(strength);
  }
  cancelCharge() {
    this.charging = false;
    sfx.chargeStop();
  }
  fire(strength: number, free = false) {
    if (!free) {
      this.save.balls -= 1;
      writeSave(this.save);
    }
    this.stats.shots++;
    this.lastShotStrength = strength;
    this.handleV -= 6; // lever kicks as the hammer fires
    const v = T.fullShotSpeed * strength * (1 + (Math.random() - 0.5) * 0.024);
    this.balls.push(this.newBall(LAUNCH.x, LAUNCH.y, 0, -v, free));
    sfx.shoot(strength);
    for (let i = 0; i < 8; i++) this.spark(LAUNCH.x, LAUNCH.y, '#9ff', 1, -Math.PI / 2, 0.8, 200);
  }
  newBall(x: number, y: number, vx: number, vy: number, free: boolean): Ball {
    return { x, y, vx, vy, free, chain: 0, lastPinT: -9, lastPin: -1, alienCd: 0, ufoCd: 0, ignoreHole: null, ignoreT: 0, slowT: 0, dead: false, age: 0, trail: [] };
  }

  // ---------------- dev actions ----------------
  devAddBalls(n = 100) {
    this.save.balls += n;
    writeSave(this.save);
    this.emit('dev', `DEV +${n} balls`);
  }
  devResetDay() {
    this.save.lastRefill = '';
    this.save.lastChance = '';
    this.save.balls = 0;
    applyRefill(this.save);
    this.outOfBalls = false;
    this.emit('dev', 'DEV day reset');
  }
  startFever(k = 1) {
    this.feverT = Math.max(this.feverT, T.feverLength * k);
    this.stats.fever++;
    sfx.setTrack('fever');
    this.flashText('FEVER MODE!', '#ff4fd8');
    this.screenFlash('#ff9cf0', 0.6);
    this.emit('fever', `FEVER MODE — winnings ×${T.feverMultiplier} for ${Math.round(T.feverLength * k)}s`, '#ff4fd8');
  }
  startRain(k = 1) {
    if (this.rainT <= 0) this.rainSuperUsed = false;
    this.rainT = Math.max(this.rainT, T.rainLength * k);
    this.rainToSpawn += T.rainBalls * k;
    this.rainSpawnAcc = 0;
    this.stats.rain++;
    this.alienHits = 0;
    this.alienGone = 0.7; // explodes, then returns as the Golden Super Alien
    if (k === 1 || this.goldCombo === 0) { this.goldCombo = 0; this.goldWon = 0; }
    this.shake = 1;
    sfx.explosion();
    sfx.setTrack('rain');
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 600;
      this.particles.push({ x: ALIEN.x, y: ALIEN.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, max: 1.2, color: ['#7dff5a', '#ff9a3c', '#9ff', '#fff'][i % 4], size: 3 + Math.random() * 5, g: 400, kind: i % 3 ? 'dot' : 'spark' });
    }
    this.particles.push({ x: ALIEN.x, y: ALIEN.y, vx: 0, vy: 0, life: 0.8, max: 0.8, color: '#bfffb0', size: 200, g: 0, kind: 'ring' });
    this.flashText('BALL RAIN!', '#7dff5a');
    this.screenFlash('#c8ffb0', 0.8);
    for (let i = 0; i < 4; i++) this.spawnRock(true, i === 0);
    this.emit('rain', `BALL RAIN — ${T.rainBalls * k} free balls`, '#7dff5a');
  }
  spawnUfo() {
    if (this.ufo.active) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    Object.assign(this.ufo, { active: true, dir, x: dir > 0 ? -60 : W + 60, t: 0, hit: false, hitT: 0, spin: 0, y: UFO_Y, beam: 0 });
    sfx.ufoWarble();
    this.emit('ufo', 'UFO incoming! Hit it for +' + T.ufoReward, '#7ff');
  }
  spinWheel(sup = false) {
    if (this.wheel) {
      this.wheelQueue.push(sup);
      return;
    }
    const slices = WHEEL_PRIZES.map((p) => ({
      id: p.id as string, color: p.color, label: wheelLabel(p.id, sup),
      result: p.id === 'jackpot' ? `JACKPOT +${sup ? 200 : 100}` : wheelLabel(p.id, sup),
    }));
    this.wheel = { angle: 0, start: 0, total: 0, t: 0, dur: 4.6, result: 0, phase: 'in', resultT: 0, lastSlice: -1, appear: 0, sup, kind: sup ? 'super' : 'normal', slices };
    this.aimWheel(this.wheel, WHEEL_PRIZES.map((p) => Math.max(0, T.wheel[p.id])));
    if (sup) { this.screenFlash('#ffe27a', 0.7); this.flashText('SUPER WHEEL!', '#ffd23c'); this.emit('wheel', 'SUPER WHEEL — all prizes ×2!', '#ffd23c'); }
  }

  /** Pick a weighted slice and set the spin so it lands there. */
  private aimWheel(w: Wheel, weights: number[]) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * sum;
    let idx = 0;
    for (; idx < weights.length - 1; idx++) {
      r -= weights[idx];
      if (r < 0) break;
    }
    const slice = (Math.PI * 2) / w.slices.length;
    // pointer at top (-PI/2). slice i spans [i*slice, (i+1)*slice) in wheel space.
    const targetLocal = idx * slice + (0.2 + Math.random() * 0.6) * slice;
    let target = -Math.PI / 2 - targetLocal;
    while (target < w.angle + Math.PI * 2 * 5) target += Math.PI * 2;
    w.start = w.angle;
    w.total = target - w.angle;
    w.result = idx;
  }

  /** First visit: a free spin of the Wheel of Fortune with boosted special-mode odds. */
  openWelcome() {
    if (this.wheel) return;
    const slices = WHEEL_PRIZES.map((p) => ({
      id: p.id as string, color: p.color, label: p.label,
      result: p.id === 'jackpot' ? 'JACKPOT +100' : p.id === 'rain' ? 'BALL RAIN!' : p.id === 'fever' ? 'FEVER MODE!' : `${p.label} BALLS`,
    }));
    this.wheel = { angle: 0, start: 0, total: 0, t: 0, dur: 5, result: 0, phase: 'ready', resultT: 0, lastSlice: -1, appear: 0, sup: false, kind: 'welcome', slices };
    this.emit('welcome', 'Welcome! Spin the Wheel of Fortune — press SPACE', '#ffd23c');
  }

  private spinWelcome() {
    const w = this.wheel!;
    this.save.welcomed = true;
    writeSave(this.save);
    this.aimWheel(w, WHEEL_PRIZES.map((p) => Math.max(0, T.welcomeWheel[p.id])));
    w.phase = 'spin';
    w.t = 0;
    sfx.lastChance();
    sfx.shoot(1);
  }

  /** Out of balls: offer one free spin of the Last Chance Wheel (once per day). */
  openLastChance() {
    if (this.wheel) return;
    const slices = LAST_CHANCE_SLICES.map((p) => ({
      id: p.id as string, color: p.color, label: p.label,
      result: p.id === 'quit' ? 'SEE YOU TOMORROW' : p.id === 'jackpot' ? 'JACKPOT +100' : p.id === 'rain' ? 'BALL RAIN!' : p.id === 'hoops' ? 'SPACE HOOPS!' : `${p.label} BALLS`,
    }));
    this.wheel = { angle: 0, start: 0, total: 0, t: 0, dur: 5.2, result: 0, phase: 'ready', resultT: 0, lastSlice: -1, appear: 0, sup: false, kind: 'last', slices };
    sfx.setTrack('none');
    sfx.lastChance();
    this.emit('last', 'LAST CHANCE WHEEL — press SPACE to spin!', '#5cf2ff');
  }

  private spinLastChance() {
    const w = this.wheel!;
    this.save.lastChance = todayStr();
    writeSave(this.save);
    // a prize's weight is shared by every slice that shows it
    const counts: Record<string, number> = {};
    for (const s of w.slices) counts[s.id] = (counts[s.id] || 0) + 1;
    this.aimWheel(w, w.slices.map((s) => Math.max(0, T.lastChance[s.id as LastChanceId] ?? 0) / counts[s.id]));
    w.phase = 'spin';
    w.t = 0;
    sfx.shoot(1);
  }

  private applyLastChance(id: string) {
    const x = BLACK_HOLE.x, y = BLACK_HOLE.y - 60;
    switch (id) {
      case 'quit':
        this.emit('last', 'No luck — see you tomorrow!');
        break;
      case 'b10': case 'b20': case 'b30': {
        const n = this.award(+id.slice(1), x, y, '#7ff');
        this.emit('last', `Last chance paid +${n}! Keep going!`, '#7ff');
        sfx.setTrack('normal');
        break;
      }
      case 'rain':
        this.startRain();
        break;
      case 'jackpot':
        this.applyPrize('jackpot');
        sfx.setTrack('normal');
        break;
      case 'hoops':
        this.startHoops();
        break;
    }
  }

  /** Hidden hole: +50, dancing astronaut, then a bonus round of Space Hoops. */
  secretFound() {
    this.stats.hidden++;
    const n = this.award(T.hiddenReward, CX, 200, '#ffd23c');
    this.astroT = 4.5;
    this.pendingHoops = true;
    sfx.jingle();
    this.emit('hidden', `SECRET HOLE! +${n} — bonus SPACE HOOPS!`, '#ffd23c');
    for (let i = 0; i < 60; i++) this.spark(HIDDEN.x, HIDDEN.y, ['#ffd23c', '#fff'][i % 2], 1, Math.random() * 6.28, 1.4, 500);
  }

  startHoops() {
    if (this.hoops) return;
    this.emit('hoops', 'SPACE HOOPS — sink it for +' + T.hoopsPrize + '!', '#ff9a3c');
    this.hoops = new Hoops((r) => this.finishHoops(r));
  }

  private finishHoops(r: HoopsResult) {
    this.hoops = null;
    if (r === 'swish') {
      const n = this.award(T.hoopsPrize, CX, 300, '#ffd23c');
      this.jackpotT = 3;
      this.shake = 1;
      this.screenFlash('#fff1b0', 0.9);
      this.flashText('SWISH!', '#ffd23c');
      for (let i = 0; i < 160; i++) this.spark(CX, 300, ['#ffd23c', '#fff', '#ff9a3c'][i % 3], 1, Math.random() * 6.28, 2, 900);
      this.emit('hoops', `SWISH! +${n} balls`, '#ffd23c');
      sfx.setTrack('normal');
    } else if (r === 'rim') {
      const n = this.award(T.hoopsRimPrize, CX, 300, '#5cf2ff');
      this.emit('hoops', `Off the rim — +${n}`, '#5cf2ff');
      sfx.setTrack('normal');
    } else this.emit('hoops', 'Missed the basket…');
  }

  flashText(text: string, color: string) {
    this.popups.push({ x: W / 2, y: 300, text, color, life: 2, size: 64 });
  }

  // ---------------- main update ----------------
  update(realDt: number) {
    realDt = Math.min(realDt, 0.05);
    this.realTime += realDt;
    this.beat = (this.realTime * (this.feverT > 0 ? 152 : 96)) / 60;

    if (this.charging) {
      this.chargeT += realDt;
      sfx.chargeUpdate(1 - Math.pow(1 - Math.min(1, this.chargeT / T.maxChargeTime), T.chargeCurve));
    }

    // black hole sequence & wheel run in real time and pause physics
    if (this.bhSeq) {
      this.bhSeq.t += realDt;
      this.zoomTarget = 1.9;
      if (this.bhSeq.t > 1.6) {
        const sup = this.bhSeq.sup;
        this.bhSeq = null;
        sfx.humStop();
        this.spinWheel(sup);
      }
    }
    if (this.wheel) this.updateWheel(realDt);
    if (this.hoops) this.hoops.update(realDt);

    // slow motion when a ball is about to fall into the black hole
    let focus = false;
    if (!this.bhSeq && !this.wheel && this.rainT <= 0) {
      for (const b of this.balls) {
        const dx = BLACK_HOLE.x - b.x, dy = BLACK_HOLE.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 46 && (dx * b.vx + dy * b.vy) > 0 && this.bhCharge >= this.bhNeed - 1) focus = true;
      }
    }
    const paused = !!this.bhSeq || !!this.wheel || !!this.hoops;
    const targetScale = paused ? 0 : focus ? 0.28 : 1;
    this.timeScale += (targetScale - this.timeScale) * Math.min(1, realDt * (targetScale < this.timeScale ? 14 : 5));
    if (!this.bhSeq) this.zoomTarget = focus ? 1.45 : 1;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, realDt * 4);

    const dt = realDt * this.timeScale;
    this.time += dt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 40) {
      this.physicsStep(DT);
      this.acc -= DT;
      steps++;
    }
    this.updateTimers(dt, realDt);
    this.updateFx(realDt, dt);
    this.updateSpectacle(realDt);
    this.updateConsole(realDt);
    if (this.warp) {
      this.warp.t += realDt;
      if (this.warp.t >= 0.75) {
        this.warp = null;
        this.stats.bh++;
        this.feedBlackHole(BLACK_HOLE.x, BLACK_HOLE.y - 20, Math.max(1, Math.round(T.warpCharge)));
      }
    }

    // rolling ball counter
    if (this.shownBalls !== this.save.balls) {
      const diff = this.save.balls - this.shownBalls;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * realDt * 6));
      this.shownBalls += Math.sign(diff) * Math.min(Math.abs(diff), step);
      sfx.countTick(diff > 0);
    }

    // auto-play (dev)
    if (this.autoPlay && !paused && this.save.balls > 0) {
      this.autoT -= realDt;
      if (this.autoT <= 0) {
        this.autoT = 0.7;
        this.fire(T.minStrength + Math.random() * (T.maxStrength - T.minStrength));
      }
    }

    // out of balls
    if (this.save.balls <= 0 && !this.outOfBalls && !this.wheel && !this.hoops) {
      if (!this.lastBallsNotice) {
        this.lastBallsNotice = true;
        this.emit('out', 'Out of balls! Waiting for the last balls to land…', '#ff7b9c');
      }
    } else if (this.save.balls > 0) this.lastBallsNotice = false;
    const idle = this.balls.length === 0 && !this.hoops && !this.warp && this.rainT <= 0 && !this.bhSeq && !this.wheel && this.wheelQueue.length === 0;
    if (this.save.balls <= 0 && idle && !this.outOfBalls && T.lastChanceOn && this.save.lastChance !== todayStr()) {
      this.openLastChance();
    } else if (this.save.balls <= 0 && idle) {
      if (!this.outOfBalls) {
        this.outOfBalls = true;
        sfx.outOfBalls();
        sfx.setTrack('none');
        this.emit('out', 'Out of balls for today');
      }
      if (msToMidnight() < 1000 || applyRefill(this.save)) {
        applyRefill(this.save);
      }
    }
    if (this.outOfBalls && this.save.balls > 0) {
      this.outOfBalls = false;
      sfx.setTrack('normal');
    }
  }

  private updateTimers(dt: number, realDt: number) {
    // cup
    this.cupX += this.cupDir * T.cupSpeed * dt;
    if (this.cupX > CUP_MAX_X) { this.cupX = CUP_MAX_X; this.cupDir = -1; }
    if (this.cupX < CUP_MIN_X) { this.cupX = CUP_MIN_X; this.cupDir = 1; }
    // fever
    if (this.feverT > 0) {
      this.feverT -= dt;
      if (this.feverT <= 0) {
        this.feverT = 0;
        sfx.setTrack(this.rainT > 0 ? 'rain' : 'normal');
        this.emit('fever', 'Fever over');
      }
    }
    // rain
    if (this.rainT > 0) {
      this.rainT -= dt;
      const rate = Math.max(T.rainBalls / T.rainLength, this.rainToSpawn / Math.max(0.5, this.rainT - 0.5));
      this.rainSpawnAcc += dt * rate;
      while (this.rainSpawnAcc >= 1 && this.rainToSpawn > 0) {
        this.rainSpawnAcc -= 1;
        this.rainToSpawn--;
        const x = CX + (Math.random() - 0.5) * 2 * (R - 120);
        const y = CY - Math.sqrt(Math.max(0, (R - 70) ** 2 - (x - CX) ** 2)) + 20;
        this.balls.push(this.newBall(x, y, (Math.random() - 0.5) * 60, 40, true));
      }
      if (this.rainT <= 0) {
        this.rainT = 0;
        this.rainToSpawn = 0;
        this.alienPop = 1;
        if (this.goldCombo > 0) this.emit('gold', `Golden Alien: ${this.goldCombo} hits, +${this.goldWon} balls!`, '#ffd23c');
        this.goldCombo = 0;
        this.goldWon = 0;
        sfx.setTrack(this.feverT > 0 ? 'fever' : 'normal');
      }
    }
    if (this.alienGone > 0) {
      this.alienGone -= dt;
      if (this.alienGone <= 0) { this.alienGone = 0; this.alienPop = 1; }
    }
    // UFO
    if (!this.ufo.active) {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) {
        this.ufoTimer = T.ufoInterval;
        this.spawnUfo();
      }
    } else {
      const u = this.ufo;
      u.t += dt;
      if (!u.hit) {
        u.x += u.dir * 150 * dt;
        u.y = UFO_Y + Math.sin(u.t * 3) * 10;
        u.beam = (Math.sin(u.t * 5) + 1) / 2;
        if ((u.dir > 0 && u.x > W + 80) || (u.dir < 0 && u.x < -80)) u.active = false;
      } else {
        u.hitT += dt;
        u.spin += dt * 18;
        u.x += u.dir * 420 * dt;
        u.y -= 260 * dt;
        if (Math.random() < 0.6) this.spark(u.x, u.y, '#ffd36b', 1, Math.random() * 6.28, 1, 200);
        if (u.hitT > 1.5) u.active = false;
      }
    }
    if (this.astroT > 0) this.astroT -= realDt;
    if (this.pendingHoops && this.astroT <= 0 && !this.wheel && !this.bhSeq) {
      this.pendingHoops = false;
      this.cancelCharge();
      this.startHoops();
    }
    if (this.jackpotT > 0) this.jackpotT -= realDt;
  }

  private chargeFrac() {
    return 1 - Math.pow(1 - Math.min(1, this.chargeT / T.maxChargeTime), T.chargeCurve);
  }

  private updateConsole(dt: number) {
    // handle: follows the charge while held, springs back with a wobble on release
    const target = this.charging ? this.chargeFrac() * 1.75 : 0;
    const k = this.charging ? 700 : 260;
    const damp = this.charging ? 45 : 11;
    this.handleV += ((target - this.handleA) * k - this.handleV * damp) * dt;
    this.handleA += this.handleV * dt;
    // tray balls
    const want = Math.min(Math.max(0, this.save.balls), TRAY_CAP);
    const have = this.trayCount + this.trayIn.length;
    if (have > want) {
      for (let n = have - want; n > 0; n--) {
        if (this.trayIn.length) this.trayIn.pop();
        else if (this.trayCount > 0) {
          this.trayCount--;
          const p = traySlot(0);
          this.trayOut.push({ t: 0, x: p.x, y: p.y });
        }
      }
    } else if (have < want) {
      this.trayInAcc += dt * (12 + (want - have) * 2.5);
      while (this.trayInAcc >= 1 && this.trayCount + this.trayIn.length < want) {
        this.trayInAcc -= 1;
        this.trayIn.push({ t: 0, slot: this.trayCount + this.trayIn.length, x0: TRAY.x1 - 6, y0: CONSOLE.y + 18 });
      }
    } else this.trayInAcc = 0;
    for (const b of this.trayIn) b.t += dt;
    while (this.trayIn.length && this.trayIn[0].t >= 0.42) {
      this.trayIn.shift();
      this.trayCount++;
    }
    for (const b of this.trayOut) b.t += dt;
    this.trayOut = this.trayOut.filter((b) => b.t < 0.35);
  }

  private drawConsole(c: CanvasRenderingContext2D) {
    const top = CONSOLE.y;
    const fever = this.feverT > 0;
    const hype = this.hype;
    c.save();
    // panel
    const pg = c.createLinearGradient(0, top, 0, top + CONSOLE.h);
    pg.addColorStop(0, '#2a2650');
    pg.addColorStop(0.5, '#15112f');
    pg.addColorStop(1, '#0b0820');
    c.fillStyle = pg;
    c.shadowColor = 'rgba(140,90,255,0.5)';
    c.shadowBlur = 30;
    c.beginPath(); c.roundRect(-30, top - 4, W + 60, CONSOLE.h + 8, 24); c.fill();
    c.shadowBlur = 0;
    const trim = fever ? `hsl(${(this.realTime * 300) % 360},100%,65%)` : hype === 2 ? '#9dff6a' : '#8f6bff';
    c.strokeStyle = trim;
    c.lineWidth = 2.5;
    c.stroke();
    // rivets
    c.fillStyle = '#8c90b8';
    for (const [x, y] of [[-14, top + 12], [W + 14, top + 12], [-14, top + CONSOLE.h - 12], [W + 14, top + CONSOLE.h - 12]]) {
      c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill();
    }
    // feed pipe: tray outlet → launcher
    const px = LEFT_X - 27;
    c.lineCap = 'round';
    c.strokeStyle = '#4b4f6b';
    c.lineWidth = 22;
    c.beginPath(); c.moveTo(px, LAUNCH.y + 420); c.lineTo(px, TRAY.floor - 10); c.lineTo(TRAY.x0 - 6, TRAY.floor - 10); c.stroke();
    c.strokeStyle = '#c9d1e6';
    c.lineWidth = 14;
    c.stroke();
    c.strokeStyle = '#0e0b24';
    c.lineWidth = 8;
    c.stroke();
    // tray well
    const wx = TRAY.x0 - 18, wy = TRAY.floor - TRAY_D * (1 + (TRAY_ROWS - 1) * 0.866) - 12, ww = TRAY.x1 - TRAY.x0 + 40, wh = TRAY.floor - wy + 6;
    const wg = c.createLinearGradient(0, wy, 0, wy + wh);
    wg.addColorStop(0, '#05030f');
    wg.addColorStop(1, '#1d1844');
    c.fillStyle = wg;
    c.beginPath(); c.roundRect(wx, wy, ww, wh, 16); c.fill();
    c.strokeStyle = 'rgba(160,170,220,0.5)';
    c.lineWidth = 1.5;
    c.stroke();
    // outlet hole (left)
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(TRAY.x0 - 6, TRAY.floor - 10, 9, 11, 0, 0, Math.PI * 2); c.fill();
    // chute (right): won balls drop in here
    const chuteGlow = this.trayIn.length > 0 ? 0.8 + 0.2 * Math.sin(this.realTime * 30) : 0.25;
    c.fillStyle = '#c9d1e6';
    c.beginPath(); c.roundRect(TRAY.x1 - 30, top + 4, 48, 22, 6); c.fill();
    c.fillStyle = '#0e0b24';
    c.fillRect(TRAY.x1 - 22, top + 16, 32, 8);
    c.fillStyle = `rgba(92,242,255,${chuteGlow})`;
    c.fillRect(TRAY.x1 - 24, top + 8, 36, 4);
    // balls
    const bs = TRAY_D * 1.12;
    const draw = (x: number, y: number, a = 1) => {
      c.globalAlpha = a;
      c.drawImage(this.ballSprite, x - bs / 2, y - bs / 2, bs, bs);
      c.globalAlpha = 1;
    };
    for (let i = 0; i < this.trayCount; i++) {
      const p = traySlot(i);
      draw(p.x, p.y);
    }
    for (const b of this.trayIn) {
      const p = traySlot(b.slot);
      const k = Math.min(1, b.t / 0.42);
      const x = b.x0 + (p.x - b.x0) * k;
      const y = b.y0 + (p.y - b.y0) * k - Math.sin(k * Math.PI) * 30;
      draw(x, y);
    }
    for (const b of this.trayOut) {
      const k = b.t / 0.35;
      draw(b.x + (TRAY.x0 - 6 - b.x) * k, b.y + (TRAY.floor - 10 - b.y) * k, 1 - k);
    }
    // front lip (chrome with a neon stripe, like the classic tray)
    const lg = c.createLinearGradient(0, TRAY.floor - 6, 0, TRAY.floor + 26);
    lg.addColorStop(0, '#f4f6ff');
    lg.addColorStop(0.4, '#9ea5c8');
    lg.addColorStop(1, '#4a4f72');
    c.fillStyle = lg;
    c.beginPath(); c.roundRect(wx - 8, TRAY.floor - 4, ww + 16, 28, 12); c.fill();
    c.fillStyle = trim;
    c.shadowColor = trim;
    c.shadowBlur = 10;
    c.fillRect(wx + 30, TRAY.floor + 8, ww - 150, 4);
    c.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      const on = Math.floor(this.realTime * 3 + i) % 3 === 0 || hype > 0;
      c.fillStyle = on ? '#ffb23c' : '#7a4a1c';
      c.beginPath(); c.roundRect(wx + ww - 108 + i * 30, TRAY.floor + 4, 20, 10, 4); c.fill();
    }
    // ball count readout + overflow
    c.font = '900 13px Orbitron, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffd23c';
    const extra = this.save.balls - TRAY_CAP;
    c.fillText(extra > 0 ? `${this.shownBalls} BALLS  (+${extra} in reserve)` : `${this.shownBalls} BALLS`, wx + 10, wy - 14);

    // launch handle
    const { x: hx, y: hy, r: hr } = HANDLE;
    const f = Math.max(0, Math.min(1, this.handleA / 1.75));
    c.fillStyle = '#0a0720';
    c.beginPath(); c.arc(hx, hy, hr + 14, 0, Math.PI * 2); c.fill();
    // charge glow ring
    c.strokeStyle = `rgba(255,${Math.round(120 + 100 * (1 - f))},${Math.round(220 * (1 - f))},${0.25 + f * 0.75})`;
    c.shadowColor = c.strokeStyle as string;
    c.shadowBlur = 8 + f * 26;
    c.lineWidth = 4;
    c.beginPath(); c.arc(hx, hy, hr + 9, 0, Math.PI * 2); c.stroke();
    c.shadowBlur = 0;
    const d = this.art.dial;
    c.save();
    c.translate(hx, hy);
    c.rotate(this.handleA);
    c.drawImage(d.img, -hr, -hr, hr * 2, hr * 2);
    c.restore();
    // lever arm
    const la = -0.45 + this.handleA;
    const lx = hx + Math.cos(la) * hr * 1.45, ly = hy + Math.sin(la) * hr * 1.45;
    c.strokeStyle = '#3c3f5c';
    c.lineWidth = 12;
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(lx, ly); c.stroke();
    const arm = c.createLinearGradient(hx, hy - 6, hx, hy + 6);
    arm.addColorStop(0, '#ffffff');
    arm.addColorStop(1, '#8a90b4');
    c.strokeStyle = arm;
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(lx, ly); c.stroke();
    const grip = c.createRadialGradient(lx - 3, ly - 3, 1, lx, ly, 12);
    grip.addColorStop(0, '#ffe2b0');
    grip.addColorStop(1, '#ff6a2c');
    c.fillStyle = grip;
    c.beginPath(); c.arc(lx, ly, 11, 0, Math.PI * 2); c.fill();
    const hub = c.createRadialGradient(hx - 4, hy - 4, 1, hx, hy, 12);
    hub.addColorStop(0, '#fff');
    hub.addColorStop(1, '#6c6f90');
    c.fillStyle = hub;
    c.beginPath(); c.arc(hx, hy, 11, 0, Math.PI * 2); c.fill();
    c.font = '700 10px Orbitron, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(200,190,255,0.7)';
    c.fillText('HOLD SPACE', hx, top + CONSOLE.h - 10);
    c.restore();
  }

  private updateFx(realDt: number, dt: number) {
    this.shake = Math.max(0, this.shake - realDt * 2);
    const sTarget = this.rainT > 0 ? T.alienScaleRain : this.feverT > 0 ? T.alienScaleFever : 1;
    this.alienScale += (sTarget - this.alienScale) * Math.min(1, realDt * 3);
    this.alienWobble = Math.max(0, this.alienWobble - realDt * 2.5);
    this.alienPop = Math.max(0, this.alienPop - realDt * 2);
    this.cupGlow = Math.max(0, this.cupGlow - realDt * 2);
    this.bhPulse += realDt;
    for (const p of PINS) if (p.flash > 0) p.flash = Math.max(0, p.flash - realDt * 3);
    for (const s of SHIPS) { s.flash = Math.max(0, s.flash - realDt * 1.2); s.bump = Math.max(0, s.bump - realDt * 4); }
    for (const o of ORBS) o.flash = Math.max(0, o.flash - realDt * 3);
    for (const ch of CROWN_HOLES) ch.flash = Math.max(0, ch.flash - realDt * 1.5);
    const pdt = Math.max(dt, realDt * 0.3);
    for (const p of this.particles) {
      p.life -= pdt;
      p.vy += p.g * pdt;
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
      p.vx *= 0.985;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.life -= realDt;
      p.y -= realDt * 40;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private updateWheel(dt: number) {
    const w = this.wheel!;
    const n = w.slices.length;
    const slice = (Math.PI * 2) / n;
    if (w.phase === 'ready') {
      w.appear = Math.min(1, w.appear + dt * 3);
      w.angle += dt * 0.4; // idle drift while waiting for Space
      return;
    }
    if (w.phase === 'in') {
      w.appear = Math.min(1, w.appear + dt * 3);
      if (w.appear >= 1) w.phase = 'spin';
      return;
    }
    if (w.phase === 'spin') {
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      const e = 1 - Math.pow(1 - k, 3.2);
      w.angle = w.start + w.total * e;
      // pointer at -PI/2; which slice is under it
      let local = (-Math.PI / 2 - w.angle) % (Math.PI * 2);
      if (local < 0) local += Math.PI * 2;
      const s = Math.floor(local / slice);
      if (s !== w.lastSlice) {
        w.lastSlice = s;
        sfx.wheelTick();
      }
      if (k >= 1) {
        w.phase = 'result';
        w.resultT = 0;
        if (w.kind === 'last' && w.slices[w.result].id === 'quit') sfx.outOfBalls();
        else sfx.fanfare();
      }
      return;
    }
    w.resultT += dt;
    if (w.resultT > 1.8) {
      const prize = w.slices[w.result].id;
      this.wheel = null;
      if (w.kind === 'last') this.applyLastChance(prize);
      else this.applyPrize(prize as PrizeId, w.sup ? 2 : 1);
      if (this.wheelQueue.length > 0) this.spinWheel(this.wheelQueue.shift());
    }
  }

  applyPrize(id: PrizeId, k = 1) {
    const x = BLACK_HOLE.x, y = BLACK_HOLE.y - 60;
    switch (id) {
      case 'b5': this.emit('wheel', 'Wheel: +' + this.award(5 * k, x, y)); break;
      case 'b10': this.emit('wheel', 'Wheel: +' + this.award(10 * k, x, y)); break;
      case 'b25': this.emit('wheel', 'Wheel: +' + this.award(25 * k, x, y, '#ffb7ff')); break;
      case 'fever': this.startFever(k); break;
      case 'rain': this.startRain(k); break;
      case 'jackpot': {
        const n = this.award(100 * k, x, y, '#ffd23c', undefined);
        this.jackpotT = 3;
        this.shake = 1;
        this.flashText('JACKPOT!', '#ffd23c');
        this.screenFlash('#fff1b0', 0.9);
        this.emit('jackpot', `BLACK HOLE JACKPOT +${n}`, '#ffd23c');
        for (let i = 0; i < 160; i++) this.spark(CX, BLACK_HOLE.y, ['#ffd23c', '#fff', '#ff7bf2'][i % 3], 1, Math.random() * 6.28, 2, 900);
        // jackpot = the full party: Ball Rain + Fever right away
        this.startFever(k);
        this.startRain(k);
        break;
      }
    }
  }

  // ---------------- physics ----------------
  private physicsStep(dt: number) {
    const g = G_BASE * T.gravity;
    for (const b of this.balls) {
      if (b.dead) continue;
      b.age += dt;
      b.alienCd -= dt;
      b.ufoCd -= dt;
      b.ignoreT -= dt;
      b.vy += g * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 2200) { b.vx *= 2200 / sp; b.vy *= 2200 / sp; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // top arc (inside)
      if (b.y < CY) {
        const dx = b.x - CX, dy = b.y - CY;
        const d = Math.hypot(dx, dy);
        const lim = R - BALL_R;
        if (d > lim) {
          const nx = dx / d, ny = dy / d;
          b.x = CX + nx * lim;
          b.y = CY + ny * lim;
          const vn = b.vx * nx + b.vy * ny;
          if (vn > 0) {
            b.vx -= (1 + T.wallBounce) * vn * nx;
            b.vy -= (1 + T.wallBounce) * vn * ny;
            b.vx *= 0.9994;
            b.vy *= 0.9994;
          }
        }
      }
      for (const s of SEGS) if (collideSeg(b, s, s.kick ? 0.9 : T.wallBounce) && s.kick) this.kick(b, s);

      // pins
      const near = pinsNear(b.x, b.y, this.near);
      for (let k = 0; k < near.length; k++) {
        const i = near[k];
        const p = PINS[i];
        const dx = b.x - p.x, dy = b.y - p.y;
        const rr = BALL_R + PIN_R;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          b.x = p.x + nx * rr;
          b.y = p.y + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            if (b.alienCd > 1) b.alienCd = 0.1; // bounced off a pin → the next alien hit counts again
            b.vx -= (1 + T.pinBounce) * vn * nx;
            b.vy -= (1 + T.pinBounce) * vn * ny;
            // tiny chaos so balls never settle on a pin
            const j = (Math.random() - 0.5) * 30;
            b.vx += -ny * j;
            b.vy += nx * j;
            if (-vn > 70 && (i !== b.lastPin || this.time - b.lastPinT > 0.25)) {
              b.chain = this.time - b.lastPinT < 0.4 ? b.chain + 1 : 0;
              b.lastPinT = this.time;
              b.lastPin = i;
              p.flash = 1;
              sfx.pin(b.chain);
            }
          }
        }
      }

      // alien bumper
      if (this.alienGone <= 0) {
        const dx = b.x - this.al.x, dy = b.y - this.al.y;
        const rr = this.al.r + BALL_R;
        const d = Math.hypot(dx, dy);
        if (d < rr) {
          const nx = dx / d, ny = dy / d;
          b.x = this.al.x + nx * rr;
          b.y = this.al.y + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= 1.75 * vn * nx;
            b.vy -= 1.75 * vn * ny;
            if (-vn > 140 && b.alienCd <= 0) {
              b.alienCd = 999; // locked until the ball touches something else (pin/orb/ship)
              this.hitAlien(b);
            }
          }
        }
      }

      // orb bumpers
      for (const o of ORBS) {
        const vn = bounceCircle(b, o, 1.9);
        if (vn > 0 && b.alienCd > 1) b.alienCd = 0.1;
        if (vn > 90) {
          o.flash = 1;
          sfx.orb();
          for (let i = 0; i < 5; i++) this.spark(b.x, b.y, '#e08bff', 1, Math.atan2(b.y - o.y, b.x - o.x) + (Math.random() - 0.5), 0.4, 220);
        }
      }
      // ship targets: hatch first (ball drops in → split), then the solid hull
      for (const sh of SHIPS) {
        if (!(b.ignoreHole === sh && b.ignoreT > 0)) {
          const rad = ((sh.mult === 2 ? T.hole2Size : T.hole3Size) * BALL_R * 2) / 2;
          if (b.vy > -40 && Math.hypot(b.x - sh.hx, b.y - sh.hy) < rad) {
            this.enterShip(b, sh);
            break;
          }
        }
        for (const body of sh.bodies) {
          const vn = bounceCircle(b, body, 1 + T.pinBounce);
          if (vn > 0 && b.alienCd > 1) b.alienCd = 0.1;
          if (vn > 110 && sh.bump < 0.5) {
            sh.bump = 1;
            sfx.shipDing(sh.kind);
          }
        }
      }
      if (b.dead) continue;

      // black hole
      if (Math.hypot(b.x - BLACK_HOLE.x, b.y - BLACK_HOLE.y) < T.blackHoleRadius) {
        b.dead = true;
        this.stats.bh++;
        this.feedBlackHole(b.x, b.y);
        continue;
      }

      // crown holes on top of the alien
      for (const ch of CROWN_HOLES) {
        const rad = T.crownHoleSize * BALL_R;
        if (Math.hypot(b.x - ch.x, b.y - ch.y) < rad && b.vx * Math.cos(ch.a) + b.vy * Math.sin(ch.a) < 120) {
          b.dead = true;
          ch.flash = 1;
          if (ch.kind === 'warp') this.startWarp();
          else this.crownSide(ch.x, ch.y);
          break;
        }
      }
      if (b.dead) continue;
      bounceCircle(b, CROWN, 1 + T.pinBounce);

      // hidden hole (Easter egg)
      // only a ball riding the rail (moving clockwise, little radial speed) slowly enough drops in
      const hr = Math.abs(((b.x - CX) * b.vx + (b.y - CY) * b.vy) / Math.max(1, Math.hypot(b.x - CX, b.y - CY)));
      if (Math.hypot(b.x - HIDDEN.x, b.y - HIDDEN.y) < HIDDEN.r && b.vx > 0 && hr < 40 && Math.hypot(b.vx, b.vy) < T.hiddenMaxSpeed) {
        b.dead = true;
        this.secretFound();
        continue;
      }

      // UFO
      if (this.ufo.active && !this.ufo.hit && b.ufoCd <= 0) {
        if (Math.abs(b.x - this.ufo.x) < 46 && Math.abs(b.y - this.ufo.y) < 22) {
          b.ufoCd = 1;
          this.hitUfo();
          b.vy = Math.abs(b.vy) * 0.5 + 100;
        }
      }

      // lucky cup
      const cx = this.cupX;
      for (const side of [-1, 1]) {
        const rx = cx + side * (CUP_HALF + 4), ry = CUP_Y - 6;
        const dx = b.x - rx, dy = b.y - ry;
        const d = Math.hypot(dx, dy);
        const rr = BALL_R + 6;
        if (d < rr) {
          const nx = dx / d, ny = dy / d;
          b.x = rx + nx * rr;
          b.y = ry + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
        }
      }
      if (b.vy > 0 && Math.abs(b.x - cx) < CUP_HALF && b.y > CUP_Y - 4 && b.y - b.vy * dt <= CUP_Y - 4) {
        b.dead = true;
        this.stats.cup++;
        this.cupGlow = 1;
        this.award(1, cx, CUP_Y - 40, '#7ff');
        sfx.cup();
        for (let i = 0; i < 14; i++) this.spark(cx, CUP_Y - 6, '#9ff', 1, -Math.PI / 2 + (Math.random() - 0.5) * 1.6, 0.8, 380);
        continue;
      }

      // stuck guard
      const spd = Math.hypot(b.vx, b.vy);
      if (spd < 12) {
        b.slowT += dt;
        if (b.slowT > 1.2) { b.vx += (Math.random() - 0.5) * 200; b.vy -= 80; b.slowT = 0; }
      } else b.slowT = 0;
      // wedged balls (e.g. on a kicker tip) never stay slow-and-still for long: clear them
      b.stuckT = spd < 60 ? (b.stuckT || 0) + dt : Math.max(0, (b.stuckT || 0) - dt * 2);
      if (b.stuckT > 2.5) b.age = 999;

      if (b.y > DRAIN_Y || b.x < -40 || b.x > W + 40 || b.y < -60 || b.age > 40) {
        b.dead = true;
        this.stats.drained++;
        if (!b.free) sfx.drain();
      }
    }
    for (const b of this.balls) {
      if (b.dead) continue;
      if (b.trail.length > 6) b.trail.shift();
      b.trail.push({ x: b.x, y: b.y });
    }
    this.balls = this.balls.filter((b) => !b.dead);
  }

  /** Slingshot kicker: shove the ball toward the centre with a flash + zap. */
  private kick(b: Ball, s: { ax: number; ay: number; bx: number; by: number }) {
    b.vx += (CX - b.x > 0 ? 1 : -1) * T.kickerPower;
    b.vy -= T.kickerPower * 0.25;
    this.kickFlash = 1;
    sfx.kicker();
    for (let i = 0; i < 8; i++) this.spark((s.ax + s.bx) / 2, (s.ay + s.by) / 2, '#9ff', 1, Math.PI + (Math.random() - 0.5), 0.4, 260);
  }

  /** A ball fell into the black hole: charge it; the N-th ball opens the Wheel of Fortune. */
  feedBlackHole(x: number, y: number, amount = 1) {
    const need = this.bhNeed;
    this.bhCharge += amount;
    this.bhGlow = 1;
    if (this.bhCharge >= need) {
      this.bhCharge = 0;
      this.save.bhLevel = (this.save.bhLevel || 0) + 1;
      this.save.bhKnown = true;
      writeSave(this.save);
      if (T.bhWheelStep > 0) this.emit('bh', `Next wheel needs ${this.bhNeed} black-hole balls`, '#c78bff');
      this.enterBlackHole(x, y);
      return;
    }
    sfx.bhGulp(this.bhCharge);
    this.popups.push({ x: BLACK_HOLE.x, y: BLACK_HOLE.y - 50, text: `${this.bhCharge}/${need}`, color: '#d6a8ff', life: 1, size: 26 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ x: BLACK_HOLE.x + Math.cos(a) * 50, y: BLACK_HOLE.y + Math.sin(a) * 50, vx: -Math.cos(a) * 120, vy: -Math.sin(a) * 120, life: 0.4, max: 0.4, color: '#c78bff', size: 2.5, g: 0, kind: 'dot' });
    }
  }

  enterBlackHole(x: number, y: number) {
    const sup = this.rainT > 0 && !this.rainSuperUsed;
    if (sup) this.rainSuperUsed = true;
    if (this.wheel || this.bhSeq) this.wheelQueue.push(sup);
    else {
      this.bhSeq = { t: 0, x, y, sup };
      sfx.humStart();
    }
    this.emit('bh', sup ? 'Black hole during Ball Rain → SUPER WHEEL!' : 'Into the black hole!', sup ? '#ffd23c' : '#c78bff');
  }

  /** Centre crown hole: the ball warps straight down through the alien into the black hole. */
  startWarp() {
    this.stats.warp++;
    this.warp = { t: 0, sup: false };
    this.alienWobble = 1;
    sfx.warp();
    this.screenFlash('#d6a8ff', 0.35);
    this.popups.push({ x: CROWN.x, y: CROWN.y - 70, text: 'WARP!', color: '#ffd23c', life: 1.3, size: 34 });
    for (let i = 0; i < 30; i++) this.spark(CROWN.x, CROWN.y - CROWN.r, ['#ffd23c', '#c78bff', '#fff'][i % 3], 1, -Math.PI / 2 + (Math.random() - 0.5) * 2.4, 0.8, 380);
    this.emit('warp', 'WARP hole! Straight into the black hole', '#ffd23c');
  }

  private crownSide(x: number, y: number) {
    this.stats.crown++;
    if (this.rainT > 0) {
      this.goldHit(x, y);
      sfx.crownHole();
      return;
    }
    this.award(T.crownReward, x, y - 26, '#9dff6a');
    this.alienHits++;
    this.stats.alien++;
    this.alienWobble = 1;
    sfx.crownHole();
    for (let i = 0; i < 16; i++) this.spark(x, y, '#9dff6a', 1, Math.random() * 6.28, 0.6, 300);
    if (this.alienHits >= this.alienNeed && this.rainT <= 0) this.alienRain();
  }

  /** Ball Rain: the Golden Super Alien pays on every hit, more as the combo grows. */
  private goldHit(x: number, y: number) {
    this.goldCombo++;
    this.stats.alien++;
    this.alienWobble = 1;
    const base = T.goldAlienReward + Math.min(T.goldComboMax, Math.floor((this.goldCombo - 1) / T.goldComboStep));
    const n = this.award(base, x, y - 20, '#ffd23c', undefined);
    this.goldWon += n;
    if (this.goldCombo % 5 === 0) {
      this.popups.push({ x: this.al.x, y: this.al.y - 130, text: `COMBO ×${this.goldCombo}!`, color: '#ff7bf2', life: 1.2, size: 36 });
      this.screenFlash('#ffe27a', 0.25);
      this.shake = Math.max(this.shake, 0.35);
    }
    sfx.goldHit(this.goldCombo);
    for (let i = 0; i < 14; i++) this.spark(x, y, ['#ffd23c', '#fff3b0', '#ff9a3c'][i % 3], 1, Math.random() * 6.28, 0.7, 340);
  }

  /** The alien hit target was reached: Ball Rain, and the next target grows. */
  private alienRain() {
    this.save.alienLevel = (this.save.alienLevel || 0) + 1;
    writeSave(this.save);
    this.startRain();
    if (T.alienRainStep > 0) this.emit('rain', `Next Ball Rain needs ${this.alienNeed} alien hits`, '#9dff6a');
  }

  private hitAlien(b: Ball) {
    if (this.rainT > 0) {
      if (b.goldDone) { this.alienWobble = 0.5; return; } // each ball pays the golden alien once
      b.goldDone = true;
      this.goldHit(b.x, b.y);
      return;
    }
    this.alienHits++;
    this.stats.alien++;
    this.alienWobble = 1;
    sfx.alienOuch();
    for (let i = 0; i < 8; i++) this.spark(b.x, b.y, '#9dff6a', 1, Math.atan2(b.y - this.al.y, b.x - this.al.x) + (Math.random() - 0.5), 0.6, 260);
    if (this.alienHits >= this.alienNeed && this.rainT <= 0) this.alienRain();
  }

  private enterShip(b: Ball, sh: Ship) {
    const n = sh.mult;
    sh.flash = 1;
    sh.bump = 1;
    b.dead = true;
    if (n === 2) this.stats.x2++;
    else this.stats.x3++;
    sfx.multiplier(n);
    const col = n === 2 ? '#5cf2ff' : '#ff7bf2';
    this.popups.push({ x: sh.x, y: sh.hy - 30, text: `×${n}`, color: col, life: 1.1, size: 34 });
    this.particles.push({ x: sh.hx, y: sh.hy, vx: 0, vy: 0, life: 0.6, max: 0.6, color: col, size: 70, g: 0, kind: 'ring' });
    for (let i = 0; i < 24; i++) this.spark(sh.hx, sh.hy, col, 1, Math.random() * 6.28, 0.8, 360);
    if (sh.kind === 'rocket') for (let i = 0; i < 26; i++) this.spark(sh.x, sh.y + 44, ['#ffb23c', '#ffe066', '#ff6a3c'][i % 3], 1, Math.PI / 2 + (Math.random() - 0.5) * 0.8, 0.7, 380);
    if (sh.kind === 'dish') for (let k = 0; k < 3; k++) this.particles.push({ x: sh.x - 10, y: sh.y - 22, vx: 0, vy: 0, life: 0.6 + k * 0.25, max: 0.6 + k * 0.25, color: '#ff7bf2', size: 60 + k * 30, g: 0, kind: 'ring' });
    // split balls pop out from under the ship (UFO: down the tractor beam)
    const outY = sh.y + (sh.kind === 'ufo' ? 26 : 48);
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.75;
      const nb = this.newBall(sh.x + Math.cos(a) * 6, outY, Math.cos(a) * 170, Math.sin(a) * 110 + 40, true);
      nb.ignoreHole = sh;
      nb.ignoreT = 0.8;
      this.balls.push(nb);
    }
  }

  private hitUfo() {
    const u = this.ufo;
    u.hit = true;
    u.hitT = 0;
    this.stats.ufo++;
    const n = this.award(T.ufoReward, u.x, u.y - 30, '#7ff');
    sfx.laserCheer();
    this.shake = 0.5;
    for (let i = 0; i < 50; i++) this.spark(u.x, u.y, ['#7ff', '#ff7bf2', '#fff'][i % 3], 1, Math.random() * 6.28, 1, 500);
    this.emit('ufo', `UFO down! +${n}`, '#7ff');
  }

  spark(x: number, y: number, color: string, n: number, angle: number, life: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, life, max: life, color, size: 2 + Math.random() * 2.5, g: 300, kind: 'spark' });
    }
  }

  // ---------------- layout ----------------
  resize(w: number, h: number, leftReserve: number, rightReserve: number, topReserve: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const availW = w - leftReserve - rightReserve;
    const availH = h - topReserve - 16;
    const s = Math.max(0.2, Math.min(availH / (H + FRAME_M * 2 + CONSOLE_EXTRA), availW / (W + FRAME_M * 2)));
    const bw = (W + FRAME_M * 2) * s;
    const bh = (H + FRAME_M * 2 + CONSOLE_EXTRA) * s;
    const bx = leftReserve + (availW - bw) / 2 + FRAME_M * s;
    const by = topReserve + (availH - bh) / 2 + FRAME_M * s;
    this.view = { w, h, dpr, bx, by, s };
  }
  /** board → css px */
  toScreen(x: number, y: number) {
    return { x: this.view.bx + x * this.view.s, y: this.view.by + y * this.view.s };
  }

  // ---------------- render ----------------
  render() {
    const c = this.ctx;
    const v = this.view;
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    this.drawBackdrop(c);

    c.save();
    const sh = this.shake * 10;
    c.translate(v.bx + (Math.random() - 0.5) * sh, v.by + (Math.random() - 0.5) * sh);
    c.scale(v.s, v.s);
    this.drawFrame(c);
    c.save();
    boardPath(c);
    c.clip();
    // camera zoom on the black hole
    if (this.zoom > 1.001) {
      const fx = BLACK_HOLE.x, fy = BLACK_HOLE.y;
      c.translate(fx, fy);
      c.scale(this.zoom, this.zoom);
      c.translate(-fx, -fy);
    }
    this.drawField(c);
    c.restore();
    this.drawFrameOver(c);
    this.drawConsole(c);
    if (this.showHitAreas) this.drawHitAreas(c);
    c.restore();

    if (this.wheel) this.drawWheel(c);
    if (this.hoops) this.hoops.render(c, v.w, v.h, this.realTime, this.art, this.ballSprite);
    if (this.astroT > 0) this.drawAstronaut(c);
    if (this.flashA > 0.01) {
      c.globalAlpha = this.flashA;
      c.fillStyle = this.flashColor;
      c.globalCompositeOperation = 'lighter';
      c.fillRect(0, 0, v.w, v.h);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
  }

  private drawBackdrop(c: CanvasRenderingContext2D) {
    const v = this.view;
    const img = this.art.backdrop;
    const sc = Math.max(v.w / img.width, v.h / img.height);
    c.drawImage(img, (v.w - img.width * sc) / 2, (v.h - img.height * sc) / 2, img.width * sc, img.height * sc);
    c.fillStyle = 'rgba(4,2,18,0.35)';
    c.fillRect(0, 0, v.w, v.h);
    // moving starfield (faster in Fever)
    const speed = this.feverT > 0 ? 0.9 : 0.04;
    const cx = v.w / 2, cy = v.h / 2;
    for (const s of this.starfield) {
      s.z -= speed * 0.016 * (0.3 + s.z);
      if (s.z <= 0.02) { s.z = 1; s.x = Math.random(); s.y = Math.random(); }
      const px = cx + (s.x - 0.5) * v.w / s.z * 0.5;
      const py = cy + (s.y - 0.5) * v.h / s.z * 0.5;
      if (px < 0 || px > v.w || py < 0 || py > v.h) { s.z = 1; continue; }
      const sz = (1 - s.z) * 2.4 + 0.3;
      c.fillStyle = this.feverT > 0 ? `hsla(${(s.x * 360 + this.realTime * 200) % 360},100%,75%,${1 - s.z})` : `rgba(220,230,255,${(1 - s.z) * 0.9})`;
      if (this.feverT > 0) {
        c.fillRect(px, py, sz * 3, sz);
      } else c.fillRect(px, py, sz, sz);
    }
    for (const r of this.rocks) if (r.screen) this.drawRock(c, r.x * v.w, r.y * v.h, r.size, r.rot);
  }

  private drawRock(c: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
    const a = this.art.asteroid;
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.drawImage(a.img, -size / 2, -size / 2, size, size * (a.h / a.w));
    c.restore();
  }

  private drawFrame(c: CanvasRenderingContext2D) {
    // machine body behind the board
    c.save();
    c.shadowColor = this.feverT > 0 ? `hsl(${(this.realTime * 240) % 360},100%,60%)` : 'rgba(140,90,255,0.6)';
    c.shadowBlur = this.feverT > 0 ? 50 : 40;
    c.fillStyle = '#0b0820';
    boardPath(c, 24);
    c.fill();
    c.restore();
    // launcher housing (left)
    c.save();
    const lg = c.createLinearGradient(LEFT_X - 50, 0, LEFT_X - 10, 0);
    lg.addColorStop(0, '#4b4f6b');
    lg.addColorStop(0.5, '#c9d1e6');
    lg.addColorStop(1, '#5a5f7c');
    c.fillStyle = lg;
    roundRect(c, LEFT_X - 50, LAUNCH.y - 6, 40, 430, 12);
    c.fill();
    this.drawPowerMeter(c);
    c.restore();
  }

  /** Power meter in the launcher housing: fills with the Space charge, MAX at the top, gold tick = last shot. */
  private drawPowerMeter(c: CanvasRenderingContext2D) {
    const x = LEFT_X - 41, w = 22;
    const top = LAUNCH.y + 26, bot = LAUNCH.y + 362, h = bot - top;
    // track
    c.fillStyle = '#0a0720';
    roundRect(c, x, top, w, h, 10);
    c.fill();
    const f = this.charging ? this.chargeFrac() : 0;
    const full = this.charging && f >= 0.999;
    if (f > 0) {
      const g = c.createLinearGradient(0, bot, 0, top);
      g.addColorStop(0, '#2ee6ff');
      g.addColorStop(0.5, '#9dff6a');
      g.addColorStop(0.8, '#ffd23c');
      g.addColorStop(1, '#ff3b6b');
      c.save();
      c.fillStyle = g;
      c.shadowColor = full ? '#ff3b6b' : '#5cf2ff';
      c.shadowBlur = full ? 22 : 12;
      roundRect(c, x + 1.5, bot - h * f, w - 3, h * f, 6);
      c.fill();
      c.restore();
      if (full && Math.floor(this.realTime * 12) % 2 === 0) {
        c.fillStyle = 'rgba(255,255,255,0.55)';
        roundRect(c, x + 1.5, top, w - 3, h, 6);
        c.fill();
      }
    }
    // ticks at 25 / 50 / 75 %
    c.fillStyle = 'rgba(200,210,255,0.55)';
    for (const k of [0.25, 0.5, 0.75]) c.fillRect(x - 4, bot - h * k - 1.5, 8, 3);
    // last shot marker
    if (this.lastFrac >= 0) {
      const y = bot - h * this.lastFrac;
      c.save();
      c.fillStyle = '#ffd23c';
      c.shadowColor = '#ffd23c';
      c.shadowBlur = 8;
      c.beginPath();
      c.moveTo(x - 1, y);
      c.lineTo(x - 11, y - 7);
      c.lineTo(x - 11, y + 7);
      c.closePath();
      c.fill();
      c.fillRect(x, y - 1.5, w, 3);
      c.restore();
    }
    // MAX label + % readout
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 12px Orbitron, sans-serif';
    c.fillStyle = full ? (Math.floor(this.realTime * 12) % 2 ? '#ffffff' : '#ff3b6b') : 'rgba(255,90,130,0.6)';
    if (full) { c.shadowColor = '#ff3b6b'; c.shadowBlur = 12; }
    c.fillText('MAX', x + w / 2, top - 10);
    c.shadowBlur = 0;
    if (this.charging) {
      c.font = '900 13px Orbitron, sans-serif';
      c.fillStyle = '#ffffff';
      c.fillText(`${Math.round(f * 100)}`, x + w / 2, bot + 12);
    }
    c.restore();
  }

  private drawFrameOver(c: CanvasRenderingContext2D) {
    // chrome rim
    c.save();
    c.lineJoin = 'round';
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f2f5ff');
    g.addColorStop(0.25, '#7d84a8');
    g.addColorStop(0.5, '#e7ebf8');
    g.addColorStop(0.75, '#6a7096');
    g.addColorStop(1, '#d9def0');
    c.strokeStyle = g;
    c.lineWidth = 16;
    boardPath(c, 8);
    c.stroke();
    const fever = this.feverT > 0;
    c.strokeStyle = fever ? `hsl(${(this.realTime * 300) % 360},100%,62%)` : 'rgba(150,110,255,0.9)';
    c.lineWidth = 3;
    c.shadowColor = c.strokeStyle as string;
    c.shadowBlur = 14;
    boardPath(c, 0.5);
    c.stroke();
    c.restore();
    // marquee chase lights around the frame
    const hype2 = this.hype;
    const speed = hype2 === 2 ? 26 : hype2 === 1 ? 16 : 4;
    const n = this.bulbs.length;
    for (let i = 0; i < n; i++) {
      const b = this.bulbs[i];
      const phase = (i - this.realTime * speed) % 6;
      const on = hype2 === 2 ? Math.floor(this.realTime * 8 + i) % 2 === 0 : (phase + 6) % 6 < (hype2 ? 3 : 1.4);
      let col: string;
      if (hype2 === 2) col = this.rainT > 0 ? (i % 2 ? '#9dff6a' : '#ffe066') : '#ffd23c';
      else if (hype2 === 1) col = `hsl(${(i * 12 + this.realTime * 300) % 360},100%,65%)`;
      else col = i % 2 ? '#5cf2ff' : '#c78bff';
      c.fillStyle = on ? col : 'rgba(60,50,100,0.9)';
      if (on) { c.shadowColor = col; c.shadowBlur = 10; }
      c.beginPath(); c.arc(b.x, b.y, on ? 3.6 : 2.6, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    }
    // launcher slot
    c.fillStyle = '#0e0b24';
    c.fillRect(LEFT_X - 12, LAUNCH.y - 2, 12, 20);
    // loaded ball in launcher
    if (this.save.balls > 0 && !this.outOfBalls) {
      const by = LAUNCH.y + 402;
      c.drawImage(this.ballSprite, LEFT_X - 30 - BALL_R * 1.1, by - BALL_R * 1.1, BALL_R * 2.2, BALL_R * 2.2);
    }
  }

  private drawField(c: CanvasRenderingContext2D) {
    const img = this.art.board;
    const sc = Math.max(W / img.width, H / img.height);
    c.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc);
    c.fillStyle = 'rgba(6,4,24,0.5)';
    c.fillRect(0, 0, W, H);
    const fever = this.feverT > 0;
    if (fever) {
      const pulse = 0.5 + 0.5 * Math.cos((this.beat % 1) * Math.PI * 2);
      c.fillStyle = `hsla(${(this.realTime * 120) % 360},100%,50%,${0.06 + pulse * 0.08})`;
      c.fillRect(0, 0, W, H);
    }
    // drain trough
    const dg = c.createLinearGradient(0, 940, 0, 1000);
    dg.addColorStop(0, 'rgba(0,0,0,0)');
    dg.addColorStop(1, 'rgba(255,60,120,0.35)');
    c.fillStyle = dg;
    c.fillRect(0, 940, W, 60);

    // spectacle: searchlight sweeps, comets and asteroids behind the pins
    const hype = this.hype;
    if (hype > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const ang = -Math.PI / 2 + side * (0.35 + 0.3 * Math.sin(this.realTime * (hype === 2 ? 2.4 : 1.4) + side));
        const ox = CX + side * 330, oy = H;
        const g2 = c.createRadialGradient(ox, oy, 10, ox, oy, 900);
        const col = hype === 2 ? '120,255,140' : `${side > 0 ? '255,90,220' : '90,220,255'}`;
        g2.addColorStop(0, `rgba(${col},0.28)`);
        g2.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g2;
        c.beginPath();
        c.moveTo(ox, oy);
        c.arc(ox, oy, 900, ang - 0.12, ang + 0.12);
        c.closePath();
        c.fill();
      }
      c.restore();
    }
    for (const cm of this.comets) {
      const g3 = c.createLinearGradient(cm.x, cm.y, cm.x - cm.vx * 0.12, cm.y - cm.vy * 0.12);
      g3.addColorStop(0, `hsla(${cm.hue},100%,85%,${Math.min(1, cm.life)})`);
      g3.addColorStop(1, `hsla(${cm.hue},100%,60%,0)`);
      c.strokeStyle = g3;
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(cm.x, cm.y); c.lineTo(cm.x - cm.vx * 0.12, cm.y - cm.vy * 0.12); c.stroke();
    }
    for (const r of this.rocks) if (!r.screen) { c.globalAlpha = 0.85; this.drawRock(c, r.x, r.y, r.size, r.rot); c.globalAlpha = 1; }

    // black hole
    this.drawBlackHole(c);
    // hidden hole: a barely visible notch in the rim
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath();
    c.arc(HIDDEN.x, HIDDEN.y, 5, 0, Math.PI * 2);
    c.fill();

    // wall kickers (chrome bars)
    c.lineCap = 'round';
    for (const s of SEGS.slice(2)) {
      if (s.ay === SIDE_BOTTOM) continue;
      c.strokeStyle = '#2a2350';
      c.lineWidth = 9;
      c.beginPath(); c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); c.stroke();
      c.strokeStyle = s.kick && this.kickFlash > 0 ? '#9ff' : fever ? `hsl(${(this.realTime * 300) % 360},100%,70%)` : s.kick ? '#7fe9ff' : '#c9d1f0';
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); c.stroke();
    }

    this.drawOrbs(c);
    this.drawShips(c);

    // pins
    const pulse = fever ? 0.5 + 0.5 * Math.cos((this.beat % 1) * Math.PI * 2) : 0;
    const ps = PIN_R * 2.6;
    for (let i = 0; i < PINS.length; i++) {
      const p = PINS[i];
      if (fever) {
        const hue = Math.floor(((p.x + p.y) / 60 + this.realTime * 4)) % 12;
        c.globalAlpha = 0.35 + pulse * 0.5;
        c.drawImage(this.glowSprites[hue], p.x - 10, p.y - 10, 20, 20);
        c.globalAlpha = 1;
      }
      if (p.flash > 0) {
        c.globalAlpha = p.flash;
        const s = 16 + p.flash * 14;
        c.drawImage(this.glowSprites[12], p.x - s / 2, p.y - s / 2, s, s);
        c.globalAlpha = 1;
      }
      c.drawImage(this.pinSprite, p.x - ps / 2, p.y - ps / 2, ps, ps);
    }

    this.drawAlien(c);
    this.drawCup(c);
    if (this.ufo.active) this.drawUfo(c);

    // balls
    for (const b of this.balls) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 500 && b.trail.length > 1) {
        c.strokeStyle = b.free ? 'rgba(140,255,160,0.35)' : 'rgba(160,220,255,0.35)';
        c.lineWidth = BALL_R * 1.2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(b.trail[0].x, b.trail[0].y);
        for (const t of b.trail) c.lineTo(t.x, t.y);
        c.stroke();
      }
      c.drawImage(this.ballSprite, b.x - BALL_R * 1.15, b.y - BALL_R * 1.15, BALL_R * 2.3, BALL_R * 2.3);
    }

    // particles
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      c.globalAlpha = a;
      if (p.kind === 'ring') {
        c.strokeStyle = p.color;
        c.lineWidth = 6 * a;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1 - a) + 10, 0, Math.PI * 2);
        c.stroke();
      } else {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;

    // popups
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of this.popups) {
      const a = Math.min(1, p.life * 2);
      const sc2 = 1 + Math.max(0, p.life - (p.size >= 60 ? 1.7 : 1.2)) * 2;
      c.globalAlpha = a;
      c.font = `900 ${p.size * sc2}px Orbitron, "Exo 2", sans-serif`;
      c.lineWidth = 6;
      c.strokeStyle = 'rgba(10,0,30,0.85)';
      c.strokeText(p.text, p.x, p.y);
      c.fillStyle = p.color;
      c.shadowColor = p.color;
      c.shadowBlur = 18;
      c.fillText(p.text, p.x, p.y);
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;

    // black-hole sequence: ball spiralling in
    if (this.bhSeq) {
      const t = this.bhSeq.t;
      const k = Math.min(1, t / 1.2);
      const r0 = Math.hypot(this.bhSeq.x - BLACK_HOLE.x, this.bhSeq.y - BLACK_HOLE.y) + 14;
      const a = t * 14;
      const rr = r0 * (1 - k);
      const sz = BALL_R * 2.3 * (1 - k * 0.8);
      c.drawImage(this.ballSprite, BLACK_HOLE.x + Math.cos(a) * rr - sz / 2, BLACK_HOLE.y + Math.sin(a) * rr - sz / 2, sz, sz);
      c.fillStyle = `rgba(20,0,40,${Math.min(0.5, t * 0.4)})`;
      c.fillRect(0, 0, W, H);
    }
    if (this.jackpotT > 0) {
      c.fillStyle = `rgba(255,210,60,${(this.jackpotT % 0.3) / 0.3 * 0.15})`;
      c.fillRect(0, 0, W, H);
    }
  }

  private drawBlackHole(c: CanvasRenderingContext2D) {
    const s = this.art.blackhole;
    const size = 128 + Math.sin(this.bhPulse * 2) * 4 + (this.bhSeq ? this.bhSeq.t * 40 : 0);
    c.save();
    c.translate(BLACK_HOLE.x, BLACK_HOLE.y);
    c.rotate(-this.bhPulse * (this.bhSeq ? 5 : 0.8));
    c.drawImage(s.img, -size / 2, -size / 2, size, size);
    c.restore();
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(BLACK_HOLE.x, BLACK_HOLE.y, 14, 0, Math.PI * 2);
    c.fill();
    // charge lights: one per ball needed to open the Wheel of Fortune
    const need = this.bhNeed;
    if (need > 1) {
      const ready = this.bhCharge === need - 1;
      for (let i = 0; i < need; i++) {
        const a = -Math.PI / 2 + (i / need) * Math.PI * 2;
        const x = BLACK_HOLE.x + Math.cos(a) * 70, y = BLACK_HOLE.y + Math.sin(a) * 70;
        const on = i < this.bhCharge;
        const blink = ready && i === need - 1 && Math.floor(this.realTime * 6) % 2 === 0;
        c.fillStyle = on ? '#f08bff' : blink ? '#ffd23c' : 'rgba(150,120,210,0.75)';
        c.shadowColor = on ? '#e07bff' : '#ffd23c';
        c.shadowBlur = on || blink ? 10 + this.bhGlow * 10 : 0;
        c.beginPath();
        c.arc(x, y, on ? 5.5 : 4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(10,4,30,0.9)';
        c.lineWidth = 1.5;
        c.stroke();
      }
      c.shadowBlur = 0;
    }
  }

  private drawOrbs(c: CanvasRenderingContext2D) {
    for (const o of ORBS) {
      const pulse = 0.5 + 0.5 * Math.sin(this.realTime * 3 + o.x);
      c.save();
      const glow = c.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r * 2.6);
      glow.addColorStop(0, `rgba(255,170,255,${0.5 + o.flash * 0.5})`);
      glow.addColorStop(0.4, `rgba(190,80,255,${0.25 + o.flash * 0.4})`);
      glow.addColorStop(1, 'rgba(120,40,255,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(o.x, o.y, o.r * 2.6, 0, Math.PI * 2); c.fill();
      const body = c.createRadialGradient(o.x - 5, o.y - 6, 1, o.x, o.y, o.r);
      body.addColorStop(0, '#fff');
      body.addColorStop(0.35, '#ff9cf5');
      body.addColorStop(0.8, '#a43cff');
      body.addColorStop(1, '#4a138f');
      c.fillStyle = body;
      c.beginPath(); c.arc(o.x, o.y, o.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = `rgba(255,190,255,${0.5 + pulse * 0.5})`;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(o.x, o.y, o.r + 5 + o.flash * 8, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
  }

  private drawShips(c: CanvasRenderingContext2D) {
    for (const sh of SHIPS) {
      const sp = sh.kind === 'ufo' ? this.art.miniufo : sh.kind === 'rocket' ? this.art.rocket : this.art.dish;
      const col = sh.mult === 2 ? '#5cf2ff' : '#ff7bf2';
      let w: number, top: number;
      if (sh.kind === 'ufo') { w = 86; top = sh.hy - 9; }
      else if (sh.kind === 'rocket') { w = 92 * (sp.w / sp.h); top = sh.hy - 6; }
      else { w = 80; top = sh.y - 42; }
      const h = w * (sp.h / sp.w);
      const wob = Math.sin(this.realTime * 38) * sh.bump * 0.08;
      const lift = sh.kind === 'rocket' ? -sh.flash * 6 : 0;
      const hover = sh.kind === 'ufo' ? Math.sin(this.realTime * 2 + sh.x) * 1.5 : 0;
      // glow behind when lit
      if (sh.flash > 0 || this.feverT > 0) {
        c.save();
        c.globalAlpha = Math.max(sh.flash, this.feverT > 0 ? 0.35 : 0);
        c.drawImage(this.glowSprites[sh.mult === 2 ? 6 : 10], sh.x - w * 0.9, top - 10, w * 1.8, h + 30);
        c.restore();
      }
      c.save();
      c.translate(sh.x, top + h / 2 + lift + hover);
      c.rotate(wob);
      if (sh.flip) c.scale(-1, 1);
      c.drawImage(sp.img, -w / 2, -h / 2, w, h);
      if (sh.flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = sh.flash * 0.6;
        c.drawImage(sp.img, -w / 2, -h / 2, w, h);
      }
      c.restore();
      // hatch: a glowing ring on the ship that catches balls
      const rad = ((sh.mult === 2 ? T.hole2Size : T.hole3Size) * BALL_R * 2) / 2;
      const pulse = 0.5 + 0.5 * Math.sin(this.realTime * 4 + sh.x * 0.05);
      c.save();
      c.shadowColor = col;
      c.shadowBlur = 10 + pulse * 8 + sh.flash * 30;
      c.fillStyle = 'rgba(5,1,20,0.85)';
      c.beginPath(); c.arc(sh.hx, sh.hy + hover, rad + 1, 0, Math.PI * 2); c.fill();
      c.strokeStyle = col;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(sh.hx, sh.hy + hover, rad + 3.5, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0;
      // multiplier chip
      const chipY = sh.kind === 'ufo' ? sh.y + 40 : sh.y + 56;
      c.font = '900 12px Orbitron, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(10,4,30,0.75)';
      c.beginPath(); c.roundRect(sh.x - 15, chipY - 8, 30, 16, 8); c.fill();
      c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = col;
      c.fillText(`×${sh.mult}`, sh.x, chipY + 0.5);
      c.restore();
    }
  }

  private drawAlien(c: CanvasRenderingContext2D) {
    const s = this.art.alien;
    const n = this.alienNeed;
    this.drawGourd(c);
    // ring of lights (around the lower body, the crown sits on top)
    for (let i = 0; i < n; i++) {
      const a = (-35 * Math.PI) / 180 + (i / Math.max(1, n - 1)) * ((250 * Math.PI) / 180);
      const x = this.al.x + Math.cos(a) * (this.al.r + 22);
      const y = this.al.y + Math.sin(a) * (this.al.r + 22);
      const on = i < this.alienHits;
      c.fillStyle = on ? '#9dff6a' : 'rgba(80,90,120,0.7)';
      c.shadowColor = '#9dff6a';
      c.shadowBlur = on ? 12 : 0;
      c.beginPath();
      c.arc(x, y, on ? 4.2 : 3, 0, Math.PI * 2);
      c.fill();
    }
    c.shadowBlur = 0;
    const gold = this.rainT > 0 && this.alienGone <= 0;
    if (gold) {
      // sunburst + aura behind the Golden Super Alien
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.translate(this.al.x, this.al.y);
      c.rotate(this.realTime * 0.8);
      const pulse = 0.6 + 0.4 * Math.sin(this.realTime * 8);
      for (let i = 0; i < 12; i++) {
        c.rotate((Math.PI * 2) / 12);
        const g = c.createLinearGradient(0, 0, 0, -170);
        g.addColorStop(0, `rgba(255,220,90,${0.6 * pulse})`);
        g.addColorStop(1, 'rgba(255,160,40,0)');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(-34, -190); c.lineTo(34, -190); c.lineTo(10, 0); c.fill();
      }
      c.restore();
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.55 + 0.3 * this.alienWobble;
      c.drawImage(this.glowSprites[1], this.al.x - 120, this.al.y - 120, 240, 240);
      c.restore();
    }
    if (this.alienGone > 0) {
      // swirling remains during the transformation
      c.strokeStyle = `rgba(157,255,106,${0.3 + 0.2 * Math.sin(this.realTime * 10)})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(this.al.x, this.al.y, this.al.r * 0.6, 0, Math.PI * 2);
      c.stroke();
      this.drawCrown(c);
      return;
    }
    const wob = Math.sin(this.realTime * 40) * this.alienWobble * 0.12;
    const pop = 1 + this.alienPop * 0.3 * Math.sin(this.alienPop * Math.PI);
    const spr = gold ? this.art.alienGold : s;
    const size = this.al.r * (gold ? 2.95 + 0.06 * Math.sin(this.realTime * 10) : 2.55) * pop;
    c.save();
    c.translate(this.al.x, this.al.y + (gold ? 0 : 6));
    c.rotate(wob);
    c.scale(1 + this.alienWobble * 0.06, 1 - this.alienWobble * 0.06);
    c.drawImage(spr.img, -size / 2, -size * (spr.h / spr.w) / 2, size, size * (spr.h / spr.w));
    c.restore();
    // hit counter (Ball Rain: golden combo + winnings)
    c.textAlign = 'center';
    if (gold) {
      c.font = '900 16px Orbitron, sans-serif';
      c.fillStyle = '#ffd23c';
      c.shadowColor = '#ff9a3c';
      c.shadowBlur = 12;
      c.fillText(this.goldCombo ? `GOLD COMBO ${this.goldCombo} · +${this.goldWon}` : 'HIT THE GOLDEN ALIEN!', this.al.x, this.al.y + this.al.r + 40);
      c.shadowBlur = 0;
    } else {
      c.font = '700 14px Orbitron, sans-serif';
      c.fillStyle = '#d8ffc8';
      if (this.save.bhKnown) {
        // both counters, digital: alien hits (green) and black-hole balls (purple)
        const y = this.al.y + this.al.r + 40;
        c.textAlign = 'right';
        c.fillText(`ALIEN ${this.alienHits}/${n}`, this.al.x - 8, y);
        c.textAlign = 'left';
        c.fillStyle = '#e0a8ff';
        c.fillText(`HOLE ${this.bhCharge}/${this.bhNeed}`, this.al.x + 8, y);
        c.textAlign = 'center';
      } else c.fillText(`${this.alienHits}/${n}`, this.al.x, this.al.y + this.al.r + 40);
    }
    this.drawCrown(c);
    // warp: the ball streaks down through the alien into the black hole
    if (this.warp) {
      const k = Math.min(1, this.warp.t / 0.75);
      const e = k * k;
      const y = CROWN.y - CROWN.r + (BLACK_HOLE.y - (CROWN.y - CROWN.r)) * e;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(0, CROWN.y - CROWN.r, 0, y);
      g.addColorStop(0, 'rgba(255,210,60,0)');
      g.addColorStop(1, 'rgba(255,230,140,0.9)');
      c.strokeStyle = g;
      c.lineWidth = 10;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(CROWN.x, CROWN.y - CROWN.r); c.lineTo(CROWN.x, y); c.stroke();
      c.restore();
      c.drawImage(this.glowSprites[12], CROWN.x - 18, y - 18, 36, 36);
      c.drawImage(this.ballSprite, CROWN.x - BALL_R * 1.15, y - BALL_R * 1.15, BALL_R * 2.3, BALL_R * 2.3);
    }
  }

  /** Gourd-shaped housing behind the alien + crown, like the classic hero housing. */
  private drawGourd(c: CanvasRenderingContext2D) {
    const fever = this.feverT > 0;
    const rim = fever ? `hsl(${(this.realTime * 200) % 360},100%,65%)` : '#b07bff';
    const rc = CROWN.r + 12, ra = this.al.r + 14;
    c.save();
    // outline = both circles stroked, then both filled slightly smaller (hides the inner overlap)
    c.shadowColor = rim;
    c.shadowBlur = 18;
    c.strokeStyle = rim;
    c.lineWidth = 4;
    c.beginPath(); c.arc(CROWN.x, CROWN.y, rc, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(this.al.x, this.al.y, ra, 0, Math.PI * 2); c.stroke();
    c.shadowBlur = 0;
    const g = c.createLinearGradient(0, CROWN.y - rc, 0, this.al.y + ra);
    g.addColorStop(0, '#3d1a7a');
    g.addColorStop(1, '#120634');
    c.fillStyle = g;
    c.beginPath();
    c.arc(CROWN.x, CROWN.y, rc - 2, 0, Math.PI * 2);
    c.moveTo(this.al.x + ra - 2, this.al.y);
    c.arc(this.al.x, this.al.y, ra - 2, 0, Math.PI * 2);
    c.fill('nonzero');
    c.restore();
  }

  private drawCrown(c: CanvasRenderingContext2D) {
    // chrome cap
    c.save();
    const g = c.createRadialGradient(CROWN.x - 10, CROWN.y - 14, 3, CROWN.x, CROWN.y, CROWN.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#c9cfe8');
    g.addColorStop(0.8, '#6c6f9a');
    g.addColorStop(1, '#2e2a5a');
    c.fillStyle = g;
    c.beginPath(); c.arc(CROWN.x, CROWN.y, CROWN.r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(200,170,255,0.9)';
    c.lineWidth = 2;
    c.stroke();
    // little antenna gem in the middle
    c.fillStyle = this.warp ? '#ffd23c' : '#ff7bf2';
    c.shadowColor = c.fillStyle;
    c.shadowBlur = 12;
    c.beginPath(); c.arc(CROWN.x, CROWN.y + 6, 6, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // holes
    for (const ch of CROWN_HOLES) {
      const warp = ch.kind === 'warp';
      const col = warp ? '#ffd23c' : '#9dff6a';
      const rad = T.crownHoleSize * BALL_R;
      const pulse = 0.5 + 0.5 * Math.sin(this.realTime * (warp ? 6 : 3));
      c.shadowColor = col;
      c.shadowBlur = 8 + pulse * 8 + ch.flash * 30;
      c.fillStyle = '#07021a';
      c.beginPath(); c.arc(ch.x, ch.y, rad + 1, 0, Math.PI * 2); c.fill();
      c.strokeStyle = col;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(ch.x, ch.y, rad + 3 + ch.flash * 6, 0, Math.PI * 2); c.stroke();
      if (warp) {
        c.save();
        c.translate(ch.x, ch.y);
        c.rotate(-this.realTime * 3);
        c.globalAlpha = 0.9;
        c.drawImage(this.art.blackhole.img, -rad, -rad, rad * 2, rad * 2);
        c.restore();
      }
      c.shadowBlur = 0;
    }
    // labels
    c.font = '900 11px Orbitron, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#7a4b00';
    c.fillText('WARP', CROWN.x, CROWN.y - 10);
    c.fillStyle = '#9dff6a';
    for (const ch of CROWN_HOLES) if (ch.kind === 'side') c.fillText(`+${T.crownReward}`, CROWN.x + (ch.x - CROWN.x) * 0.45, CROWN.y + 22);
    c.restore();
  }

  private drawCup(c: CanvasRenderingContext2D) {
    const s = this.art.cup;
    const w = CUP_HALF * 2 + 30;
    const h = w * (s.h / s.w);
    if (this.cupGlow > 0) {
      c.save();
      c.globalAlpha = this.cupGlow;
      c.drawImage(this.glowSprites[6], this.cupX - 90, CUP_Y - 60, 180, 120);
      c.restore();
    }
    c.drawImage(s.img, this.cupX - w / 2, CUP_Y - 14, w, h);
  }

  private drawUfo(c: CanvasRenderingContext2D) {
    const u = this.ufo;
    const s = this.art.ufo;
    if (!u.hit) {
      const g = c.createLinearGradient(0, u.y, 0, u.y + 200);
      g.addColorStop(0, `rgba(140,255,255,${0.25 + u.beam * 0.25})`);
      g.addColorStop(1, 'rgba(140,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(u.x - 14, u.y + 10);
      c.lineTo(u.x + 14, u.y + 10);
      c.lineTo(u.x + 50, u.y + 200);
      c.lineTo(u.x - 50, u.y + 200);
      c.fill();
    }
    const w = 104;
    const h = w * (s.h / s.w);
    c.save();
    c.translate(u.x, u.y);
    c.rotate(u.hit ? u.spin : Math.sin(u.t * 2) * 0.08);
    if (u.hit) c.globalAlpha = Math.max(0, 1 - u.hitT / 1.5);
    c.drawImage(s.img, -w / 2, -h / 2, w, h);
    c.restore();
  }

  private drawHitAreas(c: CanvasRenderingContext2D) {
    c.save();
    c.lineWidth = 1.5;
    const circ = (x: number, y: number, r: number, col: string) => {
      c.strokeStyle = col;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.stroke();
    };
    c.strokeStyle = '#0f0';
    c.beginPath();
    c.arc(CX, CY, R, Math.PI, Math.PI * 2);
    c.stroke();
    for (const s of SEGS) {
      c.beginPath();
      c.moveTo(s.ax, s.ay);
      c.lineTo(s.bx, s.by);
      c.stroke();
    }
    for (const p of PINS) circ(p.x, p.y, PIN_R, 'rgba(255,255,0,0.7)');
    circ(this.al.x, this.al.y, this.al.r, '#0f0');
    circ(BLACK_HOLE.x, BLACK_HOLE.y, T.blackHoleRadius, '#f0f');
    circ(HIDDEN.x, HIDDEN.y, HIDDEN.r, '#f00');
    for (const sh of SHIPS) {
      for (const b of sh.bodies) circ(b.x, b.y, b.r, '#0f0');
      circ(sh.hx, sh.hy, ((sh.mult === 2 ? T.hole2Size : T.hole3Size) * BALL_R * 2) / 2, '#0ff');
    }
    for (const o of ORBS) circ(o.x, o.y, o.r, '#f0f');
    c.strokeStyle = '#0ff';
    c.strokeRect(this.cupX - CUP_HALF, CUP_Y - 4, CUP_HALF * 2, 4);
    circ(this.cupX - CUP_HALF - 4, CUP_Y - 6, 6, '#0ff');
    circ(this.cupX + CUP_HALF + 4, CUP_Y - 6, 6, '#0ff');
    if (this.ufo.active) c.strokeRect(this.ufo.x - 46, this.ufo.y - 22, 92, 44);
    c.strokeStyle = '#f44';
    c.beginPath();
    c.moveTo(0, DRAIN_Y);
    c.lineTo(W, DRAIN_Y);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = '12px monospace';
    c.fillText('launch', LAUNCH.x + 30, LAUNCH.y);
    c.restore();
  }

  private drawWheel(c: CanvasRenderingContext2D) {
    const w = this.wheel!;
    const v = this.view;
    const cx = v.w / 2, cy = v.h / 2;
    const rad = Math.min(v.w, v.h) * 0.3 * (0.4 + 0.6 * easeOutBack(w.appear));
    c.save();
    c.fillStyle = `rgba(5,0,20,${0.65 * w.appear})`;
    c.fillRect(0, 0, v.w, v.h);
    c.globalAlpha = w.appear;
    // glow
    c.shadowColor = w.sup ? '#ffd23c' : '#b36bff';
    c.shadowBlur = 60;
    c.fillStyle = '#1a0f3a';
    c.beginPath();
    c.arc(cx, cy, rad + 18, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    const n = w.slices.length;
    const slice = (Math.PI * 2) / n;
    const flashing = w.phase === 'result' && Math.floor(w.resultT * 8) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const a0 = w.angle + i * slice;
      c.fillStyle = w.slices[i].color;
      if (w.phase === 'result' && i !== w.result) c.globalAlpha = w.appear * 0.4;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, rad, a0, a0 + slice);
      c.closePath();
      c.fill();
      if (flashing && i === w.result) {
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 3;
      c.stroke();
      c.globalAlpha = w.appear;
      c.save();
      c.translate(cx, cy);
      const mid = a0 + slice / 2;
      const midN = ((mid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const flip = midN > Math.PI / 2 && midN < (Math.PI * 3) / 2;
      c.rotate(mid);
      if (flip) c.rotate(Math.PI);
      c.textAlign = flip ? 'left' : 'right';
      c.textBaseline = 'middle';
      c.fillStyle = '#fff';
      const label = w.slices[i].label;
      c.font = `900 ${Math.round(rad * (label.length > 4 ? 0.1 : 0.16))}px Orbitron, sans-serif`;
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowBlur = 6;
      c.fillText(label, flip ? -(rad - 16) : rad - 16, 0);
      c.restore();
    }
    // rim lights
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const on = (i + Math.floor(this.realTime * 12)) % 3 === 0;
      c.fillStyle = on ? (w.sup ? `hsl(${(i * 20 + this.realTime * 400) % 360},100%,70%)` : '#ffe9a0') : '#6b4fa8';
      c.beginPath();
      c.arc(cx + Math.cos(a) * (rad + 10), cy + Math.sin(a) * (rad + 10), 4, 0, Math.PI * 2);
      c.fill();
    }
    // hub
    const hub = c.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, rad * 0.18);
    hub.addColorStop(0, '#fff');
    hub.addColorStop(1, '#6c6f90');
    c.fillStyle = hub;
    c.beginPath();
    c.arc(cx, cy, rad * 0.16, 0, Math.PI * 2);
    c.fill();
    // pointer
    c.fillStyle = '#ffd23c';
    c.shadowColor = '#ffd23c';
    c.shadowBlur = 16;
    c.beginPath();
    c.moveTo(cx, cy - rad + 22);
    c.lineTo(cx - 18, cy - rad - 26);
    c.lineTo(cx + 18, cy - rad - 26);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.textAlign = 'center';
    c.fillStyle = '#e9dcff';
    c.font = `900 ${Math.round(rad * 0.12)}px Orbitron, sans-serif`;
    c.fillStyle = w.sup || w.kind === 'welcome' ? '#ffd23c' : w.kind === 'last' ? '#5cf2ff' : '#e9dcff';
    c.fillText(w.sup ? '★ SUPER WHEEL ×2 ★' : w.kind === 'last' ? 'LAST CHANCE WHEEL' : w.kind === 'welcome' ? '★ WELCOME WHEEL ★' : 'WHEEL OF FORTUNE', cx, cy - rad - 50);
    if (w.phase === 'ready') {
      const fs = Math.round(Math.max(14, rad * 0.075));
      const py = Math.min(cy + rad + 40, v.h - fs * 3.2);
      c.globalAlpha = w.appear;
      c.fillStyle = 'rgba(8,4,26,0.92)';
      const welcome = w.kind === 'welcome';
      c.strokeStyle = welcome ? '#ffd23c' : '#5cf2ff';
      c.lineWidth = 2;
      c.beginPath(); c.roundRect(cx - fs * 17, py - fs * 1.1, fs * 34, fs * 3, fs * 0.8); c.fill(); c.stroke();
      c.font = `700 ${fs}px Orbitron, sans-serif`;
      c.fillStyle = '#ffffff';
      c.fillText(welcome ? 'WELCOME! YOUR FIRST SPIN IS ON THE HOUSE' : 'OUT OF BALLS — ONE FREE SPIN!', cx, py);
      c.globalAlpha = w.appear * (0.6 + 0.4 * Math.sin(this.realTime * 6));
      c.font = `900 ${Math.round(fs * 1.15)}px Orbitron, sans-serif`;
      c.fillStyle = '#5cf2ff';
      c.fillText('PRESS  SPACE  TO SPIN', cx, py + fs * 1.3);
      c.globalAlpha = w.appear;
    }
    if (w.phase === 'result') {
      const p = w.slices[w.result];
      c.font = `900 ${Math.round(rad * (p.result.length > 10 ? 0.14 : 0.22))}px Orbitron, sans-serif`;
      c.fillStyle = p.color;
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      const txt = p.result;
      c.strokeText(txt, cx, cy + rad + 70);
      c.fillText(txt, cx, cy + rad + 70);
    }
    c.restore();
  }

  private drawAstronaut(c: CanvasRenderingContext2D) {
    const s = this.art.astronaut;
    const t = 4.5 - this.astroT;
    const v = this.view;
    const a = Math.min(1, t * 3, this.astroT * 2);
    const p = this.toScreen(CX, 330);
    const size = 260 * v.s;
    c.save();
    c.globalAlpha = a;
    c.translate(p.x, p.y + Math.abs(Math.sin(t * 7)) * -30 * v.s);
    c.rotate(Math.sin(t * 7) * 0.25);
    c.scale(Math.sin(t * 3.5) > 0 ? 1 : -1, 1);
    c.drawImage(s.img, -size / 2, (-size * (s.h / s.w)) / 2, size, size * (s.h / s.w));
    c.restore();
    c.save();
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.font = `900 ${Math.round(34 * v.s)}px Orbitron, sans-serif`;
    c.fillStyle = '#ffd23c';
    c.shadowColor = '#ffd23c';
    c.shadowBlur = 20;
    c.fillText('SECRET FOUND!', p.x, p.y + 190 * v.s);
    if (this.pendingHoops) {
      c.font = `900 ${Math.round(20 * v.s)}px Orbitron, sans-serif`;
      c.fillStyle = '#ff9a3c';
      c.shadowColor = '#ff6a2c';
      c.fillText('BONUS: SPACE HOOPS COMING UP!', p.x, p.y + 225 * v.s);
    }
    c.restore();
  }

  snapshot() {
    return {
      balls: this.save.balls,
      inPlay: this.balls.length,
      ballPos: this.balls.slice(0, 5).map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy)]),
      alienHits: this.alienHits,
      bhCharge: this.bhCharge,
      fever: +this.feverT.toFixed(1),
      rain: +this.rainT.toFixed(1),
      wheel: this.wheel ? this.wheel.phase : null,
      ufo: this.ufo.active,
      outOfBalls: this.outOfBalls,
      stats: { ...this.stats },
    };
  }
}

/** Push ball out of a solid circle and reflect; returns impact speed (0 if none). */
function bounceCircle(b: Ball, c: Circle, k: number) {
  const dx = b.x - c.x, dy = b.y - c.y;
  const rr = c.r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  b.x = c.x + nx * rr;
  b.y = c.y + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  b.vx -= k * vn * nx;
  b.vy -= k * vn * ny;
  return -vn;
}

function collideSeg(b: Ball, s: { ax: number; ay: number; bx: number; by: number }, e: number): boolean {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const l2 = ex * ex + ey * ey;
  let t = ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = s.ax + ex * t, py = s.ay + ey * t;
  const dx = b.x - px, dy = b.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 < BALL_R * BALL_R && d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    b.x = px + nx * BALL_R;
    b.y = py + ny * BALL_R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      return -vn > 60;
    }
  }
  return false;
}

/** Board outline, optionally grown outward by `grow`. */
export function boardPath(c: CanvasRenderingContext2D, grow = 0) {
  c.beginPath();
  c.moveTo(LEFT_X - grow, SIDE_BOTTOM);
  c.lineTo(LEFT_X - grow, CY);
  c.arc(CX, CY, R + grow, Math.PI, Math.PI * 2);
  c.lineTo(RIGHT_X + grow, SIDE_BOTTOM);
  c.lineTo(W - 110 + grow * 0.5, 975 + grow);
  c.lineTo(W - 110 + grow * 0.5, 1000 + grow);
  c.lineTo(110 - grow * 0.5, 1000 + grow);
  c.lineTo(110 - grow * 0.5, 975 + grow);
  c.closePath();
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Light bulb positions along the chrome rim (board units). */
/** Hex-packed ball positions in the tray, filling from the outlet (left) upward. */
function traySlot(i: number) {
  let row = 0;
  for (;;) {
    const n = row % 2 ? TRAY_PER_ROW - 1 : TRAY_PER_ROW;
    if (i < n) break;
    i -= n;
    row++;
  }
  return { x: TRAY.x0 + TRAY_BR + i * TRAY_D + (row % 2 ? TRAY_BR : 0), y: TRAY.floor - TRAY_BR - row * TRAY_D * 0.866 };
}

function makeBulbs() {
  const pts: { x: number; y: number }[] = [];
  const g = 8;
  for (let y = SIDE_BOTTOM; y > CY; y -= 26) pts.push({ x: LEFT_X - g, y });
  const steps = Math.round((Math.PI * (R + g)) / 26);
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    pts.push({ x: CX + Math.cos(a) * (R + g), y: CY + Math.sin(a) * (R + g) });
  }
  for (let y = CY + 26; y <= SIDE_BOTTOM; y += 26) pts.push({ x: RIGHT_X + g, y });
  return pts;
}

function wheelLabel(id: string, sup: boolean) {
  if (!sup) return WHEEL_PRIZES.find((p) => p.id === id)!.label;
  return ({ b5: '+10', b10: '+20', b25: '+50', rain: 'RAIN ×2', fever: `FEVER ${Math.round(T.feverLength * 2)}s`, jackpot: 'JACKPOT' } as Record<string, string>)[id];
}

function easeOutBack(x: number) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function makePinSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(12, 11, 1, 16, 16, 15);
  gr.addColorStop(0, '#fff8d8');
  gr.addColorStop(0.35, '#f1c766');
  gr.addColorStop(0.8, '#a06a22');
  gr.addColorStop(1, '#4a2c0a');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  return c;
}

function makeGlow(color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color);
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.globalAlpha = 0.9;
  g.fillRect(0, 0, 64, 64);
  // star glint
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 6); g.lineTo(35, 29); g.lineTo(58, 32); g.lineTo(35, 35);
  g.lineTo(32, 58); g.lineTo(29, 35); g.lineTo(6, 32); g.lineTo(29, 29);
  g.closePath();
  g.globalAlpha = 0.6;
  g.fill();
  return c;
}

function makeBallSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(17, 15, 2, 24, 24, 23);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, '#e3e8f5');
  gr.addColorStop(0.6, '#8a93ad');
  gr.addColorStop(0.85, '#4b526a');
  gr.addColorStop(1, '#c9d3ef');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(24, 24, 22, 0, Math.PI * 2);
  g.fill();
  return c;
}
