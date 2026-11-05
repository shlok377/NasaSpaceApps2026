// Draws the animated satellite sprite sheet, pixel by pixel, and writes it next to this tool.
//   node animated_sprites/tools/gen-satellite.mjs
//
// Sheet layout (48x48 frames, 10 columns):
//   row 0  DEPLOY   10 frames, plays once: eject puff, solar panels unfold, mast rises, dish opens, LED goes green
//   row 1  WORKING   8 frames, loops: dish scans, signal waves leave it, light blinks, a glint sweeps the panels
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, Frame, writeSheet } from './lib.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'satellite');
const F = 48;
const COLS = 10;
const ROWS = 2;
const DEPLOY_FRAMES = 10;
const WORKING_FRAMES = 8;

// Fixed geometry of the finished satellite (frame is 48 wide, centre column 23.5).
const BODY = { x0: 18, x1: 29, y0: 26, y1: 39 };
const PANEL = { y0: 29, y1: 36, maxW: 11 };
const MAST = { x: 23, bottom: 25, maxLen: 6 };

function bolt(f, x, y) {
  f.rect(x, y, x + 1, y + 1, C.steelMid);
  f.set(x, y, C.steelLight);
  f.set(x + 1, y + 1, C.steelDeep);
}

function drawBody(f, led) {
  const { x0, x1, y0, y1 } = BODY;
  // off-white metal with the same bevel as the rocket parts: white top-left, grey bottom-right
  f.rect(x0, y0, x1, y1, C.metal);
  f.rect(x0, y0, x1, y0 + 1, C.white);
  f.rect(x0, y0, x0 + 1, y1, C.white);
  f.rect(x1 - 1, y0 + 2, x1 - 1, y1, C.metalMid);
  f.rect(x0 + 2, y1 - 1, x1 - 1, y1 - 1, C.metalMid);
  f.rect(x1, y0 + 1, x1, y1, C.metalShade);
  f.rect(x0 + 1, y1, x1, y1, C.metalShade);
  // red caps like the parts' top and bottom bands
  f.rect(21, y0, 26, y0, C.red);
  f.rect(22, y0, 25, y0, C.redLight);
  f.rect(21, y1, 26, y1, C.red);
  // red band across the middle
  f.rect(x0 + 2, 30, x1 - 1, 30, C.redLight);
  f.rect(x0 + 2, 31, x1 - 1, 31, C.red);
  bolt(f, 27, 27);
  bolt(f, 19, 37);
  // cockpit-style window
  f.rect(20, 32, 27, 36, C.outline);
  f.rect(21, 33, 26, 35, C.sky);
  f.rect(21, 33, 26, 33, C.skyLight);
  f.rect(21, 35, 26, 35, C.skyDark);
  f.set(22, 34, C.skyLight);
  f.set(23, 34, C.skyLight);
  // status light
  const ledColor = { off: C.off, red: C.redLight, redDim: C.redDark, green: C.green, greenDim: C.greenDim }[led] ?? C.off;
  f.rect(27, 37, 28, 38, ledColor);
  f.rect(27, 37, 27, 37, led === 'green' ? 0xb8ffd8 : ledColor);
  // nozzle, same blue steel as the engines
  f.rect(22, 40, 25, 40, C.steelMid);
  f.rect(21, 41, 26, 41, C.steelDark);
  f.rect(22, 40, 22, 40, C.steelLight);
  f.rect(25, 41, 26, 41, C.steelDeep);
}

/**
 * One solar-panel wing. `w` is how far it has swung open (2 = folded flat, 11 = open),
 * `gap` is the hinge arm that slides out at the end, `glintSum` the x+y of the sweeping shine.
 */
function drawPanel(f, side, w, gap, glintSum = null) {
  const inner = side < 0 ? BODY.x0 - 1 - gap : BODY.x1 + 1 + gap;
  const dir = side;
  for (let k = 1; k <= gap; k++) {
    const ax = side < 0 ? inner + k : inner - k;
    f.rect(ax, 32, ax, 33, C.metalMid);
  }
  const edgeOn = w < 6;
  for (let i = 0; i < w; i++) {
    const x = inner + dir * i;
    for (let y = PANEL.y0; y <= PANEL.y1; y++) {
      let c = edgeOn ? C.cellDark : C.cell;
      if (y === PANEL.y0) c = edgeOn ? C.cell : C.cellLight;
      else if (y === PANEL.y1) c = C.cellDark;
      else if (y === 33) c = C.outline;
      if (!edgeOn && i % 3 === 2) c = C.outline;
      if (i === 0) c = y % 2 ? C.metal : C.metalShade; // metal hinge strip
      if (glintSum !== null && !edgeOn && i > 0 && c !== C.outline && (x + y === glintSum || x + y === glintSum + 1)) c = x + y === glintSum ? C.white : C.wave1;
      f.set(x, y, c);
    }
  }
}

function drawMast(f, len) {
  for (let k = 0; k < len; k++) {
    f.set(MAST.x, MAST.bottom - k, C.steel);
    f.set(MAST.x + 1, MAST.bottom - k, C.steelDark);
  }
}

/** The dish: a tapered steel-blue bowl on the mast (even width, so it centres on the 2px mast); `tilt` shears it sideways while scanning. */
function drawDish(f, width, tilt = 0) {
  const bottom = MAST.bottom - MAST.maxLen; // last dish row, just above the full mast
  const h = width >= 10 ? 4 : width >= 6 ? 3 : 2;
  const a = width / 2;
  for (let dy = 0; dy < h; dy++) {
    const half = Math.max(1, Math.round(a * (1 - (dy / h) ** 1.5)));
    const shift = Math.round((tilt * (h - dy)) / h);
    const y = bottom - (h - 1) + dy;
    for (let x = 24 - half; x < 24 + half; x++) {
      const c = dy === 0 ? C.steelLight : x < 24 ? C.steel : C.steelDark;
      f.set(x + shift, y, dy === h - 1 ? C.steelMid : c);
    }
  }
  // feed horn rising out of the bowl, red tip like the rover's dish
  const top = bottom - h;
  const sx = Math.round(tilt * 0.3);
  const tx = Math.round(tilt * 0.6);
  f.rect(23 + sx, top, 24 + sx, top, C.steelDark);
  f.rect(23 + tx, top - 1, 24 + tx, top - 1, C.steelDeep);
  f.rect(23 + tx, top - 2, 24 + tx, top - 2, C.red);
  f.set(23 + tx, top - 2, C.redLight);
  return { x: 24 + tx, y: top - 2 };
}

function drawPuff(f, stage) {
  const blobs = [
    [[24, 43, 2]],
    [[24, 44, 4], [20, 45, 2], [28, 45, 2]],
    [[24, 45, 5], [18, 46, 2], [30, 46, 2], [24, 42, 2]],
    [[18, 46, 1], [30, 46, 1], [24, 47, 1], [21, 44, 1], [27, 44, 1]]
  ][stage];
  if (!blobs) return;
  for (const [cx, cy, r] of blobs) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > r + 0.2) continue;
        if (f.solid(x, y)) continue;
        f.set(x, y, dist > r - 1.2 ? C.puffEdge : C.puff);
      }
    }
  }
}

/** A signal wave: an arc around the dish tip, aimed `aim` degrees off vertical. */
function drawWave(f, cx, cy, r, aim) {
  const color = r <= 6 ? C.wave1 : r <= 9 ? C.wave2 : C.wave3;
  const dotted = r >= 10;
  const half = 52;
  let n = 0;
  const seen = new Set();
  for (let deg = -half; deg <= half; deg += 180 / (Math.PI * r)) {
    const t = ((deg + aim) * Math.PI) / 180;
    const x = Math.round(cx + r * Math.sin(t));
    const y = Math.round(cy - r * Math.cos(t));
    const key = x * 100 + y;
    if (seen.has(key)) continue;
    seen.add(key);
    n++;
    if (dotted && n % 2) continue;
    if (!f.solid(x, y)) f.set(x, y, color);
  }
}

function drawSparkle(f, x, y, size) {
  f.set(x, y, C.white);
  for (let k = 1; k <= size; k++) {
    for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) f.set(x + dx, y + dy, k === size ? C.wave2 : C.white);
  }
}

function deployFrame(i) {
  const f = new Frame(F);
  // wing opening: width per frame, with the hinge arm sliding out at the end
  const widths = [2, 2, 4, 6, 8, 11, 11, 11, 11, 11];
  const gaps = [0, 0, 0, 0, 0, 1, 2, 2, 2, 2];
  const mastLen = [0, 0, 0, 0, 0, 0, 3, 6, 6, 6][i];
  const dishW = [0, 0, 0, 0, 0, 0, 0, 4, 6, 10][i];
  const led = i < 8 ? 'off' : i === 8 ? 'red' : 'green';
  drawPanel(f, -1, widths[i], gaps[i]);
  drawPanel(f, 1, widths[i], gaps[i]);
  drawBody(f, led);
  if (mastLen) drawMast(f, mastLen);
  if (dishW) drawDish(f, dishW, 0);
  f.outline();
  if (i <= 3) drawPuff(f, i);
  if (i >= 8) {
    drawSparkle(f, 5, 29, i === 8 ? 1 : 2);
    drawSparkle(f, 42, 36, i === 8 ? 1 : 2);
  }
  return f;
}

function workingFrame(i) {
  const f = new Frame(F);
  const tilt = Math.round(2 * Math.sin((2 * Math.PI * i) / WORKING_FRAMES));
  const led = i < 4 ? 'green' : 'greenDim';
  const glintSum = 34 + 6 * i;
  drawPanel(f, -1, PANEL.maxW, 2, glintSum);
  drawPanel(f, 1, PANEL.maxW, 2, glintSum);
  drawBody(f, led);
  drawMast(f, MAST.maxLen);
  const tip = drawDish(f, 10, tilt);
  f.outline();
  for (let k = 0; k < 2; k++) {
    const r = 5 + ((i + k * 4) % 8);
    drawWave(f, tip.x, tip.y, r, tilt * 10);
  }
  return f;
}

const deploy = Array.from({ length: DEPLOY_FRAMES }, (_, i) => deployFrame(i));
const working = Array.from({ length: WORKING_FRAMES }, (_, i) => workingFrame(i));
writeSheet(OUT_DIR, 'satellite', F, COLS, ROWS, {
  deploy: { row: 0, frameList: deploy, frameMs: 110, loop: false },
  working: { row: 1, frameList: working, frameMs: 130, loop: true }
});
