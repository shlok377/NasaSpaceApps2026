import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { flyingSim, frame } from '../testing';
import { shearGust, WindShearChallenge } from './WindShearChallenge';

const CFG = CONFIG.challenges.windShear;
const at = (p: number) => CFG.from + p * (CFG.to - CFG.from);
const deg = (d: number) => (d * Math.PI) / 180;

describe('Wind shear', () => {
  it('blows one way in the lower half of the layer and the other way above', () => {
    expect(shearGust(0.25, 1, 20)).toBeCloseTo(20);
    expect(shearGust(0.75, 1, 20)).toBeCloseTo(-20);
    expect(shearGust(0.25, -1, 20)).toBeCloseTo(-20);
  });

  it('adds the gust (scaled by the launch time) inside the layer and calms it on the way out', () => {
    const sim = flyingSim();
    sim.windScale = 2;
    const c = new WindShearChallenge(() => 0);
    c.update(frame(sim, { earthAltitude: at(0.25) }));
    expect(sim.gust).toBeCloseTo(CFG.gust * 2);
    c.update(frame(sim, { earthAltitude: CFG.to + 5 }));
    expect(sim.gust).toBe(0);
  });

  it('costs health while the rocket leans past the limit', () => {
    const sim = flyingSim();
    const c = new WindShearChallenge(() => 0.9);
    c.update(frame(sim, { earthAltitude: at(0.3), pitchFromVertical: deg(CFG.maxTiltDegrees - 5) }, 1));
    expect(sim.hull).toBe(100);
    c.update(frame(sim, { earthAltitude: at(0.4), pitchFromVertical: -deg(CFG.maxTiltDegrees + 5) }, 1));
    expect(100 - sim.hull).toBeCloseTo(CFG.damagePerSecond);
    expect(c.status()).toMatchObject({ danger: true, howTo: expect.stringContaining('tap A') });
    c.update(frame(sim, { earthAltitude: CFG.to + 1 }));
    expect(c.drainEvents().find(e => e.kind === 'END')).toMatchObject({ good: false });
  });
});
