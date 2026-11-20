import { writeSave } from './save';
import { T, DEFAULTS, WHEEL_PRIZES, saveTuning, resetTuning } from './tuning';
import type { Game } from './game';

type Num = { key: keyof typeof DEFAULTS; label: string; min: number; max: number; step: number };

const SLIDERS: Num[] = [
  { key: 'dailyBalls', label: 'Daily balls', min: 10, max: 500, step: 10 },
  { key: 'maxChargeTime', label: 'Max charge time (s)', min: 0.15, max: 2, step: 0.05 },
  { key: 'chargeCurve', label: 'Charge curve (1=linear)', min: 1, max: 4, step: 0.1 },
  { key: 'minStrength', label: 'Min strength', min: 0.1, max: 0.9, step: 0.01 },
  { key: 'maxStrength', label: 'Max strength', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'fullShotSpeed', label: 'Full shot speed', min: 800, max: 2200, step: 10 },
  { key: 'gravity', label: 'Gravity', min: 0.3, max: 2, step: 0.05 },
  { key: 'pinBounce', label: 'Pin bounciness', min: 0.1, max: 1, step: 0.02 },
  { key: 'wallBounce', label: 'Wall bounciness', min: 0, max: 1, step: 0.02 },
  { key: 'kickerPower', label: 'Right slingshot power', min: 0, max: 900, step: 10 },
  { key: 'hole2Size', label: '×2 UFO hatch size (×ball)', min: 0.5, max: 3, step: 0.05 },
  { key: 'hole3Size', label: '×3 rocket/dish hatch (×ball)', min: 0.5, max: 3, step: 0.05 },
  { key: 'crownHoleSize', label: 'Crown hole size (×ball r)', min: 0.6, max: 2.5, step: 0.05 },
  { key: 'crownReward', label: 'Crown side-hole reward', min: 0, max: 30, step: 1 },
  { key: 'cupSpeed', label: 'Lucky cup speed', min: 0, max: 300, step: 5 },
  { key: 'alienHitsForRain', label: 'Alien hits → Rain', min: 1, max: 60, step: 1 },
  { key: 'rainLength', label: 'Ball Rain length (s)', min: 2, max: 30, step: 1 },
  { key: 'rainBalls', label: 'Ball Rain balls', min: 5, max: 150, step: 5 },
  { key: 'alienScaleFever', label: 'Alien size in Fever', min: 1, max: 1.6, step: 0.01 },
  { key: 'alienScaleRain', label: 'Alien size in Ball Rain', min: 1, max: 1.6, step: 0.01 },
  { key: 'goldAlienReward', label: 'Golden alien: balls/hit', min: 0, max: 10, step: 1 },
  { key: 'goldComboStep', label: 'Golden combo step (hits)', min: 1, max: 10, step: 1 },
  { key: 'goldComboMax', label: 'Golden combo max bonus', min: 0, max: 10, step: 1 },
  { key: 'feverLength', label: 'Fever length (s)', min: 5, max: 60, step: 1 },
  { key: 'feverMultiplier', label: 'Fever multiplier', min: 1, max: 5, step: 1 },
  { key: 'ufoInterval', label: 'UFO interval (s)', min: 10, max: 300, step: 5 },
  { key: 'ufoReward', label: 'UFO reward', min: 1, max: 100, step: 1 },
  { key: 'hiddenReward', label: 'Hidden hole reward', min: 1, max: 200, step: 1 },
  { key: 'hiddenMaxSpeed', label: 'Hidden hole max speed', min: 550, max: 900, step: 1 },
  { key: 'blackHoleBallsForWheel', label: 'Black hole balls → wheel', min: 1, max: 20, step: 1 },
  { key: 'warpCharge', label: 'WARP counts as N balls', min: 1, max: 20, step: 1 },
  { key: 'alienRainStep', label: 'Alien target +N per Rain', min: 0, max: 40, step: 1 },
  { key: 'bhWheelStep', label: 'Black hole target +N per wheel', min: 0, max: 20, step: 1 },
  { key: 'blackHoleRadius', label: 'Black hole radius', min: 4, max: 40, step: 1 },
];

export function setupDev(game: Game) {
  const el = document.getElementById('dev')!;
  const stats = document.createElement('pre');

  function build() {
    el.innerHTML = '';
    const h = (t: string) => {
      const e = document.createElement('h3');
      e.textContent = t;
      el.appendChild(e);
    };
    h('DEV MENU  ( ` to close )');
    const btns = document.createElement('div');
    btns.className = 'btns';
    const btn = (label: string, fn: () => void, on?: () => boolean) => {
      const b = document.createElement('button');
      b.textContent = label;
      const sync = () => on && b.classList.toggle('on', on());
      b.onclick = () => {
        fn();
        sync();
        b.blur();
      };
      sync();
      btns.appendChild(b);
    };
    btn('+100 balls', () => game.devAddBalls(100));
    btn('Reset the day', () => game.devResetDay());
    btn('Trigger Fever', () => game.startFever());
    btn('Trigger Ball Rain', () => game.startRain());
    btn('Spawn UFO', () => game.spawnUfo());
    btn('Spin the wheel', () => game.spinWheel());
    btn('Spin SUPER wheel', () => game.spinWheel(true));
    btn('Test WARP hole', () => game.startWarp());
    btn('Quality: cycle', () => { game.quality = (game.quality + 2) % 3; window.dispatchEvent(new Event('resize')); });
    btn('Show hit areas', () => (game.showHitAreas = !game.showHitAreas), () => game.showHitAreas);
    btn('Auto-play', () => (game.autoPlay = !game.autoPlay), () => game.autoPlay);
    btn('Alien +5 hits', () => { game.alienHits = Math.min(T.alienHitsForRain - 1, game.alienHits + 5); });
    btn('Last chance wheel', () => { game.save.balls = 0; game.save.lastChance = ''; game.outOfBalls = false; writeSave(game.save); });
    btn('Welcome wheel', () => game.openWelcome());
    btn('Space Hoops', () => game.startHoops());
    btn('Secret hole', () => game.secretFound());
    btn('Alien target 60 + hole known', () => { game.save.alienLevel = 3; game.save.bhKnown = true; writeSave(game.save); });
    btn('Reset hit targets', () => { game.save.alienLevel = 0; game.save.bhLevel = 0; game.save.bhKnown = false; writeSave(game.save); });
    btn('Set 0 balls', () => { game.save.balls = 0; writeSave(game.save); });
    el.appendChild(btns);

    h('REFILL (open question)');
    const sel = document.createElement('select');
    sel.innerHTML = `<option value="topUp">Top up to daily amount</option><option value="add">+daily on top</option>`;
    sel.value = T.refillMode;
    sel.onchange = () => {
      T.refillMode = sel.value as 'topUp' | 'add';
      saveTuning();
    };
    el.appendChild(sel);

    h('CONSTANTS');
    for (const s of SLIDERS) row(s.label, () => T[s.key] as number, (v) => ((T as any)[s.key] = v), s.min, s.max, s.step);
    h('WHEEL ODDS (weights)');
    for (const p of WHEEL_PRIZES) row(p.label, () => T.wheel[p.id], (v) => (T.wheel[p.id] = v), 0, 100, 1, true);

    h('WELCOME WHEEL ODDS (first visit)');
    row('Offer welcome wheel (1/0)', () => T.welcomeOn, (v) => (T.welcomeOn = v), 0, 1, 1);
    for (const p of WHEEL_PRIZES) row(p.label, () => T.welcomeWheel[p.id], (v) => (T.welcomeWheel[p.id] = v), 0, 100, 1, 'welcome');
    h('LAST CHANCE ODDS (weights)');
    row('Offer last chance (1/0)', () => T.lastChanceOn, (v) => (T.lastChanceOn = v), 0, 1, 1);
    for (const id of Object.keys(T.lastChance) as (keyof typeof T.lastChance)[]) {
      row(id === 'quit' ? 'SEE YOU (lose)' : id, () => T.lastChance[id], (v) => (T.lastChance[id] = v), 0, 100, 1, 'last');
    }
    h('SPACE HOOPS');
    row('Swish prize', () => T.hoopsPrize, (v) => (T.hoopsPrize = v), 10, 300, 10);
    row('Aim sweep speed', () => T.hoopsAimSpeed, (v) => (T.hoopsAimSpeed = v), 0.5, 5, 0.1);
    row('Power fill time (s)', () => T.hoopsPowerTime, (v) => (T.hoopsPowerTime = v), 0.3, 2, 0.05);
    row('Hoops hole size (×)', () => T.hoopsHoleSize, (v) => (T.hoopsHoleSize = v), 0.5, 3, 0.05);
    row('Swish aim tolerance', () => T.hoopsSwishAim, (v) => (T.hoopsSwishAim = v), 0.01, 0.3, 0.01);
    row('Swish power tolerance', () => T.hoopsSwishPower, (v) => (T.hoopsSwishPower = v), 0.01, 0.3, 0.01);
    h('LIVE STATS');
    el.appendChild(stats);
    const b2 = document.createElement('div');
    b2.className = 'btns';
    el.appendChild(b2);
    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { fn(); b.blur(); };
      b2.appendChild(b);
    };
    mk('Copy constants JSON', () => {
      const txt = JSON.stringify(T, null, 2);
      navigator.clipboard?.writeText(txt).catch(() => {});
      console.log(txt);
    });
    mk('Reset constants', () => {
      resetTuning();
      build();
    });
  }

  function row(label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number, odds: boolean | 'last' | 'welcome' = false) {
    const r = document.createElement('div');
    r.className = 'row';
    const l = document.createElement('span');
    l.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(get());
    const v = document.createElement('span');
    v.className = 'val';
    const show = () => {
      if (odds) {
        const sum = Object.values(odds === 'last' ? T.lastChance : odds === 'welcome' ? T.welcomeWheel : T.wheel).reduce((a, b) => a + b, 0) || 1;
        v.textContent = `${Math.round((get() / sum) * 100)}%`;
      } else v.textContent = String(+get().toFixed(3));
    };
    show();
    inp.oninput = () => {
      set(parseFloat(inp.value));
      saveTuning();
      show();
      if (odds) el.querySelectorAll<HTMLElement>('.row').forEach((x) => x.dispatchEvent(new Event('refresh')));
    };
    r.addEventListener('refresh', show);
    inp.addEventListener('keydown', (e) => e.preventDefault()); // keep Space for the game
    r.append(l, inp, v);
    el.appendChild(r);
  }

  build();
  setInterval(() => {
    if (el.classList.contains('hidden')) return;
    const s = game.stats;
    const per = (n: number) => (s.shots ? ((n / s.shots) * 100).toFixed(1) + '%' : '-');
    stats.textContent =
      `shots ${s.shots}  won ${s.won}  drained ${s.drained}\n` +
      `×2 ${s.x2} (${per(s.x2)})  ×3 ${s.x3} (${per(s.x3)})\n` +
      `cup ${s.cup} (${per(s.cup)})  alien ${s.alien}\n` +
      `black hole ${s.bh} (${per(s.bh)})  ufo ${s.ufo}\n` +
      `hidden ${s.hidden}  rain ${s.rain}  fever ${s.fever}\n` +
      `crown +${s.crown} (${per(s.crown)})  warp ${s.warp} (${per(s.warp)})\n` +
      `last shot ${(game.lastShotStrength * 100).toFixed(0)}%  in play ${game.balls.length}\n` +
      `next UFO ${game.ufo.active ? 'now' : game.ufoTimer.toFixed(0) + 's'}\n` +
      `FPS ${game.fps}  quality ${['low', 'medium', 'high'][game.quality]}`;
  }, 250);

  return {
    toggle() {
      el.classList.toggle('hidden');
    },
  };
}
