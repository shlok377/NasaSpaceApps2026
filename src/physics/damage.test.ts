import { describe, expect, it } from 'vitest';
import { distortedReading } from './damage';

describe('damaged instruments', () => {
  it('read true while the hull is at least half intact', () => {
    expect(distortedReading(100, 100, 1)).toBe(100);
    expect(distortedReading(100, 50, -1)).toBe(100);
  });

  it('drift further off as the hull fails', () => {
    const light = Math.abs(distortedReading(100, 40, 1) - 100);
    const heavy = Math.abs(distortedReading(100, 0, 1) - 100);
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeCloseTo(40, 6);
  });
});
