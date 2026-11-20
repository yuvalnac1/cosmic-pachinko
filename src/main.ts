import './style.css';
import { loadArt } from './assets';
import { Game } from './game';
import { setupDev } from './dev';
import { sfx } from './audio';
import { T, syncTuningFile, DEV_MENU } from './tuning';
import { msToMidnight } from './save';
import { W, H, CX } from './board';

const $ = (id: string) => document.getElementById(id)!;
// write-through caches: avoid DOM writes (style recalcs) when nothing changed
const lastText = new Map<Element, string>();
const lastHidden = new Map<Element, boolean>();
const setText = (el: Element, t: string, html = false) => {
  if (lastText.get(el) === t) return;
  lastText.set(el, t);
  if (html) el.innerHTML = t;
  else el.textContent = t;
};
const setHidden = (el: Element, h: boolean) => {
  if (lastHidden.get(el) === h) return;
  lastHidden.set(el, h);
  el.classList.toggle('hidden', h);
};

/** The logo art is on black: turn brightness into alpha so it floats over the backdrop. */
function keyOutBlack(img: HTMLImageElement) {
  const run = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      const a = Math.min(255, Math.max(0, (m - 8) * 1.6));
      if (m > 0) {
        const k = 255 / m;
        d[i] = Math.min(255, d[i] * k);
        d[i + 1] = Math.min(255, d[i + 1] * k);
        d[i + 2] = Math.min(255, d[i + 2] * k);
      }
      d[i + 3] = a;
    }
    g.putImageData(id, 0, 0);
    img.src = c.toDataURL('image/png');
  };
  if (img.complete && img.naturalWidth) run();
  else img.addEventListener('load', run, { once: true });
}

async function boot() {
  keyOutBlack(document.getElementById('logo') as HTMLImageElement);
  await syncTuningFile();
  const canvas = $('game') as HTMLCanvasElement;
  const art = await loadArt();
  const game = new Game(canvas, art);
  $('loading').remove();
  const dev = DEV_MENU ? setupDev(game) : { toggle() {} };
  if (!DEV_MENU) $('devBtn').remove();

  // ---------- layout ----------
  const left = $('left'), right = $('right');
  let panelW = 250;
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const wide = w >= 1000;
    document.body.classList.toggle('compact', !wide);
    document.body.classList.toggle('wide', wide);
    if (wide) {
      panelW = Math.min(290, Math.max(220, w * 0.18));
      document.documentElement.style.setProperty('--panel-w', panelW + 'px');
      const side = panelW + 40;
      const logoH = Math.round(Math.max(76, Math.min(150, h * 0.13)));
      document.documentElement.style.setProperty('--logo-h', logoH + 'px');
      game.resize(w, h, side, side, logoH + 6);
      const v = game.view;
      const boardL = v.bx - 46 * v.s, boardR = v.bx + (W + 46) * v.s;
      const top = v.by + 40 * v.s;
      Object.assign(left.style, { left: Math.max(16, boardL - panelW - 28) + 'px', top: top + 'px', right: '' });
      Object.assign(right.style, { left: Math.min(w - panelW - 16, boardR + 28) + 'px', top: top + 'px', right: '' });
    } else {
      document.documentElement.style.setProperty('--panel-w', 'auto');
      const logoH = Math.round(Math.max(44, Math.min(80, h * 0.09)));
      document.documentElement.style.setProperty('--logo-h', logoH + 'px');
      game.resize(w, h, 0, 0, Math.max(74, logoH + 6));
      Object.assign(left.style, { left: '10px', top: '8px', right: '' });
      Object.assign(right.style, { left: '', right: '10px', top: '8px', width: '200px' });
    }
    const v = game.view;
    const out = $('out');
    Object.assign(out.style, { left: v.bx + 'px', top: v.by + 'px', width: W * v.s + 'px', height: H * v.s + 'px' });
    const ft = game.toScreen(CX, 140);
    Object.assign($('fever').style, { left: ft.x + 'px', top: ft.y + 'px' });
    const rt = game.toScreen(CX, 40);
    Object.assign($('rainBanner').style, { left: rt.x + 'px', top: rt.y + 'px' });
    const lb = game.toScreen(CX, 470);
    Object.assign($('lastBalls').style, { left: lb.x + 'px', top: lb.y + 'px' });
    const ht = game.toScreen(-56, 940);
    Object.assign($('hint').style, { left: ht.x + 'px', top: ht.y + 'px' });
  }
  window.addEventListener('resize', layout);
  layout();

  // ---------- input ----------
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) game.pressStart();
    } else if (e.key === '`' || e.code === 'Backquote') {
      e.preventDefault();
      dev.toggle();
    } else if (e.code === 'KeyM') {
      sfx.setMuted(!sfx.muted);
      syncMute();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      game.pressEnd();
    }
  });
  window.addEventListener('blur', () => game.cancelCharge());
  // pointer fallback (PRD is keyboard-only; this just keeps it usable in preview frames)
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); game.pressStart(); });
  window.addEventListener('pointerup', () => game.pressEnd());
  window.addEventListener('pointercancel', () => game.cancelCharge());

  if (DEV_MENU) $('devBtn').addEventListener('click', (e) => { dev.toggle(); (e.currentTarget as HTMLElement).blur(); });
  const muteBtn = $('muteBtn');
  const syncMute = () => (muteBtn.textContent = `♪ Sound: ${sfx.muted ? 'off' : 'on'} (M)`);
  muteBtn.addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); syncMute(); });
  syncMute();

  // ---------- HUD ----------
  const ballsEl = $('balls'), deltaEl = $('ballDelta');
  const log = $('log');
  game.onEvent = (e) => {
    const li = document.createElement('li');
    li.textContent = e.text;
    if (e.color) li.style.color = e.color;
    log.prepend(li);
    while (log.children.length > 7) log.lastChild!.remove();
  };
  const pips = $('alienPips');
  let pipN = -1;
  let pipOn = -1;
  const bodyCls: Record<string, boolean> = {};
  let lastShown = -1, lastBalls = game.save.balls, deltaT = 0, deltaSum = 0;
  let shotOnce = false;

  function hud(dt: number) {
    if (game.shownBalls !== lastShown) {
      lastShown = game.shownBalls;
      ballsEl.textContent = String(game.shownBalls);
    }
    if (game.save.balls !== lastBalls) {
      const d = game.save.balls - lastBalls;
      lastBalls = game.save.balls;
      if (d > 0) {
        deltaSum += d;
        deltaT = 1.5;
        deltaEl.textContent = `+${deltaSum}`;
        ballsEl.classList.remove('bump');
        void ballsEl.offsetWidth;
        ballsEl.classList.add('bump');
      } else shotOnce = true;
    }
    if (deltaT > 0) {
      deltaT -= dt;
      if (deltaT <= 0) { deltaEl.textContent = ''; deltaSum = 0; }
    }
    setText($('bestLine'), `Daily refill: ${T.dailyBalls} · Best: ${game.save.best}`);
    const digital = game.alienNeed > 50;
    setHidden(pips, digital);
    setHidden($('alienBig'), !digital);
    if (digital) setText($('alienBig'), `${game.alienHits}<small> / ${game.alienNeed}</small>`, true);
    setHidden($('bhBox'), !game.save.bhKnown);
    if (game.save.bhKnown) setText($('bhBig'), `${game.bhCharge}<small> / ${game.bhNeed}</small>`, true);
    if (pipN !== game.alienNeed) {
      pipN = game.alienNeed;
      pips.innerHTML = '';
      pipOn = -1;
      for (let i = 0; i < pipN; i++) pips.appendChild(Object.assign(document.createElement('div'), { className: 'pip' }));
    }
    if (pipOn !== game.alienHits) {
      pipOn = game.alienHits;
      Array.from(pips.children).forEach((p, i) => p.classList.toggle('on', i < game.alienHits));
    }
    setText($('alienLine'), game.rainT > 0 ? `★ GOLDEN ALIEN — every hit pays! ${game.goldCombo ? `(${game.goldCombo} hits, +${game.goldWon})` : ''}` : digital ? 'hits → Ball Rain' : `${game.alienHits} / ${pipN} hits → Ball Rain`);

    setHidden($('fever'), game.feverT <= 0);
    if (game.feverT > 0) setText($('feverNum'), String(Math.ceil(game.feverT)));
    setHidden($('rainBanner'), game.rainT <= 0);
    if (game.rainT > 0) setText($('rainNum'), String(Math.ceil(game.rainT)));
    const mode = $('modeBox');
    const modes: string[] = [];
    if (game.feverT > 0) modes.push(`FEVER ×${T.feverMultiplier} · ${Math.ceil(game.feverT)}s`);
    if (game.rainT > 0) modes.push(`BALL RAIN · ${Math.ceil(game.rainT)}s`);
    setHidden(mode, modes.length === 0);
    setText(mode, modes.join(' · '));
    setHidden($('hint'), shotOnce || game.save.balls <= 0 || !!game.wheel || !!game.hoops);

    if (bodyCls['minigame'] !== (!!game.hoops)) document.body.classList.toggle('minigame', (bodyCls['minigame'] = !!game.hoops));
    if (bodyCls['fever'] !== (game.feverT > 0)) document.body.classList.toggle('fever', (bodyCls['fever'] = game.feverT > 0));
    if (bodyCls['rain'] !== (game.rainT > 0)) document.body.classList.toggle('rain', (bodyCls['rain'] = game.rainT > 0));
    setHidden($('lastBalls'), !(game.save.balls <= 0 && !game.outOfBalls && !game.wheel && !game.hoops && !game.bhSeq));
    setHidden($('out'), !game.outOfBalls);
    if (game.outOfBalls) {
      const ms = msToMidnight();
      const s = Math.floor(ms / 1000);
      setText($('countdown'), [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'));
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  const perf = { frames: 0, acc: 0, worst: 0, fps: 0, avgMs: 0, renderMs: 0 };
  function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    perf.frames++;
    perf.acc += dt;
    perf.worst = Math.max(perf.worst, dt);
    if (perf.acc >= 1) {
      perf.fps = Math.round(perf.frames / perf.acc);
      perf.avgMs = +((perf.acc / perf.frames) * 1000).toFixed(1);
      game.onPerf(perf.fps, perf.avgMs, perf.worst * 1000);
      perf.frames = 0; perf.acc = 0; perf.worst = 0;
    }
    game.update(dt);
    game.render();
    hud(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test-only bridge
  (globalThis as any).__OHMYGAME_PLAYTEST__ = {
    snapshot: () => ({ ...game.snapshot(), perf: { fps: perf.fps, avgMs: perf.avgMs, q: game.quality } }),
    step: (ms: number) => {
      const n = Math.ceil(ms / 16);
      for (let i = 0; i < n; i++) game.update(Math.min(0.016, ms / 1000));
      game.render();
    },
  };
  (window as any).game = game;
}

boot();
