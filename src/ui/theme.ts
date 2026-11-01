import Phaser from 'phaser';
import { PX, drawPixelPanel } from './pixel';

/**
 * Shared look for the in-game HUD widgets: the same retro pixel style as the
 * Rocket Lab (VT323 body text, Press Start 2P titles, warm charcoal panels
 * with stepped corners), tuned a little darker for contrast over the sky.
 */
export const UI = {
  font: PX.body,
  backdrop: PX.panel,
  backdropAlpha: 0.9,
  text: '#f4eee6',
  textMuted: '#b3aac4',
  blue: 0x3b6fd8,
  sky: 0x5cc8ff,
  gold: PX.gold,
  goldText: '#ffd23f',
  amber: PX.accent,
  amberText: '#ffb85c',
  red: PX.red,
  redText: '#ff6b6b',
  green: PX.green,
  greenText: '#3ef08a',
  moon: 0xb4b4b4,
  dim: PX.border
} as const;

/** VT323 runs small, so sizes are scaled up to roughly match the old font's. */
const BODY_SCALE = 1.5;

/** Pixel body text with a hard dark outline so it reads over sky, ground and space. */
export const TEXT_STYLE = (size: number, color: string = UI.text) => {
  const px = Math.round(size * BODY_SCALE);
  return {
    fontSize: `${px}px`,
    color,
    fontFamily: PX.body,
    stroke: '#07060b',
    strokeThickness: Math.max(3, Math.round(px / 7))
  };
};

/** Arcade headline (Press Start 2P) with a hard drop shadow. */
export const TITLE_STYLE = (size: number, color: string = PX.text.cream) => ({
  fontSize: `${size}px`,
  color,
  fontFamily: PX.title,
  stroke: '#07060b',
  strokeThickness: Math.max(2, Math.round(size / 5)),
  shadow: { offsetX: Math.max(2, Math.round(size / 8)), offsetY: Math.max(2, Math.round(size / 8)), color: '#07060b', fill: true, stroke: true, blur: 0 }
});

/** Standard HUD panel: the lab's stepped pixel frame, slightly see-through. */
export function hudPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent?: number): void {
  drawPixelPanel(g, x, y, w, h, { fill: PX.panel, fillAlpha: UI.backdropAlpha, border: accent ?? PX.border, highlight: accent ?? PX.glow, u: 3 });
}

export interface GlassOptions {
  /** Strength of the dark smoke behind the glass, 0..1 (default 0.3). */
  tint?: number;
  /** Colour for the lit rim instead of the lab's cool white (e.g. red for an alarm card). */
  accent?: number;
}

/** Glass is painted at 1/3 scale, so its texels match the 3 px pixel art. */
const GLASS_U = 3;

/**
 * Builds (once per size and look) the smoked Rocket Lab glass texture and returns its key:
 * the lab's sheen gradient, three feathered diagonal bands and lit rim, over a dark smoked tint
 * so text stays readable over a bright sky. Returns the key even when the scene can't paint canvases (tests).
 */
export function glassTexture(scene: Phaser.Scene, w: number, h: number, opts: GlassOptions = {}): string {
  const tint = opts.tint ?? 0.3;
  const tw = Math.max(3, Math.round(w / GLASS_U));
  const th = Math.max(3, Math.round(h / GLASS_U));
  const key = `hud_glass_${tw}x${th}_${Math.round(tint * 100)}_${opts.accent ?? 'lab'}`;
  const textures = scene.textures as Phaser.Textures.TextureManager | undefined;
  if (typeof textures?.createCanvas !== 'function' || textures.exists(key)) return key;
  const tex = textures.createCanvas(key, tw, th);
  const ctx = tex?.getContext();
  if (!tex || !ctx) return key;

  // Smoke first, so the sheen and bands sit on top of it.
  ctx.fillStyle = `rgba(7, 6, 11, ${tint})`;
  ctx.fillRect(0, 0, tw, th);

  const sheen = ctx.createLinearGradient(0, 0, 0, th);
  sheen.addColorStop(0, 'rgba(214, 238, 255, 0.10)');
  sheen.addColorStop(0.45, 'rgba(214, 238, 255, 0.03)');
  sheen.addColorStop(1, 'rgba(214, 238, 255, 0.02)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, tw, th);

  // Reflection bands run perpendicular to the top-left → bottom-right diagonal.
  const band = (from: number, to: number, peak: number) => {
    const g = ctx.createLinearGradient(0, 0, tw, th);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(from, 'rgba(255, 255, 255, 0)');
    g.addColorStop((from + to) / 2, `rgba(255, 255, 255, ${peak})`);
    g.addColorStop(to, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tw, th);
  };
  band(0.14, 0.34, 0.09);
  band(0.36, 0.42, 0.06);
  band(0.7, 0.8, 0.035);

  // Lit rim: top/left catch the light, bottom/right fall into shade.
  const a = opts.accent;
  const rgb = a !== undefined ? `${(a >> 16) & 255}, ${(a >> 8) & 255}, ${a & 255}` : null;
  ctx.fillStyle = rgb ? `rgba(${rgb}, 0.85)` : 'rgba(235, 248, 255, 0.28)';
  ctx.fillRect(0, 0, tw, 1);
  ctx.fillRect(0, 0, 1, th);
  ctx.fillStyle = rgb ? `rgba(${rgb}, 0.45)` : 'rgba(160, 205, 225, 0.12)';
  ctx.fillRect(0, th - 1, tw, 1);
  ctx.fillRect(tw - 1, 0, 1, th);
  // Clipped corners for the pixel look.
  for (const [cx, cy] of [[0, 0], [tw - 1, 0], [0, th - 1], [tw - 1, th - 1]]) ctx.clearRect(cx, cy, 1, 1);

  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/**
 * Smoked Rocket Lab glass panel with its top-left corner at (x, y), sized w × h.
 * Shared by every flight HUD panel, card and key cap: add the image to a container like any other.
 */
export function glassPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: GlassOptions = {}): Phaser.GameObjects.Image {
  return scene.add.image(x, y, glassTexture(scene, w, h, opts)).setOrigin(0, 0).setDisplaySize(w, h);
}

/** Re-shapes an existing glass panel (for cards whose size follows their content). */
export function resizeGlass(img: Phaser.GameObjects.Image, x: number, y: number, w: number, h: number, opts: GlassOptions = {}): void {
  img.setTexture(glassTexture(img.scene, w, h, opts)).setPosition(x, y).setDisplaySize(w, h);
}

/** A recessed well inside a panel (for bars, tanks and tracks). */
export function hudWell(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x07060b, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(0x000000, 0.6);
  g.fillRect(x, y, w, 3);
  g.fillStyle(PX.borderDim, 1);
  g.fillRect(x, y + h - 2, w, 2);
}

/** The original smooth HUD look, kept for the mission result panel. */
export const CLASSIC = {
  font: "'Mozilla Headline', system-ui, sans-serif",
  text: '#e5e7eb',
  textMuted: '#9ca3af',
  goldText: '#facc15',
  greenText: '#4ade80'
} as const;

export const CLASSIC_TEXT_STYLE = (size: number, color: string = CLASSIC.text) => ({
  fontSize: `${size}px`,
  color,
  fontStyle: 'bold',
  fontFamily: CLASSIC.font,
  stroke: '#000000',
  strokeThickness: 3
});

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '∞';
  if (Math.abs(m) < 1000) return `${Math.round(m)} m`;
  if (Math.abs(m) < 100_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString()} km`;
}
