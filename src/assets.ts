// Loads art from public/art. Magenta-background JPEGs are chroma-keyed and every sprite is trimmed.

export interface Sprite {
  img: CanvasImageSource;
  w: number;
  h: number;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('failed ' + src));
    i.src = src;
  });
}

function process(img: HTMLImageElement, key: boolean | 'green', maxSize = 512): Sprite {
  const sc = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * sc);
  const h = Math.round(img.height * sc);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (key) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const m = key === 'green' ? gg - Math.max(r, b) : Math.min(r, b) - gg; // key-colour-ness
      if (m > 150) d[i + 3] = 0;
      else if (m > 70) {
        const a = (150 - m) / 80;
        d[i + 3] = Math.round(d[i + 3] * a);
        // despill
        if (key === 'green') d[i + 1] = Math.min(gg, Math.max(r, b) + 20);
        else {
          const cap = gg + 70;
          d[i] = Math.min(r, cap);
          d[i + 2] = Math.min(b, cap + 20);
        }
      }
    }
    if (d[i + 3] > 12) {
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  g.putImageData(id, 0, 0);
  if (x1 <= x0) return { img: c, w, h };
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const t = document.createElement('canvas');
  t.width = tw;
  t.height = th;
  t.getContext('2d')!.drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  return { img: t, w: tw, h: th };
}

export interface Art {
  backdrop: HTMLImageElement;
  board: HTMLImageElement;
  alien: Sprite;
  blackhole: Sprite;
  ufo: Sprite;
  cup: Sprite;
  astronaut: Sprite;
  miniufo: Sprite;
  rocket: Sprite;
  dish: Sprite;
  asteroid: Sprite;
  dial: Sprite;
  alienGold: Sprite;
}

export async function loadArt(): Promise<Art> {
  const base = './art/';
  const [backdrop, board, alien, blackhole, ufo, cup, astronaut, miniufo, rocket, dish, asteroid, dial, alienGold] = await Promise.all(
    ['backdrop.jpg', 'board.jpg', 'alien.png', 'blackhole.png', 'ufo.jpg', 'cup.jpg', 'astronaut.jpg', 'miniufo.jpg', 'rocket.jpg', 'dish.jpg', 'asteroid.jpg', 'dial.jpg', 'alien-gold.jpg'].map((f) => loadImg(base + f)),
  );
  return {
    backdrop,
    board,
    alien: process(alien, false),
    blackhole: process(blackhole, false),
    ufo: process(ufo, true, 400),
    cup: process(cup, true, 400),
    astronaut: process(astronaut, true, 512),
    miniufo: process(miniufo, true, 320),
    rocket: process(rocket, true, 320),
    dish: process(dish, true, 320),
    asteroid: process(asteroid, true, 256),
    dial: process(dial, 'green', 320),
    alienGold: process(alienGold, 'green', 512),
  };
}
