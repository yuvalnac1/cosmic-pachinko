// Board geometry in fixed logical units (W×H). Everything is scaled at render time.

export const W = 800;
export const H = 1000;
export const CX = 400;
export const CY = 390; // centre of the top arc
export const R = 372; // arc radius (inner wall)
export const BALL_R = 7;
export const PIN_R = 3.4;
export const SIDE_BOTTOM = 860; // straight side walls end here, then funnel
export const DRAIN_Y = 990;
export const LEFT_X = CX - R;
export const RIGHT_X = CX + R;

export interface Seg { ax: number; ay: number; bx: number; by: number; kick?: number; ledge?: boolean }
export interface Pin { x: number; y: number; flash: number; hue: number }
export interface Circle { x: number; y: number; r: number }

export type ShipKind = 'ufo' | 'rocket' | 'dish';
/** A ship target: solid body + a catch hatch on top. A ball dropping into the hatch splits ×mult. */
export interface Ship {
  kind: ShipKind;
  mult: 2 | 3;
  x: number; y: number; // body centre
  hx: number; hy: number; // hatch centre
  bodies: Circle[];
  flash: number; // hatch capture effect
  bump: number; // body hit wobble
  flip: boolean;
}
export interface Orb { x: number; y: number; r: number; flash: number }

export const ALIEN = { x: CX, y: 410, r: 64 };
export const BLACK_HOLE = { x: CX, y: 598 };
/** Gourd "crown" on top of the alien (like the classic hero housing) with three catch holes on its top. */
export const CROWN = { x: CX, y: ALIEN.y - ALIEN.r - 34, r: 34 };
export type CrownHoleKind = 'warp' | 'side';
export const CROWN_HOLES = [-90 - 50, -90, -90 + 50].map((deg, i) => {
  const a = (deg * Math.PI) / 180;
  const d = CROWN.r + BALL_R - 2;
  return { x: CROWN.x + Math.cos(a) * d, y: CROWN.y + Math.sin(a) * d, a, kind: (i === 1 ? 'warp' : 'side') as CrownHoleKind, flash: 0 };
});
/** Console below the board: ball tray + launch handle (board units, below H). */
export const CONSOLE = { y: H + 34, h: 170 };
export const TRAY = { x0: 52, x1: 548, floor: H + 34 + 128 };
export const HANDLE = { x: 676, y: H + 34 + 92, r: 62 };
export const HIDDEN = (() => {
  // just past the apex, on the wall track: only a ball that *barely* makes the loop is slow enough to drop in
  const a = (24 * Math.PI) / 180;
  const rr = R - BALL_R - 1;
  return { x: CX + Math.sin(a) * rr, y: CY - Math.cos(a) * rr, r: 4 };
})();
export const CUP_Y = 918;
/** Return pocket: a ball dropping into the centre hole is given back (+1). */
export const RETURN_Y = 880;
export const RETURN_HALF = 70; // half width of the housing roof
export const RETURN_GAP_DEFAULT = 13; // half width of the opening at the peak (tunable: T.returnGap)
export const RETURN_HOLE = { x: 400, y: RETURN_Y - 8, r: RETURN_GAP_DEFAULT - 1, gap: RETURN_GAP_DEFAULT };
/** Resize the Ball Back opening live (moves the inner ends of the roof). */
export function setReturnGap(gap: number) {
  if (gap === RETURN_HOLE.gap) return;
  RETURN_HOLE.gap = gap;
  RETURN_HOLE.r = gap - 1;
  for (const s of SEGS) if (s.ledge) s.ax = s.bx < CX ? CX - gap : CX + gap;
}
export const CUP_HALF = 46; // half width of mouth
export const CUP_MIN_X = 150;
export const CUP_MAX_X = 650;
export const LAUNCH = { x: LEFT_X + BALL_R + 1, y: CY + 30 };
export const UFO_Y = 150; // bonus UFO flight lane

function ship(kind: ShipKind, mult: 2 | 3, x: number, y: number, flip = false): Ship {
  let bodies: Circle[];
  let hy: number;
  if (kind === 'ufo') {
    bodies = [{ x, y, r: 15 }, { x: x - 24, y: y + 8, r: 9 }, { x: x + 24, y: y + 8, r: 9 }];
    hy = y - 15;
  } else if (kind === 'rocket') {
    bodies = [{ x, y, r: 13 }, { x, y: y + 24, r: 12 }];
    hy = y - 13;
  } else {
    bodies = [{ x, y, r: 15 }, { x, y: y + 24, r: 15 }];
    hy = y - 15;
  }
  return { kind, mult, x, y, hx: x, hy, bodies, flash: 0, bump: 0, flip };
}

// Layout follows the classic machine: two discs high, a row of four at the hero's waist
// (outer two = UFOs, inner two = orb bumpers), and a staggered catcher row below.
export const SHIPS: Ship[] = [
  ship('ufo', 2, 245, 285),
  ship('ufo', 2, 555, 285, true),
  ship('ufo', 2, 150, 492),
  ship('ufo', 2, 650, 492, true),
  ship('dish', 3, 170, 690, true), // outer: big antennas near the frame
  ship('rocket', 3, 298, 752),
  ship('rocket', 3, 502, 752, true), // inner: rockets
  ship('dish', 3, 630, 690),
];

/** Glowing orb bumpers flanking the alien (strong kick, no payout). */
export const ORBS: Orb[] = [
  { x: 290, y: 482, r: 17, flash: 0 },
  { x: 510, y: 482, r: 17, flash: 0 },
];

export const SEGS: Seg[] = [
  // straight sides
  { ax: LEFT_X, ay: CY, bx: LEFT_X, by: SIDE_BOTTOM },
  { ax: RIGHT_X, ay: CY, bx: RIGHT_X, by: SIDE_BOTTOM },
  // bottom funnels toward the drain
  { ax: LEFT_X, ay: SIDE_BOTTOM, bx: 110, by: 975 },
  { ax: RIGHT_X, ay: SIDE_BOTTOM, bx: W - 110, by: 975 },
  // wall kickers: knock wall-riding balls back into the pin field
  { ax: RIGHT_X, ay: 430, bx: RIGHT_X - 58, by: 404, kick: 1 },
  ...[640, 790].map((y) => ({ ax: RIGHT_X, ay: y, bx: RIGHT_X - 26, by: y + 22 })),
  ...[600, 760].map((y) => ({ ax: LEFT_X, ay: y, bx: LEFT_X + 26, by: y + 22 })),
  // return pocket housing above the cup: a wide chrome roof (∧) with the opening at the peak —
  // balls landing on the roof roll off sideways; only a ball dropping straight in is returned
  { ax: CX - RETURN_GAP_DEFAULT, ay: RETURN_Y - 16, bx: CX - RETURN_HALF, by: RETURN_Y + 6, ledge: true },
  { ax: CX + RETURN_GAP_DEFAULT, ay: RETURN_Y - 16, bx: CX + RETURN_HALF, by: RETURN_Y + 6, ledge: true },
];

/** Is a point inside the playfield with a given clearance from walls? */
export function insideField(x: number, y: number, clear: number) {
  if (y < CY) return Math.hypot(x - CX, y - CY) < R - clear;
  if (y > SIDE_BOTTOM - 10) return false;
  return x > LEFT_X + clear && x < RIGHT_X - clear;
}

export function buildPins(): Pin[] {
  const pins: Pin[] = [];
  const solids: Circle[] = [
    { x: ALIEN.x, y: ALIEN.y, r: ALIEN.r },
    { x: ALIEN.x, y: ALIEN.y + ALIEN.r * 0.3, r: ALIEN.r * 1.3 }, // room for the enlarged alien (Fever / Rain)
    CROWN,
    ...ORBS,
    ...SHIPS.flatMap((s) => s.bodies),
  ];
  const ok = (x: number, y: number, minD: number) => {
    const clear = y < CY + 20 ? 44 : 17; // keep the launch rail clear around the arc
    if (!insideField(x, y, clear) || y > 862) return false;
    if (Math.abs(y - UFO_Y) < 26) return false;
    for (const sg of SEGS) if (segDist(x, y, sg) < 16) return false;
    for (const c of solids) if (Math.hypot(x - c.x, y - c.y) < c.r + PIN_R + 15) return false;
    for (const s of SHIPS) if (Math.hypot(x - s.hx, y - s.hy) < 21) return false;
    if (Math.hypot(x - BLACK_HOLE.x, y - BLACK_HOLE.y) < 44 && Math.hypot(x - BLACK_HOLE.x, y - BLACK_HOLE.y) > 34) return false;
    for (const p of pins) if (Math.hypot(p.x - x, p.y - y) < minD) return false;
    return true;
  };
  const add = (x: number, y: number, minD = 21) => {
    if (ok(x, y, minD)) pins.push({ x, y, flash: 0, hue: 0 });
  };
  const line = (x1: number, y1: number, x2: number, y2: number, step = 22, skipEnd = false) => {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let i = 0; i <= (skipEnd ? n - 1 : n); i++) add(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, step = 22, minD = 21) => {
    const n = Math.max(1, Math.round((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      add(cx + Math.cos(a) * r, cy + Math.sin(a) * r, minD);
    }
  };
  const deg = Math.PI / 180;
  const mirror = (fn: (s: number, mx: (x: number) => number) => void) => {
    fn(1, (x) => x);
    fn(-1, (x) => W - x);
  };

  // --- black hole guard ring (gaps barely wider than a ball) ---
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i / 9) * Math.PI * 2;
    add(BLACK_HOLE.x + Math.cos(a) * 30, BLACK_HOLE.y + Math.sin(a) * 30, 15);
  }
  // --- crown guard: an arc of pins over the crown with one ball-wide gap above each hole ---
  for (const d of [194, 209, 231, 247, 261, 279, 293, 309, 331, 346]) {
    const a = (d * Math.PI) / 180;
    add(CROWN.x + Math.cos(a) * 66, CROWN.y + Math.sin(a) * 66, 16);
  }
  add(CROWN.x, CROWN.y - 66 - 30, 16); // roof pin: the WARP hole is the hard one
  // --- shoulders of the alien ---
  for (const d of [186, 200, 214, 326, 340, 354]) {
    const a = (d * Math.PI) / 180;
    add(ALIEN.x + Math.cos(a) * 100, ALIEN.y + Math.sin(a) * 100, 20);
  }
  // --- feeder funnels: a V of pins pointing into every ship hatch ---
  for (const s of SHIPS) {
    const spread = s.kind === 'ufo' ? 1 : 0.85;
    line(s.hx - 58 * spread, s.hy - 52, s.hx - 21, s.hy - 12, 20);
    line(s.hx + 58 * spread, s.hy - 52, s.hx + 21, s.hy - 12, 20);
  }
  // --- lanes from the alien down past the black hole ---
  mirror((_s, mx) => {
    line(mx(352), 522, mx(352), 556, 17);
    line(mx(330), 612, mx(330), 690, 22);
  });
  // --- concentric rail arcs following the top of the machine ---
  arc(CX, CY, R - 56, 198 * deg, 342 * deg, 25);
  arc(CX, CY, R - 92, 205 * deg, 335 * deg, 27);
  // --- top crowns: W shapes above the upper UFOs ---
  mirror((_s, mx) => {
    line(mx(150), 190, mx(190), 232, 20);
    line(mx(190), 232, mx(232), 196, 20);
    line(mx(232), 196, mx(274), 232, 20);
    line(mx(274), 232, mx(314), 190, 20);
  });
  // --- parenthesis arcs flanking alien & black hole ---
  arc(CX, 520, 196, 145 * deg, 212 * deg, 22);
  arc(CX, 520, 196, -32 * deg, 35 * deg, 22);
  arc(CX, 520, 238, 150 * deg, 205 * deg, 24);
  arc(CX, 520, 238, -25 * deg, 30 * deg, 24);
  // --- chevrons pointing inward under the side UFOs ---
  mirror((_s, mx) => {
    line(mx(70), 590, mx(120), 625, 20);
    line(mx(120), 625, mx(70), 660, 20);
  });
  // --- lower fan above the lucky cup ---
  for (let r = 0; r < 3; r++) {
    const y = 806 + r * 24;
    const off = r % 2 ? 17 : 0;
    for (let x = 60 + off; x < W - 50; x += 34) add(x, y);
  }
  // --- fill: a sparse staggered field so no lane is a free fall ---
  const dx = 34, dy = 30;
  for (let row = 0; row * dy + 110 < 800; row++) {
    const y = 110 + row * dy;
    const off = row % 2 ? dx / 2 : 0;
    for (let x = LEFT_X + 24 + off; x < RIGHT_X - 16; x += dx) add(x, y, 35);
  }
  return pins;
}

export const PINS = buildPins();

// Spatial grid for pins
const CELL = 40;
const GW = Math.ceil(W / CELL);
const GH = Math.ceil(H / CELL);
export const PIN_GRID: number[][] = Array.from({ length: GW * GH }, () => []);
PINS.forEach((p, i) => {
  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  PIN_GRID[cy * GW + cx].push(i);
});
export function pinsNear(x: number, y: number, out: number[]) {
  out.length = 0;
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  for (let j = cy - 1; j <= cy + 1; j++) {
    if (j < 0 || j >= GH) continue;
    for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || i >= GW) continue;
      const c = PIN_GRID[j * GW + i];
      for (let k = 0; k < c.length; k++) out.push(c[k]);
    }
  }
  return out;
}

function segDist(x: number, y: number, s: Seg) {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(x - (s.ax + ex * t), y - (s.ay + ey * t));
}
