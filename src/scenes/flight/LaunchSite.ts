import Phaser from 'phaser';
import { dither, hash, rgb } from '../../ui/backdrop';
import { TIME_LOOKS, TimeOfDay } from '../../game/timeOfDay';

/**
 * Pixel art for the launch: a dithered sky for the chosen time of day (screen-fixed) and a
 * seaside spaceport (world-fixed). The spaceport is one unique centre piece (the launch
 * complex, a cliff and lighthouse) with seamless tiles either side of it: land and mountains
 * repeating forever to the west, open sea forever to the east, and pixel ground / deep water
 * tiles underneath, so the scene never ends however far the camera wanders.
 * Everything is painted once on small canvases and drawn at PIXEL x scale.
 */
export const PIXEL = 4;

export const daySkyKey = (time: TimeOfDay): string => `day_sky_${time}`;
const SKY_W = 320;
const SKY_H = 180;

export const SITE_KEY = 'launch_site';
export const LAND_TILE_KEY = 'launch_land';
export const SEA_TILE_KEY = 'launch_sea';
export const LAND_DEEP_KEY = 'launch_land_deep';
export const SEA_DEEP_KEY = 'launch_sea_deep';
/** Centre piece width; the pad sits in the middle (global column 0). */
export const SITE_W = 640;
export const SITE_H = 150;
/** Repeat periods of the tiles (columns); every pattern below is periodic in these. */
export const LAND_PERIOD = 320;
export const SEA_PERIOD = 80;
export const DEEP_H = 32;
/** Row of the panorama that sits exactly on the world's ground line (y = 0). */
export const SITE_GROUND_ROW = 90;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, pixel: (x: number, y: number) => number | null): void {
  // Test doubles of the scene may not have a texture manager.
  if (typeof scene.textures?.createCanvas !== 'function' || scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pixel(x, y);
      if (c === null) continue;
      const [r, g, b] = rgb(c);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Puffy pixel cloud: a few overlapping ellipses with a shaded underside. */
const CLOUDS = [
  { x: 40, y: 34, w: 26 },
  { x: 118, y: 22, w: 18 },
  { x: 205, y: 44, w: 30 },
  { x: 282, y: 26, w: 20 },
  { x: 160, y: 70, w: 14 }
];

function cloudAt(x: number, y: number, [body, rim, under]: [number, number, number], only?: number[]): number | null {
  for (const [ci, c] of CLOUDS.entries()) {
    if (only && !only.includes(ci)) continue;
    const lobes = [
      { dx: 0, dy: 0, r: c.w * 0.32 },
      { dx: -c.w * 0.3, dy: c.w * 0.08, r: c.w * 0.22 },
      { dx: c.w * 0.32, dy: c.w * 0.06, r: c.w * 0.24 },
      { dx: c.w * 0.12, dy: -c.w * 0.14, r: c.w * 0.2 }
    ];
    const flatBottom = c.y + c.w * 0.16;
    if (y > flatBottom) continue;
    for (const l of lobes) {
      const d = Math.hypot((x - c.x - l.dx) * 0.8, y - c.y - l.dy);
      if (d > l.r) continue;
      if (y > flatBottom - 2) return under;
      return d > l.r - 1.2 && y > c.y ? rim : body;
    }
  }
  return null;
}

/** A handful of bright stars, each drawn as a small pixel cross. */
const BRIGHT_STARS = [
  { x: 34, y: 18 },
  { x: 96, y: 42 },
  { x: 150, y: 14 },
  { x: 214, y: 30 },
  { x: 252, y: 58 },
  { x: 300, y: 12 }
];

/**
 * Night: a calm sky rather than a starfield. A faint Milky Way haze sweeps across it,
 * dim stars are sparse (denser inside the band) and fade out towards the horizon, and
 * only a few bright stars stand out.
 */
function nightSkyAt(x: number, y: number, base: number): number {
  for (const s of BRIGHT_STARS) {
    const dx = Math.abs(x - s.x);
    const dy = Math.abs(y - s.y);
    if (dx === 0 && dy === 0) return 0xffffff;
    if (dx + dy === 1) return 0x8ea0d4;
  }
  const fade = y / SKY_H; // 0 at the top, 1 at the horizon
  // Milky Way: a soft diagonal band, dithered so it reads as haze, not a stripe.
  const band = Math.abs(y - (8 + x * 0.32)) / 16;
  const haze = Math.max(0, 1 - band) * (1 - fade);
  let c = base;
  if (haze > 0.25 && dither(x, y) < haze * 0.5) c = 0x18224a;
  const n = hash(x * 7, y * 11);
  const density = 0.0025 + haze * 0.012;
  if (n > 1 - density * (1 - fade * 0.9)) c = hash(x, y) > 0.8 ? 0xc4d0f0 : 0x5d6c9c;
  return c;
}

/** Horizontal distance from a feature, wrapped so clouds tile across the sky strip's seam. */
const wrapX = (x: number, cx: number) => ((((x - cx + SKY_W / 2) % SKY_W) + SKY_W) % SKY_W) - SKY_W / 2;

/** 8×8 ordered dither: finer than the 4×4 one, so colours melt into each other without visible bands. */
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
];
const th8 = (x: number, y: number) => (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64;

/** Pick between neighbouring palette colours with the 8×8 dither: a seamless blend along t (0..1). */
function blend(p: readonly number[], t: number, x: number, y: number): number {
  const k = Math.min(1, Math.max(0, t)) * (p.length - 1);
  const i = Math.min(Math.floor(k), p.length - 2);
  return k - i > th8(x, y) ? p[i + 1] : p[i];
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A pixel cloud: a cluster of round lobes on a flat base, taller in the middle. */
interface SkyCloud {
  lobes: Array<{ x: number; y: number; r: number }>;
  base: number;
  left: number;
  right: number;
}

function makeCloud(rand: () => number, cx: number, cy: number, w: number, h: number): SkyCloud {
  const n = 4 + Math.floor(w / 14);
  const lobes = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const bump = Math.sin(t * Math.PI);
    lobes.push({ x: cx - w / 2 + t * w + (rand() - 0.5) * 6, y: cy - bump * h * 0.6 + (rand() - 0.5) * 4, r: h * (0.45 + 0.55 * bump) * (0.8 + rand() * 0.4) });
  }
  return { lobes, base: cy + h * 0.35, left: lobes[0].x, right: lobes[n - 1].x };
}

/** How solid a cloud is at (x, y) (0 outside) and how far down its lobe the point sits (0 top, 1 bottom). */
function cloudSample(c: SkyCloud, x: number, y: number): { dens: number; shade: number; side: number } | null {
  if (y > c.base + 2) return null;
  let best = 0;
  let shade = 0;
  for (const l of c.lobes) {
    const v = 1 - Math.hypot(wrapX(x, l.x) * 0.9, y - l.y) / l.r;
    if (v > best) {
      best = v;
      shade = (y - (l.y - l.r)) / (2 * l.r);
    }
  }
  if (best <= 0) return null;
  const flat = y > c.base ? 1 - (y - c.base) / 2 : 1;
  const side = (wrapX(x, c.left) + 0) / (c.right - c.left + 1);
  return { dens: best * flat, shade, side };
}

interface SkyRecipe {
  /** Gradient top to bottom; blended down to `horizon` rows, then held. */
  sky: number[];
  curve: number;
  /** Cloud shading, top (lit) to bottom (shadow); reversed when lit from below. */
  cloud: number[];
  litBelow?: boolean;
  /** Edge highlight for thin cloud edges (dusk's gold rims, dawn's warm edge). */
  rim?: number;
  /** -1: lit on the left (dawn), 1: lit on the right; shading leans that way. */
  light?: number;
  seed: number;
  /** [centre x, centre y, width, height] in sky pixels. */
  clouds: Array<[number, number, number, number]>;
}

const HORIZON = 150;

const RECIPES: Record<'DAWN' | 'NOON' | 'DUSK', SkyRecipe> = {
  DAWN: {
    sky: TIME_LOOKS.DAWN.sky,
    curve: 1.1,
    cloud: [0xfff4ec, 0xfbd8cf, 0xeeb2b8, 0xc793ad, 0x9a78a6],
    rim: 0xfff2d6,
    light: -1,
    seed: 3,
    clouds: [
      [150, 58, 70, 16],
      [255, 40, 54, 12],
      [60, 82, 46, 10],
      [215, 98, 40, 8]
    ]
  },
  NOON: {
    sky: TIME_LOOKS.NOON.sky,
    curve: 1.3,
    cloud: [0xffffff, 0xf3f7fb, 0xdce7f1, 0xbccddd, 0x94a9c0],
    light: 1,
    seed: 11,
    clouds: [
      [90, 92, 90, 30],
      [205, 110, 70, 22],
      [290, 70, 50, 14],
      [30, 50, 40, 10]
    ]
  },
  DUSK: {
    sky: TIME_LOOKS.DUSK.sky,
    curve: 0.9,
    // The original dusk cloud colours: peach and coral, fading to soft plum, lit from below.
    cloud: [0xffb38a, 0xf8a07a, 0xf08a6a, 0xc66a72, 0x9a4f78],
    litBelow: true,
    rim: 0xffd6a0,
    seed: 9,
    clouds: [
      [110, 70, 60, 7],
      [210, 52, 50, 6],
      [40, 92, 40, 5],
      [290, 86, 36, 5],
      [160, 104, 34, 5]
    ]
  }
};

/** A daytime sky: a seamless dithered gradient and soft-edged, shaded pixel clouds (no sun). */
function paintRecipe(r: SkyRecipe): (x: number, y: number) => number {
  const rand = seeded(r.seed);
  const clouds = r.clouds.map(([cx, cy, w, h]) => makeCloud(rand, cx, cy, w, h));
  return (x, y) => {
    let col = blend(r.sky, Math.pow(Math.min(1, y / HORIZON), r.curve), x, y);
    for (const c of clouds) {
      const q = cloudSample(c, x, y);
      if (!q) continue;
      if (Math.min(1, q.dens / 0.28) <= th8(x + 1, y + 2)) continue;
      let s = q.shade;
      if (r.light) s = s * 0.7 + (r.light < 0 ? q.side : 1 - q.side) * 0.3;
      col = blend(r.cloud, r.litBelow ? 1 - s : s, x, y);
      if (r.rim !== undefined && q.dens < 0.18 && (!r.litBelow || q.shade > 0.55)) col = r.rim;
    }
    return col;
  };
}

export function createDaySkyTexture(scene: Phaser.Scene, time: TimeOfDay): void {
  const look = TIME_LOOKS[time];
  const sky = look.sky;
  if (time !== 'NIGHT') {
    paint(scene, daySkyKey(time), SKY_W, SKY_H, paintRecipe(RECIPES[time]));
    return;
  }
  paint(scene, daySkyKey(time), SKY_W, SKY_H, (x, y) => {
    const cloud = cloudAt(x, y, look.cloud, look.clouds);
    if (cloud !== null) return cloud;
    const t = (y / SKY_H) * (sky.length - 1);
    const i = Math.min(Math.floor(t), sky.length - 2);
    return nightSkyAt(x, y, t - i > dither(x, y) ? sky[i + 1] : sky[i]);
  });
}

interface Peak {
  x: number;
  top: number;
  slope: number;
}

// Columns are global: 0 is the pad, + is east (out to sea). The centre piece covers -320..319.
const HALF = SITE_W / 2;
const G = SITE_GROUND_ROW;
/** Last land column: the cliff top edge. Everything east of SEA_FROM is open water. */
const CLIFF = 90;
export const SEA_FROM = CLIFF + 7;
/** Row where the sea meets the sky (above the ground line: the sea runs off into the distance). */
export const HORIZON_ROW = G - 16;
/** Where land meets the sea the hills start to fall away (centre piece only). */
const COAST_FROM = -20;

const mod = (v: number, m: number) => ((v % m) + m) % m;

// Peaks at tile columns 0..LAND_PERIOD; with the pad at column 0 they sit 95–225 columns west of it.
const FAR_PEAKS: Peak[] = [
  { x: 70, top: 46, slope: 0.65 },
  { x: 150, top: 38, slope: 0.7 },
  { x: 225, top: 54, slope: 0.6 }
];
const NEAR_PEAKS: Peak[] = [
  { x: 95, top: 30, slope: 1.0 },
  { x: 160, top: 46, slope: 0.95 },
  { x: 215, top: 60, slope: 0.9 }
];

/** Is this global column open water? (The sea runs on forever to the east.) */
export function isSeaColumn(gx: number): boolean {
  return Math.round(gx) >= SEA_FROM;
}

function ridge(u: number, peaks: Peak[], seed: number): { row: number; peak: Peak; dx: number } {
  let best = { row: SITE_H, peak: peaks[0], dx: 0 };
  for (const p of peaks) {
    let dx = u - p.x;
    if (dx >= LAND_PERIOD / 2) dx -= LAND_PERIOD;
    else if (dx < -LAND_PERIOD / 2) dx += LAND_PERIOD;
    const row = p.top + Math.abs(dx) * p.slope + (hash(u, p.x + seed) - 0.5) * 2;
    if (row < best.row) best = { row, peak: p, dx };
  }
  return best;
}

/** Layered dirt d rows under the grass, with the odd stone (periodic in u). */
function dirt(u: number, y: number, d: number): number {
  let c: number;
  if (d === 0) c = hash(u, 1) > 0.5 ? 0x9fd46a : 0x86c058;
  else if (d < 3) c = hash(u * 5, y) > 0.3 ? 0x6fae48 : 0x9a6b40;
  else if (d < 5) c = dither(u, y) > 0.6 ? 0x6fae48 : 0x9a6b40;
  else if (d < 18) c = dither(u, y) > 0.55 ? 0x9a6b40 : 0x8a5d36;
  else if (d < 34) c = dither(u, y) > 0.5 ? 0x8a5d36 : 0x744d2c;
  else c = dither(u, y) > 0.6 ? 0x744d2c : 0x5f3f24;
  if (d > 4 && hash(u * 13, y * 17) > 0.992) c = 0xb89a78;
  if (d > 5 && hash(u * 13, (y - 1) * 17) > 0.992) c = 0x5f3f24;
  return c;
}

/** The repeating land: hazy far range, snowy near range, hills, grass and dirt. Periodic in LAND_PERIOD. */
function landAt(gx: number, y: number, hillDrop = 0, mountains = true): number | null {
  const u = mod(gx, LAND_PERIOD);
  if (y >= G) return dirt(u, y, y - G);
  const hill = G - 7 + hillDrop + Math.round(3 * Math.sin((u * Math.PI * 2 * 3) / LAND_PERIOD) + 2 * Math.sin((u * Math.PI * 2 * 7) / LAND_PERIOD + 1));
  if (y >= hill) return y === hill ? 0x9fd46a : dither(u, y) > 0.6 ? 0x6fb04a : 0x7dbb52;
  if (!mountains) return null;

  const near = ridge(u, NEAR_PEAKS, 3);
  if (y >= near.row) {
    const p = near.peak;
    const lit = near.dx < -(y - p.top) * 0.35 + (hash(y, p.x) - 0.5) * 2;
    const snowLine = p.top + 10 + hash(u) * 4;
    if (y < snowLine) {
      if (y > snowLine - 3 && dither(u, y) > 0.5) return lit ? 0x98a3a8 : 0x77838b;
      return y - near.row < 1 ? 0xffffff : lit ? 0xf3f7fb : 0xc9d6e4;
    }
    if (y > G - 14 - hash(u, 9) * 5) return (u + y) % 3 === 0 ? 0x4f8a3c : lit ? 0x6aa84a : 0x5a9440;
    if (hash(u * 3, y * 7) > 0.94) return lit ? 0x838e94 : 0x66717a;
    return lit ? 0x98a3a8 : 0x77838b;
  }

  // Far range: pale and hazy (air perspective).
  const far = ridge(u, FAR_PEAKS, 7);
  if (y >= far.row) {
    const lit = far.dx < -(y - far.peak.top) * 0.4;
    if (y < far.peak.top + 6) return lit ? 0xf4f8fc : 0xdde7f1;
    return lit ? 0xc3d3e4 : 0xadc0d6;
  }
  return null;
}

const SEA = [0xb4dcef, 0x8cc6e6, 0x6aaed9, 0x5197cb, 0x3f82bb, 0x336fa8];

/** Open water from the horizon down: bands get taller towards the viewer. Periodic in SEA_PERIOD. */
function seaAt(gx: number, y: number): number | null {
  const d = y - HORIZON_ROW;
  if (d < 0) return null;
  const u = mod(gx, SEA_PERIOD);
  if (d === 0) return 0xd6eef8;
  const t = Math.min(1, Math.sqrt(d / (SITE_H - HORIZON_ROW))) * (SEA.length - 1);
  const i = Math.min(Math.floor(t), SEA.length - 2);
  let c = t - i > dither(u, y) ? SEA[i + 1] : SEA[i];
  if (hash(Math.floor(u / 5), y * 3) > 0.93 && (u + y) % 5 !== 0) c = d < 10 ? 0xe2f3fb : 0x8cc6e6;
  return c;
}

type Prop = (gx: number, y: number) => number | null;

const STEEL = 0x8e99a6;
const STEEL_DARK = 0x5f6a78;
const WHITE = 0xf2f1ec;
const SHADE = 0xc9cbc6;

/** Palm tree whose trunk base is at column `bx` on row `by`. */
function palm(bx: number, by: number, h: number, lean: number): Prop {
  return (x, y) => {
    const up = by - y;
    if (up < 0 || up > h + 6) return null;
    const tx = bx + Math.round(lean * (up / h) ** 2);
    if (up <= h && (x === tx || x === tx + 1)) return up % 3 === 0 ? 0x7a5230 : 0x9a6a3c;
    const dx = x - (bx + lean);
    const dy = y - (by - h);
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= 7; k++) {
        const droop = Math.floor((k * k) / 12);
        if (dx === dir * k && (dy === droop - 1 || dy === droop)) return dy === droop ? 0x3d8a3a : 0x58b04a;
      }
    }
    if (Math.abs(dx) <= 1 && dy >= -3 && dy <= -1) return 0x58b04a;
    if (Math.abs(dx) <= 1 && dy === 1) return 0x6a4a2a;
    return null;
  };
}

/** Lighthouse on the cliff: red and white bands, a dark lantern room and a cap. */
function lighthouse(cx: number): Prop {
  const h = 34;
  return (x, y) => {
    const up = G - y;
    if (up < 0 || up > h + 7) return null;
    const half = Math.round(4 - (up / h) * 1.5);
    if (up <= h) {
      if (Math.abs(x - cx) > half) return null;
      if (Math.abs(x - cx) <= 1 && up > 12 && up < 16) return 0x2a3140;
      const band = Math.floor(up / 7) % 2 === 0;
      const lit = x <= cx;
      return band ? (lit ? 0xe2463a : 0xb8352c) : lit ? WHITE : SHADE;
    }
    const top = up - h;
    if (top <= 1) return Math.abs(x - cx) <= 4 ? 0x2a3140 : null;
    if (top <= 4) return Math.abs(x - cx) <= 2 ? (Math.abs(x - cx) <= 1 ? 0xffe9a0 : 0x2a3140) : null;
    return Math.abs(x - cx) <= 3 - (top - 5) ? 0xb8352c : null;
  };
}

/** Water tower: a round tank on four legs with cross bracing. */
function waterTower(cx: number): Prop {
  return (x, y) => {
    const up = G - y;
    const dx = x - cx;
    if (up >= 16 && up <= 25) {
      if (Math.abs(dx) > (up === 16 || up === 25 ? 5 : 6)) return null;
      if (up === 21) return 0xd8432f;
      return dx < 0 ? WHITE : SHADE;
    }
    if (up >= 26 && up <= 28) return Math.abs(dx) <= 5 - (up - 26) * 2 ? SHADE : null;
    if (up >= 0 && up < 16) {
      if (dx === -5 || dx === 5 || dx === -2 || dx === 2) return STEEL_DARK;
      if ((up === 5 || up === 11) && Math.abs(dx) <= 5) return STEEL;
      if (Math.abs(dx) <= 5 && (Math.abs(dx) === Math.round((up % 6) * 0.9) || Math.abs(dx) === Math.round((6 - (up % 6)) * 0.9))) return STEEL;
    }
    return null;
  };
}

/** Round propellant tank on a short skirt. */
function fuelSphere(cx: number, r: number, stripe: number): Prop {
  return (x, y) => {
    const cy = G - r - 3;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx + 0.5, dy + 0.5);
    if (d <= r) {
      if (Math.abs(dy) <= 0.5) return stripe;
      if (d > r - 1) return STEEL_DARK;
      return dx + dy < -r * 0.4 ? WHITE : dx + dy > r * 0.5 ? SHADE : 0xe4e5e0;
    }
    if (y > cy && y < G && Math.abs(dx) <= r - 2 && (Math.abs(dx) === r - 2 || Math.abs(dx) === 1)) return STEEL_DARK;
    return null;
  };
}

/** Control bunker: a low concrete block with slit windows and a radar dish on the roof. */
function bunker(x0: number, w: number): Prop {
  return (x, y) => {
    const up = G - y;
    const dx = x - x0;
    if (dx >= 0 && dx < w && up >= 0 && up < 9) {
      if (up === 8) return 0xa8a69c;
      if (up >= 4 && up <= 5 && dx % 5 >= 1 && dx % 5 <= 3) return 0x3a5a7a;
      if (up === 0) return 0x7d7a70;
      return dx < 2 ? 0xc4c1b6 : 0xb4b1a6;
    }
    const mx = x0 + w - 6;
    if (x === mx && up >= 9 && up <= 13) return STEEL_DARK;
    const ddx = x - mx;
    const ddy = up - 16;
    if (Math.abs(ddx) <= 5 && ddy === Math.round((ddx * ddx) / 10) - 2) return WHITE;
    if (Math.abs(ddx) <= 4 && ddy === Math.round((ddx * ddx) / 10) - 1) return SHADE;
    if (ddx === 0 && ddy === 2) return 0xd8432f;
    return null;
  };
}

/** Floodlight mast: a tall thin pole with a lamp bank at the top. */
function floodMast(cx: number, h: number): Prop {
  return (x, y) => {
    const up = G - y;
    if (up < 0 || up > h + 3) return null;
    if (up <= h && x === cx) return STEEL_DARK;
    if (up > h && Math.abs(x - cx) <= 2) return up === h + 2 ? STEEL_DARK : 0xfff3c4;
    return null;
  };
}

/** Bare flagpole (the cloth is drawn live so it can flap). */
function flagpole(cx: number, h: number): Prop {
  return (x, y) => {
    const up = G - y;
    if (up < 0 || up > h) return null;
    return x === cx ? (up === h ? 0xffd23f : 0xd8d8d8) : null;
  };
}

/** Launch-complex props (global columns); WorldRenderer reuses these spots for the live touches. */
export const COMPLEX = {
  lighthouse: { x: 78, top: G - 38 },
  bunker: { x: -124, w: 40 },
  flags: [
    { x: -74, top: G - 26, color: 0x3b6fd8 },
    { x: -68, top: G - 22, color: 0xff8a3d }
  ],
  floods: [
    { x: -42, top: G - 30 },
    { x: 42, top: G - 30 }
  ]
} as const;

const PROPS: Prop[] = [
  palm(64, G, 20, 4),
  palm(-150, G, 16, -3),
  lighthouse(COMPLEX.lighthouse.x),
  ...COMPLEX.flags.map(f => flagpole(f.x, G - f.top)),
  ...COMPLEX.floods.map(f => floodMast(f.x, G - f.top - 3)),
  fuelSphere(48, 6, 0xd8432f),
  fuelSphere(34, 4, 0x3b6fd8),
  waterTower(-56),
  bunker(COMPLEX.bunker.x, COMPLEX.bunker.w)
];

/** The centre piece: land on the west edge matching the land tile, sea on the east edge matching the sea tile. */
function centreAt(gx: number, y: number): number | null {
  if (isSeaColumn(gx)) return seaAt(gx, y);
  for (const prop of PROPS) {
    const c = prop(gx, y);
    if (c !== null) return c;
  }
  if (gx <= COAST_FROM) return landAt(gx, y);

  // Coast: hills fall towards the cliff, the sea shows behind them, and the cliff face drops into the water.
  const d = y - G;
  if (d >= 0) {
    const undercut = Math.min(Math.floor(d / 3), 6);
    if (gx > CLIFF + 6 - undercut) return seaAt(gx, y);
    if (gx > CLIFF - 4 && d < 18) {
      const foot = 14 + Math.round(hash(gx, 2) * 2);
      if (d === foot) return 0xffffff; // surf at the foot of the cliff
      if (d > foot) return seaAt(gx, y);
      return d === 0 ? 0x9fd46a : d % 4 === 0 ? 0x6b5a4c : dither(gx, y) > 0.5 ? 0x8a7562 : 0x7a6656;
    }
    return dirt(mod(gx, LAND_PERIOD), y, d);
  }
  const drop = Math.round(Math.max(0, (gx - COAST_FROM) / (CLIFF - COAST_FROM)) * 4);
  const land = landAt(gx, y, drop, false);
  return land ?? seaAt(gx, y);
}

export function createLaunchSiteTexture(scene: Phaser.Scene): void {
  paint(scene, SITE_KEY, SITE_W, SITE_H, (x, y) => centreAt(x - HALF, y));
}

/** Land tile (west of the centre piece) and sea tile (east of it), same height as the centre piece. */
export function createShoreTiles(scene: Phaser.Scene): void {
  paint(scene, LAND_TILE_KEY, LAND_PERIOD, SITE_H, (x, y) => landAt(x, y));
  paint(scene, SEA_TILE_KEY, SEA_PERIOD, SITE_H, (x, y) => seaAt(x, y));
  // Below the centre piece: more dirt (same pattern as its deepest rows) and deep water.
  paint(scene, LAND_DEEP_KEY, LAND_PERIOD, DEEP_H, (x, y) => dirt(x, y + SITE_H, 60 + y));
  paint(scene, SEA_DEEP_KEY, SEA_PERIOD, DEEP_H, (x, y) => {
    const yy = y + SITE_H;
    let c = dither(x, yy) > 0.5 ? 0x336fa8 : 0x2f68a0;
    if (hash(Math.floor(x / 5), yy * 3) > 0.95 && (x + yy) % 5 !== 0) c = 0x4a8cc4;
    if (hash(x * 7, yy * 13) > 0.996) c = 0x9fd0ea; // a rising bubble
    return c;
  });
}
