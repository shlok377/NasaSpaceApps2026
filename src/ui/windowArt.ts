import Phaser from 'phaser';
import { LaunchWindowId } from '../game/launchWindows';
import { dither, hash, rgb } from './backdrop';

/**
 * Colours of the seashore launch site at each time of day. Shared by the picker
 * previews and the launch-site painter so both always agree.
 */
export interface WindowPalette {
  /** Sky stops, zenith first, horizon last. */
  sky: number[];
  /** Sea stops, horizon first, shore last. */
  sea: number[];
  /** Light glinting on the water (sun or Moon path, wave crests). */
  glint: number;
  sand: [number, number];
  /** Far land silhouettes (headland, town). */
  land: number;
  /** Dune grass / scrub. */
  scrub: number;
  /** Lit windows and beacons (0 = lights off). */
  lights: number;
  stars: boolean;
  /** Sun or Moon disc on the sky ('none' = off-screen). */
  disc: 'sun-high' | 'sun-setting' | 'moon';
  discColor: number;
}

export const WINDOW_PALETTES: Record<LaunchWindowId, WindowPalette> = {
  DAY: {
    sky: [0x2f6fcf, 0x3d80d8, 0x4f93e0, 0x66a6e8, 0x80b9ee, 0x9ccbf2, 0xbfdff6, 0xdcefff],
    sea: [0x2a8fc0, 0x239fbf, 0x23b0c2, 0x35c4c8, 0x5fd6cc],
    glint: 0xeafcff,
    sand: [0xf0d79a, 0xd9b877],
    land: 0x5d8fa8,
    scrub: 0x6aa84a,
    lights: 0,
    stars: false,
    disc: 'sun-high',
    discColor: 0xfff6c8
  },
  SUNSET: {
    sky: [0x1d1226, 0x2a172f, 0x3b1d36, 0x512639, 0x6c3239, 0x8a4438, 0xb85a3c, 0xe07d3e, 0xffa94f, 0xffd27a],
    sea: [0xd0703e, 0x7a3c4a, 0x4a2a48, 0x33203f, 0x2a1b36],
    glint: 0xffd27a,
    sand: [0xa8695a, 0x7f4c4a],
    land: 0x2a1830,
    scrub: 0x3a2236,
    lights: 0xffc86a,
    stars: false,
    disc: 'sun-setting',
    discColor: 0xffe08a
  },
  NIGHT: {
    sky: [0x02030a, 0x040714, 0x070c1f, 0x0b122a, 0x101a36, 0x162244, 0x1d2c52],
    sea: [0x1a2850, 0x111c3c, 0x0c1530, 0x091027, 0x070c20],
    glint: 0xc8dcff,
    sand: [0x3a4258, 0x2a3044],
    land: 0x0a0f1e,
    scrub: 0x141c2c,
    lights: 0xffd27a,
    stars: true,
    disc: 'moon',
    discColor: 0xe8eefc
  }
};

/** Pick a dithered colour along a list of stops at t in [0, 1]. */
export function ramp(stops: readonly number[], t: number, x: number, y: number): number {
  const f = Phaser.Math.Clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(Math.floor(f), stops.length - 2);
  return f - i > dither(x, y) ? stops[i + 1] : stops[i];
}

const PREVIEW_W = 80;
const PREVIEW_H = 50;
export const PREVIEW_SCALE = 3;

export function previewKey(id: LaunchWindowId): string {
  return `window_preview_${id}`;
}

/**
 * A tiny picture of the seashore pad at this time of day for the picker card:
 * sky, sun or Moon, sea with its light path on the right, dunes, town and lighthouse on the left.
 */
export function createWindowPreview(scene: Phaser.Scene, id: LaunchWindowId): string {
  const key = previewKey(id);
  if (typeof scene.textures?.createCanvas !== 'function' || scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, PREVIEW_W, PREVIEW_H);
  if (!tex) return key;
  const p = WINDOW_PALETTES[id];
  const ctx = tex.getContext();
  const img = ctx.createImageData(PREVIEW_W, PREVIEW_H);
  const HORIZON = 31;
  const SHORE = 40; // sea starts right of this column
  const disc = p.disc === 'sun-setting' ? { x: 60, y: HORIZON, r: 6 } : p.disc === 'moon' ? { x: 62, y: 11, r: 4 } : { x: 66, y: 7, r: 4 };

  for (let y = 0; y < PREVIEW_H; y++) {
    for (let x = 0; x < PREVIEW_W; x++) {
      let c = ramp(p.sky, y / HORIZON, x, y);
      // Glow around the sun or Moon.
      const d = Math.hypot(x - disc.x, (y - disc.y) * 1.2);
      if (d < disc.r * 3 && dither(x, y) < 0.16 * (1 - d / (disc.r * 3))) c = p.glint;
      if (d < disc.r && y <= HORIZON) c = p.discColor;
      if (p.stars && y < HORIZON - 6 && hash(x, y * 3) > 0.975) c = hash(y, x) > 0.5 ? 0xffffff : 0xb8c8ff;

      if (y > HORIZON) {
        // Sea on the right, with the light path under the disc and a few wave crests.
        const t = (y - HORIZON) / (PREVIEW_H - HORIZON);
        c = ramp(p.sea, t, x, y);
        const path = Math.abs(x - disc.x) < 2 + t * 6 + Math.sin(y * 2.3) * 1.5;
        if (path && dither(x, y) > 0.35 + t * 0.4) c = p.glint;
        if (hash(x * 7, y * 5) > 0.95) c = p.glint;
      }

      // Land on the left: a headland with a lighthouse, town roofs, then dunes down to the beach.
      const dune = HORIZON + 4 - Math.round(2 * Math.sin(x * 0.35) + (x < 14 ? (14 - x) * 0.9 : 0)) + Math.max(0, x - SHORE + 6) * 0.7;
      if (x < SHORE + 4 && y >= dune) {
        const below = y - dune;
        c = below < 1 ? p.scrub : ramp(p.sand, below / 10, x, y);
      }
      const town = x > 14 && x < 26 && y >= HORIZON - 2 - (x % 4 < 2 ? 2 : 0) && y < dune;
      if (town) c = p.land;
      if (town && p.lights && hash(x, y) > 0.7) c = p.lights;
      const lighthouse = x >= 5 && x <= 6 && y >= 14 && y < dune;
      if (lighthouse) c = y < 16 ? (p.lights || 0xfff3d6) : y % 3 === 0 ? 0xd94a4a : 0xf4eee6;

      // The pad's tower right at the shore.
      if (x === SHORE - 2 && y >= HORIZON - 12 && y < dune) c = id === 'NIGHT' ? 0x1e2638 : 0x3a2f40;
      if (x === SHORE - 1 && y >= HORIZON - 9 && y < dune && y % 2 === 0) c = id === 'NIGHT' ? 0x1e2638 : 0x3a2f40;
      if (p.lights && x === SHORE - 2 && y === HORIZON - 13) c = 0xff4f4f;

      const [r, g, b] = rgb(c);
      const i = (y * PREVIEW_W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
