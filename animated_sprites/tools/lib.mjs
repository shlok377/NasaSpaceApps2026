// Shared by the sprite generators: the palette sampled from the rocket part sprites, a pixel Frame and the sheet writer.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.mjs';

// Palette sampled from the rocket part sprites (cockpit, engines, nose cone) so everything matches.
export const C = {
  outline: 0x000000,
  white: 0xffffff,
  metal: 0xe8e1e1,
  metalMid: 0xc6c6c6,
  metalShade: 0xb5b5b5,
  steelLight: 0x6c81c8,
  steel: 0x566ec0,
  steelMid: 0x475b9b,
  steelDark: 0x3f5291,
  steelDeep: 0x2d407d,
  red: 0xc40000,
  redLight: 0xe60000,
  redDark: 0xa20000,
  sky: 0x4aaee8,
  skyLight: 0x71bfed,
  skyDark: 0x0a80c4,
  wave1: 0xcdecff,
  wave2: 0x8fcff5,
  wave3: 0x4aaee8,
  cell: 0x2eaff2,
  cellLight: 0x68c5f6,
  cellDark: 0x11a4f0,
  green: 0x3ef08a,
  greenDim: 0x14532d,
  off: 0x6b6b6b,
  puff: 0xffffff,
  puffEdge: 0xb5b5b5
};

export class Frame {
  constructor(size) {
    this.size = size;
    this.d = new Uint8Array(size * size * 4);
  }
  set(x, y, color, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    this.d[i] = (color >> 16) & 255;
    this.d[i + 1] = (color >> 8) & 255;
    this.d[i + 2] = color & 255;
    this.d[i + 3] = a;
  }
  solid(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size && this.d[(y * this.size + x) * 4 + 3] > 0;
  }
  rect(x0, y0, x1, y1, color) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, color);
  }
  /** One-pixel black outline around everything drawn so far. */
  outline() {
    const edge = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.solid(x, y)) continue;
        if (this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y - 1) || this.solid(x, y + 1)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.set(x, y, C.outline);
  }
}

/** A small cloud of dust puffs resting on the floor row `floor`: stage 0 (tight) .. 3 (thin and wide). */
export function puffCloud(f, cx, cy, stage, dir, floor) {
  const sets = [
    [[0, 0, 2]],
    [[-2, 0, 3], [2, -1, 2], [0, -2, 2]],
    [[-4, 0, 3], [3, -1, 3], [0, -3, 2], [-1, 1, 2]],
    [[-6, 0, 2], [5, -1, 2], [1, -4, 1], [-3, -2, 1]]
  ];
  for (const [dx, dy, r] of sets[stage]) {
    const px = cx + dx + dir * stage;
    for (let y = cy + dy - r; y <= cy + dy + r; y++) {
      for (let x = px - r; x <= px + r; x++) {
        const d = Math.hypot(x - px, y - (cy + dy));
        if (d > r + 0.2 || f.solid(x, y) || y > floor) continue;
        f.set(x, y, d > r - 1.2 ? C.puffEdge : C.puff);
      }
    }
  }
}

/** Lay frames out on a grid (rows of `cols` frames) and write `<name>.png` plus `<name>.json`. */
export function writeSheet(outDir, name, size, cols, rows, animations) {
  const w = cols * size;
  const sheet = new Uint8Array(w * rows * size * 4);
  for (const anim of Object.values(animations)) {
    anim.frameList.forEach((frame, col) => {
      for (let y = 0; y < size; y++) {
        const src = y * size * 4;
        sheet.set(frame.d.subarray(src, src + size * 4), ((anim.row * size + y) * w + col * size) * 4);
      }
    });
  }
  writeFileSync(join(outDir, name + '.png'), encodePng(w, rows * size, sheet));
  const meta = { image: name + '.png', frameWidth: size, frameHeight: size, animations: {} };
  for (const [k, a] of Object.entries(animations)) meta.animations[k] = { row: a.row, frames: a.frameList.length, frameMs: a.frameMs, loop: a.loop };
  writeFileSync(join(outDir, name + '.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(`wrote ${name}.png (${w}x${rows * size}) and ${name}.json`);
}
