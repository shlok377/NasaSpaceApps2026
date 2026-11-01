import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { FlightSim } from '../physics/FlightSim';
import { buildFlightVehicle } from '../physics/vehicle';
import { LAUNCH_WINDOWS, launchPrice, withWindowBonus } from './launchWindows';
import { flightEarnings } from './progress';

function basicVehicle() {
  const tree = new RocketTree(7, 8);
  tree.attachPart(7, 9, 'FUEL_TANK');
  tree.attachPart(7, 10, 'ENGINE');
  return buildFlightVehicle(tree.getTelemetry().tree);
}

function burn(sim: FlightSim, seconds: number): void {
  sim.launch();
  for (let i = 0; i < seconds * 120 && !sim.isFinished; i++) sim.step(1 / 120, { throttle: 1, steer: 0 });
}

describe('launch windows', () => {
  it('adds the window fee on top of the rocket price', () => {
    expect(launchPrice(40, 'DAY')).toBe(40);
    expect(launchPrice(40, 'SUNSET')).toBe(55);
    expect(launchPrice(40, 'NIGHT')).toBe(45);
  });

  it('pays the harder windows more', () => {
    expect(withWindowBonus(100, 'DAY')).toBe(110);
    expect(withWindowBonus(100, 'SUNSET')).toBe(100);
    expect(withWindowBonus(100, 'NIGHT')).toBe(120);
  });

  it('applies the bonus to flight earnings but not to the recovery refund', () => {
    const base = flightEarnings('SPACE', [], 50, 100, true);
    const night = flightEarnings('SPACE', [], 50, 100, true, 0, LAUNCH_WINDOWS.NIGHT.earningsBonus);
    expect(night.recovery).toBe(base.recovery);
    expect(night.windowBonus).toBe(Math.round((base.outcome + base.mission) * 0.2));
    expect(night.total).toBe(base.total + night.windowBonus);
  });

  it('burns less fuel on a cold night for the same push', () => {
    const vehicle = basicVehicle();
    const day = new FlightSim(vehicle, LAUNCH_WINDOWS.DAY.conditions);
    const night = new FlightSim(vehicle, LAUNCH_WINDOWS.NIGHT.conditions);
    burn(day, 2);
    burn(night, 2);
    expect(night.fuel).toBeGreaterThan(day.fuel);
  });

  it('scales the wind the rocket feels', () => {
    const vehicle = basicVehicle();
    const day = new FlightSim(vehicle, LAUNCH_WINDOWS.DAY.conditions);
    const sunset = new FlightSim(vehicle, LAUNCH_WINDOWS.SUNSET.conditions);
    burn(day, 3);
    burn(sunset, 3);
    const dw = day.getTelemetry().wind;
    const sw = sunset.getTelemetry().wind;
    expect(Math.abs(dw)).toBeGreaterThan(Math.abs(sw));
  });

  it('keeps the window conditions across a checkpoint restore', () => {
    const sim = new FlightSim(basicVehicle(), LAUNCH_WINDOWS.NIGHT.conditions);
    expect(FlightSim.restore(sim.snapshot()).conditions).toEqual(LAUNCH_WINDOWS.NIGHT.conditions);
  });
});
