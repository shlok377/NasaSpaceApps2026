/** Below this hull integrity the instruments start lying. */
export const READOUT_FAULT_HULL = 50;

/**
 * A damaged hull throws the readouts off: up to ±40 % at 0 hull, nothing at or above half.
 * `noise` is a value in −1..1 (the scene feeds it a slow wobble so the numbers drift rather than flicker).
 */
export function distortedReading(value: number, hull: number, noise: number): number {
  if (hull >= READOUT_FAULT_HULL) return value;
  const spread = ((READOUT_FAULT_HULL - hull) / READOUT_FAULT_HULL) * 0.4;
  return value * (1 + noise * spread);
}
