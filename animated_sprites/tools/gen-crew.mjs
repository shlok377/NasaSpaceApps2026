// Draws the crew (astronaut) sprite sheet, pixel by pixel, and writes it next to this tool.
//   node animated_sprites/tools/gen-crew.mjs
//
// What happens after the rocket lands. The sprite is placed beside the rocket's base (the rocket is the player's own
// build, so it is not part of the sheet): x = 6 is the hatch, the astronaut ends up standing at x = 24.
// Sheet layout (48x48 frames, 10 columns, ground is row 44):
//   row 0  EXIT       10 frames, once: airlock puff, the astronaut steps out and walks to the spot
//   row 1  PLANT       8 frames, once: carries the flag, plants it, it unfurls   (on the landing site only)
//   row 2  WAVE_FLAG   6 frames, loops: waves beside the planted flag            (on the site)
//   row 3  WAVE        6 frames, loops: just waves, no flag                      (down safely, off the site)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, Frame, puffCloud, writeSheet } from './lib.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'crew');
const F = 48;
const COLS = 10;
const ROWS = 4;
const GY = 44; // last row of the ground contact
const STAND_X = 24;
const POLE_X = 31;
const POLE_LEN = 34;
const RAD = Math.PI / 180;

// The game's flag_blue.png: brown pole, cyan pennant.
const FLAG = { pole: 0x563b27, poleDark: 0x3d2819, light: 0x00eefa, mid: 0x00d1db, dark: 0x00b4bc };

const dust = (f, cx, cy, stage, dir = 0) => puffCloud(f, cx, cy, stage, dir, GY);

/** A limb as a short thick line. Angle 0 = straight down, +90 = forward (to the right), 180 = straight up. */
function limb(f, x, y, angle, len, w, color, tipColor = color, tipLen = 0) {
  const a = angle * RAD;
  for (let t = 0; t <= len; t += 0.5) {
    const px = x + Math.sin(a) * t;
    const py = y + Math.cos(a) * t;
    const c = t > len - tipLen ? tipColor : color;
    for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) f.set(px - (w - 1) / 2 + dx, py - (w - 1) / 2 + dy, c);
  }
}

/**
 * The astronaut, facing right, standing at column x. o: legs (swing degrees), arms (swing degrees, opposite to legs),
 * bob (px), front (angle of the front arm, overrides the swing).
 */
function drawAstronaut(f, x, o = {}) {
  const b = o.bob ?? 0;
  const swing = o.legs ?? 0;
  const yT = GY - 15 + b; // torso top
  const hipY = GY - 8 + b;
  // legs (back one darker), boots at the ends
  const leg = (a, light) => {
    limb(f, light ? x + 1 : x - 2, hipY, a, 6, 3, light ? C.metal : C.metalMid, light ? C.metalShade : C.steelDark, 2);
  };
  leg(-swing - 2, false);
  // back arm (behind the torso)
  limb(f, x - 1, yT + 2, -(o.arms ?? 0) - 6, 6, 2, C.metalMid, C.steelDark, 2);
  // backpack
  f.rect(x - 7, yT + 1, x - 5, yT + 7, C.steel);
  f.rect(x - 7, yT + 1, x - 7, yT + 7, C.steelLight);
  f.rect(x - 5, yT + 2, x - 5, yT + 7, C.steelDark);
  // torso with the same bevel as the parts
  f.rect(x - 4, yT, x + 3, yT + 7, C.metal);
  f.rect(x - 4, yT, x + 3, yT, C.white);
  f.rect(x - 4, yT, x - 4, yT + 7, C.white);
  f.rect(x + 3, yT + 1, x + 3, yT + 7, C.metalMid);
  f.rect(x - 3, yT + 7, x + 3, yT + 7, C.metalShade);
  f.rect(x - 3, yT + 6, x + 2, yT + 6, C.red);
  f.rect(x - 1, yT + 2, x + 1, yT + 3, C.steelMid);
  f.set(x + 1, yT + 2, C.green);
  leg(swing + 2, true);
  // helmet
  const yH = yT - 7;
  f.rect(x - 4, yH, x + 3, yH + 6, C.metal);
  f.rect(x - 3, yH, x + 2, yH, C.white);
  f.rect(x - 4, yH + 1, x - 4, yH + 5, C.white);
  f.rect(x + 3, yH + 2, x + 3, yH + 6, C.metalMid);
  f.rect(x - 3, yH + 6, x + 2, yH + 6, C.metalShade);
  f.rect(x - 1, yH + 1, x + 3, yH + 5, C.outline);
  f.rect(x, yH + 2, x + 3, yH + 4, C.sky);
  f.rect(x, yH + 2, x + 3, yH + 2, C.skyLight);
  f.rect(x, yH + 4, x + 3, yH + 4, C.skyDark);
  // front arm
  const front = o.front ?? (o.arms ?? 0) + 6;
  limb(f, x + 1, yT + 2, front, front > 100 ? 7 : 6, 2, C.metal, C.steelMid, 2);
}

/** The flag: pole from base (bx, by) tilted `tilt` degrees to the right, cloth width `w` (0 = furled), rippling with phase `t`. */
function drawFlag(f, bx, by, tilt, w, t = 0) {
  const a = tilt * RAD;
  const tip = [bx + Math.sin(a) * POLE_LEN, by - Math.cos(a) * POLE_LEN];
  for (let s = 0; s <= POLE_LEN; s += 0.5) {
    const px = bx + Math.sin(a) * s;
    const py = by - Math.cos(a) * s;
    f.set(px, py, FLAG.pole);
    f.set(px + 1, py, FLAG.poleDark);
  }
  const L = 13;
  const x0 = Math.round(tip[0]) + 2;
  const y0 = Math.round(tip[1]);
  const width = w === 0 ? 2 : w;
  for (let k = 0; k < Math.min(width, L); k++) {
    const h = w === 0 ? 4 : Math.max(1, Math.ceil(4.5 * (1 - k / L)));
    const dy = w === 0 ? 0 : Math.round(Math.sin(k * 0.7 + t) * (k / L) * 1.6);
    for (let r = -h; r < h; r++) {
      const c = r < -h / 2 ? FLAG.light : r < h / 3 ? FLAG.mid : FLAG.dark;
      f.set(x0 + k, y0 + 4 + r + dy, w === 0 ? FLAG.dark : c);
    }
  }
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

function exitFrame(i) {
  const f = new Frame(F);
  if (i >= 1) {
    if (i === 9) drawAstronaut(f, STAND_X, { legs: 0, arms: 0 });
    else {
      const ph = ((i - 1) * Math.PI) / 2;
      const x = Math.round(10 + ((i - 1) * (STAND_X - 10)) / 8);
      drawAstronaut(f, x, { legs: 26 * Math.sin(ph), arms: 22 * Math.sin(ph), bob: Math.abs(Math.sin(ph)) < 0.5 ? -1 : 0 });
    }
  }
  f.outline();
  if (i <= 2) dust(f, 7, GY, i === 0 ? 2 : i === 1 ? 1 : 0, 1);
  return f;
}

function plantFrame(i) {
  const f = new Frame(F);
  // [base x, base y, tilt, cloth width, front arm angle, bob]
  const steps = [
    [POLE_X, 38, 8, 0, 75, 0],
    [POLE_X, 41, 6, 0, 75, 0],
    [POLE_X, 43, 3, 0, 75, 0],
    [POLE_X, GY, 0, 0, 75, 1],
    [POLE_X, GY, 0, 5, 75, 0],
    [POLE_X, GY, 0, 10, 75, 0],
    [POLE_X, GY, 0, 13, 140, 0],
    [POLE_X, GY, 0, 13, 140, 0]
  ][i];
  drawFlag(f, steps[0], steps[1], steps[2], steps[3], i * 0.8);
  drawAstronaut(f, STAND_X, { legs: 0, arms: 0, front: steps[4], bob: steps[5] });
  f.outline();
  if (i === 3) dust(f, POLE_X, GY, 1, 1);
  if (i === 4) dust(f, POLE_X, GY, 0, 1);
  return f;
}

function waveFrame(i, withFlag) {
  const f = new Frame(F);
  const t = (i * 2 * Math.PI) / 6;
  if (withFlag) drawFlag(f, POLE_X, GY, 0, 13, t);
  drawAstronaut(f, STAND_X, { legs: 0, arms: 0, front: 140 + 20 * Math.sin(t), bob: i % 3 === 1 ? -1 : 0 });
  f.outline();
  return f;
}

const make = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
writeSheet(OUT_DIR, 'crew', F, COLS, ROWS, {
  exit: { row: 0, frameList: make(10, exitFrame), frameMs: 110, loop: false },
  plant: { row: 1, frameList: make(8, plantFrame), frameMs: 140, loop: false },
  wave_flag: { row: 2, frameList: make(6, (i) => waveFrame(i, true)), frameMs: 150, loop: true },
  wave: { row: 3, frameList: make(6, (i) => waveFrame(i, false)), frameMs: 150, loop: true }
});
