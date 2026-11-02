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
