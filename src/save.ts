import { T } from './tuning';

const KEY = 'cosmicPachinko.save';

export interface SaveData {
  balls: number;
  lastRefill: string; // YYYY-MM-DD local
  best: number;
  lastChance?: string; // day the Last Chance Wheel was used
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function msToMidnight(now = new Date()) {
  const m = new Date(now);
  m.setHours(24, 0, 0, 0);
  return m.getTime() - now.getTime();
}

export function loadSave(): SaveData {
  let s: SaveData | null = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {}
  if (!s || typeof s.balls !== 'number') s = { balls: 0, lastRefill: '', best: 0 };
  applyRefill(s);
  return s;
}

/** Applies the daily refill if the stored date isn't today. Returns true if refilled. */
export function applyRefill(s: SaveData): boolean {
  const today = todayStr();
  if (s.lastRefill === today) return false;
  if (T.refillMode === 'add') s.balls += T.dailyBalls;
  else s.balls = Math.max(s.balls, T.dailyBalls);
  s.lastRefill = today;
  writeSave(s);
  return true;
}

export function writeSave(s: SaveData) {
  s.best = Math.max(s.best || 0, s.balls);
  localStorage.setItem(KEY, JSON.stringify(s));
}
