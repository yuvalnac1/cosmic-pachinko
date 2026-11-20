// BLACK HOLE HOOPS ("Space Hoops") — a one-button skill shot offered by the Last Chance Wheel.
// The aim arrow sweeps left↔right. HOLD Space to lock the aim and charge the power (it ping-pongs),
// RELEASE to shoot. A clean swish pays the big prize; grazing the rim pays a small consolation.

import { T } from './tuning';
import { sfx } from './audio';
import type { Art } from './assets';

export type HoopsResult = 'swish' | 'rim' | 'miss';
type Phase = 'intro' | 'aim' | 'power' | 'flight' | 'result';

export class Hoops {
  phase: Phase = 'intro';
  t = 0;
  aim = 0; // -1..1
  aimT = Math.random() * 4;
  hoopAim = (Math.random() - 0.5) * 0.9; // where the basket is, in aim units
  power = 0;
  powerT = 0;
  lockedAim = 0;
  lockedPower = 0;
  flightT = 0;
  result: HoopsResult = 'miss';
  resultT = 0;
  done = false;
  private lastTick = 0;

  constructor(private onFinish: (r: HoopsResult) => void) {
    sfx.lastChance();
  }

  press() {
    if (this.phase === 'intro' && this.t > 0.6) { this.phase = 'aim'; return; }
    if (this.phase !== 'aim') return;
    this.lockedAim = this.aim;
    this.phase = 'power';
    this.powerT = 0;
    sfx.chargeStart();
  }

  release() {
    if (this.phase !== 'power') return;
    sfx.chargeStop();
    this.lockedPower = this.power;
    const ea = Math.abs(this.lockedAim - this.hoopAim);
    const ep = Math.abs(this.lockedPower - T.hoopsPowerTarget);
    if (ea <= T.hoopsSwishAim && ep <= T.hoopsSwishPower) this.result = 'swish';
    else if (ea <= T.hoopsRimAim && ep <= T.hoopsRimPower) this.result = 'rim';
    else this.result = 'miss';
    this.phase = 'flight';
    this.flightT = 0;
    sfx.shoot(this.lockedPower);
  }

  update(dt: number) {
    this.t += dt;
    if (this.phase === 'intro' && this.t > 2.2) this.phase = 'aim';
    if (this.phase === 'aim') {
      // triangle wave: constant sweep speed so timing is learnable
      this.aimT += dt * T.hoopsAimSpeed;
      const ph = this.aimT % 4;
      this.aim = ph < 2 ? ph - 1 : 3 - ph;
      if (Math.sign(this.aim) !== Math.sign(this.lastTick)) sfx.wheelTick();
      this.lastTick = this.aim;
    }
    if (this.phase === 'power') {
      this.powerT += dt / T.hoopsPowerTime;
      const ph = this.powerT % 2;
      this.power = ph < 1 ? ph : 2 - ph; // ping-pong: holding too long drops the power again
      sfx.chargeUpdate(this.power);
    }
    if (this.phase === 'flight') {
      this.flightT += dt;
      if (this.flightT >= 1.15) {
        this.phase = 'result';
        this.resultT = 0;
        if (this.result === 'swish') sfx.fanfare();
        else if (this.result === 'rim') sfx.kicker();
        else sfx.outOfBalls();
      }
    }
    if (this.phase === 'result') {
      this.resultT += dt;
      if (this.resultT > 2.4 && !this.done) {
        this.done = true;
        this.onFinish(this.result);
      }
    }
  }

  render(c: CanvasRenderingContext2D, w: number, h: number, time: number, art: Art, ballImg: CanvasImageSource) {
    const s = Math.min(w, h) / 900;
    const cx = w / 2;
    const horizon = h * 0.36;
    const appear = Math.min(1, this.t * 3);
    const swish = this.phase === 'result' && this.result === 'swish';
    c.save();
    c.globalAlpha = appear;

    // --- cosmic backdrop: the game's nebula art, dimmed, with a purple warp grid floor ---
    const bd = art.backdrop;
    const bsc = Math.max(w / bd.width, h / bd.height);
    c.drawImage(bd, (w - bd.width * bsc) / 2, (h - bd.height * bsc) / 2, bd.width * bsc, bd.height * bsc);
    c.fillStyle = 'rgba(6,2,24,0.62)';
    c.fillRect(0, 0, w, h);
    const floorTop = horizon + 70 * s;
    const fg = c.createLinearGradient(0, floorTop, 0, h);
    fg.addColorStop(0, 'rgba(60,20,120,0)');
    fg.addColorStop(1, 'rgba(90,30,170,0.45)');
    c.fillStyle = fg;
    c.fillRect(0, floorTop, w, h - floorTop);
    c.lineWidth = 1.5;
    for (let i = -9; i <= 9; i++) {
      c.strokeStyle = i % 3 === 0 ? 'rgba(92,242,255,0.35)' : 'rgba(180,110,255,0.25)';
      c.beginPath();
      c.moveTo(cx + i * 20 * s, floorTop);
      c.lineTo(cx + i * 150 * s, h);
      c.stroke();
    }
    const scroll = (time * 0.25) % 1;
    for (let k = 0; k < 10; k++) {
      const f = Math.pow((k + scroll) / 10, 1.8);
      const y = floorTop + (h - floorTop) * f;
      c.strokeStyle = `rgba(180,110,255,${0.15 + f * 0.25})`;
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }

    // --- the goal: alien backboard + black-hole hoop, floating on a UFO tractor beam ---
    const hx = cx + this.hoopAim * w * 0.32;
    const hy = horizon;
    const bob = Math.sin(time * 1.6) * 4 * s;
    const bw = 190 * s, bh = 130 * s;
    const boardTop = hy - bh - 6 * s + bob;
    // beam underneath
    const beam = c.createLinearGradient(0, hy + bob, 0, hy + 150 * s);
    beam.addColorStop(0, 'rgba(140,255,255,0.35)');
    beam.addColorStop(1, 'rgba(140,255,255,0)');
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(hx - 18 * s, hy + 10 * s + bob);
    c.lineTo(hx + 18 * s, hy + 10 * s + bob);
    c.lineTo(hx + 60 * s, hy + 150 * s);
    c.lineTo(hx - 60 * s, hy + 150 * s);
    c.fill();
    // backboard: dark glass panel with chrome frame and neon rim
    c.save();
    const glass = c.createLinearGradient(0, boardTop, 0, boardTop + bh);
    glass.addColorStop(0, 'rgba(70,30,140,0.9)');
    glass.addColorStop(1, 'rgba(18,8,52,0.92)');
    c.fillStyle = glass;
    c.shadowColor = swish ? '#ffd23c' : '#b07bff';
    c.shadowBlur = 24;
    c.beginPath(); c.roundRect(hx - bw / 2, boardTop, bw, bh, 14 * s); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = '#d9def0';
    c.lineWidth = 4 * s;
    c.stroke();
    c.strokeStyle = swish ? `hsl(${(time * 400) % 360},100%,65%)` : '#ff4fd8';
    c.lineWidth = 2;
    c.beginPath(); c.roundRect(hx - bw / 2 + 6 * s, boardTop + 6 * s, bw - 12 * s, bh - 12 * s, 10 * s); c.stroke();
    // alien in the backboard (golden & dancing on a swish, nervous wobble while you aim)
    const al = swish ? art.alienGold : art.alien;
    const asz = bh * (swish ? 1.05 : 0.95);
    const wob = swish ? Math.sin(time * 14) * 0.18 : Math.sin(time * 3) * 0.05;
    c.save();
    c.beginPath(); c.roundRect(hx - bw / 2 + 6 * s, boardTop + 6 * s, bw - 12 * s, bh - 12 * s, 10 * s); c.clip();
    c.translate(hx, boardTop + bh * 0.52 + (swish ? -Math.abs(Math.sin(time * 10)) * 6 * s : 0));
    c.rotate(wob);
    c.drawImage(al.img, -asz / 2, -asz * (al.h / al.w) / 2, asz, asz * (al.h / al.w));
    c.restore();
    c.restore();

    // hoop = black hole vortex in a chrome ring
    const rimW = 48 * s, rimH = rimW * 0.34;
    const rimY = hy + 2 * s + bob;
    const bhs = art.blackhole;
    const ring = (front: boolean) => {
      c.save();
      c.strokeStyle = '#e7ebf8';
      c.lineWidth = 5 * s;
      c.shadowColor = swish ? '#ffd23c' : '#ff4fd8';
      c.shadowBlur = 14;
      c.beginPath();
      c.ellipse(hx, rimY, rimW, rimH, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      c.stroke();
      c.strokeStyle = swish ? '#ffd23c' : '#ff4fd8';
      c.lineWidth = 2 * s;
      c.stroke();
      c.restore();
    };
    ring(false);
    c.save();
    c.translate(hx, rimY);
    c.scale(1, rimH / rimW);
    c.rotate(-time * (swish ? 9 : 2.2));
    const vr = rimW * (swish ? 1.15 + 0.1 * Math.sin(time * 20) : 1.02);
    c.drawImage(bhs.img, -vr, -vr, vr * 2, vr * 2);
    c.restore();
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(hx, rimY, rimW * 0.28, rimH * 0.28, 0, 0, Math.PI * 2); c.fill();

    // --- the metal pachinko ball ---
    const bx0 = cx, by0 = h * 0.82, br0 = 30 * s;
    let bx = bx0, by = by0, br = br0, inHole = false, alpha = 1;
    if (this.phase === 'flight' || this.phase === 'result') {
      const k = Math.min(1, this.flightT / 1.15);
      const tx = cx + this.lockedAim * w * 0.32;
      const pe = this.lockedPower - T.hoopsPowerTarget;
      const ty = rimY - pe * 260 * s;
      bx = bx0 + (tx - bx0) * k;
      by = by0 + (ty - by0) * k - Math.sin(Math.PI * k) * h * 0.38;
      br = br0 + (rimW * 0.42 - br0) * k;
      if (this.phase === 'result') {
        const r = this.resultT;
        if (this.result === 'swish') {
          // spiral into the black hole
          const q = Math.min(1, r / 0.9);
          const ang = r * 16;
          bx = hx + Math.cos(ang) * rimW * 0.7 * (1 - q);
          by = rimY + Math.sin(ang) * rimH * 0.7 * (1 - q);
          br = rimW * 0.42 * (1 - q * 0.9);
          alpha = 1 - q;
          inHole = true;
        } else if (this.result === 'rim') {
          bx = tx + Math.sign(tx - hx || 1) * r * 90 * s;
          by = ty - Math.sin(Math.min(1, r * 1.6) * Math.PI) * 40 * s + Math.max(0, r - 0.6) * 220 * s;
        } else {
          by = ty + r * r * 260 * s;
          alpha = Math.max(0, 1 - r * 0.5);
        }
      }
      // cyan comet trail while flying
      if (this.phase === 'flight') {
        for (let i = 1; i <= 6; i++) {
          const kk = Math.max(0, k - i * 0.03);
          const tx2 = bx0 + (tx - bx0) * kk;
          const ty2 = by0 + (ty - by0) * kk - Math.sin(Math.PI * kk) * h * 0.38;
          const r2 = (br0 + (rimW * 0.42 - br0) * kk) * (1 - i * 0.12);
          c.fillStyle = `rgba(92,242,255,${0.28 - i * 0.04})`;
          c.beginPath(); c.arc(tx2, ty2, r2, 0, Math.PI * 2); c.fill();
        }
      }
    }
    if (!inHole) ring(true);
    c.save();
    c.globalAlpha = appear * alpha;
    c.shadowColor = 'rgba(160,220,255,0.9)';
    c.shadowBlur = 18;
    c.drawImage(ballImg, bx - br, by - br, br * 2, br * 2);
    c.shadowBlur = 0;
    // specular glint
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.ellipse(bx - br * 0.35, by - br * 0.4, br * 0.22, br * 0.14, -0.6, 0, Math.PI * 2); c.fill();
    c.restore();
    if (inHole) ring(true);

    // --- aim line (dotted comet path) ---
    if (this.phase === 'aim' || this.phase === 'power' || this.phase === 'intro') {
      const a = this.phase === 'power' ? this.lockedAim : this.aim;
      const tx = cx + a * w * 0.32, ty = rimY;
      c.setLineDash([10 * s, 10 * s]);
      c.lineDashOffset = -time * 40;
      c.strokeStyle = this.phase === 'power' ? '#ffd23c' : 'rgba(92,242,255,0.9)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(bx0, by0 - br0);
      c.quadraticCurveTo((bx0 + tx) / 2, (by0 + ty) / 2 - h * 0.25, tx, ty);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = c.strokeStyle;
      c.beginPath(); c.arc(tx, ty, 6, 0, Math.PI * 2); c.fill();
    }

    // --- power meter (same style as the launcher meter) with target zones ---
    if (this.phase === 'power' || this.phase === 'aim') {
      const mx = cx + 90 * s, mh = 220 * s, mw = 22 * s, mt = by0 - mh + 20 * s;
      c.fillStyle = '#0a0720';
      c.beginPath(); c.roundRect(mx, mt, mw, mh, 10 * s); c.fill();
      const zone = (half: number, col: string) => {
        c.fillStyle = col;
        c.fillRect(mx, mt + mh * (1 - T.hoopsPowerTarget - half), mw, mh * half * 2);
      };
      zone(T.hoopsRimPower, 'rgba(92,242,255,0.25)');
      zone(T.hoopsSwishPower, 'rgba(255,210,60,0.8)');
      if (this.phase === 'power') {
        const g = c.createLinearGradient(0, mt + mh, 0, mt);
        g.addColorStop(0, '#2ee6ff');
        g.addColorStop(0.6, '#b07bff');
        g.addColorStop(1, '#ff4fd8');
        c.fillStyle = g;
        c.globalAlpha = appear * 0.55;
        c.fillRect(mx + 3, mt + mh * (1 - this.power), mw - 6, mh * this.power);
        c.globalAlpha = appear;
        c.fillStyle = '#ffffff';
        c.shadowColor = '#ff4fd8';
        c.shadowBlur = 10;
        c.fillRect(mx - 6 * s, mt + mh * (1 - this.power) - 2, mw + 12 * s, 4);
        c.shadowBlur = 0;
      }
      c.strokeStyle = 'rgba(200,190,255,0.7)';
      c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(mx, mt, mw, mh, 10 * s); c.stroke();
    }

    // --- texts in the game's palette ---
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${Math.round(46 * s)}px Orbitron, sans-serif`;
    const tg = c.createLinearGradient(cx - 200 * s, 0, cx + 200 * s, 0);
    tg.addColorStop(0, '#5cf2ff');
    tg.addColorStop(0.5, '#ff4fd8');
    tg.addColorStop(1, '#ffd23c');
    c.fillStyle = tg;
    c.shadowColor = '#ff4fd8';
    c.shadowBlur = 20;
    c.fillText('BLACK HOLE HOOPS', cx, h * 0.075);
    c.shadowBlur = 0;
    c.font = `700 ${Math.round(17 * s)}px Orbitron, sans-serif`;
    c.fillStyle = '#ffd23c';
    c.fillText(`Sink the ball into the black hole = +${T.hoopsPrize} BALLS`, cx, h * 0.075 + 40 * s);
    c.font = `700 ${Math.round(16 * s)}px Orbitron, sans-serif`;
    c.fillStyle = '#e9dcff';
    let hint = '';
    if (this.phase === 'intro') hint = 'One shot. Feed the black hole!';
    else if (this.phase === 'aim') hint = 'HOLD SPACE to lock the aim and charge…';
    else if (this.phase === 'power') hint = '…RELEASE in the gold zone!';
    if (hint) c.fillText(hint, cx, h * 0.95);
    if (this.phase === 'result') {
      const txt = this.result === 'swish' ? `SWALLOWED!  +${T.hoopsPrize}` : this.result === 'rim' ? `OFF THE RIM!  +${T.hoopsRimPrize}` : 'LOST IN SPACE…';
      const col = this.result === 'swish' ? '#ffd23c' : this.result === 'rim' ? '#5cf2ff' : '#ff7b9c';
      const pop = 1 + Math.max(0, 0.4 - this.resultT) * 1.5;
      c.font = `900 ${Math.round(60 * s * pop)}px Orbitron, sans-serif`;
      c.fillStyle = col;
      c.shadowColor = col;
      c.shadowBlur = 24;
      c.fillText(txt, cx, h * 0.6);
      c.shadowBlur = 0;
    }
    c.restore();
  }
}
