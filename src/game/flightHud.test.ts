import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { FuelKind, PartType } from '../core/types';
import { FlightSim } from '../physics/FlightSim';
import { boosterStages, buildFlightVehicle } from '../physics/vehicle';
import { flightHudModel, HudTelemetry } from './flightHud';

type Layout = Array<[number, number, PartType, FuelKind?]>;

function simFor(parts: Layout): FlightSim {
  const tree = new RocketTree(7, 8);
  for (const [x, y, type, kind] of parts) {
    const result = tree.attachPart(x, y, type, kind);
    if (!result.success) throw new Error(`Could not attach ${type} at ${x},${y}: ${result.reason}`);
  }
  return new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
}

const deg = (d: number) => (d * Math.PI) / 180;
const CALM: HudTelemetry = { pitchFromVertical: 0, wind: 0 };
const hud = (sim: FlightSim, telemetry: Partial<HudTelemetry> = {}) => flightHudModel(sim, { ...CALM, ...telemetry });

/** Core methane tank + engine, two kerosene side boosters with their own engines. */
const STAGED: Layout = [
  [7, 9, 'FUEL_TANK', 'GREEN'],
  [7, 10, 'ENGINE'],
  [6, 9, 'FUEL_TANK'],
  [8, 9, 'FUEL_TANK'],
  [6, 10, 'ENGINE'],
  [8, 10, 'ENGINE']
];

/** Eight tanks: a hydrogen core stack of four and four kerosene side tanks. */
const BIG: Layout = [
  [7, 9, 'FUEL_TANK', 'PURPLE'],
  [7, 10, 'FUEL_TANK', 'PURPLE'],
  [7, 11, 'FUEL_TANK', 'PURPLE'],
  [7, 12, 'FUEL_TANK', 'PURPLE'],
  [7, 13, 'ENGINE'],
  [6, 9, 'FUEL_TANK'],
  [8, 9, 'FUEL_TANK'],
  [6, 10, 'FUEL_TANK'],
  [8, 10, 'FUEL_TANK']
];

describe('flight HUD model: fuel', () => {
  it('has one entry per tank with its fuel type and fill', () => {
    const sim = simFor(STAGED);
    const [core, left, right] = sim.vehicle.parts.filter(p => p.fuelCapacity > 0);
    sim.tanks.set(left.id, left.fuelCapacity / 2);
    const model = hud(sim);
    expect(model.grouped).toBe(false);
    expect(model.tanks).toHaveLength(3);
    const byId = new Map(model.tanks.map(t => [t.id, t]));
    expect(byId.get(core.id)).toMatchObject({ fuelKind: 'GREEN', fraction: 1, attached: true, count: 1 });
    expect(byId.get(left.id)).toMatchObject({ fuelKind: 'STANDARD', attached: true });
    expect(byId.get(left.id)!.fraction).toBeCloseTo(0.5);
    expect(byId.get(right.id)).toMatchObject({ fuelKind: 'STANDARD', fraction: 1 });
  });

  it('carries each tank’s fuel type onto the flight parts (kerosene by default)', () => {
    const sim = simFor(STAGED);
    const kinds = sim.vehicle.parts.filter(p => p.type === 'FUEL_TANK').map(p => p.fuelKind);
    expect(kinds.sort()).toEqual(['GREEN', 'STANDARD', 'STANDARD']);
    expect(sim.vehicle.parts.filter(p => p.type === 'ENGINE').every(p => p.fuelKind === undefined)).toBe(true);
  });

  it('reports tanks that dropped away with their booster as gone', () => {
    const sim = simFor(STAGED);
    // The side boosters (the core tank is a stage too, but it keeps flying).
    const boosters = boosterStages(sim.vehicle).filter(id => sim.vehicle.parts.find(p => p.id === id)!.u !== 0);
    expect(boosters).toHaveLength(2);
    sim.launch();
    for (const id of boosters) sim.tanks.set(id, 0);
    for (let i = 0; i < 10; i++) sim.step(1 / 120, { throttle: 1, steer: 0 });
    for (const id of boosters) expect(sim.vehicle.parts.some(p => p.id === id)).toBe(false);

    const model = hud(sim);
    expect(model.tanks).toHaveLength(3);
    for (const tank of model.tanks) {
      const dropped = boosters.includes(tank.id);
      expect(tank.attached).toBe(!dropped);
      if (dropped) expect(tank.fraction).toBe(0);
    }
  });

  it('groups repeated tanks as ×n above six tanks', () => {
    const sim = simFor(BIG);
    expect(sim.vehicle.parts.filter(p => p.fuelCapacity > 0)).toHaveLength(8);
    const model = hud(sim);
    expect(model.grouped).toBe(true);
    expect(model.tanks.length).toBeLessThanOrEqual(6);
    expect(model.tanks.reduce((n, t) => n + t.count, 0)).toBe(8);
    expect(model.tanks.some(t => t.count > 1)).toBe(true);
    for (const t of model.tanks) expect(t.partIds).toHaveLength(t.count);
    expect(model.tanks.filter(t => t.fuelKind === 'PURPLE').reduce((n, t) => n + t.count, 0)).toBe(4);
  });

  it('does not group six tanks or fewer', () => {
    const sim = simFor(BIG.filter(([x, y]) => !(y === 10 && x !== 7)));
    expect(hud(sim)).toMatchObject({ grouped: false });
    expect(hud(sim).tanks.every(t => t.count === 1)).toBe(true);
  });

  it('gives the total fuel as a percentage of what the rocket launched with', () => {
    const sim = simFor(STAGED);
    expect(hud(sim).totalFuelPercent).toBe(100);
    const [core, left, right] = sim.vehicle.parts.filter(p => p.fuelCapacity > 0);
    sim.tanks.set(core.id, 0);
    sim.tanks.set(left.id, left.fuelCapacity / 2);
    sim.tanks.set(right.id, right.fuelCapacity / 2);
    const expected = Math.round((100 * left.fuelCapacity) / (core.fuelCapacity + left.fuelCapacity + right.fuelCapacity));
    expect(hud(sim).totalFuelPercent).toBe(expected);
    for (const id of sim.tanks.keys()) sim.tanks.set(id, 0);
    expect(hud(sim).totalFuelPercent).toBe(0);
  });
});

describe('flight HUD model: attitude and wind', () => {
  const sim = simFor(STAGED);

  it('gives the tilt in degrees with warnings past 20° and 35°', () => {
    expect(hud(sim, { pitchFromVertical: deg(12) }).tiltDegrees).toBeCloseTo(12);
    expect(hud(sim, { pitchFromVertical: 0 }).tiltWarning).toBe('NORMAL');
    expect(hud(sim, { pitchFromVertical: deg(19.9) }).tiltWarning).toBe('NORMAL');
    expect(hud(sim, { pitchFromVertical: deg(20.5) }).tiltWarning).toBe('AMBER');
    expect(hud(sim, { pitchFromVertical: deg(-25) }).tiltWarning).toBe('AMBER');
    expect(hud(sim, { pitchFromVertical: deg(34.9) }).tiltWarning).toBe('AMBER');
    expect(hud(sim, { pitchFromVertical: deg(36) }).tiltWarning).toBe('RED');
    expect(hud(sim, { pitchFromVertical: deg(-60) }).tiltWarning).toBe('RED');
  });

  it('reads the tilt straight from the sim’s attitude', () => {
    sim.state.theta = Math.PI / 2 + deg(30);
    expect(hud(sim, { pitchFromVertical: sim.getTelemetry().pitchFromVertical }).tiltDegrees).toBeCloseTo(30, 0);
    sim.state.theta = Math.PI / 2;
  });

  it('points the wind arrow the way the wind blows, stronger for stronger wind', () => {
    const right = hud(sim, { wind: 6 }).wind;
    const left = hud(sim, { wind: -6 }).wind;
    expect(right.direction).toBe(1);
    expect(left.direction).toBe(-1);
    expect(hud(sim, { wind: 0 }).wind).toMatchObject({ direction: 0, strength: 0 });
    expect(hud(sim, { wind: 15 }).wind.strength).toBeGreaterThan(right.strength);
    expect(hud(sim, { wind: 500 }).wind.strength).toBe(1);
  });

  it('passes the launch time through for the sky palette', () => {
    expect(flightHudModel(sim, CALM, 'NIGHT').timeOfDay).toBe('NIGHT');
  });
});
