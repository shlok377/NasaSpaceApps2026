// Draws the animated rover sprite sheet, pixel by pixel, and writes it next to this tool.
//   node animated_sprites/tools/gen-rover.mjs
//
// Sheet layout (64x64 frames, 10 columns, ground is row 57):
//   row 0  FALL    1 frame, static: the airbag ball while it drops (no animation until it hits the ground)
//   row 1  LAND    7 frames, once:  squash on impact, bounces twice, settles, deflates over the shell
//   row 2  DEPLOY 10 frames, once:  the shell opens, the rover unfolds mast, camera, dish and solar panel
//   row 3  DRIVE   8 frames, loops: wheels spin, dish scans, dust trails behind
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, Frame, puffCloud, writeSheet } from './lib.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rover');
const F = 64;
const COLS = 10;
const ROWS = 4;
const GY = 57; // last row of the ground contact
const RAD = Math.PI / 180;

const R = {
  yellow: 0xe5ca08,
  yellowLight: 0xf7db15,
  yellowDark: 0xc7b007,
  flame: 0xffd23f,
  flameMid: 0xffa53d,
  interior: 0x211e30
};

function ledColor(name) {
  return { off: C.off, red: C.redLight, redDim: C.redDark, green: C.green, greenDim: C.greenDim }[name] ?? C.off;
}

// ---------------------------------------------------------------------------
// Rover (side view, facing right)
// ---------------------------------------------------------------------------

function drawWheel(f, cx, cy, spin) {
  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= 3.9) f.set(x, y, C.outline);
      if (d <= 2.4) f.set(x, y, x < cx && y < cy ? C.white : C.metal);
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = spin + k * 90;
    f.set(cx + 1.6 * Math.cos(a * RAD), cy + 1.6 * Math.sin(a * RAD), C.steelMid);
  }
  f.set(cx, cy, C.steelDeep);
}

function drawDish(f, open, theta) {
  if (open <= 0) return;
  const th = theta * RAD;
  const d = [Math.cos(th), -Math.sin(th)]; // where it aims (y is down)
  const p = [Math.sin(th), Math.cos(th)];
  const c = [22.5, 36];
  const rc = [c[0] + d[0] * 1.5, c[1] + d[1] * 1.5];
  const half = 3 * open;
  for (let u = -half; u <= half; u += 0.5) {
    const depth = Math.round(2 * open * (1 - (u / (half + 0.01)) ** 2));
    for (let j = 0; j <= depth; j++) {
      f.set(rc[0] + p[0] * u - d[0] * j, rc[1] + p[1] * u - d[1] * j, j === 0 ? C.redLight : j === depth ? C.redDark : C.red);
    }
  }
  for (let j = 1; j <= 3; j++) f.set(rc[0] + d[0] * j, rc[1] + d[1] * j, j === 3 ? C.white : C.steelLight);
}

/**
 * The rover on its wheels. o: bob (px), spin (deg), mast (0..8 camera mast height), dish (0..1 open),
 * theta (dish aim, deg), panel (0..1 open), led.
 */
function drawRover(f, o) {
  const b = o.bob ?? 0;
  for (const wx of [24, 32, 40]) drawWheel(f, wx, 54, o.spin ?? 0);
  // dish mast + dish
  if ((o.dish ?? 0) > 0) {
    f.rect(22, 37 + b, 23, 43 + b, C.steel);
    f.rect(23, 37 + b, 23, 43 + b, C.steelDark);
      }
  // chassis
  f.rect(20, 44 + b, 43, 50 + b, R.yellow);
  f.rect(20, 44 + b, 43, 44 + b, R.yellowLight);
  f.rect(20, 44 + b, 20, 50 + b, R.yellowLight);
  f.rect(43, 45 + b, 43, 50 + b, R.yellowDark);
  f.rect(21, 49 + b, 43, 50 + b, R.yellowDark);
  f.rect(23, 47 + b, 40, 47 + b, C.red); // red band, like the parts
  f.rect(23, 46 + b, 40, 46 + b, C.redLight);
  f.set(22, 45 + b, C.steelMid);
  f.set(41, 49 + b, C.steelMid);
  f.set(22, 45 + b, C.steelLight);
  // solar panel on the roof
  const pw = Math.round(12 * (o.panel ?? 0));
  for (let i = 0; i < pw; i++) {
    const x = 32 - Math.floor(pw / 2) + i;
    const div = i % 3 === 2;
    f.set(x, 41 + b, C.cellLight);
    f.set(x, 42 + b, div ? C.outline : C.cell);
    f.set(x, 43 + b, C.cellDark);
  }
  // camera mast + head
  const len = o.mast ?? 0;
  if (len > 0) {
    f.rect(39, 43 + b - len, 40, 43 + b, C.steel);
    f.rect(40, 43 + b - len, 40, 43 + b, C.steelDark);
    const hy = 43 + b - len - 5;
    f.rect(37, hy, 44, hy + 4, C.metal);
    f.rect(37, hy, 44, hy, C.white);
    f.rect(37, hy, 37, hy + 4, C.white);
    f.rect(44, hy + 1, 44, hy + 4, C.metalShade);
    f.rect(38, hy + 4, 44, hy + 4, C.metalShade);
    f.rect(42, hy + 1, 43, hy + 2, C.sky);
    f.set(42, hy + 1, C.skyLight);
    f.rect(38, hy + 2, 39, hy + 2, ledColor(o.led));
  }
  drawDish(f, o.dish ?? 0, o.theta ?? 125);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

const dust = (f, cx, cy, stage, dir = 0) => puffCloud(f, cx, cy, stage, dir, GY);

/** The airbag ball: lobed metal-white sphere with black seams; `wrinkle` makes it saggy. */
function drawBag(f, cx, cy, rx, ry, wrinkle = 0) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const t = nx * 0.55 + ny * 0.8;
      let c = t < -0.5 ? C.white : t < 0.15 ? C.metal : t < 0.55 ? C.metalMid : C.metalShade;
      const flat = Math.sqrt(Math.max(0, 1 - ny * ny));
      for (const k of [-0.62, 0, 0.62]) {
        const sx = k * flat + (wrinkle * Math.sin(y * 1.7 + k * 4)) / rx;
        if (Math.abs(nx - sx) < 0.8 / rx) c = C.outline;
      }
      f.set(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Landing shell (cut-away: roof, two end walls, dark inside)
// ---------------------------------------------------------------------------

const SHELL = { x0: 17, x1: 46, roofY0: 42, roofY1: 44, wallLen: 13, wallW: 4 };

/** An end wall that has swung `phi` degrees outward about its bottom outer corner. u runs along the wall, v across it. */
function drawWall(f, side, phi) {
  const hx = side < 0 ? SHELL.x0 : SHELL.x1;
  const out = side; // outward direction on x (-1 left, +1 right)
  const ph = phi * RAD;
  for (let u = 0; u < SHELL.wallLen; u += 0.5) {
    for (let v = 0; v < SHELL.wallW; v += 0.5) {
      const x = hx + out * Math.sin(ph) * u - out * Math.cos(ph) * v;
      const y = GY + 0.49 - Math.cos(ph) * u - Math.sin(ph) * v;
      let c = v < 0.8 ? C.white : v < 2.6 ? C.metal : v < 3.4 ? C.metalMid : C.metalShade;
      if (u >= 6 && u < 8) c = v < 0.8 ? C.redLight : C.red;
      if (u > 10 && u < 12 && v > 1 && v < 3) c = C.steelMid;
      f.set(x, y, c);
    }
  }
}

function drawRoof(f, dx, dy, tilt) {
  const cx = (SHELL.x0 + SHELL.x1 + 1) / 2;
  const cy = (SHELL.roofY0 + SHELL.roofY1 + 1) / 2;
  const a = tilt * RAD;
  for (let u = 0; u < 30; u += 0.5) {
    for (let v = 0; v < 3; v += 0.5) {
      const lx = SHELL.x0 + u - cx;
      const ly = SHELL.roofY0 + v - cy;
      const x = cx + dx + lx * Math.cos(a) - ly * Math.sin(a);
      const y = cy + dy + lx * Math.sin(a) + ly * Math.cos(a);
      let c = v < 1 ? C.white : v < 2 ? C.metal : C.metalShade;
      if (u >= 13 && u < 17) c = v < 1.5 ? C.redLight : C.red;
      f.set(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

/** The airbag ball hanging still in the air; it sits where the ball will touch down, so landing starts from the same spot. */
function fallFrame() {
  const f = new Frame(F);
  drawBag(f, 32, GY - 14, 14, 14);
  f.outline();
  return f;
}

function landFrame(i) {
  const f = new Frame(F);
  const ball = (cy, rx, ry, wr = 0) => drawBag(f, 32, cy, rx, ry, wr);
  switch (i) {
    case 0: // impact: squashed, dust kicks out
      ball(GY - 10, 17, 11);
      f.outline();
      dust(f, 14, GY, 1, -1);
      dust(f, 50, GY, 1, 1);
      break;
    case 1: // first bounce, stretched
      ball(36, 13, 15);
      f.outline();
      dust(f, 12, GY, 3, -1);
      dust(f, 52, GY, 3, 1);
      break;
    case 2: // top of the bounce
      ball(30, 14, 14);
      f.outline();
      break;
    case 3: // second impact
      ball(GY - 11, 16, 12);
      f.outline();
      dust(f, 15, GY, 1, -1);
      dust(f, 49, GY, 1, 1);
      break;
    case 4: // small hop
      ball(41, 14, 14);
      f.outline();
      dust(f, 14, GY, 2, -1);
      dust(f, 50, GY, 2, 1);
      break;
    case 5: // settles
      ball(GY - 12, 15, 13);
      f.outline();
      dust(f, 16, GY, 0, -1);
      dust(f, 48, GY, 0, 1);
      break;
    case 6: // deflating over the shell
      drawShell(f, { backdrop: true });
      drawBag(f, 32, 52, 19, 6, 1.2);
      f.outline();
      break;
  }
  return f;
}

function drawShell(f, o) {
  if (o.backdrop) f.rect(SHELL.x0 + SHELL.wallW, SHELL.roofY1 + 1, SHELL.x1 - SHELL.wallW, GY, R.interior);
  drawRover(f, { led: o.led ?? 'off' });
  drawWall(f, -1, 0);
  drawWall(f, 1, 0);
  drawRoof(f, 0, 0, 0);
}

function deployFrame(i) {
  const f = new Frame(F);
  const phi = [0, 0, 0, 10, 35, 60, 80, 90, 90, null][i];
  const roof = [[0, 0, 0], [0, 0, 0], [0, -2, 0], [0, -6, 4], [3, -14, 10], [6, -26, 20], [9, -40, 32], null, null, null][i];
  const rover = {
    mast: [0, 0, 0, 0, 0, 3, 6, 8, 8, 8][i],
    dish: [0, 0, 0, 0, 0, 0, 0.4, 0.8, 1, 1][i],
    panel: [0, 0, 0, 0, 0, 0, 0.4, 0.8, 1, 1][i],
    theta: 125,
    led: ['off', 'off', 'red', 'redDim', 'red', 'red', 'red', 'red', 'green', 'green'][i]
  };
  if (i <= 3) f.rect(SHELL.x0 + SHELL.wallW, SHELL.roofY1 + 1, SHELL.x1 - SHELL.wallW, GY, R.interior);
  drawRover(f, rover);
  if (i === 1) {
    // the saggy bag slides off both sides
    drawBag(f, 11, 55, 8, 2, 0.6);
    drawBag(f, 53, 55, 8, 2, 0.6);
  }
  if (phi !== null) {
    drawWall(f, -1, phi);
    drawWall(f, 1, phi);
  }
  if (roof) drawRoof(f, roof[0], roof[1], roof[2]);
  if (i === 0) drawBag(f, 32, 54, 20, 4, 1);
  f.outline();
  if (i === 2) for (const [x, y] of [[17, 42], [46, 42], [17, 44], [46, 44]]) f.set(x, y - 2, C.white);
  if (i === 3 || i === 4) for (const [x, y] of [[15, 41], [48, 41], [19, 39], [44, 39]]) f.set(x, y, R.flame);
  if (i >= 6 && i <= 8) {
    dust(f, 10, GY, i - 6 + 1 > 3 ? 3 : i - 6 + 1, -1);
    dust(f, 54, GY, i - 6 + 1 > 3 ? 3 : i - 6 + 1, 1);
  }
  if (i === 9) {
    dust(f, 10, GY, 3, -1);
    dust(f, 54, GY, 3, 1);
  }
  return f;
}

function driveFrame(i) {
  const f = new Frame(F);
  drawRover(f, {
    bob: i % 4 === 2 ? -1 : 0,
    spin: i * 22.5,
    mast: 8,
    dish: 1,
    panel: 1,
    theta: 125 + 28 * Math.sin((2 * Math.PI * i) / 8),
    led: i < 4 ? 'green' : 'greenDim'
  });
  f.outline();
  for (let k = 0; k < 4; k++) {
    const age = (i + k * 2) % 8;
    const x = 17 - age * 1.7 - k;
    const y = GY - 1 - age * 0.45 - (k % 2);
    const c = age < 3 ? C.metal : age < 6 ? C.metalMid : C.metalShade;
    if (age < 4) f.rect(Math.round(x), Math.round(y) - 1, Math.round(x) + 1, Math.round(y), c);
    else f.set(x, y, c);
  }
  return f;
}

const make = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
writeSheet(OUT_DIR, 'rover', F, COLS, ROWS, {
  fall: { row: 0, frameList: make(1, fallFrame), frameMs: 800, loop: false },
  land: { row: 1, frameList: make(7, landFrame), frameMs: 130, loop: false },
  deploy: { row: 2, frameList: make(10, deployFrame), frameMs: 130, loop: false },
  drive: { row: 3, frameList: make(8, driveFrame), frameMs: 110, loop: true }
});
