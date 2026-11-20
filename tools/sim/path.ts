import { noop } from './stubs';
import { Game } from '../../src/game';
const art: any = new Proxy({}, { get: () => ({}) });
const g = new Game({ getContext: () => noop } as any, art);
g.ufoTimer = 1e9; g.save.balls = 1e6;
for (const st of [0.7, 0.8, 1.0]) for (let r = 0; r < 3; r++) {
  g.balls.length = 0; g.fire(st); const b = g.balls[0]; const pts: string[] = [];
  for (let k = 0; k < 1200 && g.balls.includes(b); k++) { (g as any).physicsStep(1 / 240); if (k % 40 === 0) pts.push(`${b.x.toFixed(0)},${b.y.toFixed(0)}`); }
  console.log(st, pts.join(' '));
}
