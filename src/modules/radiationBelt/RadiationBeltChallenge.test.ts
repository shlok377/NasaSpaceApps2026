import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { flyingSim, frame } from '../testing';
import { RadiationBeltChallenge } from './RadiationBeltChallenge';

const CFG = CONFIG.challenges.radiationBelt;
const mid = (CFG.from + CFG.to) / 2;

describe('Radiation belt', () => {
  it('drains health every second inside and scrambles the readouts until the rocket is out', () => {
    const sim = flyingSim();
    const c = new RadiationBeltChallenge();
    c.update(frame(sim, { earthAltitude: mid }, 2));
    expect(100 - sim.hull).toBeCloseTo(CFG.dosePerSecond * 2);
    expect(c.glitch).toBe(true);
    c.update(frame(sim, { earthAltitude: CFG.to + 1 }));
    expect(c.glitch).toBe(false);
    expect(c.drainEvents().find(e => e.kind === 'END')).toMatchObject({ good: true, award: { points: CFG.reward } });
  });

  it('hits a crewed ship harder', () => {
    const sim = flyingSim();
    new RadiationBeltChallenge().update(frame(sim, { earthAltitude: mid }, 2, 'CREW'));
    expect(100 - sim.hull).toBeCloseTo(CFG.dosePerSecond * CFG.crewFactor * 2);
  });

  it('a slow crossing gets no award', () => {
    const sim = flyingSim();
    const c = new RadiationBeltChallenge();
    c.update(frame(sim, { earthAltitude: mid }, CFG.cleanDose / CFG.dosePerSecond + 1));
    c.update(frame(sim, { earthAltitude: CFG.to + 1 }));
    const end = c.drainEvents().find(e => e.kind === 'END');
    expect(end).toMatchObject({ good: false });
    expect(end && 'award' in end ? end.award : undefined).toBeUndefined();
  });
});
