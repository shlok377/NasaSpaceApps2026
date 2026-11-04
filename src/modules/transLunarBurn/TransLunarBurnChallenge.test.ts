import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { MOON, MOON_CENTER } from '../../physics/constants';
import { orbitFromState } from '../../physics/orbit';
import { flyingSim, frame } from '../testing';
import { burnFuel, correctionKick, predictedPass, TransLunarBurnChallenge } from './TransLunarBurnChallenge';

const CFG = CONFIG.challenges.transLunarBurn;
const pe = (pos: { x: number; y: number }, vel: { x: number; y: number }) => orbitFromState(pos, vel, MOON.mu, MOON.radius).periapsisAltitude;

/** Just inside the Moon's pull, climbing past it a little too close: an impact course. */
const NEAR = { pos: { x: 1500, y: -3000 }, vel: { x: 0, y: 90 } };
function nearMiss(sim: ReturnType<typeof flyingSim>): void {
  sim.state.x = MOON_CENTER.x + NEAR.pos.x;
  sim.state.y = MOON_CENTER.y + NEAR.pos.y;
  sim.state.vx = NEAR.vel.x;
  sim.state.vy = NEAR.vel.y;
}

describe('Trans-lunar burn window', () => {
  it('finds the smallest sideways kick that turns an impact course into a pass in the green', () => {
    const { pos, vel } = NEAR;
    expect(pe(pos, vel)).toBeLessThan(0);
    const kick = correctionKick(pos, vel, CFG.lowPeriapsis, CFG.highPeriapsis, CFG.maxCorrection)!;
    const after = pe(pos, { x: vel.x + kick.x, y: vel.y + kick.y });
    expect(after).toBeGreaterThanOrEqual(CFG.lowPeriapsis);
    expect(after).toBeLessThanOrEqual(CFG.highPeriapsis);
    expect(correctionKick(pos, vel, CFG.lowPeriapsis, CFG.highPeriapsis, 1)).toBeNull();
  });

  it('a bigger burn costs more fuel', () => {
    expect(burnFuel(800, 40)).toBeGreaterThan(burnFuel(800, 20));
    expect(burnFuel(800, 0)).toBe(0);
  });

  it('shows the predicted Moon pass as a needle with a green target', () => {
    const sim = flyingSim();
    nearMiss(sim);
    const c = new TransLunarBurnChallenge();
    c.update(frame(sim, { earthAltitude: CFG.from + 10, body: 'EARTH' }));
    expect(c.drainEvents()[0]).toMatchObject({ kind: 'START', id: 'TRANS_LUNAR_BURN' });
    expect(c.status()).toMatchObject({ needle: true, danger: true, zone: expect.any(Object) });
  });

  it('off course at the Moon’s pull: an automatic correction burn fixes the pass and costs fuel', () => {
    const sim = flyingSim();
    nearMiss(sim);
    const c = new TransLunarBurnChallenge();
    c.update(frame(sim, { earthAltitude: CFG.from + 10, body: 'EARTH' }));
    const fuel = sim.boosterFuel;
    sim.stats.reachedMoonSoi = true;
    c.update(frame(sim, { body: 'MOON' }));
    const end = c.drainEvents().find(e => e.kind === 'END');
    expect(end).toMatchObject({ good: false, message: expect.stringContaining('correction burn') });
    expect(sim.boosterFuel).toBeLessThan(fuel);
    expect(predictedPass(sim)).toBeGreaterThanOrEqual(CFG.lowPeriapsis);
  });

  it('on course: an award and no fuel taken', () => {
    const sim = flyingSim();
    nearMiss(sim);
    const kick = correctionKick(NEAR.pos, NEAR.vel, CFG.lowPeriapsis + 100, CFG.highPeriapsis - 100, CFG.maxCorrection)!;
    sim.state.vx += kick.x;
    sim.state.vy += kick.y;
    const c = new TransLunarBurnChallenge();
    c.update(frame(sim, { earthAltitude: CFG.from + 10, body: 'EARTH' }));
    const fuel = sim.boosterFuel;
    sim.stats.reachedMoonSoi = true;
    c.update(frame(sim, { body: 'MOON' }));
    expect(c.drainEvents().find(e => e.kind === 'END')).toMatchObject({ good: true, award: { points: CFG.reward } });
    expect(sim.boosterFuel).toBe(fuel);
  });
});
