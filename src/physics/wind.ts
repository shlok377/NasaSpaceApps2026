import { WIND } from './constants';

/**
 * Horizontal wind (m/s, + = blowing east) at a given altitude and time.
 * A smooth altitude profile plus a few overlapping sine waves for gusts —
 * deterministic, so flights are repeatable.
 */
export function windAt(altitude: number, time: number): number {
  if (altitude >= WIND.ceiling || altitude < 0) return 0;
  const jet = WIND.jetStream * Math.exp(-(((altitude - WIND.jetStreamAltitude) / WIND.jetStreamWidth) ** 2));
  const base = WIND.surface + jet;
  // Direction slowly swings with height, so the rocket meets shear on the way up.
  const direction = 0.3 + 0.7 * Math.sin(altitude / 6_000 + 0.8);
  const gust = 0.45 * Math.sin(time * 0.9 + altitude / 700) + 0.3 * Math.sin(time * 2.3 + altitude / 310) + 0.25 * Math.sin(time * 0.37 + 1.3);
  const fade = Math.min(1, (WIND.ceiling - altitude) / 3_000);
  return base * direction * (1 + 0.6 * gust) * fade;
}
