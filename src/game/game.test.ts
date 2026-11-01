import { describe, expect, it } from 'vitest';
import { FlightStats } from '../physics/FlightSim';
import { ROCK_BELT } from '../physics/constants';
import { VehicleReport } from '../physics/vehicle';
import { currentMission, MISSIONS, newlyCompleted, rocketCost } from './missions';
import { flightEarnings, GRANT_FLOOR, loadProgress, saveProgress, STARTING_MONEY, withGrant } from './progress';
import { anchorBelt, BELT, checkBelt, Combo, generateBelt, generateLaneWaves, rockBlocks, rockX, RUNNER_CONFIG, RUNNER_LANES } from './rocks';

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

  it('charges extra for picked fuel, engine and payload types', () => {
    const base = rocketCost(['COCKPIT', 'FUEL_TANK', 'ENGINE']);
    const standard = rocketCost([
      { type: 'COCKPIT', payload: 'CREW' },
      { type: 'FUEL_TANK', fuelKind: 'STANDARD' },
      { type: 'ENGINE', engineKind: 'STANDARD' }
    ]);
    const fancy = rocketCost([
      { type: 'COCKPIT', payload: 'ROVER' },
      { type: 'FUEL_TANK', fuelKind: 'PURPLE' },
      { type: 'ENGINE', engineKind: 'TWIN' }
    ]);
    expect(standard).toBe(base);
    expect(fancy).toBe(base + 15 + 10 + 12);
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
    const fuel = { ...rock, id: 3, kind: 'FUEL' as const, x0: -1, y: 4_001 };
    const parts = [{ id: 'fin', x: 0, y: 4_000 }];
    const r = checkBelt([rock, close, fuel], parts, 0, 0.7);
    expect(r.hits.map(h => h.partId)).toEqual(['fin']);
    expect(r.nearMisses.map(n => n.id)).toEqual([2]);
    expect(r.pickups.map(p => p.kind)).toEqual(['FUEL']);
    expect(checkBelt([rock, close, fuel], parts, 0, 0.7).hits).toHaveLength(0);
  });

  it('near misses in a row build a combo that lapses', () => {
    const combo = new Combo();
    expect(combo.nearMiss(0)).toBe(1);
    expect(combo.nearMiss(2)).toBe(2);
    expect(combo.nearMiss(2 + BELT.comboWindow + 1)).toBe(1);
  });

  describe('evasive runner belt', () => {
    it('defines 5 discrete lanes from config', () => {
      expect(RUNNER_LANES).toEqual([-20, -10, 0, 10, 20]);
    });

    it('keeps every rock within the rock belt altitude range', () => {
      const items = generateLaneWaves(12345);
      const rocks = items.filter(r => r.kind === 'ROCK');
      expect(rocks.length).toBeGreaterThan(0);
      expect(rocks.every(r => r.y >= ROCK_BELT.bottom && r.y <= ROCK_BELT.top)).toBe(true);
    });

    const SEEDS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919);
    const span = ROCK_BELT.top - ROCK_BELT.bottom;
    const lastThird = ROCK_BELT.bottom + (span * 2) / 3;

    it('puts every rock at its own height: no rows across neighbouring lanes', () => {
      for (const seed of SEEDS) {
        const lane = generateLaneWaves(seed, 'NIGHT').filter(r => r.laneIndex !== undefined);
        for (const a of lane) {
          for (const b of lane) {
            if (Math.abs(a.laneIndex! - b.laneIndex!) === 1) expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(3);
          }
        }
      }
    });

    it('gets denser from the bottom third to the top third', () => {
      for (const seed of SEEDS) {
        const rocks = generateLaneWaves(seed);
        const bottom = rocks.filter(r => r.y < ROCK_BELT.bottom + span / 3).length;
        const top = rocks.filter(r => r.y >= lastThird).length;
        expect(top).toBeGreaterThan(bottom);
      }
    });

    it('only drifts rocks sideways in the last third, and some do', () => {
      for (const seed of SEEDS) {
        const rocks = generateLaneWaves(seed);
        const drifters = rocks.filter(r => r.vx !== 0);
        expect(drifters.length).toBeGreaterThan(0);
        for (const r of drifters) {
          expect(r.y).toBeGreaterThanOrEqual(lastThird);
          expect(r.laneIndex).toBeUndefined();
        }
        for (const r of rocks.filter(r => r.vx === 0)) expect(RUNNER_LANES).toContain(r.x0);
      }
    });

    it('has no SHIELD pickups (nor any other pickups), only rocks', () => {
      for (const seed of SEEDS) expect(generateLaneWaves(seed).every(r => r.kind === 'ROCK')).toBe(true);
    });

    it('brings more rocks at night than at dawn for the same seed', () => {
      for (const seed of SEEDS) {
        const dawn = generateLaneWaves(seed, 'DAWN');
        const night = generateLaneWaves(seed, 'NIGHT');
        expect(night.length).toBeGreaterThan(dawn.length);
        expect(night.filter(r => r.vx !== 0).length).toBeGreaterThan(dawn.filter(r => r.vx !== 0).length);
      }
    });

    /**
     * A lane-switching player climbing at the runner's cruise speed: can it get
     * from the belt's bottom to its top without touching a rock? A lane shift
     * takes the lane-shift time, during which the rocket covers both lanes.
     */
    function reachable(rocks: ReturnType<typeof generateLaneWaves>): boolean {
      const step = 0.5;
      const shiftSteps = Math.ceil((RUNNER_CONFIG.cruiseSpeed * RUNNER_CONFIG.laneShiftDuration) / step);
      const clear = (lane: number, y: number) => !rocks.some(r => rockBlocks(r, RUNNER_LANES[lane], y));
      const n = RUNNER_LANES.length;
      const ys: number[] = [];
      for (let y = ROCK_BELT.bottom; y <= ROCK_BELT.top; y += step) ys.push(y);
      const free = ys.map(y => RUNNER_LANES.map((_, l) => clear(l, y)));
      const reach: boolean[][] = [free[0].slice()];
      for (let i = 1; i < ys.length; i++) {
        const row: boolean[] = [];
        for (let l = 0; l < n; l++) {
          if (!free[i][l]) {
            row.push(false);
            continue;
          }
          let ok = reach[i - 1][l];
          for (const from of [l - 1, l + 1]) {
            if (ok || from < 0 || from >= n) continue;
            const s0 = i - shiftSteps;
            if (s0 < 0 || !reach[s0][from]) continue;
            let bothClear = true;
            for (let k = s0; k <= i; k++) if (!free[k][from] || !free[k][l]) bothClear = false;
            ok = bothClear;
          }
          row.push(ok);
        }
        reach.push(row);
      }
      return reach[reach.length - 1].some(Boolean);
    }

    it('always leaves a reachable path at the cruise climb speed and lane-shift time', () => {
      for (const time of ['DAWN', 'NIGHT'] as const) {
        for (const seed of SEEDS) expect(reachable(generateLaneWaves(seed, time))).toBe(true);
      }
    });

    it('drifters wait for the belt clock: anchoring shifts them in time', () => {
      const rocks = generateLaneWaves(42, 'NIGHT');
      const d = rocks.find(r => r.vx !== 0)!;
      const before = rockX(d, 5);
      anchorBelt(rocks, 100);
      expect(rockX(d, 105)).toBeCloseTo(before, 6);
    });
  });
});
