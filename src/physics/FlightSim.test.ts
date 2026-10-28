import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { PartType } from '../core/types';
import { airDensity } from './atmosphere';
import { dominantBody, earthGravity, gravityAt, moonAltitude, moonSoiAltitude } from './bodies';
import { LIMITS, MOON, MOON_CENTER, WORLD } from './constants';
import { FlightSim, ControlInput, MAX_SUBSTEPS, PHYSICS_DT } from './FlightSim';
import { CONFIG } from '../config';
import { analyzeVehicle, boosterStages, buildFlightVehicle, FlightVehicle } from './vehicle';

type Layout = Array<[number, number, PartType]>;

function buildVehicle(parts: Layout): FlightVehicle {
  const tree = new RocketTree(7, 8);
  for (const [x, y, type] of parts) {
    const result = tree.attachPart(x, y, type);
    if (!result.success) throw new Error(`Could not attach ${type} at ${x},${y}: ${result.reason}`);
  }
  return buildFlightVehicle(tree.getTelemetry().tree);
}

const BASIC: Layout = [
  [7, 9, 'FUEL_TANK'],
  [7, 10, 'ENGINE']
];
const FINNED: Layout = [[7, 7, 'NOSE_CONE'], ...BASIC, [6, 9, 'FIN'], [8, 9, 'FIN']];
/** Core tank + engine with two side boosters (tank + engine each) and fins. */
const STAGED: Layout = [
  [7, 7, 'NOSE_CONE'],
  [7, 9, 'FUEL_TANK'],
  [7, 10, 'ENGINE'],
  [6, 9, 'FUEL_TANK'],
  [8, 9, 'FUEL_TANK'],
  [6, 10, 'ENGINE'],
  [8, 10, 'ENGINE'],
  [5, 9, 'FIN'],
  [9, 9, 'FIN']
];
/** All the fuel and the engine on one side. */
const LOPSIDED: Layout = [
  [7, 7, 'NOSE_CONE'],
  [7, 9, 'FUEL_TANK'],
  [7, 10, 'ENGINE'],
  [6, 9, 'FUEL_TANK'],
  [6, 10, 'ENGINE'],
  [5, 9, 'FIN'],
  [8, 9, 'FIN']
];

const FULL: ControlInput = { throttle: 1, steer: 0 };
const COAST: ControlInput = { throttle: 0, steer: 0 };

function fly(sim: FlightSim, seconds: number, input: ControlInput | ((sim: FlightSim) => ControlInput)): void {
  for (let i = 0; i < seconds * 120 && !sim.isFinished; i++) {
    sim.step(1 / 120, typeof input === 'function' ? input(sim) : input);
  }
}

/** A pilot who just keeps the rocket upright. */
const holdUpright = (throttle = 1) => (sim: FlightSim): ControlInput => {
  const t = sim.getTelemetry();
  return { throttle, steer: Math.max(-1, Math.min(1, -t.pitchFromVertical * 3 - sim.state.omega)) };
};

describe('the compact world', () => {
  it("Earth's pull fades with height; inside the Moon's sphere of influence only the Moon pulls", () => {
    expect(earthGravity(0)).toBeCloseTo(WORLD.surfaceGravity, 6);
    expect(earthGravity(4_000)).toBeLessThan(earthGravity(1_000));
    const soi = moonSoiAltitude();
    expect(soi).toBeGreaterThan(MOON.altitude * 0.5);
    expect(soi).toBeLessThan(MOON.altitude);
    expect(dominantBody(0, soi - 10)).toBe('EARTH');
    expect(dominantBody(0, soi + 10)).toBe('MOON');
    expect(gravityAt(0, soi + 10).y).toBeGreaterThan(0);
    expect(gravityAt(0, soi - 10).y).toBeLessThan(0);
  });

  it('has air at the bottom and space at the top', () => {
    expect(airDensity(0)).toBeCloseTo(WORLD.seaLevelDensity, 6);
    expect(airDensity(WORLD.atmosphereTop + 1)).toBe(0);
  });
});

describe('vehicle model', () => {
  it('derives mass, propellant and thrust from the builder tree', () => {
    const v = buildVehicle(BASIC);
    const p = CONFIG.parts;
    expect(v.dryMass).toBe(p.COCKPIT.mass + p.FUEL_TANK.mass + p.ENGINE.mass);
    expect(v.fuelCapacity).toBe(p.FUEL_TANK.fuelLiters);
    expect(v.engineCount).toBe(1);
  });

  it('finds side boosters (tank + its own engine) as droppable stages', () => {
    expect(boosterStages(buildVehicle(STAGED)).length).toBeGreaterThanOrEqual(2);
    expect(analyzeVehicle(buildVehicle(STAGED)).stageCount).toBeGreaterThanOrEqual(2);
  });
});

describe('flight', () => {
  it('stays on the pad until launch, then climbs', () => {
    const sim = new FlightSim(buildVehicle(STAGED));
    fly(sim, 2, FULL);
    expect(sim.state.y).toBeLessThan(2);
    sim.launch();
    fly(sim, 6, holdUpright());
    expect(sim.getTelemetry().earthAltitude).toBeGreaterThan(30);
    expect(sim.drainEvents().map(e => e.kind)).toContain('LIFTOFF');
  });

  it('an unbalanced rocket tips over on its own', () => {
    const sim = new FlightSim(buildVehicle(LOPSIDED));
    sim.launch();
    let maxTilt = 0;
    fly(sim, 6, s => {
      maxTilt = Math.max(maxTilt, Math.abs(s.getTelemetry().pitchFromVertical));
      return FULL;
    });
    expect(maxTilt).toBeGreaterThan(0.5);
  });

  it('a symmetric finned rocket flies nearly straight up with no help', () => {
    const sim = new FlightSim(buildVehicle(STAGED));
    sim.launch();
    let maxTilt = 0;
    fly(sim, 10, s => {
      maxTilt = Math.max(maxTilt, Math.abs(s.getTelemetry().pitchFromVertical));
      return FULL;
    });
    expect(maxTilt).toBeLessThan(0.35);
  });

  it('runs out of fuel, coasts up, and falls back in an arc', () => {
    const sim = new FlightSim(buildVehicle(FINNED));
    sim.launch();
    // Test a suborbital ascent that coasts and falls back to Earth
    for (const id of sim.tanks.keys()) sim.tanks.set(id, 60);
    fly(sim, 400, holdUpright());
    expect(sim.stats.maxAltitude).toBeGreaterThan(500);
    expect(sim.isFinished).toBe(true);
    expect(sim.stats.landedOn ?? sim.stats.crashedOn).toBe('EARTH');
  });

  it('drops empty boosters, getting lighter', () => {
    const sim = new FlightSim(buildVehicle(STAGED));
    const startParts = sim.vehicle.parts.length;
    sim.launch();
    fly(sim, 40, holdUpright());
    expect(sim.stats.stagesDropped).toBeGreaterThanOrEqual(1);
    expect(sim.vehicle.parts.length).toBeLessThan(startParts);
    expect(sim.debris.length + sim.stats.stagesDropped).toBeGreaterThan(0);
  });

  it('a rock hit knocks off the part it strikes; hitting the cockpit ends the flight', () => {
    const sim = new FlightSim(buildVehicle(FINNED));
    sim.launch();
    fly(sim, 3, FULL);
    const fin = sim.vehicle.parts.find(p => p.type === 'FIN')!;
    sim.hitPart(fin.id);
    expect(sim.vehicle.parts.some(p => p.id === fin.id)).toBe(false);
    expect(sim.stats.partsLost).toBe(1);
    sim.hitPart(sim.vehicle.parts.find(p => p.parentId === null)!.id);
    expect(sim.phase).toBe('CRASHED');
  });

  it('joints snap when the rocket is flung sideways through thick air', () => {
    const sim = new FlightSim(buildVehicle(FINNED));
    sim.launch();
    sim.onGround = false;
    Object.assign(sim.state, { y: 300, vx: 200, vy: 0, theta: Math.PI / 2 });
    fly(sim, 0.2, COAST);
    expect(sim.stats.partsLost).toBeGreaterThan(0);
  });

  it('predicts whether a coast alone reaches the Moon', () => {
    const sim = new FlightSim(buildVehicle(FINNED));
    sim.launch();
    sim.onGround = false;
    Object.assign(sim.state, { y: 3_000, vx: 0, vy: 0 });
    expect(sim.predictApex(true).reachesMoon).toBe(false);
    Object.assign(sim.state, { y: 4_000, vy: 200 });
    expect(sim.predictApex(true).reachesMoon).toBe(true);
  });

  it('a soft upright touchdown on the Moon is a landing; landing tilted tips over', () => {
    const land = (tilt: number) => {
      const sim = new FlightSim(buildVehicle(FINNED));
      sim.launch();
      sim.onGround = false;
      // Hanging just under the Moon's lowest point, nose pointing down at Earth = "up" for the Moon.
      Object.assign(sim.state, { x: 0, y: MOON.altitude - 6, vx: 0, vy: 1, theta: -Math.PI / 2 + tilt, omega: 0 });
      fly(sim, 10, COAST);
      return sim;
    };
    const upright = land(0);
    expect(upright.phase).toBe('LANDED');
    expect(upright.stats.landedOn).toBe('MOON');
    expect(upright.stats.touchdownAt).not.toBeNull();
    const tilted = land(LIMITS.maxLandingTilt + 0.4);
    expect(tilted.phase).toBe('CRASHED');
  });

  it('the staged reference rocket can reach the Moon’s gravity with fuel to spare', () => {
    const sim = new FlightSim(buildVehicle(STAGED));
    sim.launch();
    let cutFuel = -1;
    fly(sim, 200, s => {
      const t = s.getTelemetry();
      // Aim at the Moon, cut once a coast alone gets there.
      const toMoon = Math.atan2(MOON_CENTER.y - s.state.y, MOON_CENTER.x - s.state.x) - Math.PI / 2;
      const target = Math.max(-0.35, Math.min(0.35, toMoon * 2));
      const steer = Math.max(-1, Math.min(1, (target - t.pitchFromVertical) * 3 - s.state.omega));
      if (cutFuel < 0 && s.predictApex(true).reachesMoon) cutFuel = t.fuelFraction;
      return { throttle: cutFuel < 0 ? 1 : 0, steer };
    });
    expect(sim.stats.reachedMoonSoi).toBe(true);
    expect(cutFuel).toBeGreaterThan(0.15);
    expect(moonAltitude(sim.state.x, sim.state.y)).toBeLessThan(MOON.radius);
  });
});

describe('balance check', () => {
  it('flags a rocket that becomes lopsided as its outer tank drains', () => {
    expect(Math.abs(analyzeVehicle(buildVehicle(LOPSIDED)).thrustOffset)).toBeGreaterThan(0.15);
    expect(Math.abs(analyzeVehicle(buildVehicle(STAGED)).thrustOffset)).toBeLessThan(0.05);
  });
});

describe('performance & spiral-of-death protection', () => {
  it('clamps accumulator to MAX_SUBSTEPS during huge frame lag spikes', () => {
    const sim = new FlightSim(buildVehicle(STAGED));
    sim.launch();

    // Simulate an extreme 2.0-second browser freeze / lag spike
    const lagSeconds = 2.0;
    const initialTime = sim.state.time;
    sim.advance(lagSeconds, { throttle: 1, steer: 0 });

    // The sim should advance by exactly MAX_SUBSTEPS * PHYSICS_DT, not 240 steps!
    const expectedMaxAdvance = MAX_SUBSTEPS * PHYSICS_DT;
    const actualAdvance = sim.state.time - initialTime;
    expect(actualAdvance).toBeCloseTo(expectedMaxAdvance, 5);
  });

  it('caches centerOfMass calculation across accesses and invalidates when fuel burns', () => {
    const sim = new FlightSim(buildVehicle(STAGED));
    const initialCom = sim.com;
    // Repeated access returns the exact same cached reference
    expect(sim.com).toBe(initialCom);

    sim.launch();
    // After stepping with throttle 0 (no fuel burned), cache remains identical
    sim.step(1 / 120, { throttle: 0, steer: 0 });
    expect(sim.com).toBe(initialCom);

    // After stepping with throttle 1 (fuel burns), cache invalidates and updates
    sim.step(1 / 120, { throttle: 1, steer: 0 });
    const burnedCom = sim.com;
    expect(burnedCom).not.toBe(initialCom);
    // Subsequent access returns the new cached reference
    expect(sim.com).toBe(burnedCom);
  });
});

