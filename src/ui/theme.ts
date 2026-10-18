/** Shared look for the in-game HUD widgets. */
export const UI = {
  font: "'Mozilla Headline', system-ui, sans-serif",
  backdrop: 0x05070d,
  backdropAlpha: 0.42,
  text: '#e5e7eb',
  textMuted: '#9ca3af',
  blue: 0x3b82f6,
  sky: 0x60a5fa,
  gold: 0xfacc15,
  goldText: '#facc15',
  amber: 0xf59e0b,
  red: 0xef4444,
  green: 0x22c55e,
  greenText: '#4ade80',
  moon: 0xb4b4b4,
  dim: 0x4b5563
} as const;

/** Bold text with a dark outline so it reads over sky, ground and space. */
export const TEXT_STYLE = (size: number, color: string = UI.text) => ({
  fontSize: `${size}px`,
  color,
  fontStyle: 'bold',
  fontFamily: UI.font,
  stroke: '#000000',
  strokeThickness: 3
});

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '∞';
  if (Math.abs(m) < 1000) return `${Math.round(m)} m`;
  if (Math.abs(m) < 100_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString()} km`;
}
