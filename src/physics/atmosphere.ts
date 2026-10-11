import { WORLD } from './constants';

/** Barometric air density ρ(y) = ρ₀·e^(−y/H), vacuum above the top of the air. */
export function airDensity(altitude: number): number {
  if (altitude >= WORLD.atmosphereTop) return 0;
  return WORLD.seaLevelDensity * Math.exp(-Math.max(altitude, 0) / WORLD.scaleHeight);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Transonic drag rise: peaks just past Mach 1, settles to a higher supersonic plateau. */
export function machDragFactor(mach: number): number {
  const peak = 0.9 * Math.exp(-(((mach - 1.1) / 0.3) ** 2));
  return 1 + peak + 0.3 * smoothstep(0.8, 1.4, mach);
}
