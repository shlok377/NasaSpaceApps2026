import Phaser from 'phaser';
import { dither, hash, rgb } from '../../ui/backdrop';
import { TIME_LOOKS, TimeOfDay } from '../../game/timeOfDay';

/**
 * Pixel art for the launch: a dithered sky for the chosen time of day (screen-fixed) and a
 * seaside spaceport panorama (world-fixed): mountains and the launch complex on the land to
 * the left, a cliff with a lighthouse, then ocean out to the horizon on the right.
 * Both are painted once on small canvases and drawn at PIXEL x scale. The panorama
 * wraps horizontally (and the far range is its own layer) so it can be tiled forever.
 */
export const PIXEL = 4;

export const daySkyKey = (time: TimeOfDay): string => `day_sky_${time}`;
const SKY_W = 320;
const SKY_H = 180;

export const SITE_KEY = 'launch_site';
export const SITE_FAR_KEY = 'launch_site_far';
const SITE_W = 640;
const SITE_H = 150;
/** Row of the panorama that sits exactly on the world's ground line (y = 0). */
export const SITE_GROUND_ROW = 90;
export const SITE_SIZE = { width: SITE_W * PIXEL, height: SITE_H * PIXEL };

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

function cloudAt(x: number, y: number, [body, rim, under]: [number, number, number]): number | null {
  for (const c of CLOUDS) {
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

export function createDaySkyTexture(scene: Phaser.Scene, time: TimeOfDay): void {
  const look = TIME_LOOKS[time];
  const sky = look.sky;
  paint(scene, daySkyKey(time), SKY_W, SKY_H, (x, y) => {
    const cloud = cloudAt(x, y, look.cloud);
    if (cloud !== null) return cloud;
    // Night: sparse stars, a few of them bright, thinning towards the horizon.
    if (look.stars && hash(x * 7, y * 11) > 0.985 + (y / SKY_H) * 0.012) return hash(x, y) > 0.7 ? 0xffffff : 0x9fb0d8;
    const t = (y / SKY_H) * (sky.length - 1);
    const i = Math.min(Math.floor(t), sky.length - 2);
    return t - i > dither(x, y) ? sky[i + 1] : sky[i];
  });
}

interface Peak {
  x: number;
  top: number;
  slope: number;
}

// x in panorama pixels; the pad sits at the centre (x = 320) and spans 290–350.
// Land runs from the beach (x ≈ 0–36) to the cliff (x = 410); past it is open sea,
// which wraps round to the beach so the panorama still tiles.
export const PAD_COLUMN = 320;
const BEACH_END = 36;
const CLIFF = 410;
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
/** Row where the sea meets the sky (above the ground line: the sea runs off into the distance). */
export const HORIZON_ROW = SITE_GROUND_ROW - 16;

/** Is this panorama column open water (the shore and cliff count as land)? */
export function isSeaColumn(x: number): boolean {
  const c = ((Math.round(x) % SITE_W) + SITE_W) % SITE_W;
  return c > CLIFF + 6;
}

/** Signed horizontal distance from a peak, wrapped so the panorama tiles seamlessly. */
function wrapDx(x: number, px: number): number {
  let d = x - px;
  if (d >= SITE_W / 2) d -= SITE_W;
  else if (d < -SITE_W / 2) d += SITE_W;
  return d;
}

function ridge(x: number, peaks: Peak[], seed: number): { row: number; peak: Peak; dx: number } {
  let best = { row: SITE_H, peak: peaks[0], dx: 0 };
  for (const p of peaks) {
    const dx = wrapDx(x, p.x);
    const row = p.top + Math.abs(dx) * p.slope + (hash(x, p.x + seed) - 0.5) * 2;
    if (row < best.row) best = { row, peak: p, dx };
  }
  return best;
}

/** Far range on its own layer: pale and hazy (air perspective), only over the land. */
export function createLaunchSiteFarTexture(scene: Phaser.Scene): void {
  paint(scene, SITE_FAR_KEY, SITE_W, SITE_H, (x, y) => {
    if (x > CLIFF - 20 || y >= HORIZON_ROW + 4) return null;
    const far = ridge(x, FAR_PEAKS, 7);
    if (y < far.row) return null;
    const lit = far.dx < -(y - far.peak.top) * 0.4;
    if (y < far.peak.top + 6) return lit ? 0xf4f8fc : 0xdde7f1;
    return lit ? 0xc3d3e4 : 0xadc0d6;
  });
}

const SEA = [0xb4dcef, 0x8cc6e6, 0x6aaed9, 0x5197cb, 0x3f82bb, 0x336fa8];

function seaAt(x: number, y: number): number {
  const d = y - HORIZON_ROW;
  if (d === 0) return 0xd6eef8;
  // Bands get taller towards the viewer, dithered where they meet.
  const t = Math.sqrt(d / (SITE_H - HORIZON_ROW)) * (SEA.length - 1);
  const i = Math.min(Math.floor(t), SEA.length - 2);
  let c = t - i > dither(x, y) ? SEA[i + 1] : SEA[i];
  // Short horizontal wave crests.
  if (hash(Math.floor(x / 5), y * 3) > 0.93 && (x + y) % 5 !== 0) c = d < 10 ? 0xe2f3fb : 0x8cc6e6;
  return c;
}

type Prop = (x: number, y: number) => number | null;

const G = SITE_GROUND_ROW;
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
    // Fronds: arcs drooping out from the top.
    const dx = x - (bx + lean);
    const dy = y - (by - h);
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= 7; k++) {
        if (dx === dir * k && (dy === Math.floor((k * k) / 12) - 1 || dy === Math.floor((k * k) / 12))) return dy === Math.floor((k * k) / 12) ? 0x3d8a3a : 0x58b04a;
      }
    }
    if (Math.abs(dx) <= 1 && dy >= -3 && dy <= -1) return 0x58b04a;
    if (Math.abs(dx) <= 1 && dy === 1) return 0x6a4a2a; // coconuts
    return null;
  };
}

/** Lighthouse on the cliff: red and white bands, a black lantern room and a cap. */
function lighthouse(cx: number): Prop {
  const h = 34;
  return (x, y) => {
    const up = G - y;
    if (up < 0 || up > h + 7) return null;
    const half = Math.round(4 - (up / h) * 1.5);
    if (up <= h) {
      if (Math.abs(x - cx) > half) return null;
      const band = Math.floor(up / 7) % 2 === 0;
      const lit = x <= cx;
      if (Math.abs(x - cx) <= 1 && up > 12 && up < 16) return 0x2a3140; // window
      return band ? (lit ? 0xe2463a : 0xb8352c) : lit ? WHITE : SHADE;
    }
    const top = up - h;
    if (top <= 1) return Math.abs(x - cx) <= 4 ? 0x2a3140 : null; // gallery
    if (top <= 4) return Math.abs(x - cx) <= 2 ? (Math.abs(x - cx) <= 1 ? 0xffe9a0 : 0x2a3140) : null; // lantern
    return Math.abs(x - cx) <= 3 - (top - 5) ? 0xb8352c : null; // cap
  };
}

/** Water tower: a round tank on four legs with cross bracing. */
function waterTower(cx: number): Prop {
  return (x, y) => {
    const up = G - y;
    const dx = x - cx;
    if (up >= 16 && up <= 25) {
      const r = Math.abs(dx);
      const width = up === 16 || up === 25 ? 5 : 6;
      if (r > width) return null;
      if (up === 21) return 0xd8432f; // painted band
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
    // Dish on a mast near the right end, tipped up towards the sky.
    const mx = x0 + w - 6;
    if (x === mx && up >= 9 && up <= 13) return STEEL_DARK;
    const ddx = x - mx;
    const ddy = up - 16;
    if (ddy >= -3 && ddy <= 2 && Math.abs(ddx) <= 5) {
      if (Math.abs(ddx) >= 5 - Math.max(0, -ddy) * 0 && ddy === Math.round((ddx * ddx) / 10) - 2) return WHITE;
      if (ddy === Math.round((ddx * ddx) / 10) - 1 && Math.abs(ddx) <= 4) return SHADE;
    }
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
    if (x === cx) return up === h ? 0xffd23f : 0xd8d8d8;
    return null;
  };
}

/** Launch-complex props in front-to-back order (first match wins). Columns/heights are reused by WorldRenderer. */
export const COMPLEX = {
  lighthouse: { x: 398, top: G - 38 },
  flags: [
    { x: 246, top: G - 26, color: 0x3b6fd8 },
    { x: 252, top: G - 22, color: 0xff8a3d }
  ],
  floods: [
    { x: 278, top: G - 30 },
    { x: 362, top: G - 30 }
  ]
} as const;

const PROPS: Prop[] = [
  palm(24, G + 3, 18, -4),
  palm(12, G + 6, 14, 3),
  palm(384, G, 20, 4),
  lighthouse(COMPLEX.lighthouse.x),
  ...COMPLEX.flags.map(f => flagpole(f.x, G - f.top)),
  ...COMPLEX.floods.map(f => floodMast(f.x, G - f.top - 3)),
  fuelSphere(368, 6, 0xd8432f),
  fuelSphere(354, 4, 0x3b6fd8),
  waterTower(264),
  bunker(196, 40)
];

export function createLaunchSiteTexture(scene: Phaser.Scene): void {
  paint(scene, SITE_KEY, SITE_W, SITE_H, (x, y) => {
    // Beach: sand rising out of the sea at the left edge (where the sea wraps round).
    const sea = x > CLIFF + 6;
    const beachTop = x < BEACH_END ? G + Math.round(9 * (1 - x / BEACH_END) ** 1.5) : G;

    for (const prop of PROPS) {
      const c = prop(x, y);
      if (c !== null) return c;
    }

    let color: number | null = null;
    // The sea runs behind the coast too, so the hills near the cliff sit in front of it.
    if (y >= HORIZON_ROW && (sea || x > 300 || (x < BEACH_END && y < beachTop + 1))) color = seaAt(x, y);

    // Near range: rocky slate with snow caps, lit from the left (land side only).
    if (!sea && x < CLIFF - 30) {
      const near = ridge(x, NEAR_PEAKS, 3);
      if (y >= near.row && y < G) {
        const p = near.peak;
        const lit = near.dx < -(y - p.top) * 0.35 + (hash(y, p.x) - 0.5) * 2;
        const snowLine = p.top + 10 + hash(x) * 4;
        if (y < snowLine) {
          color = y - near.row < 1 ? 0xffffff : lit ? 0xf3f7fb : 0xc9d6e4;
          if (y > snowLine - 3 && dither(x, y) > 0.5) color = lit ? 0x98a3a8 : 0x77838b;
        } else {
          color = lit ? 0x98a3a8 : 0x77838b;
          if (hash(x * 3, y * 7) > 0.94) color = lit ? 0x838e94 : 0x66717a;
          const tree = G - 14 - hash(x, 9) * 5;
          if (y > tree) color = (x + y) % 3 === 0 ? 0x4f8a3c : lit ? 0x6aa84a : 0x5a9440;
        }
      }
    }

    // Rolling dunes and grass between the beach and the cliff, lower towards the sea.
    if (!sea && x >= BEACH_END) {
      const fall = Math.max(0, (x - 300) / (CLIFF - 300));
      const hill = G - 7 + Math.round(fall * 4) + Math.round(3 * Math.sin(x * ((Math.PI * 2 * 5) / SITE_W)) + 2 * Math.sin(x * ((Math.PI * 2 * 13) / SITE_W) + 1));
      if (y >= hill && y < G) color = y === hill ? 0x9fd46a : dither(x, y) > 0.6 ? 0x6fb04a : 0x7dbb52;
    }

    // Sand on the beach.
    if (x < BEACH_END && y >= beachTop) {
      const d = y - beachTop;
      color = d === 0 ? 0xf6e2a8 : dither(x, y) > 0.55 ? 0xe8cc8a : 0xd9b977;
      if (d === 0 && hash(x, 4) > 0.6) color = 0xffffff; // surf
    }

    // Ground: grass lip, then layered dirt. The cliff face drops into the sea at the right.
    if (!sea && x >= BEACH_END && y >= G) {
      const d = y - G;
      const face = x > CLIFF - 4;
      if (face) {
        // Rock face: banded, darker towards the water, with surf at its foot.
        const foot = G + 14 + Math.round(hash(x, 2) * 2);
        if (y >= foot) return y === foot ? 0xffffff : seaAt(x, y);
        if (x > CLIFF + 6 - Math.floor(d / 3)) return y >= HORIZON_ROW ? seaAt(x, y) : null;
        return d === 0 ? 0x9fd46a : d % 4 === 0 ? 0x6b5a4c : dither(x, y) > 0.5 ? 0x8a7562 : 0x7a6656;
      }
      if (d === 0) color = hash(x, 1) > 0.5 ? 0x9fd46a : 0x86c058;
      else if (d < 3) color = hash(x * 5, y) > 0.3 ? 0x6fae48 : 0x9a6b40;
      else if (d < 5) color = dither(x, y) > 0.6 ? 0x6fae48 : 0x9a6b40;
      else if (d < 18) color = dither(x, y) > 0.55 ? 0x9a6b40 : 0x8a5d36;
      else if (d < 34) color = dither(x, y) > 0.5 ? 0x8a5d36 : 0x744d2c;
      else color = dither(x, y) > 0.6 ? 0x744d2c : 0x5f3f24;
      if (d > 4 && hash(x * 13, y * 17) > 0.992) color = 0xb89a78;
      if (d > 5 && hash(x * 13, (y - 1) * 17) > 0.992) color = 0x5f3f24;
    }

    return color;
  });
}
