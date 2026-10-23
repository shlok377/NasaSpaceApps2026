import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { buildFlightVehicle } from './vehicle';
import { FlightSim } from './FlightSim';
import { MOON_CENTER } from './constants';

describe('Lunar Landing Retrograde Guidance Math', () => {
  function createTestSim(): FlightSim {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    return new FlightSim(vehicle);
  }

  // Pure mathematical model matching WorldRenderer.toScreen and getRetrogradeScreenVector
  function screenRetrograde(sim: FlightSim, upAngle: number, scale = 1.6) {
    const s = sim.state;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed < 0.5) return null;

    const ux = Math.cos(upAngle);
    const uy = Math.sin(upAngle);

    function toScreen(wx: number, wy: number) {
      const dx = wx - s.x;
      const dy = wy - s.y;
      const east = dx * uy - dy * ux;
      const up = dx * ux + dy * uy;
      return { x: 640 + east * scale, y: 360 - up * scale };
    }

    const r = toScreen(s.x, s.y);
    const p2 = toScreen(s.x - s.vx / speed, s.y - s.vy / speed);
    const rx = p2.x - r.x;
    const ry = p2.y - r.y;
    const len = Math.hypot(rx, ry);
    if (len < 1e-4) return null;

    const alpha = Math.min(Math.max((speed - 0.5) / 1.5, 0), 1) * 0.9;
    return { dirX: rx / len, dirY: ry / len, alpha };
  }

  it('suppresses retrograde vector below 0.5 m/s threshold', () => {
    const sim = createTestSim();
    sim.state.vx = 0.2;
    sim.state.vy = 0.2; // ~0.28 m/s
    const result = screenRetrograde(sim, Math.PI / 2);
    expect(result).toBeNull();
  });

  it('points straight up on screen when falling straight down toward Moon surface', () => {
    const sim = createTestSim();
    // Position rocket directly below the Moon center (underside of Moon)
    // Local "up" away from Moon center is pointing down in world Y (e.g. upAngle = -Math.PI / 2)
    // Or position at top of Moon where local up is +Y:
    sim.state.x = MOON_CENTER.x;
    sim.state.y = MOON_CENTER.y + 2500; // 500m above surface
    const upAngle = Math.PI / 2; // Local up points up (+Y)

    // Falling toward surface (downward world vy = -15 m/s)
    sim.state.vx = 0;
    sim.state.vy = -15;

    const vec = screenRetrograde(sim, upAngle)!;
    expect(vec).not.toBeNull();
    // Retrograde is opposite to falling: points up on screen (screen Y is negative going up)
    expect(vec.dirX).toBeCloseTo(0, 4);
    expect(vec.dirY).toBeCloseTo(-1, 4);
    expect(Math.hypot(vec.dirX, vec.dirY)).toBeCloseTo(1, 4);
    expect(vec.alpha).toBeCloseTo(0.9, 2);
  });

  it('points to the left on screen when drifting to the right', () => {
    const sim = createTestSim();
    sim.state.x = MOON_CENTER.x;
    sim.state.y = MOON_CENTER.y + 2500;
    const upAngle = Math.PI / 2;

    // Moving horizontally to the right (+vx = 8 m/s, vy = 0)
    sim.state.vx = 8;
    sim.state.vy = 0;

    const vec = screenRetrograde(sim, upAngle)!;
    expect(vec).not.toBeNull();
    // Retrograde points opposite to right: points left on screen (-X)
    expect(vec.dirX).toBeCloseTo(-1, 4);
    expect(vec.dirY).toBeCloseTo(0, 4);
  });

  it('scales alpha smoothly from 0.5 m/s to 2.0 m/s', () => {
    const sim = createTestSim();
    sim.state.vx = 1.25; // 1.25 m/s -> exactly midway between 0.5 and 2.0
    sim.state.vy = 0;
    const vec = screenRetrograde(sim, Math.PI / 2)!;
    expect(vec).not.toBeNull();
    // Halfway: (1.25 - 0.5)/1.5 * 0.9 = 0.5 * 0.9 = 0.45
    expect(vec.alpha).toBeCloseTo(0.45, 2);
  });

  it('continues providing active inertial retrograde orientation during RADAR_FAILURE', () => {
    const sim = createTestSim();
    sim.state.x = MOON_CENTER.x;
    sim.state.y = MOON_CENTER.y + 2100; // 100m above surface
    sim.state.vx = -4; // lateral drift
    sim.state.vy = -12; // descending
    const upAngle = Math.PI / 2;

    const vec = screenRetrograde(sim, upAngle)!;
    expect(vec).not.toBeNull();
    // Speed is hypot(4, 12) = ~12.6 m/s > 2 m/s -> alpha 0.9
    expect(vec.alpha).toBeCloseTo(0.9, 2);
    // Retrograde has +X component (to cancel -vx) and -Y component (to cancel downward vy)
    expect(vec.dirX).toBeGreaterThan(0);
    expect(vec.dirY).toBeLessThan(0);
  });
});

