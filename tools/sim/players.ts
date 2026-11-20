// Simulate N players with different shooting styles, in parallel worker threads.
// Uses the real game code + tuning.config.json. Run: npm run sim:players [-- players=1000 cap=400]
import { noop } from './stubs';
import { Game } from '../../src/game';
import { T } from '../../src/tuning';
import { sfx } from '../../src/audio';
(sfx as any).unlock = () => {}; // no audio in the simulator
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';

type Persona = 'tapper' | 'mid' | 'power' | 'random' | 'learner';
const PERSONAS: Persona[] = ['tapper', 'mid', 'power', 'random', 'learner'];

interface Result {
  persona: Persona;
  shots: number;
  coreWon: number;
  bonusWon: number;
  endBalls: number;
  bustedOut: boolean;
  stats: Record<string, number>;
}

const art: any = new Proxy({}, { get: () => ({ img: {}, w: 1, h: 1 }) });
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function holdTime(p: Persona, learn: { best: number }) {
  const max = T.maxChargeTime;
  switch (p) {
    case 'tapper': return Math.max(0, 0.12 * max + gauss() * 0.06 * max);
    case 'mid': return Math.max(0, 0.45 * max + gauss() * 0.08 * max);
    case 'power': return Math.max(0, 0.95 * max + gauss() * 0.15 * max);
    case 'random': return Math.random() * 1.3 * max;
    case 'learner': return Math.max(0, learn.best + gauss() * 0.08 * max);
  }
}

function playOne(persona: Persona, cap: number): Result {
  const g = new Game({ getContext: () => noop } as any, art);
  g.ufoTimer = T.ufoInterval * Math.random();
  g.save.balls = T.dailyBalls;
  const learn = { best: Math.random() * T.maxChargeTime, bestGain: -1 };
  let shots = 0, coreWon = 0, bonusWon = 0;
  let inBonus = true; // the Welcome Wheel opens first
  let lastWon = 0;
  let bustedOut = false;
  let shotTimer = 0;
  let gainSince = 0, holdUsed = 0;
  const DT = 1 / 30;
  for (let step = 0; step < 400000; step++) {
    // automate the wheels / mini-game like a player would
    if (g.wheel?.phase === 'ready') g.pressStart();
    if (g.wheel?.kind === 'last') inBonus = true;
    if (g.hoops && (g.hoops.phase === 'aim' || g.hoops.phase === 'intro')) {
      const h = g.hoops;
      h.phase = 'power';
      h.lockedAim = h.hoopAim + gauss() * 0.12; // human aim error
      h.power = T.hoopsPowerTarget + gauss() * 0.12;
      h.release();
    }
    g.update(DT);
    const won = g.stats.won;
    if (won !== lastWon) {
      if (inBonus) bonusWon += won - lastWon;
      else { coreWon += won - lastWon; gainSince += won - lastWon; }
      lastWon = won;
    }
    const busy = !!g.wheel || !!g.hoops || !!g.bhSeq || !!g.warp;
    if (inBonus && !busy && g.rainT <= 0 && g.balls.length === 0) inBonus = false;
    if (g.outOfBalls) { bustedOut = true; break; }
    if (shots >= cap && g.balls.length === 0 && !busy && g.rainT <= 0) break;
    shotTimer -= DT;
    if (!busy && !inBonus && shotTimer <= 0 && g.save.balls > 0 && shots < cap) {
      // learner: keep the hold that paid best over the last few shots
      if (persona === 'learner' && shots % 15 === 0 && shots > 0) {
        if (gainSince > learn.bestGain) { learn.best = holdUsed; learn.bestGain = gainSince; }
        else learn.bestGain *= 0.8;
        gainSince = 0;
      }
      const t = holdTime(persona, learn);
      holdUsed = t;
      g.charging = true;
      g.chargeT = t;
      g.pressEnd();
      shots++;
      shotTimer = 0.7 + Math.random() * 0.3;
    }
  }
  return { persona, shots, coreWon, bonusWon, endBalls: g.save.balls, bustedOut, stats: { ...g.stats } };
}

if (!isMainThread) {
  const { count, cap, offset } = workerData as { count: number; cap: number; offset: number };
  const out: Result[] = [];
  for (let i = 0; i < count; i++) out.push(playOne(PERSONAS[(offset + i) % PERSONAS.length], cap));
  parentPort!.postMessage(out);
} else {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
  const players = +(args.players ?? 1000);
  const cap = +(args.cap ?? 400);
  const threads = Math.min(os.cpus().length, players);
  const t0 = Date.now();
  const per = Math.ceil(players / threads);
  const jobs: Promise<Result[]>[] = [];
  for (let i = 0; i < threads; i++) {
    const count = Math.min(per, players - i * per);
    if (count <= 0) break;
    jobs.push(new Promise((res, rej) => {
      const w = new Worker(__filename, { workerData: { count, cap, offset: i * per } });
      w.on('message', res);
      w.on('error', rej);
    }));
  }
  Promise.all(jobs).then((parts) => {
    const all = parts.flat();
    const sum = (f: (r: Result) => number, rs = all) => rs.reduce((a, r) => a + f(r), 0);
    const shots = sum((r) => r.shots);
    const core = sum((r) => r.coreWon);
    const bonus = sum((r) => r.bonusWon);
    console.log(`\n${all.length} players, session cap ${cap} shots, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log(`CORE RTP (normal play): ${((core / shots) * 100).toFixed(1)}%   | incl. welcome + last-chance bonuses: ${(((core + bonus) / shots) * 100).toFixed(1)}%`);
    console.log(`avg shots/player ${(shots / all.length).toFixed(0)}  busted out ${(100 * all.filter((r) => r.bustedOut).length / all.length).toFixed(0)}%  avg end balls ${(sum((r) => r.endBalls) / all.length).toFixed(0)}`);
    const rows: Record<string, any> = {};
    for (const p of PERSONAS) {
      const rs = all.filter((r) => r.persona === p);
      const s = sum((r) => r.shots, rs);
      rows[p] = { players: rs.length, 'core RTP %': +((sum((r) => r.coreWon, rs) / s) * 100).toFixed(1), 'avg shots': Math.round(s / rs.length), 'busted %': Math.round((100 * rs.filter((r) => r.bustedOut).length) / rs.length) };
    }
    console.table(rows);
    const keys = ['x2', 'x3', 'cup', 'alien', 'crown', 'warp', 'bh', 'rain', 'fever', 'ufo', 'hidden'];
    const per1k: Record<string, number> = {};
    for (const k of keys) per1k[k] = +((sum((r) => r.stats[k] || 0) / shots) * 1000).toFixed(1);
    console.log('events per 1000 shots:', JSON.stringify(per1k));
  });
}
