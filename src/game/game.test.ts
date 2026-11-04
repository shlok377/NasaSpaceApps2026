import { describe, expect, it } from 'vitest';
import { FlightStats } from '../physics/FlightSim';
import { VehicleReport } from '../physics/vehicle';
import { currentMission, MISSIONS, newlyCompleted, rocketCost } from './missions';
import { flightEarnings, objectiveBonus, payoutBreakdown, GRANT_FLOOR, loadProgress, saveProgress, STARTING_MONEY, withGrant } from './progress';

const stats: FlightStats = {
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
  damageTaken: 0,
  bounces: 0,
  fuelCollected: 0,
  deltaVSpent: 0
};
const report: VehicleReport = {
  partCount: 6,
  wetMass: 500,
  dryMass: 300,
  fuelMass: 200,
  liftoffTwr: 1.4,
  deltaV: 350,
  burnTime: 25,
  thrustOffset: 0,
  finCount: 2,
  finStable: true,
  stageCount: 0
};

describe('missions', () => {
  it('starts with the easiest mission and moves on as they are completed', () => {
    expect(currentMission([])?.id).toBe(MISSIONS[0].id);
    expect(currentMission([MISSIONS[0].id])?.id).toBe(MISSIONS[1].id);
    expect(currentMission(MISSIONS.map(m => m.id))).toBeNull();
  });

  it('checks goals and constraints against the flight', () => {
    const cheapSpace = { stats: { ...stats, maxAltitude: 3_500, reachedSpace: true }, report, cost: 60, awards: [], phasesDone: 0, payload: 'CREW' as const, objectiveDone: false, problemsSolved: 0, problemsFailed: 0 };
    const done = newlyCompleted(cheapSpace, []).map(m => m.id);
    expect(done).toEqual(expect.arrayContaining(['liftoff', 'clouds', 'cheap-space']));
    const pricey = { ...cheapSpace, cost: 200 };
    expect(newlyCompleted(pricey, []).map(m => m.id)).not.toContain('cheap-space');
  });

  it('objective missions follow the chosen payload', () => {
    const base = { stats, report, cost: 100, awards: [], phasesDone: 2, payload: 'SATELLITE' as const, objectiveDone: true, problemsSolved: 0, problemsFailed: 0 };
    const ids = (c: typeof base | { payload: 'ROVER' | 'CREW' }) => newlyCompleted({ ...base, ...c }, []).map(m => m.id);
    expect(ids(base)).toContain('satellite');
    expect(ids(base)).not.toContain('rover');
    expect(ids({ payload: 'ROVER' })).toContain('rover');
    expect(ids({ payload: 'CREW' })).toContain('crew');
  });

  it('pays a bonus for a clean, cheap finished objective only', () => {
    expect(objectiveBonus(false, 500, 0, 50)).toBe(0);
    expect(objectiveBonus(true, 500, 3, 500)).toBe(0);
    expect(objectiveBonus(true, 500, 0, 500)).toBeGreaterThan(0);
    expect(objectiveBonus(true, 500, 0, 50)).toBeGreaterThan(objectiveBonus(true, 500, 0, 500));
  });

  it('prices rockets from their parts', () => {
    expect(rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE'])).toBeGreaterThan(0);
    expect(rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE', 'ENGINE'])).toBeGreaterThan(rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE']));
  });

  it('charges extra for picked fuel and payload types', () => {
    const base = rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE']);
    const standard = rocketCost([
      { type: 'COCKPIT', payload: 'CREW' },
      { type: 'FUEL_TANK', fuelKind: 'KEROSENE' },
      { type: 'ENGINE' }
    ]);
    const fancy = rocketCost([
      { type: 'COCKPIT', payload: 'ROVER' },
      { type: 'FUEL_TANK', fuelKind: 'HYDROGEN' },
      { type: 'ENGINE' }
    ]);
    expect(standard).toBe(base);
    expect(fancy).toBe(base + 15 + 10);
  });
});

describe('economy', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('starts new players with money and round-trips progress', () => {
    const store = memory();
    const fresh = loadProgress(store);
    expect(fresh.money).toBe(STARTING_MONEY);
    saveProgress({ ...fresh, money: 58, completedMissions: ['liftoff'] }, store);
    expect(loadProgress(store)).toMatchObject({ money: 58, completedMissions: ['liftoff'] });
    store.setItem('nasa2026.progress', '{oops');
    expect(loadProgress(store).money).toBe(STARTING_MONEY);
  });

  it('pays more for going further, and refunds half the rocket for landing it home', () => {
    const space = flightEarnings('SPACE', [], 0, 100, false);
    const home = flightEarnings('SPACE', [], 0, 100, true);
    const moon = flightEarnings('CREW_LANDED', [], 150, 100, false);
    expect(home.total - space.total).toBe(50);
    expect(moon.total).toBeGreaterThan(space.total);
  });

  it('pays double for a night launch, but not on the rocket refund', () => {
    const dawn = flightEarnings('SPACE', [], 20, 100, true);
    const night = flightEarnings('SPACE', [], 20, 100, true, 0, 2);
    expect(night.outcome).toBe(dawn.outcome * 2);
    expect(night.mission).toBe(40);
    expect(night.recovery).toBe(dawn.recovery);
  });

  it('never leaves a player too broke to fly', () => {
    const { progress, grant } = withGrant({ ...loadProgress(null), money: 3 });
    expect(progress.money).toBe(GRANT_FLOOR);
    expect(grant).toBe(GRANT_FLOOR - 3);
  });
});

describe('payout breakdown', () => {
  it('lists the base and each bonus, and only pays bonuses on a finished objective', () => {
    expect(payoutBreakdown(false, 400, 0, 10, 2)).toEqual({ base: 400, clean: 0, cheap: 0, time: 0 });
    const b = payoutBreakdown(true, 400, 0, 10, 1.5);
    expect(b.clean).toBeGreaterThan(0);
    expect(b.cheap).toBeGreaterThan(0);
    expect(b.time).toBe(200);
    expect(objectiveBonus(true, 400, 0, 10)).toBe(b.clean + b.cheap);
  });
});
