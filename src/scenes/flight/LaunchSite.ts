import Phaser from 'phaser';
import { dither, hash, rgb } from '../../ui/backdrop';

/**
 * Daylight pixel art for the launch: a light dithered sky (screen-fixed) and a
 * launch-site panorama (world-fixed: mountains either side, hills, grass and dirt).
 * Both are painted once on small canvases and drawn at PIXEL x scale.
 */
export const PIXEL = 4;

export const DAY_SKY_KEY = 'day_sky';
const SKY_W = 320;
const SKY_H = 180;
const DAY_SKY = [0x7fb8e8, 0x8cc2ec, 0x9bcbef, 0xabd4f2, 0xbcdcf4, 0xcde5f6, 0xdcecf7, 0xe9f3f8];

export const SITE_KEY = 'launch_site';
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

function cloudAt(x: number, y: number): number | null {
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
      if (y > flatBottom - 2) return 0xd6e6f2;
      return d > l.r - 1.2 && y > c.y ? 0xe8f1f8 : 0xffffff;
    }
  }
  return null;
}

export function createDaySkyTexture(scene: Phaser.Scene): void {
  paint(scene, DAY_SKY_KEY, SKY_W, SKY_H, (x, y) => {
    const cloud = cloudAt(x, y);
    if (cloud !== null) return cloud;
    const t = (y / SKY_H) * (DAY_SKY.length - 1);
    const i = Math.min(Math.floor(t), DAY_SKY.length - 2);
    return t - i > dither(x, y) ? DAY_SKY[i + 1] : DAY_SKY[i];
  });
}

interface Peak {
  x: number;
  top: number;
  slope: number;
}

// x in panorama pixels; the pad sits at the centre (x = 320). Keep peaks clear of it.
const FAR_PEAKS: Peak[] = [
  { x: 150, top: 40, slope: 0.7 },
  { x: 215, top: 52, slope: 0.6 },
  { x: 420, top: 50, slope: 0.6 },
  { x: 495, top: 36, slope: 0.7 },
  { x: 575, top: 46, slope: 0.65 },
  { x: 60, top: 48, slope: 0.65 }
];
const NEAR_PEAKS: Peak[] = [
  { x: 95, top: 28, slope: 1.0 },
  { x: 160, top: 46, slope: 0.95 },
  { x: 222, top: 62, slope: 0.9 },
  { x: 418, top: 60, slope: 0.9 },
  { x: 478, top: 42, slope: 0.95 },
  { x: 548, top: 26, slope: 1.0 },
  { x: 615, top: 40, slope: 1.0 }
];

function ridge(x: number, peaks: Peak[], seed: number): { row: number; peak: Peak } {
  let best = { row: SITE_H, peak: peaks[0] };
  for (const p of peaks) {
    const row = p.top + Math.abs(x - p.x) * p.slope + (hash(x, p.x + seed) - 0.5) * 2;
    if (row < best.row) best = { row, peak: p };
  }
  return best;
}

export function createLaunchSiteTexture(scene: Phaser.Scene): void {
  const G = SITE_GROUND_ROW;
  paint(scene, SITE_KEY, SITE_W, SITE_H, (x, y) => {
    let color: number | null = null;

    // Far range: pale and hazy (daylight air perspective).
    const far = ridge(x, FAR_PEAKS, 7);
    if (y >= far.row) {
      const lit = x < far.peak.x - (y - far.peak.top) * 0.4;
      color = lit ? 0xc3d3e4 : 0xadc0d6;
      if (y < far.peak.top + 6) color = lit ? 0xf4f8fc : 0xdde7f1;
    }

    // Near range: rocky slate with snow caps, lit from the left.
    const near = ridge(x, NEAR_PEAKS, 3);
    if (y >= near.row) {
      const p = near.peak;
      const lit = x < p.x - (y - p.top) * 0.35 + (hash(y, p.x) - 0.5) * 2;
      const snowLine = p.top + 10 + hash(x) * 4;
      if (y < snowLine) {
        color = y - near.row < 1 ? 0xffffff : lit ? 0xf3f7fb : 0xc9d6e4;
        if (y > snowLine - 3 && dither(x, y) > 0.5) color = lit ? 0x98a3a8 : 0x77838b;
      } else {
        color = lit ? 0x98a3a8 : 0x77838b;
        if (hash(x * 3, y * 7) > 0.94) color = lit ? 0x838e94 : 0x66717a;
        // Green foothills creep up the base of each mountain.
        const tree = G - 14 - hash(x, 9) * 5;
        if (y > tree) color = (x + y) % 3 === 0 ? 0x4f8a3c : lit ? 0x6aa84a : 0x5a9440;
      }
    }

    // Rolling hills in front of everything.
    const hill = G - 7 + Math.round(3 * Math.sin(x * 0.05) + 2 * Math.sin(x * 0.13 + 1));
    if (y >= hill && y < G) color = y === hill ? 0x9fd46a : dither(x, y) > 0.6 ? 0x6fb04a : 0x7dbb52;

    // Ground: grass lip, then layered dirt with pebbles.
    if (y >= G) {
      const d = y - G;
      if (d === 0) color = hash(x, 1) > 0.5 ? 0x9fd46a : 0x86c058;
      else if (d < 3) color = hash(x * 5, y) > 0.3 ? 0x6fae48 : 0x9a6b40;
      else if (d < 5) color = dither(x, y) > 0.6 ? 0x6fae48 : 0x9a6b40;
      else if (d < 18) color = dither(x, y) > 0.55 ? 0x9a6b40 : 0x8a5d36;
      else if (d < 34) color = dither(x, y) > 0.5 ? 0x8a5d36 : 0x744d2c;
      else color = dither(x, y) > 0.6 ? 0x744d2c : 0x5f3f24;
      // Sparse stones: a light top pixel with a shadow underneath.
      if (d > 4 && hash(x * 13, y * 17) > 0.992) color = 0xb89a78;
      if (d > 5 && hash(x * 13, (y - 1) * 17) > 0.992) color = 0x5f3f24;
    }

    return color;
  });
}
