import Phaser from 'phaser';

/**
 * Pixel-art drawing on a Graphics object: every shape is built from rows of whole
 * 4 px "pixels" snapped to the screen grid, so live effects (beams, glows, ripples,
 * the curved horizon) match the painted scenery instead of looking smooth and vector.
 */
export const PX = 4;
const snap = (v: number) => Math.round(v / PX) * PX;
const SCREEN_W = 1280;
const SCREEN_H = 720;

export function pxRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const x0 = snap(x);
  const y0 = snap(y);
  const w1 = Math.max(PX, snap(x + w) - x0);
  const h1 = Math.max(PX, snap(y + h) - y0);
  g.fillRect(x0, y0, w1, h1);
}

/** Horizontal run clipped to the screen. */
function span(g: Phaser.GameObjects.Graphics, x0: number, x1: number, y: number): void {
  const a = Math.max(0, snap(x0));
  const b = Math.min(SCREEN_W, snap(x1));
  if (b > a) g.fillRect(a, y, b - a, PX);
}

/** Filled ellipse with stepped pixel edges (also a circle when rx = ry). */
export function pxEllipse(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number): void {
  const top = Math.max(0, snap(cy - ry));
  const bottom = Math.min(SCREEN_H, snap(cy + ry));
  for (let y = top; y < bottom; y += PX) {
    const dy = (y + PX / 2 - cy) / ry;
    if (Math.abs(dy) >= 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    span(g, cx - half, cx + half, y);
  }
}

/** Elliptical ring `thickness` pixels wide (outline drawn in whole pixels). */
export function pxRing(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, thickness = PX): void {
  const top = Math.max(0, snap(cy - ry));
  const bottom = Math.min(SCREEN_H, snap(cy + ry));
  const irx = Math.max(0, rx - thickness);
  const iry = Math.max(0, ry - thickness);
  for (let y = top; y < bottom; y += PX) {
    const fy = y + PX / 2 - cy;
    const dy = fy / ry;
    if (Math.abs(dy) >= 1) continue;
    const outer = rx * Math.sqrt(1 - dy * dy);
    const idy = iry > 0 ? fy / iry : 2;
    if (Math.abs(idy) >= 1) {
      span(g, cx - outer, cx + outer, y);
      continue;
    }
    const inner = irx * Math.sqrt(1 - idy * idy);
    span(g, cx - outer, cx - inner, y);
    span(g, cx + inner, cx + outer, y);
  }
}

/** Filled triangle, scanline by scanline in whole pixels. */
export function pxTriangle(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  const top = Math.max(0, snap(Math.min(ay, by, cy)));
  const bottom = Math.min(SCREEN_H, snap(Math.max(ay, by, cy)));
  const edges: Array<[number, number, number, number]> = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = top; y < bottom; y += PX) {
    const yy = y + PX / 2;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x0, y0, x1, y1] of edges) {
      if ((yy < y0 && yy < y1) || (yy > y0 && yy > y1) || y0 === y1) continue;
      const x = x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (hi > lo) span(g, lo, hi, y);
  }
}

/** Stepped line of square pixels, `width` thick. */
export function pxLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, width = PX): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / PX));
  const w = Math.max(PX, snap(width));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    g.fillRect(snap(x0 + (x1 - x0) * t - w / 2), snap(y0 + (y1 - y0) * t - w / 2), w, w);
  }
}

/** Vertical gradient in banded pixel rows with a dithered seam between bands (no smooth blending). */
export function pxGradient(g: Phaser.GameObjects.Graphics, top: number, bottom: number, bands = 18): void {
  const lerp = (t: number) => {
    const m = (s: number) => Math.round(((top >> s) & 255) + (((bottom >> s) & 255) - ((top >> s) & 255)) * t);
    return (m(16) << 16) | (m(8) << 8) | m(0);
  };
  const h = SCREEN_H / bands;
  for (let i = 0; i < bands; i++) {
    g.fillStyle(lerp(i / (bands - 1)), 1);
    g.fillRect(0, Math.round(i * h), SCREEN_W, Math.ceil(h) + 1);
  }
  // Checkerboard of the next band's colour along each seam.
  for (let i = 0; i < bands - 1; i++) {
    g.fillStyle(lerp((i + 1) / (bands - 1)), 1);
    const y = snap((i + 1) * h - PX);
    for (let x = (i % 2) * PX; x < SCREEN_W; x += PX * 2) g.fillRect(x, y, PX, PX);
  }
}
