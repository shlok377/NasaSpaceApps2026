import { describe, expect, it } from 'vitest';
import { FlightStats } from './FlightSim';
import { evaluateMission, OUTCOME_PAYOUT } from './mission';
import { VehicleReport } from './vehicle';

const baseStats: FlightStats = {
  maxAltitude: 0,
  maxSpeed: 0,
  maxQ: 0,
  reachedSpace: false,
  reachedMoonSoi: false,
  closestMoonApproach: Infinity,
  landedOn: null,
  crashedOn: null,
  impactSpeed: 0,
  touchdownAt: null,
  stagesDropped: 0,
  partsLost: 0,
  bounces: 0,
  fuelCollected: 0,
  deltaVSpent: 0
};

const goodRocket: VehicleReport = {
  partCount: 9,
  wetMass: 1000,
  dryMass: 500,
  fuelMass: 500,
  liftoffTwr: 1.5,
  deltaV: 500,
  burnTime: 30,
  thrustOffset: 0,
  finCount: 2,
  finStable: true,
  stageCount: 2
};

const run = (stats: Partial<FlightStats>, phasesDone = 0, phase: 'FLYING' | 'LANDED' | 'CRASHED' = 'FLYING') =>
  evaluateMission({ phase, stats: { ...baseStats, ...stats }, report: goodRocket, fuelFraction: 0.1, phasesDone });

describe('mission evaluation', () => {
  it('ranks crew landed > rover > orbit > reached the Moon > space > sky', () => {
    const moon = { maxAltitude: 5_000, reachedSpace: true, reachedMoonSoi: true };
    const results = [
      run({ ...moon, landedOn: 'MOON', impactSpeed: 2 }, 3, 'LANDED'),
      run(moon, 2, 'CRASHED'),
      run(moon, 1, 'CRASHED'),
      run(moon, 0, 'CRASHED'),
      run({ maxAltitude: 3_500, reachedSpace: true }, 0, 'CRASHED'),
      run({ maxAltitude: 1_200 }, 0, 'CRASHED')
    ];
    expect(results.map(r => r.outcome)).toEqual(['CREW_LANDED', 'ROVER_DEPLOYED', 'IN_ORBIT', 'MOON_SOI', 'SPACE', 'SKY']);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThan(results[i].score);
      expect(results[i - 1].stars).toBeGreaterThanOrEqual(results[i].stars);
    }
    expect(OUTCOME_PAYOUT.CREW_LANDED).toBeGreaterThan(OUTCOME_PAYOUT.ROVER_DEPLOYED);
  });

  it('explains design flaws in plain words', () => {
    const result = evaluateMission({
      phase: 'CRASHED',
      stats: { ...baseStats, maxAltitude: 100 },
      report: { ...goodRocket, liftoffTwr: 0.9, thrustOffset: 0.6, finCount: 1, finStable: false },
      fuelFraction: 0,
      phasesDone: 0
    });
    const text = result.insights.join(' ');
    expect(text).toMatch(/heavy/i);
    expect(text).toMatch(/Unbalanced/);
    expect(text).toMatch(/at least 2/);
  });
});
