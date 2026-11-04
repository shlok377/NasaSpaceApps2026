import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createChallenges } from './ChallengeRunner';
import { flyingSim, frame } from './testing';

const C = CONFIG.challenges;

describe('Challenge runner', () => {
  afterEach(() => {
    C.maxQ.enabled = true;
  });

  it('marks every height challenge on the climb, low to high, without overlapping each other', () => {
    const bands = createChallenges().bands;
    expect(bands.map(b => b.label)).toEqual(['max-Q', 'wind', 'radiation', 'TLI']);
    for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBeGreaterThanOrEqual(bands[i - 1].to);
    // None of them sits inside the rock belt.
    for (const b of bands) expect(b.to <= CONFIG.rockBelt.bottom || b.from >= CONFIG.rockBelt.top).toBe(true);
  });

  it('each challenge has its own switch', () => {
    C.maxQ.enabled = false;
    expect(createChallenges().modules.map(m => m.id)).not.toContain('MAX_Q');
  });

  it('collects events, shows the live card and passes the glitch through', () => {
    const sim = flyingSim();
    const r = createChallenges(() => 0.99);
    r.update(frame(sim, { earthAltitude: (C.radiationBelt.from + C.radiationBelt.to) / 2 }));
    expect(r.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'START', id: 'RADIATION_BELT' }));
    expect(r.status?.id).toBe('RADIATION_BELT');
    expect(r.glitch).toBe(true);
  });

  it('a jammed shell takes priority on the card and swallows its key', () => {
    const sim = flyingSim();
    const r = createChallenges(() => 0);
    expect(r.onSeparationKey('B', frame(sim))).toBe(true);
    r.update(frame(sim, { earthAltitude: (C.maxQ.from + C.maxQ.to) / 2 }));
    expect(r.status?.id).toBe('STAGING_FAULT');
  });
});
