import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
      RandomDataGenerator: class {
        constructor() {}
        realInRange(min: number, max: number) { return min + (max - min) * 0.5; }
        between(min: number, max: number) { return Math.floor(min + (max - min) * 0.5); }
      }
    }
  }
}));

import { RocketTree } from '../core/RocketTree';
import { buildFlightVehicle } from './vehicle';
import { FlightSim } from './FlightSim';
import { WorldRenderer } from '../scenes/flight/WorldRenderer';

function createMockScene() {
  return {
    add: {
      graphics: () => ({
        clear: () => {},
        fillStyle: () => {},
        fillCircle: () => {},
        fillRect: () => {},
        fillGradientStyle: () => {},
        lineStyle: () => {},
        lineBetween: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        strokePath: () => {}
      }),
      image: () => {
        const img: any = {
          visible: false,
          x: 0,
          y: 0,
          setVisible: (v: boolean) => { img.visible = v; return img; },
          setPosition: (x: number, y: number) => { img.x = x; img.y = y; return img; },
          setDisplaySize: () => img,
          setAlpha: () => img,
          setTint: () => img,
          setTexture: () => img
        };
        return img;
      },
      container: () => ({
        add: () => {}
      }),
      text: () => ({
        setVisible: () => ({ setPosition: () => ({ setText: () => ({ setColor: () => ({ setFontSize: () => ({ setOrigin: () => ({ setDepth: () => {} }) }) }) }) }) })
      })
    },
    time: { now: 1000 }
  } as any;
}

describe('Smoke Alignment & Thruster Pivot Diagnostics', () => {
  it('checks distance between engine nozzle and spawned smoke puff at various angles and flight speeds', () => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);
    sim.launch();

    const renderer = new WorldRenderer(createMockScene());

    // Fly straight up for 5 seconds to build speed
    const dt = 1 / 60;
    const gameDt = dt * 1.5;

    for (let f = 0; f < 300; f++) {
      sim.step(gameDt, { throttle: 1, steer: 0 });
      const t = sim.getTelemetry();
      renderer.updateCamera(sim, t, dt, 'ASCENT');
      renderer.updateSmoke(gameDt, sim, t, true);
    }

    // Now let's pitch the rocket by steering (or setting theta) to match user screenshot (~135° or -45°)
    sim.state.theta = -Math.PI / 4; // tilted down-right like media_1792328749733.png

    // Step one frame with throttle=1
    sim.step(gameDt, { throttle: 1, steer: 0 });
    const t = sim.getTelemetry();
    renderer.updateCamera(sim, t, dt, 'ASCENT');

    renderer.updateSmoke(gameDt, sim, t, true);
    const smokeCountAfter = (renderer as any).smokeCount;
    const smokePool = (renderer as any).smokePool;

    // Find the engine part and its nozzle screen position
    const enginePart = vehicle.parts.find(p => p.thrust > 0)!;
    const s = sim.state;
    const com = sim.com;
    const c = renderer.camera;
    const rot = renderer.screenRotation(s.theta);
    const cellPx = c.rocketScale;
    const visual = cellPx / c.scale;

    const du = (enginePart.u - com.u) * visual;
    const da = (enginePart.a - com.a) * visual;
    const engineScreen = renderer.toScreen(
      s.x + da * Math.cos(s.theta) + du * Math.sin(s.theta),
      s.y + da * Math.sin(s.theta) - du * Math.cos(s.theta)
    );

    // In drawFlame, the nozzle exit base is at +cellPx/2 along sprite local Y
    const base = cellPx / 2;
    const cosRot = Math.cos(rot);
    const sinRot = Math.sin(rot);
    const nozzleScreen = {
      x: engineScreen.x - base * sinRot,
      y: engineScreen.y + base * cosRot
    };

    // Check that the newest smoke particle is pivoted within 3 pixels of the engine nozzle
    let minDistanceToNozzle = Infinity;
    for (let i = 0; i < smokeCountAfter; i++) {
      const p = smokePool[i];
      if (p.age > 0.05) continue;
      const sp = renderer.toScreen(p.x, p.y);
      const dist = Math.hypot(sp.x - nozzleScreen.x, sp.y - nozzleScreen.y);
      if (dist < minDistanceToNozzle) {
        minDistanceToNozzle = dist;
      }
    }

    expect(minDistanceToNozzle).toBeLessThan(4);
  });
});
