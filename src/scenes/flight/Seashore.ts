import Phaser from 'phaser';
import { LaunchWindowId } from '../../game/launchWindows';
import { WORLD } from '../../physics/constants';
import { dither, hash, rgb } from '../../ui/backdrop';
import { WINDOW_PALETTES, WindowPalette, ramp } from '../../ui/windowArt';
import { pxEllipse, pxRect, pxRing, pxTriangle } from './pixelDraw';

/**
 * The seashore launch site, painted for the chosen launch window (Day, Sunset or Night).
 *
 * Everything is pixel art on small canvases drawn at PIXEL x scale, in back-to-front layers:
 * a sky that hangs on the sea horizon, the setting sun, a far layer (open sea, a coastal town,
 * a lighthouse headland, islands and a ship) that drifts at a slower parallax, and a near layer
 * (dunes with palms on the left, the beach, then surf on the right). Land runs on forever to the
 * left and sea forever to the right: each layer is a unique centre piece around the pad plus a
 * repeating tile on either side. A live overlay animates the water, the lighthouse beam, gulls,
 * searchlights, the exhaust glow on the water at liftoff, and the climb (cloud deck, curved horizon).
 */
export const PIXEL = 4;
const SITE_H = 150;
/** Panorama row that sits exactly on the world's ground line (y = 0). */
export const SITE_GROUND_ROW = 90;
const G = SITE_GROUND_ROW;
/** Row of the sea horizon in the panorama. */
const HORIZON = 70;
/** Where the beach meets the water, in texels right of the pad. */
const SHORE = 66;
const FAR_PARALLAX = 0.85;
/** The sun sits on the horizon this many far-layer texels right of the pad. */
const SUN_TX = 104;
/** Thick cloud deck the rocket bursts through (metres). */
const DECK = 1_500;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (a: number, b: number, x: number) => {
  const t = Phaser.Math.Clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerpColor = (c1: number, c2: number, t: number): number => {
  const [r1, g1, b1] = rgb(c1);
  const [r2, g2, b2] = rgb(c2);
  const k = Phaser.Math.Clamp(t, 0, 1);
  return (Math.round(r1 + (r2 - r1) * k) << 16) | (Math.round(g1 + (g2 - g1) * k) << 8) | Math.round(b1 + (b2 - b1) * k);
};

type PixelFn = (tx: number, y: number) => number | null;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, x0: number, fn: PixelFn): void {
  if (typeof scene.textures?.createCanvas !== 'function' || scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x0 + x, y);
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

/**
 * One parallax layer: a unique centre piece (texels -half..half around the pad) with a
 * tile of `period` texels repeating forever on each side. The pixel function must repeat
 * with that period outside the centre so the joins are seamless.
 */
class Strip {
  private readonly left?: Phaser.GameObjects.TileSprite;
  private readonly centre?: Phaser.GameObjects.Image;
  private readonly right?: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene, key: string, private readonly half: number, private readonly period: number, fn: PixelFn) {
    paint(scene, `${key}_l`, period, SITE_H, -half - period, fn);
    paint(scene, `${key}_c`, half * 2, SITE_H, -half, fn);
    paint(scene, `${key}_r`, period, SITE_H, half, fn);
    this.left = scene.add.tileSprite?.(0, 0, 1280, SITE_H * PIXEL, `${key}_l`);
    this.centre = scene.add.image?.(0, 0, `${key}_c`);
    this.right = scene.add.tileSprite?.(0, 0, 1280, SITE_H * PIXEL, `${key}_r`);
    for (const t of [this.left, this.right]) {
      t?.setOrigin?.(0, 0);
      t?.setTileScale?.(PIXEL, PIXEL);
    }
    this.centre?.setOrigin?.(0, 0);
    this.centre?.setScale?.(PIXEL);
  }

  /** `padX`: screen x of texel 0 (the pad); `top`: screen y of row 0. */
  place(padX: number, top: number, visible: boolean): void {
    const cl = Math.round(padX - this.half * PIXEL);
    const cr = Math.round(padX + this.half * PIXEL);
    this.centre?.setPosition?.(cl, top);
    this.centre?.setVisible?.(visible);
    if (this.left) {
      this.left.setPosition(cl - 1280, top).setVisible(visible && cl > 0);
      // Texel under the left tile's first column, wrapped into the tile.
      this.left.tilePositionX = mod((cl - 1280 - padX) / PIXEL + this.half + this.period, this.period);
    }
    if (this.right) {
      this.right.setPosition(cr, top).setVisible(visible && cr < 1280);
      this.right.tilePositionX = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Dune height (rows above the ground line) on the land side; 0 at the pad. */
function landSurface(tx: number): number {
  if (tx > 34) return G + Math.min(3, Math.round(((tx - 34) / (SHORE - 34)) * 3));
  const b = smooth(-34, -110, tx);
  const dune = 6 + 4 * Math.sin((tx * Math.PI * 2) / 160) + 2 * Math.sin((tx * Math.PI * 2) / 64 + 1);
  return G - Math.round(b * dune);
}

/** A leaning palm as pixel offsets from its base: trunk, then drooping fronds. */
const PALM = (() => {
  const px = new Map<string, 'trunk' | 'lit' | 'shade'>();
  const H = 26;
  for (let k = 0; k <= H; k++) {
    const x = Math.round(5 * (k / H) ** 2);
    px.set(`${x},${-k}`, 'trunk');
    if (k % 3 !== 0) px.set(`${x + 1},${-k}`, 'trunk');
  }
  // Each frond arcs up from the crown and bends over, with leaflets hanging off it.
  const fronds: Array<[number, number, number]> = [
    [-1, 70, 12], [-1, 40, 13], [-1, 12, 11],
    [1, 75, 12], [1, 45, 13], [1, 15, 11], [1, -10, 8], [-1, -12, 8]
  ];
  fronds.forEach(([dir, a0, len], n) => {
    let x = 5;
    let y = -H;
    let a = (a0 * Math.PI) / 180;
    for (let i = 0; i < len; i++) {
      x += dir * Math.cos(a);
      y -= Math.sin(a);
      a -= 0.2;
      const fx = Math.round(x);
      const fy = Math.round(y);
      px.set(`${fx},${fy}`, n % 3 === 1 ? 'shade' : 'lit');
      if (i > 2 && i % 2 === 0) px.set(`${fx},${fy + 1}`, 'shade');
      if (i > 4 && i % 3 === 0) px.set(`${fx},${fy + 2}`, 'shade');
    }
  });
  // Coconuts under the crown.
  px.set('4,-25', 'trunk');
  px.set('6,-25', 'trunk');
  return px;
})();

const NEAR_HALF = 240;
const NEAR_PERIOD = 320;

function nearPixel(p: WindowPalette): PixelFn {
  return (tx, y) => {
    const n = mod(tx, NEAR_PERIOD);
    if (tx < SHORE) {
      // Palms every 160 texels along the dunes, well clear of the pad.
      const off = mod(tx + 120, 160);
      const dx = off <= 80 ? off : off - 160;
      const base = tx - dx;
      if (base <= -120) {
        const hit = PALM.get(`${dx},${y - landSurface(base)}`);
        if (hit) return hit === 'trunk' ? p.trunk : hit === 'lit' ? p.palm[0] : p.palm[1];
      }
      const surf = landSurface(tx);
      // Scrub tufts on the dune crests.
      if (tx < -40 && y < surf && y >= surf - 2 && hash(n, 7) > 0.72 && (y === surf - 1 || hash(n, 8) > 0.5)) return p.scrub;
      if (y < surf) return null;
      const d = y - surf;
      const wet = smooth(44, SHORE, tx);
      if (d === 0) return tx < -40 && hash(n, 3) > 0.6 ? p.scrub : wet > 0.5 ? p.sandDeep[0] : p.sand[0];
      if (d < 10) {
        const c = ramp(p.sand, d / 10, n, y);
        return wet > dither(n, y) ? p.sandDeep[0] : c;
      }
      if (hash(n * 13, y * 17) > 0.985) return p.sand[0];
      return ramp(p.sandDeep, (d - 10) / 40, n, y);
    }
    // Surf: foam on the wave line, then water darkening with depth.
    if (y < G + 2) return null;
    const d = y - (G + 2);
    if (d === 0) return hash(n, 5) > 0.45 ? p.foam : p.sea[2];
    if (d === 1 && hash(n, 6) > 0.7) return p.foam;
    // The beach keeps sloping down under the water, seen through the shallows.
    const bed = G + 4 + (tx - SHORE) * 0.4;
    if (y >= bed) {
      const under = ramp(p.sandDeep, (y - bed) / 30, n, y);
      return lerpColor(under, p.sea[4], y - bed < 2 ? 0.3 : 0.55);
    }
    return ramp(p.sea, 0.45 + (d / 58) * 0.55, n, y);
  };
}

const FAR_HALF = 240;
const FAR_PERIOD = 640;

function farPixel(p: WindowPalette, id: LaunchWindowId): PixelFn {
  const lit = p.lights || 0xfff3d6;
  return (tx, y) => {
    const m = mod(tx, FAR_PERIOD);
    const bl = smooth(-20, -60, tx);
    const br = smooth(20, 60, tx);

    // Land side: low hills on the far shore, a little town and a lighthouse on its headland.
    if (bl > 0) {
      const hills = HORIZON - Math.round(bl * (3 + 2 * Math.sin((tx * Math.PI * 2) / 320) + 1.5 * Math.sin((tx * Math.PI * 2) / 128 + 2)));
      const cliff = m >= 460 && m < 520 ? Math.round(bl * (10 - Math.abs(m - 489) * 0.32)) : 0;
      const ground = Math.min(hills, HORIZON - Math.max(0, cliff));
      // Lighthouse: striped tower with a lamp room on the headland.
      if (bl === 1 && m >= 488 && m <= 491 && y >= ground - 18 && y < ground) {
        if (y < ground - 15) return y === ground - 18 ? p.land : lit;
        return mod(y, 4) < 2 ? 0xd94a4a : 0xf4eee6;
      }
      // Town: blocks of houses with lit windows.
      if (bl === 1 && m >= 512 && m < 596) {
        const block = Math.floor((m - 512) / 7);
        const roof = ground - 4 - Math.round(hash(block, 31) * 8);
        if (y >= roof && y < ground) {
          const wx = mod(m - 512, 7);
          const lit2 = wx >= 2 && wx <= 4 && mod(y - roof, 3) === 1 && hash(m, y) > 0.35;
          if (lit2 && p.lights) return p.lights;
          return y === roof ? lerpColor(p.land, p.sky[p.sky.length - 1], 0.25) : p.land;
        }
      }
      if (y >= ground && y < HORIZON) return p.land;
    }

    // Sea side: islands and a ship on the horizon.
    if (br > 0) {
      const island = (c: number, w: number, h: number) => Math.max(0, h * (1 - ((m - c) / w) ** 2));
      const top = HORIZON - Math.round(br * Math.max(island(150, 22, 5), island(330, 40, 9)));
      if (y >= top && y < HORIZON) return p.land;
      const sx = m - 520;
      if (br === 1 && sx >= 0 && sx < 10) {
        if (y === HORIZON - 1 || (y === HORIZON - 2 && sx > 0 && sx < 9)) return p.land;
        if (y === HORIZON - 3 && sx >= 3 && sx < 7) return p.lights && sx % 2 ? p.lights : p.land;
        if (y < HORIZON - 3 && y >= HORIZON - 7 && sx === 5) return y === HORIZON - 7 && p.lights ? 0xff4f4f : p.land;
      }
    }

    if (y < HORIZON) return null;
    // Open water: a bright horizon line, then bands that darken toward the shore.
    if (y === HORIZON) return id === 'NIGHT' ? p.sea[0] : lerpColor(p.sea[0], p.glint, 0.5);
    const t = (y - HORIZON) / (SITE_H - HORIZON);
    if (hash(Math.floor(m / 3), y * 7) > 0.94 - t * 0.04) return lerpColor(ramp(p.sea, t * 1.4, m, y), p.glint, 0.35);
    return ramp(p.sea, t * 1.4, m, y);
  };
}

const SKY_W = 320;
const SKY_H = 110;

function skyPixel(p: WindowPalette, id: LaunchWindowId): PixelFn {
  return (x, y) => {
    let c = ramp(p.sky, y / SKY_H, x, y);
    if (id === 'NIGHT') {
      // A faint Milky Way leaning across the sky, then stars.
      const band = Math.abs(y - (90 - x * 0.28));
      if (band < 9 && dither(x, y) < 0.25 * (1 - band / 9) + hash(x, y) * 0.1) c = 0x1f2a50;
      if (hash(x, y * 3) > 0.993 - (1 - y / SKY_H) * 0.004) c = hash(y, x) > 0.6 ? 0xffffff : 0xb8c8ff;
      if (hash(x * 3, y) > 0.995 && y < 80) c = 0xfff2c8;
    } else if (id === 'SUNSET') {
      // Glow around where the sun sets, and thin lit streaks of cloud.
      const d = Math.hypot(x - 262, (y - SKY_H) * 1.6);
      if (d < 70 && dither(x, y) < 0.5 * (1 - d / 70)) c = lerpColor(c, p.discColor, 0.45);
      const streak = Math.abs(y - (64 + 10 * Math.sin(x * 0.02)));
      if (streak < 1.2 && hash(Math.floor(x / 9), 4) > 0.35) c = y < 64 ? 0xff9a6a : 0xffc08a;
      if (y < 30 && hash(x, y * 3) > 0.993) c = 0xffe9c4;
    } else {
      // High sun off the top right, and a few fair-weather clouds.
      const d = Math.hypot(x - 300, y + 12);
      if (d < 80) c = lerpColor(c, 0xeaf6ff, dither(x, y) < 0.5 ? 0.6 * (1 - d / 80) : 0.35 * (1 - d / 80));
      for (const cl of [{ x: 52, y: 40, w: 24 }, { x: 150, y: 24, w: 16 }, { x: 214, y: 58, w: 28 }]) {
        const lobes = [[0, 0, 0.32], [-0.3, 0.08, 0.22], [0.32, 0.06, 0.24], [0.12, -0.14, 0.2]];
        const flat = cl.y + cl.w * 0.16;
        if (y > flat) continue;
        for (const [dx, dy, r] of lobes) {
          const dd = Math.hypot((x - cl.x - dx * cl.w) * 0.8, y - cl.y - dy * cl.w);
          if (dd <= r * cl.w) c = y > flat - 2 ? 0xd6e6f2 : 0xffffff;
        }
      }
    }
    return c;
  };
}

function sunPixel(p: WindowPalette): PixelFn {
  return (x, y) => {
    const d = Math.hypot(x - 12, y - 12);
    if (d > 12) return null;
    if (d > 10.5) return dither(x, y) > 0.5 ? p.discColor : null;
    // Hazy horizontal bands across the low sun.
    return y > 13 && mod(y, 3) === 0 ? lerpColor(p.discColor, 0xff8a3c, 0.5) : p.discColor;
  };
}

// ---------------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------------

export interface SiteFrame {
  /** Screen position of the world origin (the pad, on the ground line). */
  ground: { x: number; y: number };
  /** 1 on the ground, 0 at the top of the atmosphere. */
  air: number;
  altitude: number;
  time: number;
  /** Rocket screen position and engine output (0..1) for the searchlights and water glow. */
  rocket: { x: number; y: number };
  throttle: number;
  /** Screen x of the Moon in the sky (its path glitters on the water at night). */
  moonX: number;
}

export class SeashoreSite {
  readonly palette: WindowPalette;
  private readonly sky?: Phaser.GameObjects.Image;
  private readonly sun?: Phaser.GameObjects.Image;
  private readonly far: Strip;
  private readonly near: Strip;
  private readonly water?: Phaser.GameObjects.Graphics;
  private readonly glow?: Phaser.GameObjects.Graphics;
  private readonly climb?: Phaser.GameObjects.Graphics;
  private readonly gulls = Array.from({ length: 5 }, (_, i) => ({ x: -260 + i * 140 + (i % 2) * 40, y: 120 + (i * 37) % 70, phase: i * 1.7 }));
  private readonly ripples: Array<{ born: number; x: number }> = [];
  private lastRipple = -Infinity;

  constructor(scene: Phaser.Scene, private readonly windowId: LaunchWindowId) {
    const p = (this.palette = WINDOW_PALETTES[windowId]);
    const key = `seashore_${windowId}`;
    paint(scene, `${key}_sky`, SKY_W, SKY_H, 0, skyPixel(p, windowId));
    this.sky = scene.add.image?.(0, 0, `${key}_sky`);
    this.sky?.setOrigin?.(0, 1);
    this.sky?.setScale?.(PIXEL);
    this.sky?.setDepth?.(-2);
    if (windowId === 'SUNSET') {
      paint(scene, `${key}_sun`, 25, 25, 0, sunPixel(p));
      this.sun = scene.add.image?.(0, 0, `${key}_sun`);
      this.sun?.setScale?.(PIXEL);
      this.sun?.setDepth?.(-1.5);
    }
    this.far = new Strip(scene, `${key}_far`, FAR_HALF, FAR_PERIOD, farPixel(p, windowId));
    this.water = scene.add.graphics?.();
    this.near = new Strip(scene, `${key}_near`, NEAR_HALF, NEAR_PERIOD, nearPixel(p));
    this.glow = scene.add.graphics?.();
    this.glow?.setBlendMode?.('ADD');
    this.climb = scene.add.graphics?.();
  }

  /** Sky colours for the full-screen gradient behind everything (top, bottom) at this much air. */
  skyGradient(air: number): [number, number] {
    const p = this.palette;
    const top = lerpColor(0x050812, lerpColor(p.skyHigh, p.sky[0], air), Math.pow(air, 0.5) * 1.4);
    const bottom = lerpColor(0x050812, p.sky[Math.floor(p.sky.length / 3)], Math.pow(air, 0.7));
    return [top, bottom];
  }

  /** Out of the climb (orbit map, Moon views): nothing of the coast shows. */
  hide(): void {
    this.sky?.setVisible?.(false);
    this.sun?.setVisible?.(false);
    this.far.place(-9999, 9999, false);
    this.near.place(-9999, 9999, false);
    this.water?.clear?.();
    this.glow?.clear?.();
    this.climb?.clear?.();
  }

  update(f: SiteFrame): void {
    const top = Math.round(f.ground.y) - G * PIXEL;
    const visible = top < 720 && f.air > 0;
    const horizonY = top + HORIZON * PIXEL;
    const farPadX = 640 + (f.ground.x - 640) * FAR_PARALLAX;

    this.sky?.setVisible?.(f.air > 0);
    this.sky?.setPosition?.(0, horizonY);
    this.sky?.setAlpha?.(Phaser.Math.Clamp((f.air - 0.55) / 0.4, 0, 1));
    this.sun?.setVisible?.(visible);
    this.sun?.setPosition?.(Math.round(farPadX + SUN_TX * PIXEL), horizonY + 2 * PIXEL);
    this.far.place(farPadX, top, visible);
    this.near.place(f.ground.x, top, visible);

    this.drawWater(f, visible, horizonY, farPadX);
    this.drawGlow(f, visible, horizonY, farPadX);
    this.drawClimb(f);
  }

  /** Light path on the sea, drifting glints and the foam line breathing on the beach. */
  private drawWater(f: SiteFrame, visible: boolean, horizonY: number, farPadX: number): void {
    const g = this.water;
    g?.clear?.();
    if (!g || !visible) return;
    const p = this.palette;
    const shoreY = horizonY + (G - HORIZON + 2) * PIXEL;
    const seaLeft = Math.max(0, Math.round(farPadX + 30 * PIXEL));
    const t = f.time;

    // Path of light under the sun (Sunset) or the Moon (Night); Day gets a broad sparkle field.
    const pathX = this.windowId === 'SUNSET' ? farPadX + SUN_TX * PIXEL : this.windowId === 'NIGHT' ? f.moonX : -1;
    if (pathX > 0) {
      for (let y = horizonY + PIXEL; y < Math.min(720, shoreY + 40 * PIXEL); y += PIXEL) {
        const depth = (y - horizonY) / (60 * PIXEL);
        const half = (4 + depth * 26) * (0.7 + 0.3 * Math.sin(y * 0.3 + t * 2));
        for (let k = 0; k < 3; k++) {
          const sx = pathX + Math.sin(y * 1.7 + k * 2.1 + t * 1.3) * half;
          if (sx < seaLeft) continue;
          const len = PIXEL * (1 + Math.round((1 + Math.sin(y + k * 4 + t * 3)) * (1 + depth * 3)));
          g.fillStyle(p.glint, 0.55 + 0.35 * Math.sin(t * 4 + y + k));
          g.fillRect(Math.round(sx / PIXEL) * PIXEL, y, len, PIXEL);
        }
      }
    }
    // Twinkling glints scattered over the open water.
    const count = this.windowId === 'DAY' ? 70 : 34;
    for (let i = 0; i < count; i++) {
      const life = (t * 0.6 + hash(i, 1) * 7) % 1;
      const gx = mod(hash(i, 2) * 1280 + t * 6 * (hash(i, 3) - 0.5) + (farPadX - 640), 1280);
      const gy = horizonY + PIXEL * (1 + Math.floor(hash(i, 4) * hash(i, 5) * 34));
      if (gx < seaLeft || gy > 720) continue;
      g.fillStyle(p.glint, Math.sin(life * Math.PI) * 0.8);
      g.fillRect(Math.round(gx / PIXEL) * PIXEL, gy, PIXEL * (1 + (i % 3 === 0 ? 1 : 0)), PIXEL);
    }
    // Foam sliding up and down the beach.
    const shoreX = f.ground.x + SHORE * PIXEL;
    const reach = (Math.sin(t * 0.9) * 0.5 + 0.5) * 7 * PIXEL;
    g.fillStyle(p.foam, 0.75);
    for (let x = shoreX - reach; x < Math.min(1280, shoreX + 30 * PIXEL); x += PIXEL) {
      if (hash(Math.round(x / PIXEL), Math.floor(t * 2)) > 0.35) g.fillRect(Math.round(x / PIXEL) * PIXEL, shoreY - PIXEL, PIXEL, PIXEL);
    }
  }

  /** Additive light: lighthouse beam, searchlights, beacons, exhaust glow and ripples on the water. */
  private drawGlow(f: SiteFrame, visible: boolean, horizonY: number, farPadX: number): void {
    const g = this.glow;
    g?.clear?.();
    if (!g || !visible) return;
    const p = this.palette;
    const t = f.time;
    const night = this.windowId !== 'DAY';

    // Lighthouse beams sweeping from every lighthouse on screen.
    if (night) {
      for (let k = -2; k <= 1; k++) {
        const lx = farPadX + (-150 + k * FAR_PERIOD) * PIXEL;
        if (lx < -600 || lx > 1880) continue;
        const ly = horizonY - 26.5 * PIXEL;
        const a = Math.sin(t * 0.7) * 1.25;
        const len = 900;
        const spread = 0.05;
        const facing = Math.cos(t * 0.7);
        g.fillStyle(p.lights, 0.1 + 0.12 * Math.abs(facing));
        pxTriangle(g, lx, ly, lx + Math.cos(a - spread) * len, ly - Math.sin(Math.abs(a - spread)) * 120, lx + Math.cos(a + spread) * len, ly - Math.sin(Math.abs(a + spread)) * 120);
        g.fillStyle(0xfff3d6, 0.5 + 0.4 * Math.abs(facing));
        pxRect(g, lx - 6, ly - 6, 12, 12);
      }
    }

    // Searchlights crossing on the rocket while it's still near the pad.
    if (night && f.altitude < 120) {
      const fade = 1 - f.altitude / 120;
      for (const [ox, phase] of [[-16, 0], [14, 1.9]] as const) {
        const bx = f.ground.x + ox * 24;
        const by = f.ground.y;
        const tx = f.rocket.x + Math.sin(t * 0.8 + phase) * 30;
        const ty = f.rocket.y - 40;
        const dx = tx - bx;
        const dy = ty - by;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        const w = 46;
        g.fillStyle(0xfff3d6, 0.09 * fade);
        pxTriangle(g, bx, by, tx + nx * w, ty + ny * w, tx - nx * w, ty - ny * w);
        g.fillStyle(0xfff3d6, 0.07 * fade);
        pxTriangle(g, bx, by, tx + nx * w * 0.4, ty + ny * w * 0.4, tx - nx * w * 0.4, ty - ny * w * 0.4);
      }
    }

    // Exhaust lighting the shallows and pushing ripples out from the beach at liftoff.
    if (f.throttle > 0 && f.altitude < 50) {
      const heat = f.throttle * (1 - f.altitude / 50);
      const shoreX = f.ground.x + SHORE * PIXEL;
      const shoreY = horizonY + (G - HORIZON + 2) * PIXEL;
      g.fillStyle(0xff8a3c, 0.22 * heat);
      pxEllipse(g, shoreX + 140, shoreY + 20, 260, 35);
      g.fillStyle(0xffd27a, 0.25 * heat);
      pxEllipse(g, shoreX + 60, shoreY + 8, 120, 13);
      if (t - this.lastRipple > 0.45) {
        this.lastRipple = t;
        this.ripples.push({ born: t, x: shoreX + 40 });
      }
    }
    const shoreY = horizonY + (G - HORIZON + 2) * PIXEL;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const age = t - r.born;
      if (age > 2.6 || age < 0) {
        this.ripples.splice(i, 1);
        continue;
      }
      g.fillStyle(p.glint, 0.45 * (1 - age / 2.6));
      pxRing(g, r.x + age * 60, shoreY + 18 + age * 10, 40 + age * 130, 5 + age * 7);
    }
  }

  /** Gulls by day, the cloud deck and the curving horizon (with the sun rising again at Sunset). */
  private drawClimb(f: SiteFrame): void {
    const g = this.climb;
    g?.clear?.();
    if (!g) return;
    const p = this.palette;
    const t = f.time;
    const alt = f.altitude;

    if (this.windowId === 'DAY' && alt < 200) {
      g.fillStyle(0x2a3040, 1 - alt / 200);
      for (const b of this.gulls) {
        const x = mod(f.ground.x * 0.9 + b.x + t * 18, 1600) - 160;
        const y = f.ground.y - 420 - b.y + Math.sin(t + b.phase) * 6;
        const flap = Math.sin(t * 6 + b.phase) > 0 ? 1 : 0;
        pxRect(g, x - 8, y - flap * 4, 4, 4);
        pxRect(g, x - 4, y, 4, 4);
        pxRect(g, x + 4, y, 4, 4);
        pxRect(g, x + 8, y - flap * 4, 4, 4);
        pxRect(g, x, y + 4, 4, 4);
      }
    }

    const bumps = (x: number, seed: number) => 14 * Math.sin(x * 0.011 + seed) + 9 * Math.sin(x * 0.027 + seed * 2) + 5 * Math.sin(x * 0.061 + seed);
    const scroll = f.ground.x * 0.05;

    // Underside of the cloud deck looming overhead as you approach it.
    if (alt > DECK - 300 && alt < DECK) {
      const k = (alt - (DECK - 300)) / 300;
      const edge = k * 360;
      for (let x = 0; x < 1280; x += PIXEL * 2) {
        const y = Math.round((edge + bumps(x + scroll, 1)) / PIXEL) * PIXEL;
        g.fillStyle(p.cloud[1], 0.92);
        g.fillRect(x, 0, PIXEL * 2, Math.max(0, y));
        g.fillStyle(p.cloud[0], 0.35);
        g.fillRect(x, y - PIXEL * 2, PIXEL * 2, PIXEL);
      }
    }
    // Bursting through: everything goes soft and bright for a moment.
    const inside = 1 - Math.min(1, Math.abs(alt - DECK) / 45);
    if (inside > 0) {
      g.fillStyle(p.cloud[0], 0.85 * inside);
      g.fillRect(0, 0, 1280, 720);
    }
    // Then a sea of cloud tops falls away below, lit by the window's light.
    if (alt >= DECK && alt < DECK + 900) {
      const k = (alt - DECK) / 900;
      const edge = 360 + k * 380;
      const fade = 1 - smooth(0.7, 1, k);
      for (let x = 0; x < 1280; x += PIXEL * 2) {
        const y = Math.round((edge + bumps(x - scroll, 3) * (1 - k * 0.6)) / PIXEL) * PIXEL;
        g.fillStyle(p.cloud[1], 0.95 * fade);
        g.fillRect(x, y, PIXEL * 2, 720 - y);
        g.fillStyle(p.cloud[0], 0.95 * fade);
        g.fillRect(x, y, PIXEL * 2, PIXEL * 3);
        g.fillStyle(lerpColor(p.cloud[0], p.cloud[1], 0.5), 0.9 * fade);
        g.fillRect(x, y + PIXEL * 3, PIXEL * 2, PIXEL * 3);
      }
    }

    // The curved horizon: Earth's limb rises into view, ringed by a thin glowing atmosphere.
    if (alt > DECK + 300) {
      const k = smooth(DECK + 300, WORLD.atmosphereTop + 1_500, alt);
      const r = 5200 - 3400 * k;
      const cy = 720 + r - 40 - 170 * k;
      g.fillStyle(p.earth, 0.95);
      pxEllipse(g, 640, cy, r, r);
      for (let i = 0; i < 6; i++) {
        g.fillStyle(p.limbGlow, (0.5 - i * 0.08) * Math.min(1, k * 3));
        pxRing(g, 640, cy, r + (i + 1) * PIXEL, r + (i + 1) * PIXEL, PIXEL);
      }
      if (this.windowId === 'NIGHT') {
        // City lights scattered across the dark Earth.
        g.fillStyle(0xffd27a, 0.7 * Math.min(1, k * 3));
        for (let i = 0; i < 60; i++) {
          const a = -Math.PI / 2 + (hash(i, 9) - 0.5) * 1.1;
          const rr = r - 10 - hash(i, 10) * 90;
          pxRect(g, 640 + Math.cos(a) * rr, cy + Math.sin(a) * rr, PIXEL, PIXEL);
        }
      }
      if (this.windowId === 'SUNSET') {
        // Climbing out of Earth's shadow: the sun comes back up over the right of the horizon.
        const rise = smooth(DECK + 400, WORLD.atmosphereTop + 600, alt);
        const a = -Math.PI / 2 + Math.asin(Math.min(1, 300 / r));
        const sx = 640 + Math.cos(a) * r;
        const sy = cy + Math.sin(a) * r - rise * 26;
        g.fillStyle(0xff9a4a, 0.25 * rise);
        pxEllipse(g, sx, sy + 10, 260 * rise, 23);
        g.fillStyle(0xffe08a, 0.9 * rise);
        pxEllipse(g, sx, sy, 6 + 16 * rise, 6 + 16 * rise);
        g.fillStyle(0xffffff, rise);
        pxEllipse(g, sx, sy, 3 + 8 * rise, 3 + 8 * rise);
      }
    }
  }
}
