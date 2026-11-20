import { noop } from './stubs';
import { Game } from '../../src/game';
import { T } from '../../src/tuning';
import { sfx } from '../../src/audio';
import { BLACK_HOLE } from '../../src/board';
(sfx as any).unlock = () => {};
const art: any = new Proxy({}, { get: () => ({ img: {}, w: 1, h: 1 }) });
const g = new Game({ getContext: () => noop } as any, art);
g.wheel = null;
// 1) wedged ball on the right kicker tip, 0 balls left
g.save.balls = 0; g.save.lastChance = '';
const b = g.newBall(740, 658, 0, 0, false); g.balls.push(b);
let t = 0;
while (!g.wheel && t < 60) { g.update(1 / 30); t += 1 / 30; }
console.log(`stuck ball cleared + last-chance opened after ${t.toFixed(1)}s (wheel=${g.wheel?.kind})`);
g.wheel = null; g.save.balls = 100;
// 2) escalating targets
T.alienHitsForRain = 30; T.alienRainStep = 10; T.blackHoleBallsForWheel = 10; T.bhWheelStep = 5;
g.save.alienLevel = 0; g.save.bhLevel = 0;
const needs: number[] = [g.alienNeed];
for (let r = 0; r < 2; r++) { g.alienHits = g.alienNeed - 1; (g as any).crownSide(400, 300); needs.push(g.alienNeed); g.rainT = 0; }
const bh: number[] = [g.bhNeed];
for (let r = 0; r < 2; r++) { const n = g.bhNeed; for (let i = 0; i < n; i++) g.feedBlackHole(BLACK_HOLE.x, BLACK_HOLE.y); bh.push(g.bhNeed); g.bhSeq = null; g.wheel = null; g.wheelQueue = []; }
console.log('alien targets:', needs.join(' → '), '| black hole targets:', bh.join(' → '));
