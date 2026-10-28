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
import { WorldRenderer, MissionOverlay } from '../scenes/flight/WorldRenderer';
import { GAME_ASSETS } from '../core/assets';
import { moonSurfacePoint } from './bodies';
import { ROVER_ZONE } from '../game/phases';

interface MockImage {
  key: string;
  x: number;
  y: number;
  visible: boolean;
  originX: number;
  originY: number;
  rotation: number;
  displayWidth: number;
  displayHeight: number;
  alpha: number;
  depth: number;
  setVisible(v: boolean): MockImage;
  setOrigin(x: number, y: number): MockImage;
  setPosition(x: number, y: number): MockImage;
  setRotation(rot: number): MockImage;
  setDisplaySize(w: number, h: number): MockImage;
  setAlpha(a: number): MockImage;
  setDepth(d: number): MockImage;
  setTexture(k: string): MockImage;
}

function createMockScene() {
  const images: MockImage[] = [];

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
        closePath: () => {},
        fillPath: () => {},
        strokePath: () => {},
        strokeRect: () => {},
        strokeCircle: () => {},
        fillTriangle: () => {},
        fillEllipse: () => {},
        generateTexture: () => {},
        destroy: () => {}
      }),
      image: (_x: number, _y: number, key: string): MockImage => {
        const img: MockImage = {
          key,
          x: 0,
          y: 0,
          visible: false,
          originX: 0.5,
          originY: 0.5,
          rotation: 0,
          displayWidth: 32,
          displayHeight: 32,
          alpha: 1,
          depth: 0,
          setVisible(v: boolean) { img.visible = v; return img; },
          setOrigin(ox: number, oy: number) { img.originX = ox; img.originY = oy; return img; },
          setPosition(px: number, py: number) { img.x = px; img.y = py; return img; },
          setRotation(r: number) { img.rotation = r; return img; },
          setDisplaySize(w: number, h: number) { img.displayWidth = w; img.displayHeight = h; return img; },
          setAlpha(a: number) { img.alpha = a; return img; },
          setDepth(d: number) { img.depth = d; return img; },
          setTexture(k: string) { img.key = k; return img; }
        };
        images.push(img);
        return img;
      },
      container: () => ({
        add: () => {}
      }),
      text: () => ({
        setVisible: () => ({
          setPosition: () => ({
            setText: () => ({
              setColor: () => ({
                setFontSize: () => ({
                  setOrigin: () => ({
                    setDepth: () => {}
                  })
                })
              })
            })
          })
        })
      })
    },
    textures: {
      exists: (key: string) => [
        'smoke_puff',
        GAME_ASSETS.UI_MOON_BIG.key,
        GAME_ASSETS.FLAG_GREEN.key,
        GAME_ASSETS.FLAG_BLUE.key
      ].includes(key as any)
    },
    time: { now: 1000 }
  };

  return { mockScene: mockScene as any, images };
}

describe('Surface Flags & Moon Big Sprite in WorldRenderer', () => {
  it('initializes flag sprites and sky moon sprite with correct textures and origins', () => {
    const { mockScene, images } = createMockScene();
    new WorldRenderer(mockScene);

    const skyMoon = images.find(img => img.key === GAME_ASSETS.UI_MOON_BIG.key);
    expect(skyMoon).toBeDefined();
    expect(skyMoon?.visible).toBe(false);
    expect(skyMoon?.depth).toBe(1);

    const greenFlag = images.find(img => img.key === GAME_ASSETS.FLAG_GREEN.key);
    expect(greenFlag).toBeDefined();
    expect(greenFlag?.originX).toBeCloseTo(0.08, 2);
    expect(greenFlag?.originY).toBeCloseTo(0.97, 2);
    expect(greenFlag?.visible).toBe(false);

    const blueFlag = images.find(img => img.key === GAME_ASSETS.FLAG_BLUE.key);
    expect(blueFlag).toBeDefined();
    expect(blueFlag?.originX).toBeCloseTo(0.08, 2);
    expect(blueFlag?.originY).toBeCloseTo(0.97, 2);
    expect(blueFlag?.visible).toBe(false);
  });

  it('positions and radially orients flags on the Moon surface in Orbit Map mode', () => {
    const { mockScene, images } = createMockScene();
    const renderer = new WorldRenderer(mockScene);

    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);

    renderer.camera.mode = 'ORBIT';
    renderer.camera.scale = 0.08;
    renderer.camera.upAngle = Math.PI / 2;

    const overlay: MissionOverlay = {
      roverZone: true,
      site: { angle: Math.PI * 0.45, halfWidth: 35 },
      boulders: false,
      rover: null,
      landedRovers: [],
      dropMarker: null,
      debrisRing: null,
      impactMarker: null
    };

    renderer.render(sim, sim.getTelemetry(), [], true, false, overlay);

    const greenFlag = images.find(img => img.key === GAME_ASSETS.FLAG_GREEN.key)!;
    expect(greenFlag.visible).toBe(true);
    expect(greenFlag.displayWidth).toBe(20);
    expect(greenFlag.displayHeight).toBe(20);

    // Flag base must match Moon surface point on screen
    const roverBase = moonSurfacePoint(ROVER_ZONE.angle);
    const expectedRoverScreen = renderer.toScreen(roverBase.x, roverBase.y);
    expect(greenFlag.x).toBeCloseTo(expectedRoverScreen.x, 2);
    expect(greenFlag.y).toBeCloseTo(expectedRoverScreen.y, 2);

    // Rotation must point radially outward from Moon center
    const expectedRoverRot = renderer.screenRotation(ROVER_ZONE.angle);
    expect(greenFlag.rotation).toBeCloseTo(expectedRoverRot, 4);

    const blueFlag = images.find(img => img.key === GAME_ASSETS.FLAG_BLUE.key)!;
    expect(blueFlag.visible).toBe(true);
    const siteBase = moonSurfacePoint(overlay.site!.angle);
    const expectedSiteScreen = renderer.toScreen(siteBase.x, siteBase.y);
    expect(blueFlag.x).toBeCloseTo(expectedSiteScreen.x, 2);
    expect(blueFlag.y).toBeCloseTo(expectedSiteScreen.y, 2);
    const expectedSiteRot = renderer.screenRotation(overlay.site!.angle);
    expect(blueFlag.rotation).toBeCloseTo(expectedSiteRot, 4);

    // Pixel-art Moon sprite must be visible and properly sized in Orbit Map
    const mapMoon = images.find(img => img.key === GAME_ASSETS.UI_MOON_BIG.key && img.depth === 0)!;
    expect(mapMoon.visible).toBe(true);
    expect(mapMoon.displayWidth).toBeCloseTo(2000 * 0.08 * 2, 1);
    expect(mapMoon.displayHeight).toBeCloseTo(2000 * 0.08 * 2, 1);
  });

  it('hides flags when overlay flags are absent or during ASCENT mode', () => {
    const { mockScene, images } = createMockScene();
    const renderer = new WorldRenderer(mockScene);

    const tree = new RocketTree(7, 8);
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);

    renderer.camera.mode = 'ASCENT';
    const overlay: MissionOverlay = {
      roverZone: false,
      site: null,
      boulders: false,
      rover: null,
      landedRovers: [],
      dropMarker: null,
      debrisRing: null,
      impactMarker: null
    };

    renderer.render(sim, sim.getTelemetry(), [], true, false, overlay);

    const greenFlag = images.find(img => img.key === GAME_ASSETS.FLAG_GREEN.key)!;
    const blueFlag = images.find(img => img.key === GAME_ASSETS.FLAG_BLUE.key)!;
    expect(greenFlag.visible).toBe(false);
    expect(blueFlag.visible).toBe(false);

    // Sky moon sprite should be visible during ascent, map moon sprite should be hidden
    const skyMoon = images.find(img => img.key === GAME_ASSETS.UI_MOON_BIG.key && img.depth === 1)!;
    expect(skyMoon.visible).toBe(true);
    const mapMoon = images.find(img => img.key === GAME_ASSETS.UI_MOON_BIG.key && img.depth === 0)!;
    expect(mapMoon.visible).toBe(false);
  });
});
