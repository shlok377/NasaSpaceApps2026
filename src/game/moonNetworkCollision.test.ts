import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { MOON, MOON_CENTER } from '../physics/constants';
import { RoverCapsule, stepRover } from './phases';

describe('Moon network collision mechanics', () => {
  it('satellites in concentric orbits separated by 25m do not crash into each other as they lap', () => {
    const col = CONFIG.network.collision;
    const r1 = MOON.radius + 300;
    const r2 = MOON.radius + 325; // 25m separation in altitude

    const v1 = Math.sqrt(MOON.mu / r1);
    const v2 = Math.sqrt(MOON.mu / r2);

    const sat1: RoverCapsule = { x: MOON_CENTER.x, y: MOON_CENTER.y - r1, vx: v1, vy: 0, landed: false, angle: null, inZone: false };
    const sat2: RoverCapsule = { x: MOON_CENTER.x, y: MOON_CENTER.y - r2, vx: v2, vy: 0, landed: false, angle: null, inZone: false };

    let crashed = false;
    const dt = (1 / 60) * 1.5;

    // Simulate 1 full orbit (sat1 completes orbit and laps sat2)
    for (let step = 0; step < 250 * 60; step++) {
      stepRover(sat1, dt);
      stepRover(sat2, dt);

      const dist = Math.hypot(sat1.x - sat2.x, sat1.y - sat2.y);
      if (dist < col.assetRadius) {
        crashed = true;
        break;
      }
    }

    // Expect concentric orbits separated by 25m to NEVER collide
    expect(crashed).toBe(false);
  });

  it('rocket colliding with one satellite does not destroy another satellite 25m away', () => {
    const col = CONFIG.network.collision;
    const r1 = MOON.radius + 300;
    const r2 = MOON.radius + 325;

    const sat1 = { x: MOON_CENTER.x, y: MOON_CENTER.y - r1 };
    const sat2 = { x: MOON_CENTER.x, y: MOON_CENTER.y - r2 };

    // Rocket is exactly at sat1's position
    const rocket = { x: sat1.x, y: sat1.y };

    const distToSat1 = Math.hypot(rocket.x - sat1.x, rocket.y - sat1.y);
    const distToSat2 = Math.hypot(rocket.x - sat2.x, rocket.y - sat2.y);

    const hitsSat1 = distToSat1 < col.satelliteRadius;
    const hitsSat2 = distToSat2 < col.satelliteRadius;

    expect(hitsSat1).toBe(true);
    // Rocket hitting sat1 should NOT also hit sat2 which is 25m higher!
    expect(hitsSat2).toBe(false);
  });
});
