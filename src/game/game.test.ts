import { describe, expect, it } from 'vitest';
import { FlightStats } from '../physics/FlightSim';
import { ROCK_BELT } from '../physics/constants';
import { VehicleReport } from '../physics/vehicle';
import { currentMission, MISSIONS, newlyCompleted, rocketCost } from './missions';
import { flightEarnings, GRANT_FLOOR, loadProgress, saveProgress, STARTING_MONEY, withGrant } from './progress';
import { BELT, checkBelt, Combo, generateBelt, generateLaneWaves, rockX, RUNNER_LANES } from './rocks';

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
    const cheapSpace = { stats: { ...stats, maxAltitude: 3_500, reachedSpace: true }, report, cost: 60, awards: [], phasesDone: 0, problemsSolved: 0, problemsFailed: 0 };
    const done = newlyCompleted(cheapSpace, []).map(m => m.id);
    expect(done).toEqual(expect.arrayContaining(['liftoff', 'clouds', 'cheap-space']));
    const pricey = { ...cheapSpace, cost: 200 };
    expect(newlyCompleted(pricey, []).map(m => m.id)).not.toContain('cheap-space');
  });

  it('prices rockets from their parts', () => {
    expect(rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE'])).toBeGreaterThan(0);
    expect(rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE', 'ENGINE'])).toBeGreaterThan(rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE']));
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

  it('never leaves a player too broke to fly', () => {
    const { progress, grant } = withGrant({ ...loadProgress(null), money: 3 });
    expect(progress.money).toBe(GRANT_FLOOR);
    expect(grant).toBe(GRANT_FLOOR - 3);
  });
});

describe('rock belt', () => {
  it('fills the belt, denser near the top', () => {
    const rocks = generateBelt().filter(r => r.kind === 'ROCK');
    const mid = (ROCK_BELT.bottom + ROCK_BELT.top) / 2;
    expect(rocks.filter(r => r.y > mid).length).toBeGreaterThan(rocks.filter(r => r.y <= mid).length);
    expect(rocks.every(r => r.y >= ROCK_BELT.bottom && r.y <= ROCK_BELT.top)).toBe(true);
  });

  it('drifting rocks wrap around the belt width', () => {
    const rock = generateBelt()[0];
    for (const t of [0, 100, 1_000]) expect(Math.abs(rockX(rock, t))).toBeLessThanOrEqual(BELT.halfWidth);
  });

  it('reports hits, near misses and pickups once each', () => {
    const rock = { id: 1, kind: 'ROCK' as const, x0: 0, y: 4_000, vx: 0, radius: 8, seed: 0, spent: false };
    const close = { ...rock, id: 2, x0: 12 };
    const shield = { ...rock, id: 3, kind: 'SHIELD' as const, x0: -1, y: 4_001 };
    const parts = [{ id: 'fin', x: 0, y: 4_000 }];
    const r = checkBelt([rock, close, shield], parts, 0, 0.7);
    expect(r.hits.map(h => h.partId)).toEqual(['fin']);
    expect(r.nearMisses.map(n => n.id)).toEqual([2]);
    expect(r.pickups.map(p => p.kind)).toEqual(['SHIELD']);
    expect(checkBelt([rock, close, shield], parts, 0, 0.7).hits).toHaveLength(0);
  });

  it('near misses in a row build a combo that lapses', () => {
    const combo = new Combo();
    expect(combo.nearMiss(0)).toBe(1);
    expect(combo.nearMiss(2)).toBe(2);
    expect(combo.nearMiss(2 + BELT.comboWindow + 1)).toBe(1);
  });

  describe('evasive runner lane waves', () => {
    it('defines 5 discrete lanes from config', () => {
      expect(RUNNER_LANES).toEqual([-20, -10, 0, 10, 20]);
    });

    it('generates waves within the rock belt altitude range', () => {
      const items = generateLaneWaves(12345);
      const rocks = items.filter(r => r.kind === 'ROCK');
      expect(rocks.length).toBeGreaterThan(0);
      expect(rocks.every(r => r.y >= ROCK_BELT.bottom && r.y <= ROCK_BELT.top)).toBe(true);
    });

    it('aligns all obstacles to discrete lanes with zero horizontal drift', () => {
      const items = generateLaneWaves(12345);
      for (const item of items) {
        expect(RUNNER_LANES).toContain(item.x0);
        expect(item.vx).toBe(0);
      }
    });

    it('guarantees 1 to 2 safe open lanes in every wave', () => {
      const items = generateLaneWaves(12345);
      // Group items by wave altitude (within 10m tolerance)
      const waveMap = new Map<number, typeof items>();
      for (const item of items) {
        const waveKey = Math.round(item.y / 70) * 70;
        const list = waveMap.get(waveKey) ?? [];
        list.push(item);
        waveMap.set(waveKey, list);
      }

      for (const [, waveItems] of waveMap) {
        const rockLanes = new Set(waveItems.filter(r => r.kind === 'ROCK').map(r => r.x0));
        const safeLanes = RUNNER_LANES.filter(lane => !rockLanes.has(lane));
        expect(safeLanes.length).toBeGreaterThanOrEqual(1);
        expect(safeLanes.length).toBeLessThanOrEqual(2);
      }
    });

    it('spawns only SHIELD pickups in open safe lanes (no FUEL pickups)', () => {
      const items = generateLaneWaves(12345);
      const shields = items.filter(r => r.kind === 'SHIELD');
      const fuels = items.filter(r => r.kind === 'FUEL');
      expect(shields.length).toBeGreaterThan(0);
      expect(fuels.length).toBe(0);
      for (const p of shields) {
        // Ensure no rock shares the same lane at the same altitude wave
        const waveRocks = items.filter(r => r.kind === 'ROCK' && Math.abs(r.y - p.y) < 15);
        expect(waveRocks.some(r => r.x0 === p.x0)).toBe(false);
      }
    });
  });
});
