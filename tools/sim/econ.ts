import { noop } from './stubs';
import { Game } from '../../src/game';
import { T } from '../../src/tuning';
const art: any = { alien: {}, blackhole: {}, ufo: {}, cup: {}, astronaut: {} };
for (const mode of ['random', 'fixed0.5', 'fixed0.8']) {
  let tot = 0, shots = 0; const agg: any = {};
  for (let run = 0; run < 6; run++) {
    const g = new Game({ getContext: () => noop } as any, art);
    g.save.balls = 1e6;
    for (let s = 0; s < 500; s++) {
      const st = mode === 'random' ? 0.3 + Math.random() * 0.7 : mode === 'fixed0.5' ? 0.5 : 0.8;
      g.fire(st);
      for (let k = 0; k < 45; k++) g.update(1 / 60); // ~0.75s between shots
    }
    for (let k = 0; k < 3000 && (g.balls.length || g.wheel || g.bhSeq || g.rainT > 0); k++) g.update(1 / 30);
    tot += g.stats.won; shots += 500;
    for (const [k, v] of Object.entries(g.stats)) agg[k] = (agg[k] || 0) + (v as number);
  }
  console.log(mode, 'RTP', (tot / shots).toFixed(2), JSON.stringify(agg));
}
