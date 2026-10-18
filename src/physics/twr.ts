/**
 * TWR to Analog Gauge Needle Angle Converter.
 *
 * Gauge visual arc:
 * - Far-left limit: -50 deg (idle / 0.0x TWR)
 * - Red zone: -50 deg to -25 deg (0.0x to 1.0x TWR - underpowered, cannot lift off)
 * - Neutral zone to center tick: -25 deg to 0 deg (1.0x to 1.5x TWR)
 * - Center tick: 0 deg (1.5x TWR - nominal cruising acceleration)
 * - Green zone entry: +25 deg (2.5x TWR)
 * - Green zone max: +50 deg (4.0x+ TWR - peak punch)
 */

export const TWR_MIN_ANGLE = -50;
export const TWR_RED_TRANSITION_ANGLE = -25;
export const TWR_CENTER_ANGLE = 0;
export const TWR_GREEN_ENTRY_ANGLE = 25;
export const TWR_MAX_ANGLE = 50;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Maps real-time TWR to the analog gauge needle angle in degrees [-50..+50].
 *
 * @param twr Current active thrust-to-weight ratio (thrust / (mass * g))
 * @param throttleActive Whether engines are actively throttling/firing
 */
export function twrToNeedleAngle(twr: number, throttleActive: boolean): number {
  if (!throttleActive || twr <= 0 || !Number.isFinite(twr)) {
    return TWR_MIN_ANGLE;
  }

  if (twr < 1.0) {
    // 0.0 -> -50 deg, 1.0 -> -25 deg
    return lerp(TWR_MIN_ANGLE, TWR_RED_TRANSITION_ANGLE, twr / 1.0);
  }

  if (twr < 1.5) {
    // 1.0 -> -25 deg, 1.5 -> 0 deg
    return lerp(TWR_RED_TRANSITION_ANGLE, TWR_CENTER_ANGLE, (twr - 1.0) / 0.5);
  }

  if (twr < 2.5) {
    // 1.5 -> 0 deg, 2.5 -> +25 deg (green zone entry)
    return lerp(TWR_CENTER_ANGLE, TWR_GREEN_ENTRY_ANGLE, (twr - 1.5) / 1.0);
  }

  if (twr <= 4.0) {
    // 2.5 -> +25 deg, 4.0 -> +50 deg (green zone max)
    return lerp(TWR_GREEN_ENTRY_ANGLE, TWR_MAX_ANGLE, (twr - 2.5) / 1.5);
  }

  return TWR_MAX_ANGLE;
}

/**
 * Returns whether active engines have insufficient TWR to overcome gravity.
 */
export function isLowThrustAlert(twr: number, throttleActive: boolean): boolean {
  return throttleActive && twr > 0 && twr < 1.0;
}
