export interface ScreenRetrogradeVector {
  dirX: number;
  dirY: number;
  alpha: number;
}

/**
 * Calculates screen-space retrograde vector from world velocity and camera up-angle
 * with zero heap allocations when using a destination object.
 * Pure TypeScript without Phaser dependencies.
 */
export function computeScreenRetrograde(
  vx: number,
  vy: number,
  upAngle: number,
  out?: ScreenRetrogradeVector
): ScreenRetrogradeVector | null {
  const speed = Math.hypot(vx, vy);
  if (speed < 0.5) return null;

  const wvx = -vx / speed;
  const wvy = -vy / speed;
  const ux = Math.cos(upAngle);
  const uy = Math.sin(upAngle);

  // Rotate world direction into camera screen orientation
  const dirX = wvx * uy - wvy * ux;
  const dirY = -(wvx * ux + wvy * uy);
  const alpha = Math.min(Math.max((speed - 0.5) / 1.5, 0), 1) * 0.9;

  if (out) {
    out.dirX = dirX;
    out.dirY = dirY;
    out.alpha = alpha;
    return out;
  }
  return { dirX, dirY, alpha };
}
