import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { GAME_ASSETS, getPartTextureKey } from '../core/assets';
import { buildFlightVehicle } from '../physics/vehicle';
import { FlightSim } from '../physics/FlightSim';

describe('Design Artist Assets & Flight Playtest', () => {
  it('correctly maps all rocket parts to their 2D pixel art textures', () => {
    expect(getPartTextureKey('COCKPIT')).toBe(GAME_ASSETS.PART_COCKPIT.key);
    expect(getPartTextureKey('FUEL_TANK', undefined, 100)).toBe(GAME_ASSETS.PART_FUEL.key);
    expect(getPartTextureKey('FUEL_TANK', undefined, 0)).toBe(GAME_ASSETS.PART_FUEL_EMPTY.key);
    expect(getPartTextureKey('ENGINE')).toBe(GAME_ASSETS.PART_ENGINE.key);
    expect(getPartTextureKey('NOSE_CONE')).toBe(GAME_ASSETS.PART_NOSE_CONE.key);
    expect(getPartTextureKey('FIN', 'LEFT')).toBe(GAME_ASSETS.PART_LEFT_WING.key);
    expect(getPartTextureKey('FIN', 'RIGHT')).toBe(GAME_ASSETS.PART_RIGHT_WING.key);
    expect(getPartTextureKey('STRUCTURAL')).toBe(GAME_ASSETS.PART_BLOCK.key);
  });

  it('assembles a three-stage lunar mission rocket with authentic part sprites', () => {
    const tree = new RocketTree(7, 8); // Cockpit at (7, 8)

    // Center core: nose cone on top, fuel tank below, engine on bottom
    expect(tree.attachPart(7, 7, 'NOSE_CONE').success).toBe(true);
    expect(tree.attachPart(7, 9, 'FUEL_TANK').success).toBe(true);
    expect(tree.attachPart(7, 10, 'ENGINE').success).toBe(true);

    // Left booster: fin + tank + engine
    expect(tree.attachPart(6, 9, 'FUEL_TANK').success).toBe(true);
    expect(tree.attachPart(5, 9, 'FIN').success).toBe(true);
    expect(tree.attachPart(6, 10, 'ENGINE').success).toBe(true);

    // Right booster: fin + tank + engine
    expect(tree.attachPart(8, 9, 'FUEL_TANK').success).toBe(true);
    expect(tree.attachPart(9, 9, 'FIN').success).toBe(true);
    expect(tree.attachPart(8, 10, 'ENGINE').success).toBe(true);

    const telemetry = tree.getTelemetry();
    expect(telemetry.valid).toBe(true);
    expect(telemetry.partCount).toBe(10);
    expect(telemetry.totalThrust).toBeGreaterThan(0);

    const vehicle = buildFlightVehicle(telemetry.tree);
    expect(vehicle.parts.length).toBe(10);

    // Test texture key resolution for all assembled parts
    for (const part of vehicle.parts) {
      const tex = getPartTextureKey(part.type, part.finOrientation, part.fuelCapacity);
      expect(tex).toBeDefined();
      expect(typeof tex).toBe('string');
    }
  });

  it('simulates launch, burns fuel draining tanks, and updates telemetry', () => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    tree.attachPart(6, 9, 'FUEL_TANK');
    tree.attachPart(5, 9, 'FIN');
    tree.attachPart(6, 10, 'ENGINE');
    tree.attachPart(8, 9, 'FUEL_TANK');
    tree.attachPart(9, 9, 'FIN');
    tree.attachPart(8, 10, 'ENGINE');

    const telemetry = tree.getTelemetry();
    const vehicle = buildFlightVehicle(telemetry.tree);
    const sim = new FlightSim(vehicle);

    const initialFuel = sim.fuel;
    expect(initialFuel).toBeGreaterThan(0);

    sim.launch();

    // Run 10 seconds of full throttle burn
    for (let i = 0; i < 1000; i++) {
      sim.step(0.01, { throttle: 1, steer: 0 });
    }

    const t = sim.getTelemetry();
    expect(t.altitude).toBeGreaterThan(50); // Ascended into the sky
    expect(t.speed).toBeGreaterThan(10); // Accelerated
    expect(sim.fuel).toBeLessThan(initialFuel); // Fuel burned

    // Confirm that fuel fraction is valid between 0 and 1
    const fuelFraction = sim.fuel / initialFuel;
    expect(fuelFraction).toBeGreaterThan(0);
    expect(fuelFraction).toBeLessThan(1);

    // Test needle angle mapping (-50 to +50 degrees)
    const needleAngle = -50 + fuelFraction * 100;
    expect(needleAngle).toBeGreaterThan(-50);
    expect(needleAngle).toBeLessThan(50);
  });
});
