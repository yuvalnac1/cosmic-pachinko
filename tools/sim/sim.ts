import { noop } from './stubs';
import { Game } from '../../src/game';
import { T } from '../../src/tuning';
const art: any = { alien: {}, blackhole: {}, ufo: {}, cup: {}, astronaut: {} };
const res: Record<string, any> = {};
if (process.env.BASE) { T.alienHitsForRain = 1e9; T.wheel = { b5: 0, b10: 1, b25: 0, rain: 0, fever: 0, jackpot: 0 } as any; }
const N = 400;
for (const st of [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.612, 0.616, 0.62, 0.7, 0.8, 0.9, 1.0]) {
  const g = new Game({ getContext: () => noop } as any, art);
  g.ufoTimer = 1e9;
  g.save.balls = 100000;
  let apexX: number[] = [];
  for (let s = 0; s < N; s++) {
    g.fire(st);
    const b = g.balls[g.balls.length - 1];
    let minY = 1e9, xAtTop = 0, firstPinX = -1;
    for (let k = 0; k < 600 && g.balls.includes(b); k++) {
      g.update(1 / 60);
      if (b.y < minY) { minY = b.y; xAtTop = b.x; }
    }
    while (g.balls.length || g.wheel || g.bhSeq) g.update(1 / 30);
    apexX.push(Math.round(xAtTop));
  }
  const s = g.stats;
  apexX.sort((a, b) => a - b);
  res[st] = { bh_pct: +(s.bh / N * 100).toFixed(1), alien_pct: +(s.alien / N * 100).toFixed(1), rtp: +(s.won / N).toFixed(2), apexMedX: apexX[N/2], won: s.won, x2: s.x2, x3: s.x3, cup: s.cup, alien: s.alien, bh: s.bh, hidden: s.hidden, rain: s.rain };
}
console.table(res);
