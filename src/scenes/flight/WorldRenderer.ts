import Phaser from 'phaser';
import { CONFIG } from '../../config';
import { PART_DEFINITIONS } from '../../core/partDefinitions';
import { BOULDER_FIELD, ROVER_ZONE, RoverCapsule, SurfaceZone } from '../../game/phases';
import { Rock, rockX } from '../../game/rocks';
import { gravityAt, insideMoonSoi, localUp, moonAltitude, moonSurfacePoint } from '../../physics/bodies';
import { MOON, MOON_CENTER, ROCK_BELT, WORLD } from '../../physics/constants';
import { FlightSim, FlightTelemetry } from '../../physics/FlightSim';
import { FlightPart } from '../../physics/vehicle';
import { GAME_ASSETS, getPartTextureKey } from '../../core/assets';

export const SCREEN_CX = 640;
export const SCREEN_CY = 400;
/** Pixels per metre on the pad (one grid cell = one metre). */
export const CELL_PX = CONFIG.camera.ascentScale;
/** In the orbit map the rocket is drawn this many pixels per part, so its heading stays readable. */
const MAP_ROCKET_PX = 12;

export const WORLD_COLORS = {
  skyLow: 0x6fb1e6,
  skyHigh: 0x1d3b6e,
  space: 0x050812,
  ground: 0x4c7a3f,
  groundDark: 0x355a2c,
  moon: 0xa8a8a8,
  moonDark: 0x8c8c8c,
  pad: 0xf59e0b,
  rock: 0x6b6259,
  rockEdge: 0x3f3a35,
  shield: 0x67e8f9,
  fuel: 0x22c55e,
  zone: 0x22c55e,
  site: 0x38bdf8,
  danger: 0xef4444,
  rover: 0xfacc15
} as const;

/**
 * How the camera frames the flight. The climb keeps the launch-pad scale the
 * whole way (no zooming out: it just goes up). Inside the Moon's pull the
 * view cuts to an orbit map; coming down to land it cuts to close-ups.
 */
export type CameraMode = 'ASCENT' | 'ORBIT' | 'DESCENT' | 'TOUCHDOWN';

export interface Camera {
  x: number;
  y: number;
  /** Angle of the camera's "up" in the world (rad). */
  upAngle: number;
  /** Pixels per metre for the world. */
  scale: number;
  /** Pixels per metre the rocket is drawn at (≥ scale, so it stays readable). */
  rocketScale: number;
  mode: CameraMode;
}

/** What the mission wants drawn on the Moon and in orbit this frame. */
export interface MissionOverlay {
  roverZone: boolean;
  site: SurfaceZone | null;
  boulders: boolean;
  rover: RoverCapsule | null;
  landedRovers: number[];
  /** Predicted landing point of the rover if dropped now. */
  dropMarker: { x: number; y: number } | null;
  /** Debris swarm ring (radius from the Moon's centre). */
  debrisRing: number | null;
  /** Where the rocket will hit the Moon if it keeps coasting. */
  impactMarker: { x: number; y: number } | null;
}

interface SmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

/** Fill or stroke a closed polygon given as flat [x0, y0, x1, y1, ...]. */
export function polygon(g: Phaser.GameObjects.Graphics, pts: number[], fill: boolean): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) g.fillPath();
  else g.strokePath();
}

function lerpColor(c1: number, c2: number, t: number): number {
  const mix = (shift: number) => Math.round(((c1 >> shift) & 0xff) + (((c2 >> shift) & 0xff) - ((c1 >> shift) & 0xff)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Part outline in its own frame (cell-centred, nose up, y down), as flat points scaled by `h` (half a cell). */
function partShape(p: FlightPart, h: number): number[] {
  if (p.type === 'NOSE_CONE') return [-h, h, -h * 0.85, 0, -h * 0.5, -h * 0.65, 0, -h, h * 0.5, -h * 0.65, h * 0.85, 0, h, h];
  if (p.type === 'ENGINE') return [-h * 0.4, -h, h * 0.4, -h, h * 0.8, h, -h * 0.8, h];
  if (p.type === 'FIN') {
    return p.finOrientation === 'LEFT' ? [h, -h, h, h, -h, h * 1.35, -h * 0.4, 0] : [-h, -h, -h, h, h, h * 1.35, h * 0.4, 0];
  }
  const s = h * 0.95;
  return [-s, -s, s, -s, s, s, -s, s];
}

export class WorldRenderer {
  public camera: Camera = { x: 0, y: 0, upAngle: Math.PI / 2, scale: CELL_PX, rocketScale: CELL_PX, mode: 'ASCENT' };
  private readonly skyGfx: Phaser.GameObjects.Graphics;
  private readonly skyMoonSprite: Phaser.GameObjects.Image;
  private readonly smokeSpritesContainer: Phaser.GameObjects.Container;
  private readonly smokeSpritesPool: Phaser.GameObjects.Image[] = [];
  private lastSkyAltitude = -Infinity;
  private lastSkyMode: CameraMode | null = null;
  public skyRedrawCount = 0;
  private readonly worldGfx: Phaser.GameObjects.Graphics;
  private readonly rocketGfx: Phaser.GameObjects.Graphics;
  private readonly partSpritesContainer: Phaser.GameObjects.Container;
  private readonly partSpritesPool: Phaser.GameObjects.Image[] = [];
  private activeSpriteCount = 0;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private labelIndex = 0;
  private clouds: Array<{ x: number; y: number; puffs: Array<{ dx: number; dy: number; r: number }> }> = [];
  private dust: Array<{ x: number; y: number }> = [];
  private static readonly MAX_SMOKE = 400;
  private readonly smokePool: SmokePuff[] = Array.from({ length: 400 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0 }));
  private smokeCount = 0;
  private readonly pathPoints = new Float32Array(1200);
  private pathCount = 0;
  private pathColor: number = WORLD_COLORS.zone;
  private pathAt = -Infinity;
  private smoothedRocketY = 470;

  constructor(private readonly scene: Phaser.Scene) {
    const rng = new Phaser.Math.RandomDataGenerator(['moonshot']);
    this.clouds = Array.from({ length: 90 }, () => {
      const w = rng.realInRange(14, 50);
      return {
        x: rng.realInRange(-700, 700),
        y: rng.realInRange(WORLD.cloudsFrom, WORLD.cloudsTo),
        puffs: Array.from({ length: rng.between(3, 5) }, () => ({ dx: rng.realInRange(-w / 2, w / 2), dy: rng.realInRange(-w / 10, w / 10), r: rng.realInRange(w / 5, w / 3) }))
      };
    });
    this.dust = Array.from({ length: 34 }, () => ({ x: rng.realInRange(-30, 30), y: rng.realInRange(-20, 20) }));
    this.skyGfx = scene.add.graphics();
    this.skyMoonSprite = scene.add.image(0, 0, GAME_ASSETS.UI_MOON.key).setVisible(false);
    this.ensureSmokeTexture();
    this.smokeSpritesContainer = scene.add.container(0, 0);
    this.worldGfx = scene.add.graphics();
    this.rocketGfx = scene.add.graphics();
    this.partSpritesContainer = scene.add.container(0, 0);
  }

  private ensureSmokeTexture(): void {
    if (this.scene.textures && !this.scene.textures.exists('smoke_puff')) {
      const g = typeof this.scene.make?.graphics === 'function'
        ? this.scene.make.graphics({ x: 0, y: 0 })
        : this.scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 16, 16);
      g.generateTexture('smoke_puff', 32, 32);
      g.destroy();
    }
  }

  /** World → screen, using the current camera. */
  public toScreen(wx: number, wy: number): { x: number; y: number } {
    const c = this.camera;
    const ux = Math.cos(c.upAngle);
    const uy = Math.sin(c.upAngle);
    const dx = wx - c.x;
    const dy = wy - c.y;
    const east = dx * uy - dy * ux;
    const up = dx * ux + dy * uy;
    return { x: SCREEN_CX + east * c.scale, y: SCREEN_CY - up * c.scale };
  }

  /** Screen rotation for something pointing at world angle `theta`. */
  public screenRotation(theta: number): number {
    return -(theta - this.camera.upAngle);
  }

  /** Where the rocket's centre of mass is on screen. */
  public rocketScreen(sim: FlightSim): { x: number; y: number } {
    return this.toScreen(sim.state.x, sim.state.y);
  }

  /** How big a rocket part counts for collisions (m): matches what's drawn. */
  public partRadiusMetres(): number {
    return (0.5 * this.camera.rocketScale) / this.camera.scale;
  }

  /**
   * Frame the flight for the given mode. Scales are fixed per mode; changing
   * mode is a cut, not a zoom.
   */
  public updateCamera(sim: FlightSim, t: FlightTelemetry, dt: number, mode: CameraMode): void {
    const c = this.camera;
    const snap = mode !== c.mode;
    c.mode = mode;
    const s = sim.state;
    const cam = CONFIG.camera;

    if (mode === 'ORBIT') {
      c.scale = cam.orbitViewRadiusPx / MOON.sphereOfInfluence;
      c.rocketScale = MAP_ROCKET_PX;
      c.upAngle = Math.PI / 2;
      // Moon a little above centre, so the approach from Earth (below) fits.
      c.x = MOON_CENTER.x;
      c.y = MOON_CENTER.y;
      return;
    }

    if (mode === 'ASCENT') {
      c.scale = cam.ascentScale;
      c.rocketScale = c.scale;
      const targetUp = Math.PI / 2;
      const climbFactor = sim.onGround ? 1 : Phaser.Math.Clamp((t.verticalSpeed + 8) / 16, 0, 1);
      const targetRocketY = 260 + (470 - 260) * climbFactor;

      if (snap) {
        this.smoothedRocketY = targetRocketY;
        c.upAngle = targetUp;
      } else {
        this.smoothedRocketY += (targetRocketY - this.smoothedRocketY) * (1 - Math.exp(-dt * 3));
        c.upAngle = targetUp;
      }
      c.x = s.x;
      c.y = s.y + (this.smoothedRocketY - SCREEN_CY) / c.scale;
    } else {
      c.scale = mode === 'DESCENT' ? cam.descentScale : cam.touchdownScale;
      c.rocketScale = Math.max(c.scale, CELL_PX * 0.45);
      const up = localUp('MOON', s.x, s.y);
      const targetUp = Math.atan2(up.y, up.x);
      const alt = Math.max(0, t.moonAltitude);
      const targetRocketY = Phaser.Math.Clamp(640 - alt * c.scale, 160, 480);

      if (snap) {
        this.smoothedRocketY = targetRocketY;
        c.upAngle = targetUp;
      } else {
        this.smoothedRocketY += (targetRocketY - this.smoothedRocketY) * (1 - Math.exp(-dt * 4));
        c.upAngle += Math.atan2(Math.sin(targetUp - c.upAngle), Math.cos(targetUp - c.upAngle)) * (1 - Math.exp(-dt * 3));
      }
      const offset = (this.smoothedRocketY - SCREEN_CY) / c.scale;
      c.x = s.x + up.x * offset;
      c.y = s.y + up.y * offset;
    }
  }

  private spawnSmoke(x: number, y: number, vx: number, vy: number, life: number): void {
    let p: SmokePuff;
    if (this.smokeCount < WorldRenderer.MAX_SMOKE) {
      p = this.smokePool[this.smokeCount++];
    } else {
      let oldestIdx = 0;
      let maxAge = 0;
      for (let i = 0; i < this.smokeCount; i++) {
        if (this.smokePool[i].age > maxAge) {
          maxAge = this.smokePool[i].age;
          oldestIdx = i;
        }
      }
      p = this.smokePool[oldestIdx];
    }
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.age = 0;
    p.life = life;
  }

  public updateSmoke(simDt: number, sim: FlightSim, t: FlightTelemetry, alive: boolean): void {
    // 1. Advance existing smoke particles first
    const damp = Math.exp(-2.2 * simDt);
    let writeIdx = 0;
    for (let i = 0; i < this.smokeCount; i++) {
      const p = this.smokePool[i];
      p.age += simDt;
      if (p.age < p.life) {
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * simDt;
        p.y += p.vy * simDt;
        if (writeIdx !== i) {
          const target = this.smokePool[writeIdx];
          this.smokePool[writeIdx] = p;
          this.smokePool[i] = target;
        }
        writeIdx++;
      }
    }
    this.smokeCount = writeIdx;

    // 2. Spawn new smoke strictly pivoted to active thrusters
    if (alive && t.thrust > 0 && t.airDensity > 0.05) {
      const s = sim.state;
      const bx = Math.cos(s.theta);
      const by = Math.sin(s.theta);
      const visual = this.camera.rocketScale / this.camera.scale;
      const com = sim.com;

      for (const part of sim.vehicle.parts) {
        if (part.thrust <= 0) continue;
        const du = (part.u - com.u) * visual;
        const da = (part.a - com.a) * visual;
        const engX = s.x + da * bx + du * by;
        const engY = s.y + da * by - du * bx;

        const nozzleDist = 0.5 * visual;
        const count = Math.min(4, Math.max(1, Math.round(simDt * 60)));

        for (let i = 0; i < count; i++) {
          const spread = (Math.random() - 0.5) * 4;
          const spawnDist = nozzleDist + Math.random() * 0.15;
          const spawnX = engX - bx * spawnDist;
          const spawnY = engY - by * spawnDist;

          // Exhaust shoots strictly backwards along the thruster axis (-bx, -by)
          const exhaustSpeed = 16 + Math.random() * 6;
          const vx = -bx * exhaustSpeed - by * spread;
          const vy = -by * exhaustSpeed + bx * spread;

          this.spawnSmoke(
            spawnX,
            spawnY,
            vx,
            vy,
            1.8 + Math.random() * 1.5
          );
        }
      }
    }
  }

  private hideSmokeSprites(): void {
    for (let i = 0; i < this.smokeSpritesPool.length; i++) {
      this.smokeSpritesPool[i].setVisible(false);
    }
  }

  public render(sim: FlightSim, t: FlightTelemetry, rocks: readonly Rock[], alive: boolean, shield: boolean, overlay: MissionOverlay): void {
    this.labelIndex = 0;
    this.drawSky(sim, t);
    const g = this.worldGfx;
    g.clear();
    if (this.camera.mode === 'ORBIT') {
      this.hideSmokeSprites();
      this.drawOrbitMap(sim, t, overlay);
    } else if (this.camera.mode === 'ASCENT') {
      this.drawAscent(sim, t, rocks);
    } else {
      this.hideSmokeSprites();
      this.drawMoonCloseUp(sim, overlay);
    }
    this.drawRocketAndDebris(sim, t, alive, shield);
    for (let i = this.labelIndex; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  /** A pooled text label for world annotations. */
  private label(x: number, y: number, text: string, color: string, size = 12, originX = 0.5): void {
    let l = this.labels[this.labelIndex];
    if (!l) {
      l = this.scene.add.text(0, 0, '', { fontSize: `${size}px`, color, fontStyle: 'bold', fontFamily: 'system-ui, sans-serif', stroke: '#000000', strokeThickness: 3 });
      this.labels.push(l);
    }
    this.labelIndex++;
    l.setVisible(true).setPosition(x, y).setText(text).setColor(color).setFontSize(size).setOrigin(originX, 0.5).setDepth(5);
  }

  private drawSky(sim: FlightSim, t: FlightTelemetry): void {
    const y = Math.max(0, t.earthAltitude);
    const altDiff = Math.abs(y - this.lastSkyAltitude);
    const modeChanged = this.camera.mode !== this.lastSkyMode;

    // Cache sky gradient: re-evaluate only when altitude shifts noticeably (>25m) or camera mode changes
    if (modeChanged || altDiff >= 25 || this.lastSkyAltitude === -Infinity) {
      const g = this.skyGfx;
      g.clear();
      const air = this.camera.mode === 'ASCENT' ? Phaser.Math.Clamp(1 - y / WORLD.atmosphereTop, 0, 1) : 0;
      const top = air > 0.5 ? lerpColor(WORLD_COLORS.skyHigh, WORLD_COLORS.skyLow, (air - 0.5) * 2) : lerpColor(WORLD_COLORS.space, WORLD_COLORS.skyHigh, air * 2);
      const bottom = lerpColor(WORLD_COLORS.space, 0xb9dcf5, Math.pow(air, 0.7));
      g.fillGradientStyle(top, top, bottom, bottom, 1);
      g.fillRect(0, 0, 1280, 720);

      this.lastSkyAltitude = y;
      this.lastSkyMode = this.camera.mode;
      this.skyRedrawCount++;
    }

    // During the climb the Moon hangs in the sky ahead and grows as you near it.
    if (this.camera.mode === 'ASCENT') {
      const air = Phaser.Math.Clamp(1 - y / WORLD.atmosphereTop, 0, 1);
      const k = Phaser.Math.Clamp(y / (MOON_CENTER.y - MOON.sphereOfInfluence), 0, 1);
      const r = 26 + 210 * k * k;
      const cx = 900 - Phaser.Math.Clamp(sim.state.x * 0.08, -200, 200) - 200 * k;
      const cy = 230 - 120 * k;
      this.skyMoonSprite.setPosition(cx, cy);
      this.skyMoonSprite.setDisplaySize(r * 2, r * 2);
      this.skyMoonSprite.setAlpha(0.25 + 0.75 * (1 - air * 0.5));
      this.skyMoonSprite.setVisible(true);
    } else {
      this.skyMoonSprite.setVisible(false);
    }
  }

  // ---------------------------------------------------------------------------
  // The climb
  // ---------------------------------------------------------------------------

  private drawAscent(sim: FlightSim, t: FlightTelemetry, rocks: readonly Rock[]): void {
    const g = this.worldGfx;
    const scale = this.camera.scale;
    const s = sim.state;

    // Ground: a flat plain below y = 0, plus the pad and its tower.
    if (s.y < 60) {
      const gl = this.toScreen(s.x - 200, 0);
      const gr = this.toScreen(s.x + 200, 0);
      g.fillStyle(WORLD_COLORS.ground, 1);
      g.fillRect(gl.x, gl.y, gr.x - gl.x, 720 - gl.y + 10);
      g.lineStyle(2, WORLD_COLORS.groundDark, 1);
      g.lineBetween(gl.x, gl.y, gr.x, gr.y);
      const pad = [this.toScreen(-5, 0), this.toScreen(5, 0), this.toScreen(5, -1), this.toScreen(-5, -1)];
      g.fillStyle(0x64748b, 1);
      polygon(g, pad.flatMap(p => [p.x, p.y]), true);
      const towerBase = this.toScreen(-3.2, 0);
      const towerTop = this.toScreen(-2.4, 9);
      g.lineStyle(Math.max(1, scale * 0.12), 0xf97316, 1);
      g.strokeRect(Math.min(towerBase.x, towerTop.x), Math.min(towerBase.y, towerTop.y), Math.abs(towerTop.x - towerBase.x), Math.abs(towerBase.y - towerTop.y));
      for (let h = 1; h < 9; h += 1.5) {
        const a = this.toScreen(-3.2, h);
        const b = this.toScreen(-2.4, h + 1.5);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // Speed streaks: still air (or dust, up high) whipping past shows how fast you're going.
    const halfW = 640 / scale;
    const halfH = 360 / scale;
    const speed = Math.hypot(s.vx, s.vy);
    if (!sim.onGround && speed > 3) {
      const cx = this.camera.x;
      const cy = this.camera.y;
      const len = Math.min(140, speed * 0.05 * scale);
      const ux = s.vx / speed;
      const uy = s.vy / speed;
      const alpha = t.airDensity > 0 ? 0.28 : 0.14;
      g.lineStyle(1.5, 0xffffff, alpha);
      for (const d of this.dust) {
        // Wrap the dust field around the camera so it's endless.
        let wx = d.x;
        let wy = d.y;
        wx = cx + ((((wx - cx + halfW) % (2 * halfW)) + 2 * halfW) % (2 * halfW)) - halfW;
        wy = cy + ((((wy - cy + halfH) % (2 * halfH)) + 2 * halfH) % (2 * halfH)) - halfH;
        d.x = wx;
        d.y = wy;
        const a = this.toScreen(wx, wy);
        g.lineBetween(a.x, a.y, a.x - ux * len, a.y + uy * len);
      }
    }

    // Clouds you fly right through.
    if (s.y > WORLD.cloudsFrom - 120 && s.y < WORLD.cloudsTo + 120) {
      for (const c of this.clouds) {
        if (Math.abs(c.y - s.y) > 60 || Math.abs(c.x - s.x) > 120) continue;
        g.fillStyle(0xffffff, 0.6);
        for (const puff of c.puffs) {
          const pp = this.toScreen(c.x + puff.dx, c.y + puff.dy);
          g.fillCircle(pp.x, pp.y, puff.r * scale);
        }
      }
    }

    // Exhaust smoke: rendered as GPU-batched quad sprites
    let visibleSmoke = 0;
    for (let i = 0; i < this.smokeCount; i++) {
      const p = this.smokePool[i];
      const sp = this.toScreen(p.x, p.y);
      const r = Math.max(1.5, (0.5 + p.age * 1.4) * scale);
      if (sp.x < -r || sp.x > 1280 + r || sp.y < -r || sp.y > 720 + r) continue;
      let sprite = this.smokeSpritesPool[visibleSmoke];
      if (!sprite) {
        sprite = this.scene.add.image(0, 0, 'smoke_puff');
        this.smokeSpritesContainer.add(sprite);
        this.smokeSpritesPool.push(sprite);
      }
      const alpha = 0.4 * (1 - p.age / p.life);
      sprite.setVisible(true);
      sprite.setPosition(sp.x, sp.y);
      sprite.setDisplaySize(r * 2, r * 2);
      sprite.setAlpha(alpha);
      sprite.setTint(0xe5e7eb);
      visibleSmoke++;
    }
    for (let i = visibleSmoke; i < this.smokeSpritesPool.length; i++) {
      this.smokeSpritesPool[i].setVisible(false);
    }

    // Rocks, shields and fuel in the belt, with warning chevrons for what's coming.
    if (s.y > ROCK_BELT.bottom - CONFIG.rockBelt.warningDistance) {
      const time = s.time;
      const ahead = CONFIG.rockBelt.warningDistance;
      for (const r of rocks) {
        if (r.spent) continue;
        const dy = r.y - s.y;
        if (dy < -halfH - 10 || dy > ahead) continue;
        const p = this.toScreen(rockX(r, time), r.y);
        const pr = r.radius * scale;
        const color = r.kind === 'ROCK' ? WORLD_COLORS.danger : r.kind === 'SHIELD' ? WORLD_COLORS.shield : WORLD_COLORS.fuel;
        if (p.y + pr < 0) {
          // Off the top of the screen: a chevron at the edge, brighter as it closes in.
          if (p.x < -40 || p.x > 1320) continue;
          const closeness = 1 - Phaser.Math.Clamp((p.y + pr) / -(ahead * scale), 0, 1);
          const x = Phaser.Math.Clamp(p.x, 16, 1264);
          const size = 6 + Math.min(14, r.radius * 2.5) * (0.5 + closeness * 0.5);
          g.fillStyle(color, 0.25 + 0.7 * closeness);
          g.fillTriangle(x - size, 8 + size * 0.2, x + size, 8 + size * 0.2, x, 8 + size * 1.2);
          continue;
        }
        if (p.x < -pr || p.x > 1280 + pr || p.y > 720 + pr) continue;
        if (r.kind === 'ROCK') {
          const pts: number[] = [];
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + r.seed * 6 + time * (r.seed - 0.5) * 0.6;
            const rr = pr * (0.78 + 0.22 * Math.sin(r.seed * 50 + i * 2.1));
            pts.push(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
          }
          g.fillStyle(WORLD_COLORS.rock, 1);
          polygon(g, pts, true);
          g.lineStyle(2, WORLD_COLORS.rockEdge, 1);
          polygon(g, pts, false);
        } else if (r.kind === 'SHIELD') {
          g.lineStyle(3, WORLD_COLORS.shield, 0.95);
          g.strokeCircle(p.x, p.y, pr);
          g.fillStyle(WORLD_COLORS.shield, 0.25);
          g.fillCircle(p.x, p.y, pr);
        } else {
          g.fillStyle(WORLD_COLORS.fuel, 1);
          g.fillRoundedRect(p.x - pr * 0.6, p.y - pr, pr * 1.2, pr * 2, 4);
          g.fillStyle(0xffffff, 0.8);
          g.fillRect(p.x - pr * 0.3, p.y - pr * 1.15, pr * 0.6, pr * 0.25);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The orbit map
  // ---------------------------------------------------------------------------

  /** Coasting path from here: one orbit, or until it hits the Moon or leaves its pull. */
  private predictPath(sim: FlightSim, t: FlightTelemetry): void {
    const now = this.scene.time.now;
    if (now - this.pathAt < 120) return;
    this.pathAt = now;
    let { x, y, vx, vy } = sim.state;
    this.pathCount = 0;
    this.pathPoints[0] = x;
    this.pathPoints[1] = y;
    this.pathCount = 1;
    const o = t.moonOrbit;
    const span = o && !o.escaping ? Math.min(o.period * 1.02, 1200) : 600;
    const dt = Math.max(0.25, span / 500);
    let hit = false;
    let left = false;
    for (let time = 0; time < span; time += dt) {
      const g = gravityAt(x, y);
      vx += g.x * dt;
      vy += g.y * dt;
      x += vx * dt;
      y += vy * dt;
      if (this.pathCount < 600) {
        this.pathPoints[this.pathCount * 2] = x;
        this.pathPoints[this.pathCount * 2 + 1] = y;
        this.pathCount++;
      }
      if (moonAltitude(x, y) <= 0) {
        hit = true;
        break;
      }
      if (!insideMoonSoi(x, y)) {
        left = true;
        break;
      }
    }
    this.pathColor = hit ? WORLD_COLORS.danger : left ? 0xfbbf24 : WORLD_COLORS.zone;
  }

  /** A filled ring between two radii. */
  private annulus(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r0: number, r1: number): void {
    const n = 72;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * r1, cy + Math.sin((i / n) * Math.PI * 2) * r1);
    for (let i = n; i >= 0; i--) pts.push(cx + Math.cos((i / n) * Math.PI * 2) * r0, cy + Math.sin((i / n) * Math.PI * 2) * r0);
    polygon(g, pts, true);
  }

  private surfaceArc(g: Phaser.GameObjects.Graphics, zone: SurfaceZone, color: number, width: number, alpha = 1): void {
    const a0 = zone.angle - zone.halfWidth / MOON.radius;
    const a1 = zone.angle + zone.halfWidth / MOON.radius;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const p = moonSurfacePoint(a0 + ((a1 - a0) * i) / 16);
      const sp = this.toScreen(p.x, p.y);
      if (i === 0) g.moveTo(sp.x, sp.y);
      else g.lineTo(sp.x, sp.y);
    }
    g.strokePath();
  }

  private flag(g: Phaser.GameObjects.Graphics, angle: number, color: number, height: number): { x: number; y: number } {
    const base = moonSurfacePoint(angle);
    const top = moonSurfacePoint(angle, height);
    const b = this.toScreen(base.x, base.y);
    const t = this.toScreen(top.x, top.y);
    g.lineStyle(2, 0xffffff, 1);
    g.lineBetween(b.x, b.y, t.x, t.y);
    g.fillStyle(color, 1);
    g.fillCircle(t.x, t.y, 4);
    return t;
  }

  private cross(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number): void {
    g.lineStyle(3, color, 1);
    g.lineBetween(x - size, y - size, x + size, y + size);
    g.lineBetween(x - size, y + size, x + size, y - size);
  }

  private drawOrbitMap(sim: FlightSim, t: FlightTelemetry, overlay: MissionOverlay): void {
    const g = this.worldGfx;
    const scale = this.camera.scale;
    const mc = this.toScreen(MOON_CENTER.x, MOON_CENTER.y);

    // The edge of the Moon's pull.
    g.lineStyle(1, 0x94a3b8, 0.35);
    const soiR = MOON.sphereOfInfluence * scale;
    for (let i = 0; i < 72; i += 2) {
      const a0 = (i / 72) * Math.PI * 2;
      const a1 = ((i + 1) / 72) * Math.PI * 2;
      g.lineBetween(mc.x + Math.cos(a0) * soiR, mc.y + Math.sin(a0) * soiR, mc.x + Math.cos(a1) * soiR, mc.y + Math.sin(a1) * soiR);
    }
    this.label(mc.x + soiR * 0.72, mc.y + soiR * 0.72, 'edge of the Moon’s pull', '#64748b', 11, 0);

    // Safe-orbit band: between the lowest and highest allowed heights.
    const lo = (MOON.radius + CONFIG.phases.orbit.minPeriapsis) * scale;
    const hi = (MOON.radius + CONFIG.phases.orbit.maxApoapsis) * scale;
    g.fillStyle(0x22c55e, 0.07);
    this.annulus(g, mc.x, mc.y, lo, hi);

    // Earth, far below.
    g.fillStyle(0x3b82f6, 0.5);
    g.fillTriangle(SCREEN_CX - 8, 704, SCREEN_CX + 8, 704, SCREEN_CX, 714);
    this.label(SCREEN_CX - 30, 709, 'Earth', '#60a5fa', 11);

    // The Moon.
    const mr = MOON.radius * scale;
    g.fillStyle(WORLD_COLORS.moon, 1);
    g.fillCircle(mc.x, mc.y, mr);
    g.fillStyle(WORLD_COLORS.moonDark, 1);
    g.fillCircle(mc.x - mr * 0.35, mc.y - mr * 0.2, mr * 0.16);
    g.fillCircle(mc.x + mr * 0.3, mc.y + mr * 0.3, mr * 0.11);
    g.fillCircle(mc.x + mr * 0.15, mc.y - mr * 0.45, mr * 0.08);

    // Debris swarm.
    if (overlay.debrisRing !== null) {
      const half = CONFIG.phases.rover.problems.DEBRIS.bandHalfHeight * scale;
      const pulse = 0.4 + 0.15 * Math.sin(this.scene.time.now / 150);
      g.fillStyle(WORLD_COLORS.danger, pulse);
      this.annulus(g, mc.x, mc.y, overlay.debrisRing * scale - half, overlay.debrisRing * scale + half);
      // Debris specks drifting round the ring.
      g.fillStyle(0xfca5a5, 0.9);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + this.scene.time.now / 4000 + Math.sin(i * 7.3) * 0.05;
        const rr = overlay.debrisRing * scale + Math.sin(i * 3.7) * half * 0.7;
        g.fillCircle(mc.x + Math.cos(a) * rr, mc.y + Math.sin(a) * rr, 1.5);
      }
    }

    this.drawMissionMarks(g, overlay, true);

    // Predicted path.
    this.predictPath(sim, t);
    g.lineStyle(2, this.pathColor, 0.9);
    for (let i = 1; i < this.pathCount; i++) {
      if (i % 2 === 0) continue;
      const a = this.toScreen(this.pathPoints[(i - 1) * 2], this.pathPoints[(i - 1) * 2 + 1]);
      const b = this.toScreen(this.pathPoints[i * 2], this.pathPoints[i * 2 + 1]);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // Low / high points.
    const o = t.moonOrbit;
    if (o && o.periapsisAltitude > -MOON.radius + 1) {
      const peDir = o.argumentOfPeriapsis;
      if (o.periapsisAltitude > 0) {
        const pe = this.toScreen(MOON_CENTER.x + Math.cos(peDir) * o.periapsisRadius, MOON_CENTER.y + Math.sin(peDir) * o.periapsisRadius);
        g.fillStyle(0x7dd3fc, 1);
        g.fillCircle(pe.x, pe.y, 4);
        this.label(pe.x + Math.cos(peDir) * 18, pe.y - Math.sin(peDir) * 18, `low ${Math.round(o.periapsisAltitude)} m`, '#7dd3fc', 11);
      }
      if (!o.escaping && o.apoapsisRadius < MOON.sphereOfInfluence) {
        const ap = this.toScreen(MOON_CENTER.x - Math.cos(peDir) * o.apoapsisRadius, MOON_CENTER.y - Math.sin(peDir) * o.apoapsisRadius);
        g.fillStyle(0xfbbf24, 1);
        g.fillCircle(ap.x, ap.y, 4);
        this.label(ap.x - Math.cos(peDir) * 18, ap.y + Math.sin(peDir) * 18, `high ${Math.round(o.apoapsisAltitude)} m`, '#fbbf24', 11);
      }
    }

    // Rover capsule on its way down.
    if (overlay.rover && !overlay.rover.landed) {
      const p = this.toScreen(overlay.rover.x, overlay.rover.y);
      g.fillStyle(WORLD_COLORS.rover, 1);
      g.fillRect(p.x - 4, p.y - 4, 8, 8);
    }

    // Direction of travel.
    const s = sim.state;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 1) {
      const r = this.rocketScreen(sim);
      const ux = s.vx / sp;
      const uy = -s.vy / sp;
      const tip = { x: r.x + ux * 34, y: r.y + uy * 34 };
      g.lineStyle(2, 0xffffff, 0.8);
      g.lineBetween(r.x + ux * 16, r.y + uy * 16, tip.x, tip.y);
      g.fillStyle(0xffffff, 0.8);
      g.fillTriangle(tip.x + ux * 7, tip.y + uy * 7, tip.x - uy * 5, tip.y + ux * 5, tip.x + uy * 5, tip.y - ux * 5);
    }
  }

  /** Zones, sites, rovers and markers on the Moon's surface (map or close-up). */
  private drawMissionMarks(g: Phaser.GameObjects.Graphics, overlay: MissionOverlay, map: boolean): void {
    const pulse = 0.65 + 0.35 * Math.sin(this.scene.time.now / 220);
    if (overlay.roverZone) {
      this.surfaceArc(g, ROVER_ZONE, WORLD_COLORS.zone, map ? 7 : 10, pulse);
      const top = this.flag(g, ROVER_ZONE.angle, WORLD_COLORS.zone, map ? 260 : 6);
      this.label(top.x, top.y - 14, 'ROVER ZONE', '#4ade80', 12);
    }
    for (const angle of overlay.landedRovers) {
      const p = moonSurfacePoint(angle, map ? 0 : 0.8);
      const sp = this.toScreen(p.x, p.y);
      g.fillStyle(WORLD_COLORS.rover, 1);
      const s = map ? 4 : Math.max(4, this.camera.scale * 0.9);
      g.fillRect(sp.x - s, sp.y - s, s * 2, s * 2);
    }
    if (overlay.boulders) {
      this.surfaceArc(g, BOULDER_FIELD, WORLD_COLORS.danger, map ? 5 : 8, 0.8);
      for (let i = -3; i <= 3; i++) {
        const angle = BOULDER_FIELD.angle + (i * BOULDER_FIELD.halfWidth) / 3.4 / MOON.radius;
        const size = (3 + ((i * 7 + 11) % 5)) * (map ? 0.15 : 1);
        const p = moonSurfacePoint(angle, size * 0.5);
        const sp = this.toScreen(p.x, p.y);
        g.fillStyle(0x57534e, 1);
        g.fillCircle(sp.x, sp.y, Math.max(2, size * this.camera.scale * (map ? 3 : 1)));
      }
    }
    if (overlay.site) {
      this.surfaceArc(g, overlay.site, WORLD_COLORS.site, map ? 7 : 10, pulse);
      const top = this.flag(g, overlay.site.angle, WORLD_COLORS.site, map ? 260 : 6);
      this.label(top.x, top.y - 14, 'LANDING SITE', '#7dd3fc', 12);
    }
    if (overlay.dropMarker) {
      const p = this.toScreen(overlay.dropMarker.x, overlay.dropMarker.y);
      this.cross(g, p.x, p.y, 7, WORLD_COLORS.rover);
    }
    if (overlay.impactMarker) {
      const p = this.toScreen(overlay.impactMarker.x, overlay.impactMarker.y);
      this.cross(g, p.x, p.y, 7, 0xffffff);
    }
  }

  // ---------------------------------------------------------------------------
  // Coming down to land
  // ---------------------------------------------------------------------------

  private drawMoonCloseUp(sim: FlightSim, overlay: MissionOverlay): void {
    const g = this.worldGfx;
    const s = sim.state;
    // Just the nearby stretch of the surface, as a big filled arc.
    const near = Math.atan2(s.y - MOON_CENTER.y, s.x - MOON_CENTER.x);
    const span = Math.min(Math.PI / 2, 1000 / (MOON.radius * this.camera.scale) + 0.02);
    const mc = this.toScreen(MOON_CENTER.x, MOON_CENTER.y);
    const pts: number[] = [];
    for (let i = 0; i <= 80; i++) {
      const p = moonSurfacePoint(near - span + (2 * span * i) / 80);
      const sp = this.toScreen(p.x, p.y);
      pts.push(sp.x, sp.y);
    }
    // Close the shape at the Moon's centre, far below the screen.
    const deep = [...pts, mc.x, mc.y];
    g.fillStyle(WORLD_COLORS.moon, 1);
    polygon(g, deep, true);
    g.lineStyle(2, WORLD_COLORS.moonDark, 1);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.strokePath();

    // Craters for a sense of speed across the ground.
    for (let i = -40; i <= 40; i++) {
      const angle = Math.round(near * 400) / 400 + i / 400;
      const seed = Math.abs(Math.sin(Math.round(angle * 400) * 12.9898)) % 1;
      if (seed < 0.6) continue;
      const p = moonSurfacePoint(angle, -2 - seed * 3);
      const sp = this.toScreen(p.x, p.y);
      g.fillStyle(WORLD_COLORS.moonDark, 1);
      g.fillEllipse(sp.x, sp.y, (2 + seed * 6) * this.camera.scale, (0.8 + seed * 2) * this.camera.scale);
    }

    this.drawMissionMarks(g, overlay, false);
  }

  // ---------------------------------------------------------------------------
  // The rocket
  // ---------------------------------------------------------------------------

  private drawPart(g: Phaser.GameObjects.Graphics, p: FlightPart, sx: number, sy: number, rot: number, cellPx: number, alpha: number): void {
    const local = partShape(p, cellPx / 2);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pts: number[] = [];
    for (let i = 0; i < local.length; i += 2) pts.push(sx + local[i] * c - local[i + 1] * s, sy + local[i] * s + local[i + 1] * c);
    g.fillStyle(PART_DEFINITIONS[p.type].color, alpha);
    polygon(g, pts, true);
    if (cellPx > 8) {
      g.lineStyle(1.5, 0xffffff, 0.7 * alpha);
      polygon(g, pts, false);
    }
  }

  private renderPartSprite(p: FlightPart, sx: number, sy: number, rot: number, cellPx: number, alpha: number, fuelRemaining?: number): void {
    let img = this.partSpritesPool[this.activeSpriteCount];
    if (!img) {
      img = this.scene.add.image(0, 0, GAME_ASSETS.PART_COCKPIT.key);
      this.partSpritesContainer.add(img);
      this.partSpritesPool.push(img);
    }
    this.activeSpriteCount++;

    const texKey = getPartTextureKey(p.type, p.finOrientation, fuelRemaining);
    img.setTexture(texKey);
    img.setPosition(sx, sy);
    img.setRotation(rot);
    img.setDisplaySize(cellPx, cellPx);
    img.setAlpha(alpha);
    img.setVisible(true);
  }

  private drawRocketAndDebris(sim: FlightSim, t: FlightTelemetry, alive: boolean, shield: boolean): void {
    const g = this.rocketGfx;
    g.clear();
    const cellPx = this.camera.rocketScale;
    const visual = cellPx / this.camera.scale; // metres-per-cell as drawn
    this.activeSpriteCount = 0;
    const useSprites = true;

    // Tumbling debris (not on the orbit map, where it would just be clutter).
    if (this.camera.mode !== 'ORBIT') {
      for (const d of sim.debris) {
        const alpha = Phaser.Math.Clamp(1 - (d.age - 30) / 20, 0.2, 1);
        const rot = this.screenRotation(d.theta);
        for (const p of d.parts) {
          const du = (p.u - d.com.u) * visual;
          const da = (p.a - d.com.a) * visual;
          const wx = d.x + da * Math.cos(d.theta) + du * Math.sin(d.theta);
          const wy = d.y + da * Math.sin(d.theta) - du * Math.cos(d.theta);
          const sp = this.toScreen(wx, wy);
          if (sp.x < -100 || sp.x > 1380 || sp.y < -100 || sp.y > 820) continue;
          if (useSprites) {
            this.renderPartSprite(p, sp.x, sp.y, rot, cellPx, alpha, 0);
          } else {
            this.drawPart(g, p, sp.x, sp.y, rot, cellPx, alpha);
          }
        }
      }
    }
    if (!alive) {
      for (let i = this.activeSpriteCount; i < this.partSpritesPool.length; i++) {
        this.partSpritesPool[i].setVisible(false);
      }
      return;
    }

    const s = sim.state;
    const com = sim.com;
    const rot = this.screenRotation(s.theta);
    const parts = sim.vehicle.parts;
    const positions = parts.map(p => {
      const du = (p.u - com.u) * visual;
      const da = (p.a - com.a) * visual;
      return this.toScreen(s.x + da * Math.cos(s.theta) + du * Math.sin(s.theta), s.y + da * Math.sin(s.theta) - du * Math.cos(s.theta));
    });

    // Flames first, so they sit behind the engine bells.
    if (t.thrust > 0) {
      const vacuum = 1 - Math.sqrt(t.airDensity / WORLD.seaLevelDensity);
      const flicker = 0.85 + Math.random() * 0.3;
      const len = cellPx * (0.9 + 2 * t.throttle) * (1 + vacuum * 0.4) * flicker;
      const w = cellPx * 0.42 * (1 + vacuum);
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const tf = (lx: number, ly: number, ox: number, oy: number) => [ox + lx * c - ly * sn, oy + lx * sn + ly * c];
      parts.forEach((p, i) => {
        if (p.thrust <= 0) return;
        const o = positions[i];
        const base = cellPx / 2;
        const outerRaw = [-w, base, w, base, w * 0.3, base + len * 0.75, 0, base + len, -w * 0.3, base + len * 0.75];
        const outer: number[] = [];
        for (let j = 0; j < outerRaw.length; j += 2) {
          const pt = tf(outerRaw[j], outerRaw[j + 1], o.x, o.y);
          outer.push(pt[0], pt[1]);
        }
        const innerRaw = [-w * 0.5, base, w * 0.5, base, 0, base + len * 0.55];
        const inner: number[] = [];
        for (let j = 0; j < innerRaw.length; j += 2) {
          const pt = tf(innerRaw[j], innerRaw[j + 1], o.x, o.y);
          inner.push(pt[0], pt[1]);
        }
        g.fillStyle(0xff7b1c, 0.85);
        polygon(g, outer, true);
        g.fillStyle(0xffe066, 0.95);
        polygon(g, inner, true);
      });
    }

    if (useSprites) {
      parts.forEach((p, i) => this.renderPartSprite(p, positions[i].x, positions[i].y, rot, cellPx, 1, sim.tanks.get(p.id)));
    } else {
      parts.forEach((p, i) => this.drawPart(g, p, positions[i].x, positions[i].y, rot, cellPx, 1));
    }

    // Hide any unused pooled sprites
    for (let i = this.activeSpriteCount; i < this.partSpritesPool.length; i++) {
      this.partSpritesPool[i].setVisible(false);
    }

    if (shield) {
      const c = this.toScreen(s.x, s.y);
      const r = cellPx * (sim.vehicle.length / 2 + 1);
      g.lineStyle(3, WORLD_COLORS.shield, 0.6 + 0.3 * Math.sin(this.scene.time.now / 120));
      g.strokeCircle(c.x, c.y, r);
      g.fillStyle(WORLD_COLORS.shield, 0.08);
      g.fillCircle(c.x, c.y, r);
    }
  }

  /** Part positions as drawn, for collisions. */
  public partPointsAsDrawn(sim: FlightSim): Array<{ id: string; x: number; y: number }> {
    const s = sim.state;
    const com = sim.com;
    const visual = this.camera.rocketScale / this.camera.scale;
    return sim.vehicle.parts.map(p => {
      const du = (p.u - com.u) * visual;
      const da = (p.a - com.a) * visual;
      return { id: p.id, x: s.x + da * Math.cos(s.theta) + du * Math.sin(s.theta), y: s.y + da * Math.sin(s.theta) - du * Math.cos(s.theta) };
    });
  }
}
