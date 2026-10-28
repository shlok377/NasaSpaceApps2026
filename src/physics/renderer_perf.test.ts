import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
      RandomDataGenerator: class {
        constructor() {}
        realInRange(min: number, max: number) { return min + Math.random() * (max - min); }
        between(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }
      }
    }
  }
}));

import { RocketTree } from '../core/RocketTree';
import { buildFlightVehicle } from './vehicle';
import { FlightSim } from './FlightSim';
import { WorldRenderer } from '../scenes/flight/WorldRenderer';

describe('WorldRenderer Performance & Allocation Optimizations', () => {
  it('manages smoke particles with fixed ring buffer capacity and in-place recycling', () => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);
    sim.launch();

    // Create a mock scene with add.graphics and add.image
    const mockScene = {
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
            setVisible: (v: boolean) => { img.visible = v; return img; },
            setPosition: () => img,
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

    const renderer = new WorldRenderer(mockScene);
    const telemetry = sim.getTelemetry();

    // Advance smoke simulation over 60 frames (spawning puffs)
    for (let f = 0; f < 60; f++) {
      sim.step(0.016, { throttle: 1, steer: 0 });
      const t = sim.getTelemetry();
      renderer.updateSmoke(0.016, sim, t, true);
    }

    const smokeCount = (renderer as any).smokeCount;
    expect(smokeCount).toBeGreaterThan(0);
    expect(smokeCount).toBeLessThanOrEqual(400);

    // Verify smoke particles age and stay bounded to MAX_SMOKE
    for (let f = 0; f < 300; f++) {
      renderer.updateSmoke(0.05, sim, telemetry, true);
      expect((renderer as any).smokeCount).toBeLessThanOrEqual(400);
    }

    // Now test engine cut: smoke should fade out and count drop
    const emptyTelemetry = { ...telemetry, thrust: 0 };
    for (let f = 0; f < 200; f++) {
      renderer.updateSmoke(0.05, sim, emptyTelemetry, true);
    }
    expect((renderer as any).smokeCount).toBe(0);
  });

  it('populates trajectory path directly into flat typed array without point object allocations', () => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);

    const mockScene = {
      add: {
        graphics: () => ({ clear: () => {} }),
        image: () => ({ setVisible: () => {} }),
        container: () => ({ add: () => {} })
      },
      time: { now: 1000 }
    } as any;

    const renderer = new WorldRenderer(mockScene);
    const telemetry = sim.getTelemetry();

    (renderer as any).predictPath(sim, telemetry);

    const pathPoints: Float32Array = (renderer as any).pathPoints;
    const pathCount: number = (renderer as any).pathCount;

    expect(pathPoints).toBeInstanceOf(Float32Array);
    expect(pathCount).toBeGreaterThan(1);
    expect(pathCount).toBeLessThanOrEqual(600);

    // Initial point must match rocket position
    expect(pathPoints[0]).toBeCloseTo(sim.state.x, 3);
    expect(pathPoints[1]).toBeCloseTo(sim.state.y, 3);
  });

  it('pools popup texts and recycles without destroying GameObjects', async () => {
    const { Effects } = await import('../scenes/flight/Effects');
    let textAddCount = 0;
    const textsCreated: any[] = [];

    const mockScene = {
      add: {
        graphics: () => ({ clear: () => {}, lineStyle: () => {}, fillStyle: () => {} }),
        text: (x: number, y: number, label: string) => {
          textAddCount++;
          const obj = {
            x,
            y,
            text: label,
            visible: false,
            alpha: 1,
            destroyed: false,
            setOrigin: () => obj,
            setDepth: () => obj,
            setVisible: (v: boolean) => { obj.visible = v; return obj; },
            setText: (t: string) => { obj.text = t; return obj; },
            setColor: () => obj,
            setFontSize: () => obj,
            setPosition: (px: number, py: number) => { obj.x = px; obj.y = py; return obj; },
            setAlpha: (a: number) => { obj.alpha = a; return obj; },
            destroy: () => { obj.destroyed = true; }
          };
          textsCreated.push(obj);
          return obj;
        }
      }
    } as any;

    const fx = new Effects(mockScene, 8);
    // Capacity of 8 created up front
    expect(textAddCount).toBe(8);

    // Trigger 12 popups (more than capacity 8)
    for (let i = 0; i < 12; i++) {
      fx.popup(640, 360, `POPUP ${i}`, '#ffff00');
    }

    // No new texts created during gameplay
    expect(textAddCount).toBe(8);

    // None destroyed
    expect(textsCreated.every(t => !t.destroyed)).toBe(true);

    const dummyTelemetry = {
      speed: 0,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      airDensity: 1.2
    } as any;

    // Simulate 2 seconds of time (exceeding POPUP_LIFE = 1.6s)
    fx.update(2.0, dummyTelemetry, false);

    // All popups should now be invisible, but NOT destroyed
    expect(textsCreated.every(t => !t.visible)).toBe(true);
    expect(textsCreated.every(t => !t.destroyed)).toBe(true);
    expect(textAddCount).toBe(8);
  });

  it('caches sky gradient redraws when altitude change is below 25m threshold', () => {
    let clearCalls = 0;
    let fillRectCalls = 0;

    const mockScene = {
      add: {
        graphics: () => ({
          clear: () => { clearCalls++; },
          fillGradientStyle: () => {},
          fillRect: () => { fillRectCalls++; },
          fillStyle: () => {},
          fillCircle: () => {},
          lineStyle: () => {},
          lineBetween: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fillPath: () => {},
          strokePath: () => {},
          strokeRect: () => {},
          strokeCircle: () => {},
          fillTriangle: () => {}
        }),
        image: () => {
          const img: any = {
            visible: false,
            setVisible: (v: boolean) => { img.visible = v; return img; },
            setPosition: () => img,
            setDisplaySize: () => img,
            setAlpha: () => img,
            setTint: () => img,
            setTexture: () => img,
            setRotation: () => img
          };
          return img;
        },
        container: () => ({ add: () => {} }),
        text: () => ({
          setVisible: () => ({ setPosition: () => ({ setText: () => ({ setColor: () => ({ setFontSize: () => ({ setOrigin: () => ({ setDepth: () => {} }) }) }) }) }) })
        })
      },
      time: { now: 1000 }
    } as any;

    const renderer = new WorldRenderer(mockScene);
    const tree = new RocketTree(7, 8);
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);

    const dummyOverlay = {
      roverZone: false,
      site: null,
      boulders: false,
      rover: null,
      landedRovers: [],
      dropMarker: null,
      debrisRing: null,
      impactMarker: null
    };

    // Initial render: sky gradient should be drawn once
    const t0 = { ...sim.getTelemetry(), earthAltitude: 10 };
    renderer.render(sim, t0, [], true, false, dummyOverlay);
    expect(renderer.skyRedrawCount).toBe(1);

    // Minor altitude shift (15m, which is < 25m threshold): sky gradient should NOT redraw
    const t1 = { ...sim.getTelemetry(), earthAltitude: 20 };
    renderer.render(sim, t1, [], true, false, dummyOverlay);
    expect(renderer.skyRedrawCount).toBe(1);

    // Another small shift (22m): still < 25m threshold from original 10m
    const t2 = { ...sim.getTelemetry(), earthAltitude: 32 };
    renderer.render(sim, t2, [], true, false, dummyOverlay);
    expect(renderer.skyRedrawCount).toBe(1);

    // Significant altitude shift (>25m from 10m, now at 60m): sky gradient redraws
    const t3 = { ...sim.getTelemetry(), earthAltitude: 60 };
    renderer.render(sim, t3, [], true, false, dummyOverlay);
    expect(renderer.skyRedrawCount).toBe(2);

    // Camera mode switch (e.g. into ORBIT): immediate redraw regardless of altitude
    renderer.camera.mode = 'ORBIT';
    renderer.render(sim, t3, [], true, false, dummyOverlay);
    expect(renderer.skyRedrawCount).toBe(3);
  });

  it('batches smoke particles using sprite quads without graphics fillCircle calls', () => {
    let circleCount = 0;
    let imagesCreated = 0;
    const images: any[] = [];

    const mockScene = {
      add: {
        graphics: () => ({
          clear: () => {},
          fillGradientStyle: () => {},
          fillRect: () => {},
          fillStyle: () => {},
          fillCircle: () => { circleCount++; },
          lineStyle: () => {},
          lineBetween: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          fillPath: () => {},
          strokePath: () => {},
          strokeRect: () => {},
          strokeCircle: () => {}
        }),
        image: () => {
          imagesCreated++;
          const img: any = {
            visible: false,
            x: 0,
            y: 0,
            alpha: 1,
            setVisible: (v: boolean) => { img.visible = v; return img; },
            setPosition: (px: number, py: number) => { img.x = px; img.y = py; return img; },
            setDisplaySize: () => img,
            setAlpha: (a: number) => { img.alpha = a; return img; },
            setTint: () => img,
            setTexture: () => img,
            setRotation: () => img
          };
          images.push(img);
          return img;
        },
        container: () => ({ add: () => {} }),
        text: () => ({
          setVisible: () => ({ setPosition: () => ({ setText: () => ({ setColor: () => ({ setFontSize: () => ({ setOrigin: () => ({ setDepth: () => {} }) }) }) }) }) })
        })
      },
      time: { now: 1000 }
    } as any;

    const renderer = new WorldRenderer(mockScene);
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);
    sim.launch();

    // Advance smoke simulation to generate active particles
    for (let f = 0; f < 30; f++) {
      sim.step(0.016, { throttle: 1, steer: 0 });
      const t = sim.getTelemetry();
      renderer.updateSmoke(0.016, sim, t, true);
    }

    const initialCircleCount = circleCount;

    // Render an ascent frame containing active smoke
    const dummyOverlay = {
      roverZone: false,
      site: null,
      boulders: false,
      rover: null,
      landedRovers: [],
      dropMarker: null,
      debrisRing: null,
      impactMarker: null
    };
    const t = sim.getTelemetry();
    renderer.render(sim, t, [], true, false, dummyOverlay);

    const smokeSpritesPool = (renderer as any).smokeSpritesPool;
    expect(smokeSpritesPool.length).toBeGreaterThan(0);

    // Smoke particles were rendered via images, NOT by drawing fillCircle on worldGfx for each puff
    const visibleSmokeImages = images.filter(img => img.visible);
    expect(visibleSmokeImages.length).toBeGreaterThan(0);
    expect(circleCount).toBe(initialCircleCount);
  });
});

