import { describe, it, expect } from 'vitest';
import {
  twrToNeedleAngle,
  isLowThrustAlert,
  TWR_MIN_ANGLE,
  TWR_RED_TRANSITION_ANGLE,
  TWR_CENTER_ANGLE,
  TWR_GREEN_ENTRY_ANGLE,
  TWR_MAX_ANGLE
} from './twr';

describe('TWR to Needle Angle Mapping', () => {
  it('returns resting angle (-50 deg) when engines are off or coasting', () => {
    expect(twrToNeedleAngle(0, false)).toBe(TWR_MIN_ANGLE);
    expect(twrToNeedleAngle(2.5, false)).toBe(TWR_MIN_ANGLE);
    expect(twrToNeedleAngle(-1, false)).toBe(TWR_MIN_ANGLE);
    expect(twrToNeedleAngle(0, true)).toBe(TWR_MIN_ANGLE);
  });

  it('maps red zone correctly for underpowered thrust (TWR 0.0 to 1.0)', () => {
    expect(twrToNeedleAngle(0.0, true)).toBe(TWR_MIN_ANGLE);
    expect(twrToNeedleAngle(0.5, true)).toBeCloseTo(-37.5, 1);
    expect(twrToNeedleAngle(1.0, true)).toBe(TWR_RED_TRANSITION_ANGLE);
  });

  it('maps center tick at TWR 1.5 (0 deg)', () => {
    expect(twrToNeedleAngle(1.25, true)).toBeCloseTo(-12.5, 1);
    expect(twrToNeedleAngle(1.5, true)).toBe(TWR_CENTER_ANGLE);
  });

  it('maps green zone entry at TWR 2.5 (+25 deg) and max clamp at 4.0+ (+50 deg)', () => {
    expect(twrToNeedleAngle(2.0, true)).toBeCloseTo(12.5, 1);
    expect(twrToNeedleAngle(2.5, true)).toBe(TWR_GREEN_ENTRY_ANGLE); // Exactly +25 deg
    expect(twrToNeedleAngle(3.25, true)).toBeCloseTo(37.5, 1);
    expect(twrToNeedleAngle(4.0, true)).toBe(TWR_MAX_ANGLE);
    expect(twrToNeedleAngle(10.0, true)).toBe(TWR_MAX_ANGLE); // Clamped at +50 deg
  });

  it('triggers low-thrust alert only when engines are active but TWR < 1.0', () => {
    expect(isLowThrustAlert(0, false)).toBe(false);
    expect(isLowThrustAlert(0.8, false)).toBe(false); // Coasting is not an alert
    expect(isLowThrustAlert(0.8, true)).toBe(true);   // Engines active but failing to lift off
    expect(isLowThrustAlert(1.2, true)).toBe(false);  // Nominal
    expect(isLowThrustAlert(2.5, true)).toBe(false);  // High acceleration
  });
});
