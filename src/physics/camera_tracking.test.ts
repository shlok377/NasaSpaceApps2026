import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { buildFlightVehicle } from './vehicle';
import { FlightSim } from './FlightSim';
import { CONFIG } from '../config';

describe('Camera Tracking & Relative Rocket Stability', () => {
  it('maintains rock-solid on-screen vehicle stability during ascent without camera lag jitter', () => {
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
    sim.launch();

    const cam = {
      x: 0,
      y: 0,
      upAngle: Math.PI / 2,
      scale: CONFIG.camera.ascentScale,
      mode: 'ASCENT'
    };

    const SCREEN_CX = 640;
    const SCREEN_CY = 360;

    function toScreen(wx: number, wy: number) {
      const ux = Math.cos(cam.upAngle);
      const uy = Math.sin(cam.upAngle);
      const dx = wx - cam.x;
      const dy = wy - cam.y;
      const east = dx * uy - dy * ux;
      const up = dx * ux + dy * uy;
      return { x: SCREEN_CX + east * cam.scale, y: SCREEN_CY - up * cam.scale };
    }

    let smoothedRocketY = 470;
    function updateCamera(dt: number) {
      const s = sim.state;
      const t = sim.getTelemetry();
      const climbFactor = sim.onGround ? 1 : Math.min(Math.max((t.verticalSpeed + 8) / 16, 0), 1);
      const targetRocketY = 260 + (470 - 260) * climbFactor;
      smoothedRocketY += (targetRocketY - smoothedRocketY) * (1 - Math.exp(-dt * 3));

      cam.x = s.x;
      cam.y = s.y + (smoothedRocketY - SCREEN_CY) / cam.scale;
      cam.upAngle = Math.PI / 2;
    }

    const screenYHistory: number[] = [];
    const screenXHistory: number[] = [];

    // Simulate 1500 frames with varying browser deltaMs
    for (let frame = 0; frame < 1500; frame++) {
      const deltaMs = 16.6 + Math.sin(frame * 0.7) * 1.5;
      const dt = Math.min(deltaMs / 1000, 0.05);
      const gameDt = dt * CONFIG.gameSpeed;

      sim.advance(gameDt, { throttle: 1, steer: 0 });
      updateCamera(dt);

      const sp = toScreen(sim.state.x, sim.state.y);
      screenXHistory.push(sp.x);
      screenYHistory.push(sp.y);
    }

    let maxYJitter = 0;
    let maxXJitter = 0;
    for (let i = 2; i < screenYHistory.length; i++) {
      const dy1 = screenYHistory[i - 1] - screenYHistory[i - 2];
      const dy2 = screenYHistory[i] - screenYHistory[i - 1];
      const jitterY = Math.abs(dy2 - dy1);
      if (jitterY > maxYJitter) maxYJitter = jitterY;

      const dx1 = screenXHistory[i - 1] - screenXHistory[i - 2];
      const dx2 = screenXHistory[i] - screenXHistory[i - 1];
      const jitterX = Math.abs(dx2 - dx1);
      if (jitterX > maxXJitter) maxXJitter = jitterX;
    }

    // Vehicle relative to camera must not jitter or violently shake
    expect(maxYJitter).toBeLessThan(1.0);
    expect(maxXJitter).toBeLessThan(1.0);
  });
});
