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

// FINAL TUNED CONSTANTS (locked from the designer's dev-menu values).
export const DEFAULTS = {
  dailyBalls: 100,
  refillMode: 'add' as 'topUp' | 'add', // PRD open question: top up to 100, or +100 on top
  maxChargeTime: 0.75, // s — hold this long for 100%
  chargeCurve: 1.5, // 1 = linear, 2+ = short taps already give a strong shot
  minStrength: 0.3,
  maxStrength: 1,
  fullShotSpeed: 1760, // px/s at 100% strength (board units)
  gravity: 1,
  pinBounce: 0.5,
  wallBounce: 0.35,
  kickerPower: 200, // upper-right slingshot that throws strong shots back toward the alien
  hole2Size: 1.1, // × ball width
  hole3Size: 1.1,
  crownHoleSize: 1, // crown holes on top of the alien (× ball radius)
  crownReward: 3, // side crown holes (+ counts as an alien hit)
  cupSpeed: 80, // px/s
  alienHitsForRain: 30,
  rainLength: 10, // s
  rainBalls: 35,
  alienScaleFever: 1.1, // alien size during Fever (bigger target)
  alienScaleRain: 1.2, // alien size during Ball Rain
  goldAlienReward: 1, // Ball Rain: balls per golden-alien hit
  goldComboStep: 4, // +1 more per hit every N combo hits
  goldComboMax: 4, // max combo bonus per hit
  feverLength: 20, // s
  feverMultiplier: 2,
  ufoInterval: 40, // s
  ufoReward: 10,
  hiddenReward: 50,
  hiddenMaxSpeed: 634, // ball must be slower than this to drop into the hidden hole
  blackHoleBallsForWheel: 10, // balls the black hole must swallow before the Wheel of Fortune opens
  warpCharge: 1, // how many black-hole balls a WARP-hole ball counts as
  alienRainStep: 10, // after each alien Ball Rain, the next one needs this many more hits
  bhWheelStep: 5, // after each black-hole wheel, the next one needs this many more balls
  blackHoleRadius: 9, // capture radius (board px)
  lastChanceOn: 1, // 1 = offer the Last Chance Wheel once per day at 0 balls
  lastChance: { quit: 40, b10: 24, b20: 14, b30: 7, rain: 15, jackpot: 6, hoops: 10 } as Record<LastChanceId, number>,
  // Space Hoops (Last Chance mini-game)
  hoopsPrize: 50, // clean swish
  hoopsRimPrize: 10, // grazed the rim
  hoopsAimSpeed: 2, // aim sweep speed (higher = harder)
  hoopsPowerTime: 0.8, // s to fill the power bar once
  hoopsPowerTarget: 0.72,
  hoopsHoleSize: 1.2, // Space Hoops: black-hole hoop size (scales the visual AND the aim tolerance)
  hoopsSwishAim: 0.1,
  hoopsSwishPower: 0.1,
  hoopsRimAim: 0.16,
  hoopsRimPower: 0.15,
  welcomeOn: 1, // 1 = first-ever visit opens the Welcome Wheel
  welcomeWheel: { b5: 8, b10: 22, b25: 20, rain: 22, fever: 22, jackpot: 6 } as Record<PrizeId, number>,
  wheel: { b5: 40, b10: 47, b25: 15, rain: 13, fever: 13, jackpot: 7 } as Record<PrizeId, number>,
};

export type Tuning = typeof DEFAULTS;

// Release build: the dev menu is disabled and the tuned constants above are the only source of values.
// (Set DEV_MENU = true to bring back the backtick developer menu for live tuning.)
export const DEV_MENU = false;
const KEY = 'cosmicPachinko.tuning';

export const T: Tuning = JSON.parse(JSON.stringify(DEFAULTS));

// Old builds saved dev-menu values in the browser; make sure they can never override the constants.
try { localStorage.removeItem(KEY); } catch {}

/** No-op in the release build (live tuning file sync is only for DEV_MENU builds). */
export async function syncTuningFile() {}

export function saveTuning() {
  if (DEV_MENU) localStorage.setItem(KEY, JSON.stringify(T));
}
export function resetTuning() {
  Object.assign(T, JSON.parse(JSON.stringify(DEFAULTS)));
}
