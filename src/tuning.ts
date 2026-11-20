// All live-tunable constants (PRD "Developer menu and tunable constants").
// The dev menu (` key) edits this object at runtime. Once values are final,
// paste the "Copy constants" JSON from the dev menu here.

export const WHEEL_PRIZES = [
  { id: 'b5', label: '+5', color: '#3b6cff' },
  { id: 'b10', label: '+10', color: '#7a3bff' },
  { id: 'b25', label: '+25', color: '#c33bff' },
  { id: 'rain', label: 'BALL RAIN', color: '#14b8c4' },
  { id: 'fever', label: 'FEVER', color: '#ff3b8d' },
  { id: 'jackpot', label: 'JACKPOT', color: '#ffb321' },
] as const;
export type PrizeId = (typeof WHEEL_PRIZES)[number]['id'];

/** Last Chance Wheel (shown once per day at 0 balls). Two QUIT slices; weights are per prize id. */
export const LAST_CHANCE_SLICES = [
  { id: 'quit', label: 'SEE YOU', color: '#3a3560' },
  { id: 'b10', label: '+10', color: '#3b6cff' },
  { id: 'rain', label: 'BALL RAIN', color: '#14b8c4' },
  { id: 'b20', label: '+20', color: '#7a3bff' },
  { id: 'quit', label: 'SEE YOU', color: '#3a3560' },
  { id: 'b30', label: '+30', color: '#c33bff' },
  { id: 'jackpot', label: 'JACKPOT', color: '#ffb321' },
  { id: 'hoops', label: 'HOOPS', color: '#ff6a2c' },
] as const;
export type LastChanceId = (typeof LAST_CHANCE_SLICES)[number]['id'];

export const DEFAULTS = {
  dailyBalls: 100,
  refillMode: 'topUp' as 'topUp' | 'add', // PRD open question: top up to 100, or +100 on top
  maxChargeTime: 0.55, // s — hold this long for 100%
  chargeCurve: 2, // 1 = linear, 2+ = short taps already give a strong shot
  minStrength: 0.3,
  maxStrength: 1.0,
  fullShotSpeed: 1760, // px/s at 100% strength (board units)
  gravity: 1.0,
  pinBounce: 0.6,
  wallBounce: 0.35,
  kickerPower: 200, // upper-right slingshot that throws strong shots back toward the alien
  hole2Size: 1.0, // × ball width
  hole3Size: 0.95,
  returnGap: 13, // Ball Back pocket: half width of the opening (ball radius = 7)
  crownHoleSize: 0.8, // crown holes on top of the alien (× ball radius)
  crownReward: 3, // side crown holes (+ counts as an alien hit)
  cupSpeed: 80, // px/s
  alienHitsForRain: 30,
  rainLength: 10, // s
  rainBalls: 40,
  alienScaleFever: 1.15, // alien size during Fever (bigger target)
  alienScaleRain: 1.28, // alien size during Ball Rain
  goldAlienReward: 1, // Ball Rain: balls per golden-alien hit
  goldComboStep: 6, // +1 more per hit every N combo hits
  goldComboMax: 2, // max combo bonus per hit
  feverLength: 20, // s
  feverMultiplier: 2,
  ufoInterval: 90, // s
  ufoReward: 10,
  hiddenReward: 50,
  hiddenMaxSpeed: 634, // ball must be slower than this to drop into the hidden hole
  blackHoleRadius: 5, // capture radius (board px)
  lastChanceOn: 1, // 1 = offer the Last Chance Wheel once per day at 0 balls
  lastChance: { quit: 40, b10: 14, b20: 14, b30: 7, rain: 12, jackpot: 3, hoops: 10 } as Record<LastChanceId, number>,
  // Space Hoops (Last Chance mini-game)
  hoopsPrize: 100, // clean swish
  hoopsRimPrize: 10, // grazed the rim
  hoopsAimSpeed: 2.2, // aim sweep speed (higher = harder)
  hoopsPowerTime: 0.9, // s to fill the power bar once
  hoopsPowerTarget: 0.72,
  hoopsSwishAim: 0.07,
  hoopsSwishPower: 0.07,
  hoopsRimAim: 0.16,
  hoopsRimPower: 0.15,
  welcomeOn: 1, // 1 = first-ever visit opens the Welcome Wheel
  welcomeWheel: { b5: 8, b10: 22, b25: 20, rain: 22, fever: 22, jackpot: 6 } as Record<PrizeId, number>,
  wheel: { b5: 46, b10: 30, b25: 12, rain: 5, fever: 5, jackpot: 2 } as Record<PrizeId, number>,
};

export type Tuning = typeof DEFAULTS;
const KEY = 'cosmicPachinko.tuning';

// Source of truth for tuned values: tuning.config.json in the project root.
// - The dev menu writes every change to that file (dev server only), so code updates and reloads keep them.
// - The production build bakes the file in, so the tuned values ship as constants.
// - DEFAULTS above only fill keys the file doesn't have yet (e.g. a brand-new setting).
import CONFIG_FILE from '../tuning.config.json';

function merge(t: Tuning, o: any) {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(t) as (keyof Tuning)[]) {
    const def = (t as any)[k];
    if (def && typeof def === 'object') Object.assign(def, o[k] ?? {}); // nested odds tables
    else if (o[k] !== undefined) (t as any)[k] = o[k];
  }
}
const isEmpty = (o: any) => !o || typeof o !== 'object' || Object.keys(o).length === 0;

function load(): Tuning {
  const t: Tuning = JSON.parse(JSON.stringify(DEFAULTS));
  if (!isEmpty(CONFIG_FILE)) merge(t, CONFIG_FILE);
  else {
    // file not created yet: fall back to values previously saved in this browser
    try { merge(t, JSON.parse(localStorage.getItem(KEY) || 'null')); } catch {}
  }
  return t;
}

export const T: Tuning = load();

/** Dev server: pull the latest file (the bundled copy may be stale) and seed it from the browser on first run. */
export async function syncTuningFile() {
  if (!import.meta.env.DEV) return;
  try {
    const r = await fetch('./__tuning', { cache: 'no-store' });
    const file = await r.json();
    if (isEmpty(file)) {
      // first run: capture the values currently in this browser (or defaults) into the file
      writeFile();
    } else {
      const fresh: Tuning = JSON.parse(JSON.stringify(DEFAULTS));
      merge(fresh, file);
      Object.assign(T, fresh);
      // add any brand-new keys to the file without touching existing values
      if (Object.keys(DEFAULTS).some((k) => !(k in file))) writeFile();
    }
  } catch {}
}

let writeTimer = 0;
// automated playtest sessions must never overwrite the designer's file
const READ_ONLY = typeof location !== 'undefined' && /ohmygamePlaytest=1/.test(location.search);
function writeFile() {
  if (!import.meta.env.DEV || READ_ONLY) return;
  clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    fetch('./__tuning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(T) }).catch(() => {});
  }, 250);
}

export function saveTuning() {
  localStorage.setItem(KEY, JSON.stringify(T));
  writeFile();
}
export function resetTuning() {
  localStorage.removeItem(KEY);
  Object.assign(T, JSON.parse(JSON.stringify(DEFAULTS)));
  writeFile();
}
