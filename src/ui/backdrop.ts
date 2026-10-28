import Phaser from 'phaser';

/**
 * Dusk launch-site backdrop painted pixel-by-pixel on a low-res canvas
 * (320 x 180, shown at 4x): dithered sky, far hills, two mountain ranges and layered ground.
 */
const W = 320;
const H = 180;
export const BACKDROP_SCALE = 4;
/** Row (in backdrop pixels) where the ground surface sits. */
export const GROUND_ROW = 163;

const SKY = [0x07060b, 0x0c0912, 0x130d1c, 0x1d1226, 0x2a172f, 0x3b1d36, 0x512639, 0x6c3239, 0x8a4438];
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

export const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const dither = (x: number, y: number) => (BAYER[y & 3][x & 3] + 0.5) / 16;

/** Small deterministic noise so the scene looks the same every load. */
export function hash(x: number, y = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

interface Peak {
  x: number;
  top: number;
  slope: number;
}

// Peaks sit where the see-through build bay (backdrop x 70-250) shows them.
const LEFT_RANGE: Peak[] = [
  { x: 30, top: 88, slope: 1.0 },
  { x: 64, top: 98, slope: 0.95 },
  { x: 92, top: 112, slope: 0.85 },
  { x: 112, top: 134, slope: 0.8 }
];
const RIGHT_RANGE: Peak[] = [
  { x: 206, top: 134, slope: 0.8 },
  { x: 226, top: 114, slope: 0.85 },
  { x: 254, top: 96, slope: 0.95 },
  { x: 290, top: 86, slope: 1.0 }
];

/** Mountain surface row at column x (smaller = higher), and which peak owns it. */
function mountainTop(x: number, peaks: Peak[]): { row: number; peak: Peak } {
  let best = { row: H, peak: peaks[0] };
  for (const p of peaks) {
    const jag = (hash(x, p.x) - 0.5) * 2.2;
    const row = p.top + Math.abs(x - p.x) * p.slope + jag;
    if (row < best.row) best = { row, peak: p };
  }
  return best;
}

export function createBackdropTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H);
  const put = (x: number, y: number, c: number) => {
    const [r, g, b] = rgb(c);
    const i = (y * W + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 1. Sky: ordered-dither blend between gradient stops, warming toward the horizon.
      const t = Math.pow(y / GROUND_ROW, 1.35) * (SKY.length - 1);
      const i = Math.min(Math.floor(t), SKY.length - 2);
      let color = t - i > dither(x, y) ? SKY[i + 1] : SKY[i];

      // 2. Far rolling hills, hazy in the dusk light.
      const far = 146 + Math.round(4 * Math.sin(x * 0.045) + 3 * Math.sin(x * 0.11 + 2));
      if (y >= far) color = y === far ? 0x4a2a3d : (y - far < 3 && dither(x, y) > 0.5) ? 0x3a2133 : 0x2c1a2c;

      // 3. Mountain ranges on both sides, lit from the left, with snowy caps.
      const peaks = x < W / 2 ? LEFT_RANGE : RIGHT_RANGE;
      const { row, peak } = mountainTop(x, peaks);
      if (y >= row) {
        const depth = y - row;
        // Diagonal ridge line from each summit: left faces catch the light.
        const lit = x < peak.x - (y - peak.top) * 0.35 + (hash(y, peak.x) - 0.5) * 2;
        const snowLine = peak.top + 9 + hash(x) * 3;
        if (y < snowLine) {
          color = depth === 0 ? 0xf2eef8 : lit ? 0xd8d2e4 : 0x9d95b0;
          if (y > snowLine - 3 && dither(x, y) > 0.5) color = lit ? 0x6b5d6e : 0x463a4c;
        } else {
          const crack = hash(x * 3, y * 7) > 0.93;
          color = lit ? 0x6b5d6e : 0x463a4c;
          if (depth > 18) color = lit ? (dither(x, y) > 0.5 ? 0x5a4d5f : 0x4f4354) : 0x3a2f40;
          if (crack) color = lit ? 0x4f4354 : 0x2e2534;
        }
      }

      // 4. Ground: grass lip, layered dirt and scattered stones.
      const groundTop = GROUND_ROW + Math.round(Math.sin(x * 0.09) * 1.2 + hash(x, 5) * 0.8);
      if (y >= groundTop) {
        const d = y - groundTop;
        if (d === 0) color = hash(x, 1) > 0.5 ? 0x8fae45 : 0x6f8f35;
        else if (d === 1) color = hash(x, 2) > 0.35 ? 0x56722c : 0x6a4a2c;
        else if (d < 5) color = dither(x, y) > 0.7 ? 0x56722c : 0x6a4a2c;
        else if (d < 9) color = dither(x, y) > 0.5 ? 0x6a4a2c : 0x553a22;
        else color = dither(x, y) > 0.6 ? 0x553a22 : 0x3e2a18;
        if (d > 2 && hash(x * 13, y * 17) > 0.96) color = 0x8a8291;
        if (d > 3 && hash(x * 13, (y - 1) * 17) > 0.96) color = 0x5d5663;
      }

      put(x, y, color);
    }
  }

  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
