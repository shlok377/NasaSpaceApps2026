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
