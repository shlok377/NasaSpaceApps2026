import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { flyingSim, frame } from '../testing';
import { MaxQChallenge } from './MaxQChallenge';

const CFG = CONFIG.challenges.maxQ;
const mid = (CFG.from + CFG.to) / 2;

describe('Max-Q', () => {
  it('starts when the rocket enters its stretch and shows the pressure against the limit', () => {
    const sim = flyingSim();
    const c = new MaxQChallenge();
    c.update(frame(sim, { earthAltitude: CFG.from - 10, dynamicPressure: CFG.limit * 2 }));
    expect(c.status()).toBeNull();
    c.update(frame(sim, { earthAltitude: mid, dynamicPressure: CFG.limit / 2 }));
    expect(c.drainEvents()[0]).toMatchObject({ kind: 'START', id: 'MAX_Q' });
    expect(c.status()).toMatchObject({ danger: false, line: expect.any(Number) });
  });

  it('costs health only above the limit, more the further over', () => {
    const sim = flyingSim();
    const c = new MaxQChallenge();
    c.update(frame(sim, { earthAltitude: mid, dynamicPressure: CFG.limit * 0.9 }, 1));
    expect(sim.hull).toBe(100);
    c.update(frame(sim, { earthAltitude: mid, dynamicPressure: CFG.limit * 1.5 }, 1));
    expect(100 - sim.hull).toBeCloseTo(CFG.damagePerSecond * 0.5);
    expect(c.status()?.danger).toBe(true);
  });

  it('pays a clean pass and only judges once the rocket is through the top', () => {
    const sim = flyingSim();
    const c = new MaxQChallenge();
    c.update(frame(sim, { earthAltitude: mid, dynamicPressure: 100 }));
    c.update(frame(sim, { earthAltitude: CFG.from - 50 }));
    expect(c.drainEvents().some(e => e.kind === 'END')).toBe(false); // fell back out: not judged
    c.update(frame(sim, { earthAltitude: mid, dynamicPressure: 100 }));
    c.update(frame(sim, { earthAltitude: CFG.to + 1 }));
    const end = c.drainEvents().find(e => e.kind === 'END');
    expect(end).toMatchObject({ good: true, award: { points: CFG.reward } });
    c.update(frame(sim, { earthAltitude: mid, dynamicPressure: CFG.limit * 3 }, 1));
    expect(sim.hull).toBe(100); // done for this flight
  });
});
