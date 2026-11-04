import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { flyingSim, frame } from '../testing';
import { StagingFaultChallenge } from './StagingFaultChallenge';

const CFG = CONFIG.challenges.stagingFault;
const rcsId = (sim: ReturnType<typeof flyingSim>) => sim.vehicle.parts.find(p => p.type === 'RCS')!.id;

describe('Staging fault', () => {
  it('a jam swallows the key; tapping it enough times frees the shell', () => {
    const sim = flyingSim();
    const c = new StagingFaultChallenge(() => 0);
    expect(c.onSeparationKey('b', frame(sim))).toBe(true);
    expect(sim.isShellOpen(rcsId(sim))).toBe(false);
    expect(c.drainEvents()[0]).toMatchObject({ kind: 'START', id: 'STAGING_FAULT' });
    for (let i = 0; i < CFG.taps - 1; i++) c.onSeparationKey('B', frame(sim));
    expect(sim.isShellOpen(rcsId(sim))).toBe(false);
    c.onSeparationKey('B', frame(sim));
    expect(sim.isShellOpen(rcsId(sim))).toBe(true);
    expect(c.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'END', good: true }));
    expect(sim.hull).toBe(100);
  });

  it('out of time, the bolts blow: the shell comes off and health drops', () => {
    const sim = flyingSim();
    const c = new StagingFaultChallenge(() => 0);
    c.onSeparationKey('B', frame(sim));
    c.update(frame(sim, {}, CFG.timeLimit / 2));
    expect(c.status()).toMatchObject({ timeLeft: expect.any(Number) });
    c.update(frame(sim, {}, CFG.timeLimit));
    expect(sim.isShellOpen(rcsId(sim))).toBe(true);
    expect(sim.hull).toBe(100 - CFG.damage);
    expect(c.status()).toBeNull();
  });

  it('rolls once per flight: a lucky roll lets the separation through, and later ones too', () => {
    const sim = flyingSim();
    const rolls = [0.99, 0];
    const c = new StagingFaultChallenge(() => rolls.shift()!);
    expect(c.onSeparationKey('B', frame(sim))).toBe(false);
    expect(c.onSeparationKey('B', frame(sim))).toBe(false);
    expect(rolls).toHaveLength(1);
  });

  it('ignores keys that open no shell', () => {
    const c = new StagingFaultChallenge(() => 0);
    expect(c.onSeparationKey('Q', frame(flyingSim()))).toBe(false);
  });
});
