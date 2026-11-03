import { describe, expect, it } from 'vitest';
import { fuelUnlockCost } from '../core/partDefinitions';
import { RocketTree } from '../core/RocketTree';
import { FuelKind } from '../core/types';
import { FlightSim } from './FlightSim';
import { analyzeVehicle, buildFlightVehicle } from './vehicle';

/** Cockpit, one tank of `fuel` below it, one booster below that. */
function rocket(fuel: FuelKind) {
  const tree = new RocketTree(7, 8);
  tree.attachPart(7, 9, 'FUEL_TANK', fuel);
  tree.attachPart(7, 10, 'ENGINE');
  return tree;
}

/** Kerosene rocket with an RCS on the cockpit's left side and a cold gas tank hanging below it. */
function rcsRocket(withGas = true) {
  const tree = rocket('KEROSENE');
  expect(tree.attachPart(6, 8, 'RCS').success).toBe(true);
  if (withGas) expect(tree.attachPart(6, 9, 'FUEL_TANK', 'COLD_GAS').success).toBe(true);
  return tree;
}

const report = (fuel: FuelKind) => analyzeVehicle(buildFlightVehicle(rocket(fuel).getTelemetry().tree));

/** A sim already coasting well above the air. */
function inSpace(tree: RocketTree) {
  const sim = new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
  sim.phase = 'FLYING';
  sim.state.y = 400_000;
  sim.onGround = false;
  return sim;
}

describe('fuels', () => {
  it('hydrogen is lighter and goes further than kerosene', () => {
    const k = report('KEROSENE');
    const h = report('HYDROGEN');
    expect(h.wetMass).toBeLessThan(k.wetMass);
    expect(h.deltaV).toBeGreaterThan(k.deltaV);
  });

  it('hydrogen has a one-time unlock price; kerosene and cold gas are open', () => {
    expect(fuelUnlockCost('HYDROGEN')).toBeGreaterThan(0);
    expect(fuelUnlockCost('KEROSENE')).toBe(0);
    expect(fuelUnlockCost('COLD_GAS')).toBe(0);
  });

  it('boosters need kerosene or hydrogen: cold gas alone cannot launch', () => {
    const t = rocket('COLD_GAS').getTelemetry();
    expect(t.valid).toBe(false);
    expect(t.missing).toBe('BOOSTERS NEED KEROSENE OR HYDROGEN');
    expect(t.liftoffThrust).toBe(0);
  });

  it('an RCS thruster needs a cold gas tank', () => {
    expect(rcsRocket(false).getTelemetry().missing).toBe('RCS NEEDS A COLD GAS TANK');
    const ok = rcsRocket(true).getTelemetry();
    expect(ok.valid).toBe(true);
    expect(ok.missing).toBe('');
  });

  it('the lab shows the same fuel weight as the flight model', () => {
    const t = rocket('HYDROGEN').getTelemetry();
    expect(t.totalMass + t.totalFuelMass).toBeCloseTo(report('HYDROGEN').wetMass, 6);
  });
});

describe('booster and RCS', () => {
  it('a booster cannot steer in space', () => {
    const sim = inSpace(rocket('KEROSENE'));
    for (let i = 0; i < 100; i++) sim.step(0.01, { throttle: 0, steer: 1 });
    expect(Math.abs(sim.state.omega)).toBeLessThan(1e-9);
  });

  it('separation drops what hangs below the shell, then RCS steers on cold gas', () => {
    const sim = inSpace(rcsRocket());
    const gasTanks = () => sim.vehicle.parts.filter(p => p.fuelKind === 'COLD_GAS').length;
    expect(gasTanks()).toBe(1);
    expect(sim.rcsReady).toBe(false);
    expect(sim.separate()).toBe(true);
    expect(gasTanks()).toBe(0);
    expect(sim.vehicle.parts.some(p => p.type === 'RCS')).toBe(true);
    expect(sim.separate()).toBe(false);
  });

  it('RCS steering in space burns cold gas', () => {
    // Cold gas lives in the core stack, so it stays aboard after separation.
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 9, 'FUEL_TANK', 'COLD_GAS');
    tree.attachPart(7, 10, 'FUEL_TANK', 'KEROSENE');
    tree.attachPart(7, 11, 'ENGINE');
    tree.attachPart(6, 8, 'RCS');
    const sim = inSpace(tree);
    sim.separate();
    expect(sim.rcsReady).toBe(true);
    const gas = sim.coldGas;
    const fuel = sim.boosterFuel;
    for (let i = 0; i < 100; i++) sim.step(0.01, { throttle: 0, steer: 1 });
    expect(sim.coldGas).toBeLessThan(gas);
    expect(sim.boosterFuel).toBeCloseTo(fuel, 9);
    expect(Math.abs(sim.state.omega)).toBeGreaterThan(0);
  });
});

describe('shell separation by key', () => {
  const twoShells = () => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 9, 'FUEL_TANK', 'COLD_GAS');
    tree.attachPart(7, 10, 'FUEL_TANK', 'KEROSENE');
    tree.attachPart(7, 11, 'ENGINE');
    const left = tree.attachPart(6, 8, 'RCS').node!;
    const right = tree.attachPart(8, 8, 'RCS').node!;
    tree.attachPart(6, 9, 'STRUCTURAL');
    tree.attachPart(8, 9, 'STRUCTURAL');
    tree.setSeparationKey(left.id, 'G');
    tree.setSeparationKey(right.id, 'H');
    return { tree, left, right };
  };

  it('opens only the shells bound to the pressed key, and works in the air', () => {
    const { tree, left, right } = twoShells();
    const sim = new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
    sim.phase = 'FLYING';
    const blocks = () => sim.vehicle.parts.filter(p => p.type === 'STRUCTURAL').length;
    expect(blocks()).toBe(2);
    expect(sim.separate('G')).toBe(true);
    expect(blocks()).toBe(1);
    expect(sim.openShells.has(left.id)).toBe(true);
    expect(sim.openShells.has(right.id)).toBe(false);
    expect(sim.separate('G')).toBe(false);
    expect(sim.separate('H')).toBe(true);
    expect(blocks()).toBe(0);
  });

  it('survives a snapshot, and a shell with nothing on it needs no key', () => {
    const { tree } = twoShells();
    const sim = new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
    sim.phase = 'FLYING';
    sim.separate('G');
    expect(FlightSim.restore(sim.snapshot()).openShells.size).toBe(1);

    const bare = new RocketTree(7, 8);
    bare.attachPart(7, 9, 'FUEL_TANK', 'COLD_GAS');
    bare.attachPart(7, 10, 'FUEL_TANK', 'KEROSENE');
    bare.attachPart(7, 11, 'ENGINE');
    bare.attachPart(6, 8, 'RCS');
    const free = new FlightSim(buildFlightVehicle(bare.getTelemetry().tree));
    free.phase = 'FLYING';
    expect(free.activeRcsCount).toBe(1);
    expect(free.separate('B')).toBe(false);
  });
});

describe('hull integrity', () => {
  it('starts at 100 and drops with every part lost, down to 0', () => {
    const sim = inSpace(rcsRocket());
    expect(sim.hull).toBe(100);
    sim.stats.partsLost = 1;
    expect(sim.hull).toBeLessThan(100);
    sim.stats.partsLost = 10;
    expect(sim.hull).toBe(0);
  });
});

describe('RCS in air', () => {
  // Cold gas lives in the core stack, so it stays aboard after the shell opens.
  const flown = (altitude: number, open: boolean) => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 9, 'FUEL_TANK', 'COLD_GAS');
    tree.attachPart(7, 10, 'FUEL_TANK', 'KEROSENE');
    tree.attachPart(7, 11, 'ENGINE');
    tree.attachPart(6, 8, 'RCS');
    tree.attachPart(6, 9, 'STRUCTURAL');
    const sim = inSpace(tree);
    sim.state.y = altitude;
    sim.onGround = false;
    if (open) sim.separate();
    for (let i = 0; i < 20; i++) sim.step(0.01, { throttle: 0, steer: 1 });
    return Math.abs(sim.state.omega);
  };

  it('an open RCS adds some turning in air, but far less than in space', () => {
    const airGain = flown(2_000, true) - flown(2_000, false);
    expect(airGain).toBeGreaterThan(0);
    expect(airGain).toBeLessThan(flown(400_000, true));
  });
});
