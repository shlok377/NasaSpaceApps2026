import Phaser from 'phaser';

/** Retro arcade look for the builder: pixel fonts, a warm dusk palette and chunky stepped frames. */
export const PX = {
  title: '"Press Start 2P", monospace',
  body: '"VT323", monospace',
  space: 0x07060b,
  panel: 0x16131d,
  panelDeep: 0x0f0d15,
  border: 0x4b4458,
  borderDim: 0x332e3e,
  glow: 0xb8aec8,
  accent: 0xffa53d,
  red: 0xff4f4f,
  gold: 0xffd23f,
  green: 0x3ef08a,
  white: 0xf4eee6,
  muted: 0x8a829c,
  text: {
    accent: '#ffb85c',
    cream: '#ffe9c4',
    red: '#ff5a5a',
    gold: '#ffd23f',
    green: '#3ef08a',
    white: '#f4eee6',
    muted: '#9d94ae',
    shadow: '#3a1a12'
  }
} as const;

/** Chunky headline text with a hard drop shadow, like an arcade title card. */
export function pixelTitle(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: string = PX.text.accent) {
  return scene.add.text(x, y, text, {
    fontFamily: PX.title,
    fontSize: `${size}px`,
    color,
    shadow: { offsetX: Math.max(2, size / 8), offsetY: Math.max(2, size / 8), color: PX.text.shadow, fill: true, blur: 0 }
  });
}

export function pixelBody(scene: Phaser.Scene, x: number, y: number, text: string, size = 22, color: string = PX.text.white) {
  return scene.add.text(x, y, text, { fontFamily: PX.body, fontSize: `${size}px`, color });
}

/** Rectangle with stepped (pixel-rounded) corners. */
function steppedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, u: number): void {
  g.fillRect(x + 2 * u, y, w - 4 * u, h);
  g.fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
  g.fillRect(x, y + 2 * u, w, h - 4 * u);
}

export interface PanelStyle {
  fill?: number;
  fillAlpha?: number;
  border?: number;
  highlight?: number;
  shadow?: number;
  u?: number;
}

/** Arcade panel: dark outline, coloured frame, bevelled highlight on top and shade underneath. */
export function drawPixelPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: PanelStyle = {}): void {
  const u = style.u ?? 3;
  const border = style.border ?? PX.border;
  g.fillStyle(0x000000, 0.55);
  steppedRect(g, x + u, y + u, w, h, u);
  g.fillStyle(0x01020a, 1);
  steppedRect(g, x - u, y - u, w + 2 * u, h + 2 * u, u);
  g.fillStyle(border, 1);
  steppedRect(g, x, y, w, h, u);
  g.fillStyle(style.fill ?? PX.panel, style.fillAlpha ?? 0.94);
  steppedRect(g, x + u, y + u, w - 2 * u, h - 2 * u, u);
  g.fillStyle(style.highlight ?? PX.glow, 0.55);
  g.fillRect(x + 3 * u, y + u, w - 6 * u, u);
  g.fillStyle(style.shadow ?? 0x000000, 0.35);
  g.fillRect(x + 3 * u, y + h - 2 * u, w - 6 * u, u);
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

/** Plus-shaped sparkle like the stars in arcade title screens. */
export function drawSparkle(g: Phaser.GameObjects.Graphics, color: number, u: number, big: boolean): void {
  g.fillStyle(color, 1);
  g.fillRect(-u / 2, -u / 2, u, u);
  g.fillStyle(color, 0.75);
  const arm = big ? 2 : 1;
  for (let i = 1; i <= arm; i++) {
    g.fillRect(-u / 2, -u / 2 - i * u, u, u);
    g.fillRect(-u / 2, -u / 2 + i * u, u, u);
    g.fillRect(-u / 2 - i * u, -u / 2, u, u);
    g.fillRect(-u / 2 + i * u, -u / 2, u, u);
  }
  if (big) {
    g.fillStyle(0xffffff, 1);
    g.fillRect(-u / 2, -u / 2, u, u);
  }
}
