import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Math: { Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)) } }
}));

import { skyMoonAlpha } from './WorldRenderer';

describe('sky Moon fade-in', () => {
  it('starts faint on the pad, faintest in daylight', () => {
    expect(skyMoonAlpha(0, 'DAY')).toBeCloseTo(0.15);
    expect(skyMoonAlpha(0, 'SUNSET')).toBeCloseTo(0.22);
    expect(skyMoonAlpha(0, 'NIGHT')).toBeCloseTo(0.3);
  });

  it('grows steadily to fully solid at the Moon', () => {
    for (const id of ['DAY', 'SUNSET', 'NIGHT'] as const) {
      let prev = -1;
      for (let k = 0; k <= 1; k += 0.1) {
        const a = skyMoonAlpha(k, id);
        expect(a).toBeGreaterThan(prev);
        prev = a;
      }
      expect(skyMoonAlpha(1, id)).toBeCloseTo(1);
    }
  });
});
