import { noop } from './stubs';
import { Game } from '../../src/game';
import { T } from '../../src/tuning';
import { sfx } from '../../src/audio';
import { BLACK_HOLE } from '../../src/board';
(sfx as any).unlock = () => {};
const art: any = new Proxy({}, { get: () => ({ img: {}, w: 1, h: 1 }) });
const g = new Game({ getContext: () => noop } as any, art);
g.wheel = null; // skip the welcome wheel
T.blackHoleBallsForWheel = 10;
const log: string[] = [];
for (let i = 1; i <= 12; i++) {
  if (i === 5 || i === 11) { g.startWarp(); for (let k = 0; k < 40; k++) g.update(1 / 30); }
  else {
    g.balls.push(g.newBall(BLACK_HOLE.x, BLACK_HOLE.y - 2, 0, 50, true));
    for (let k = 0; k < 10; k++) g.update(1 / 30);
  }
  log.push(`${i}${i === 5 || i === 11 ? '(warp)' : ''}: charge=${g.bhCharge} wheel=${g.bhSeq || g.wheel ? 'OPEN' : '-'}`);
  for (let k = 0; k < 300 && (g.bhSeq || g.wheel); k++) g.update(1 / 30);
}
console.log(log.join('\n'));
