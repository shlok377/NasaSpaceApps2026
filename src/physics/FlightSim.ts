import { AIRFRAME, ENGINE, FINS, G0, LIMITS, MOON, MOON_CENTER, STEERING, WORLD } from './constants';
import { OrbitElements, orbitFromState } from './orbit';
import { airDensity, machDragFactor } from './atmosphere';
import { BodyId, dominantBody, earthGravity, gravityAt, insideMoonSoi, localUp, moonAltitude, moonAngleOf } from './bodies';
import {
  boosterStages,
  buildVehicle,
  centerOfMass,
  CenterOfMass,
  FlightPart,
  FlightVehicle,
  fullTanks,
  momentOfInertia,
  subtreeIds,
  totalFuel
} from './vehicle';
import { windAt } from './wind';

/** Fixed physics timestep. */
export const PHYSICS_DT = 1 / 120;
/** Maximum physics sub-steps allowed per frame to prevent spiral-of-death during lag spikes. */
export const MAX_SUBSTEPS = 24;

export type FlightPhase = 'PRELAUNCH' | 'FLYING' | 'LANDED' | 'CRASHED';

export interface ControlInput {
  /** 0..1 */
  throttle: number;
  /** −1..1, + = steer left (counter-clockwise). A nudge, not an autopilot. */
  steer: number;
}

export type FlightEventKind =
  | 'LIFTOFF'
  | 'MECO'
  | 'SPACE'
  | 'STAGE'
  | 'PART_LOST'
  | 'APEX'
  | 'MOON_SOI'
  | 'BOUNCE'
  | 'LANDED'
  | 'CRASH';

export interface FlightEvent {
  kind: FlightEventKind;
  time: number;
  message: string;
}

export interface FlightStats {
  maxAltitude: number;
  maxSpeed: number;
  maxQ: number;
  reachedSpace: boolean;
  /** Got high enough that the Moon's pull took over. */
  /** Entered the Moon's sphere of influence. */
  reachedMoonSoi: boolean;
  closestMoonApproach: number;
  landedOn: BodyId | null;
  crashedOn: BodyId | 'ROCK' | null;
  impactSpeed: number;
  /** Where it touched down: angle on the Moon (rad) or x on Earth (m). */
  touchdownAt: number | null;
  stagesDropped: number;
  partsLost: number;
  bounces: number;
  fuelCollected: number;
  deltaVSpent: number;
}

/** A chunk that came off the rocket and now tumbles on its own. */
export interface Debris {
  id: number;
  parts: FlightPart[];
  /** Body-frame centre of mass of the chunk (relative to the original layout). */
  com: CenterOfMass;
  x: number;
  y: number;
  vx: number;
  vy: number;
  theta: number;
  omega: number;
  age: number;
}

export interface FlightTelemetry {
  time: number;
  phase: FlightPhase;
  onGround: boolean;
  /** Whose gravity is stronger here; altitude/speeds/attitude are relative to its surface. */
  body: BodyId;
  altitude: number;
  earthAltitude: number;
  moonAltitude: number;
  speed: number;
  verticalSpeed: number;
  horizontalSpeed: number;
  mach: number;
  dynamicPressure: number;
  airDensity: number;
  wind: number;
  /** Nose relative to local vertical (rad, + = tilted left/CCW). */
  pitchFromVertical: number;
  /** Direction of travel relative to local vertical (rad). */
  progradeFromVertical: number;
  angleOfAttack: number;
  mass: number;
  fuel: number;
  /** Fuel left as a share of what the rocket launched with. */
  fuelFraction: number;
  throttle: number;
  thrust: number;
  twr: number;
  gForce: number;
  /** Orbit around the Moon (only inside its sphere of influence). */
  moonOrbit: OrbitElements | null;
}

export interface FlightSnapshot {
  parts: FlightPart[];
  rootGridX: number;
  rootGridY: number;
  state: FlightState;
  tanks: Array<[string, number]>;
  phase: FlightPhase;
  onGround: boolean;
  hasLeftGround: boolean;
  stats: FlightStats;
  startFuel: number;
  initialVehicle: FlightVehicle;
}

export interface FlightState {
  /** World position of the current centre of mass (m). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Nose direction (rad, math convention; π/2 = straight up). */
  theta: number;
  omega: number;
  throttle: number;
  time: number;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export class FlightSim {
  public vehicle: FlightVehicle;
  public readonly initialVehicle: FlightVehicle;
  public state: FlightState;
  public phase: FlightPhase = 'PRELAUNCH';
  public onGround = true;
  public tanks: Map<string, number>;
  public debris: Debris[] = [];
  /** Bumped whenever parts come off, so renderers know to redraw the rocket. */
  public version = 0;
  public stats: FlightStats = {
    maxAltitude: 0,
    maxSpeed: 0,
    maxQ: 0,
    reachedSpace: false,
    reachedMoonSoi: false,
    closestMoonApproach: Infinity,
    landedOn: null,
    crashedOn: null,
    impactSpeed: 0,
    touchdownAt: null,
    stagesDropped: 0,
    partsLost: 0,
    bounces: 0,
    fuelCollected: 0,
    deltaVSpent: 0
  };

  /**
   * Things going wrong, set by the mission each frame: a stuck thruster's
   * twist (N·m), an extra pull (m/s², e.g. orbit decay), a fuel leak (kg/s),
   * a dead engine.
   */
  public disturbance = { torque: 0, accelX: 0, accelY: 0, leakRate: 0, engineOut: false };

  private events: FlightEvent[] = [];
  private accumulator = 0;
  private hasLeftGround = false;
  private mecoAnnounced = false;
  private wasClimbing = false;
  private lastThrust = 0;
  private lastQ = 0;
  private lastProperAccel = 0;
  private nextDebrisId = 0;
  private readonly startFuel: number;

  /** The rocket starts standing on the pad at x = 0, pointing straight up. */
  constructor(vehicle: FlightVehicle) {
    this.vehicle = vehicle;
    this.initialVehicle = vehicle;
    this.tanks = fullTanks(vehicle);
    this.startFuel = Math.max(1e-9, totalFuel(this.tanks));
    this.state = { x: 0, y: 0, vx: 0, vy: 0, theta: Math.PI / 2, omega: 0, throttle: 1, time: 0 };
    this.state.y = -this.lowestPointOffset('EARTH');
  }

  public get isFinished(): boolean {
    return this.phase === 'LANDED' || this.phase === 'CRASHED';
  }

  public get fuel(): number {
    return totalFuel(this.tanks);
  }

  private _cachedCom: CenterOfMass | null = null;

  public invalidateCom(): void {
    this._cachedCom = null;
  }

  /** Body-frame centre of mass right now (fuel shifts it). */
  public get com(): CenterOfMass {
    if (!this._cachedCom) {
      this._cachedCom = centerOfMass(this.vehicle, this.tanks);
    }
    return this._cachedCom;
  }

  public launch(): void {
    if (this.phase === 'PRELAUNCH') this.phase = 'FLYING';
  }

  public drainEvents(): FlightEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  public advance(seconds: number, input: ControlInput): void {
    this.accumulator += seconds;
    const maxAccum = MAX_SUBSTEPS * PHYSICS_DT;
    if (this.accumulator > maxAccum) {
      this.accumulator = maxAccum;
    }
    while (this.accumulator >= PHYSICS_DT - 1e-9) {
      this.step(PHYSICS_DT, input);
      this.accumulator -= PHYSICS_DT;
    }
    this.updateDebris(seconds);
  }

  // ---------------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------------

  /** World offset of a body-frame point (u right, a forward) from the centre of mass. */
  private bodyToWorld(u: number, a: number, com: CenterOfMass, theta = this.state.theta): { x: number; y: number } {
    const bx = Math.cos(theta);
    const by = Math.sin(theta);
    // Right-hand side of the nose: (sin θ, −cos θ).
    const du = u - com.u;
    const da = a - com.a;
    return { x: da * bx + du * by, y: da * by - du * bx };
  }

  /** How far the lowest corner of the rocket sits below its centre of mass, along a body's "up" (negative). */
  private lowestPointOffset(body: BodyId): number {
    const com = this.com;
    const up = localUp(body, this.state.x, this.state.y);
    let lowest = 0;
    const half = AIRFRAME.cellLength / 2;
    for (const p of this.vehicle.parts) {
      for (const [cu, ca] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half]
      ]) {
        const w = this.bodyToWorld(p.u + cu, p.a + ca, com);
        lowest = Math.min(lowest, w.x * up.x + w.y * up.y);
      }
    }
    return lowest;
  }

  // ---------------------------------------------------------------------------
  // Step
  // ---------------------------------------------------------------------------

  public step(dt: number, input: ControlInput): void {
    const s = this.state;
    const v = this.vehicle;
    s.throttle = clamp(input.throttle, 0, 1);
    if (this.phase !== 'FLYING') {
      this.lastThrust = 0;
      return;
    }

    const bodyX = Math.cos(s.theta);
    const bodyY = Math.sin(s.theta);
    // Body "left" normal.
    const nX = -bodyY;
    const nY = bodyX;

    // --- Mass properties ----------------------------------------------------
    const com = this.com;
    const fuel = this.fuel;
    const mass = v.dryMass + fuel;
    const inertia = momentOfInertia(v, this.tanks, com);

    // --- Propulsion: outer tanks first ---------------------------------------
    let thrust = 0;
    const d = this.disturbance;
    if (d.leakRate > 0) this.drawFuel(d.leakRate * dt);
    if (fuel > 0 && s.throttle > 0 && v.engineCount > 0 && !d.engineOut) {
      const want = v.maxMassFlow * s.throttle * dt;
      const burned = this.drawFuel(want);
      thrust = v.thrust * s.throttle * (burned / want);
      if (this.fuel <= 1e-9 && !this.mecoAnnounced) {
        this.mecoAnnounced = true;
        this.emit('MECO', 'Out of fuel!');
      }
    }
    this.lastThrust = thrust;

    // --- Aerodynamics ---------------------------------------------------------
    const rho = airDensity(s.y);
    const wind = rho > 0 ? windAt(s.y, s.time) : 0;
    const airVx = s.vx - wind;
    const airVy = s.vy;
    const speed = Math.hypot(airVx, airVy);
    const q = 0.5 * rho * speed * speed;
    const alpha = speed > 0.5 ? wrapAngle(s.theta - Math.atan2(airVy, airVx)) : 0;
    const sinAlpha = Math.sin(alpha);
    this.lastQ = q;

    let dragX = 0;
    let dragY = 0;
    if (speed > 1e-6 && rho > 0) {
      const cdA = v.dragArea * machDragFactor(speed / WORLD.speedOfSound) * (1 + AIRFRAME.angleOfAttackDragFactor * sinAlpha * sinAlpha);
      dragX = (-airVx / speed) * q * cdA;
      dragY = (-airVy / speed) * q * cdA;
    }

    // Normal force per surface, including the body's own rotation (pitch damping).
    let normalForce = 0;
    let aeroTorque = 0;
    if (rho > 0) {
      const halfRhoA = 0.5 * rho * v.referenceArea;
      for (const surface of v.aeroSurfaces) {
        const d = surface.a - com.a;
        const fn = halfRhoA * surface.cn * (speed * speed * sinAlpha - speed * s.omega * d);
        normalForce += fn;
        aeroTorque += d * fn;
      }
      const qA = q * v.referenceArea;
      aeroTorque += (v.finStable ? -1 : 1) * FINS.stabilityMoment * qA * v.length * sinAlpha;
      aeroTorque += FINS.asymmetryMoment * (v.leftFins - v.rightFins) * qA;
    }

    // --- Torques: imbalance tilts the rocket; the pilot only nudges ----------
    const thrustTorque = (v.thrustU - com.u) * thrust;
    const steer = clamp(input.steer, -1, 1);
    const gimbalArm = Math.abs(v.thrustA - com.a);
    const qA = q * v.referenceArea;
    const steerAuthority =
      (v.hasCommandModule ? AIRFRAME.reactionWheelTorque + (thrust === 0 ? STEERING.rcsTorque : 0) : 0) +
      thrust * Math.sin(ENGINE.gimbalRange) * gimbalArm +
      FINS.controlAuthority * v.finCount * qA * v.length * 0.5;
    const controlTorque = steer * steerAuthority;
    // Small side thrusters push the way you steer.
    const rcs = v.hasCommandModule ? steer * STEERING.rcsAcceleration * mass : 0;

    // --- Integrate --------------------------------------------------------------
    const g = gravityAt(s.x, s.y);
    const nonGravX = thrust * bodyX + dragX + (normalForce + rcs) * nX;
    const nonGravY = thrust * bodyY + dragY + (normalForce + rcs) * nY;
    const ax = nonGravX / mass + g.x + d.accelX;
    const ay = nonGravY / mass + g.y + d.accelY;

    if (this.onGround) {
      // The pad pushes back until thrust beats weight.
      if (ay <= 0) {
        s.vx = 0;
        s.vy = 0;
        s.omega = 0;
        this.lastProperAccel = earthGravity(s.y);
        s.time += dt;
        return;
      }
      this.onGround = false;
      if (!this.hasLeftGround) {
        this.hasLeftGround = true;
        this.emit('LIFTOFF', 'LIFTOFF!');
      }
    }

    s.omega += ((aeroTorque + thrustTorque + controlTorque + d.torque) / inertia) * dt;
    s.omega *= Math.exp(-AIRFRAME.spinDamping * dt);
    s.theta = wrapAngle(s.theta + s.omega * dt);
    s.vx += ax * dt;
    s.vy += ay * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.time += dt;

    this.lastProperAccel = Math.hypot(nonGravX, nonGravY) / mass;
    this.stats.deltaVSpent += (thrust / mass) * dt;

    this.checkJoints(q, alpha);
    this.checkStaging();
    this.checkContact();
    if (!this.isFinished) this.updateStats(q);
  }

  /** Burn from the outermost tanks first (deepest in the tree), evenly among equals. */
  private drawFuel(want: number): number {
    let remaining = want;
    while (remaining > 1e-12) {
      let depth = -1;
      for (const [id, kg] of this.tanks) {
        if (kg <= 0) continue;
        const p = this.vehicle.parts.find(q => q.id === id);
        if (p && p.depth > depth) depth = p.depth;
      }
      if (depth < 0) break;
      const group = [...this.tanks].filter(([id, kg]) => kg > 0 && this.vehicle.parts.find(q => q.id === id)?.depth === depth);
      const share = remaining / group.length;
      let taken = 0;
      for (const [id, kg] of group) {
        const t = Math.min(kg, share);
        this.tanks.set(id, kg - t);
        taken += t;
      }
      remaining -= taken;
      if (taken <= 1e-12) break;
    }
    const drawn = want - remaining;
    if (drawn > 1e-12) this.invalidateCom();
    return drawn;
  }

  /** Empty booster stages drop off — but only when what's left can still fly. */
  private checkStaging(): void {
    for (const tankId of boosterStages(this.vehicle)) {
      if ((this.tanks.get(tankId) ?? 0) > 1e-9) continue;
      const ids = subtreeIds(this.vehicle.parts, tankId);
      const stageFuel = [...ids].reduce((sum, id) => sum + (this.tanks.get(id) ?? 0), 0);
      if (stageFuel > 1e-9) continue;
      const rest = this.vehicle.parts.filter(p => !ids.has(p.id));
      const restHasEngine = rest.some(p => p.thrust > 0);
      const restFuel = rest.reduce((sum, p) => sum + (this.tanks.get(p.id) ?? 0), 0);
      if (!restHasEngine || restFuel <= 1e-9) continue;
      this.detach(ids, 2);
      this.stats.stagesDropped++;
      this.emit('STAGE', 'STAGE SEPARATION — empty booster dropped');
      return;
    }
  }

  /**
   * Joints snap when an outer part (one with nothing bolted to it) is loaded
   * too hard — flying sideways through thick air, or spinning too fast.
   */
  private checkJoints(q: number, alpha: number): void {
    const v = this.vehicle;
    const s = this.state;
    const com = this.com;
    const sinA = Math.abs(Math.sin(alpha));
    for (const p of v.parts) {
      if (p.parentId === null || v.parts.some(c => c.parentId === p.id)) continue;
      const r = Math.hypot(p.u - com.u, p.a - com.a);
      const aeroLoad = q * v.referenceArea * p.normalForceCoeff * sinA;
      const spinLoad = p.dryMass * s.omega * s.omega * r;
      const tooFast = Math.abs(s.omega) > LIMITS.maxSpin;
      if (aeroLoad + spinLoad > LIMITS.jointStrength || tooFast) {
        this.detach(new Set([p.id]), 1);
        this.stats.partsLost++;
        this.emit('PART_LOST', `${p.type === 'FIN' ? 'A fin' : p.type === 'NOSE_CONE' ? 'The nose cone' : 'A part'} snapped off!`);
        return;
      }
    }
  }

  /** A rock (or anything) knocked into a part: it and everything beyond it comes off. */
  public hitPart(partId: string): void {
    if (this.phase !== 'FLYING') return;
    const part = this.vehicle.parts.find(p => p.id === partId);
    if (!part) return;
    if (part.parentId === null) {
      this.detach(new Set(this.vehicle.parts.map(p => p.id)), 3, true);
      this.phase = 'CRASHED';
      this.stats.crashedOn = 'ROCK';
      this.emit('CRASH', 'Direct hit on the command module!');
      return;
    }
    this.detach(subtreeIds(this.vehicle.parts, partId), 4);
    this.stats.partsLost++;
    this.emit('PART_LOST', 'BONK! A rock knocked a part off');
  }

  /** Split parts off into a tumbling chunk and rebuild what's left. */
  private detach(ids: Set<string>, push: number, everything = false): void {
    const s = this.state;
    const com = this.com;
    const chunk = this.vehicle.parts.filter(p => ids.has(p.id));
    if (chunk.length === 0) return;

    let m = 0;
    let cu = 0;
    let ca = 0;
    for (const p of chunk) {
      const pm = p.dryMass + (this.tanks.get(p.id) ?? 0);
      m += pm;
      cu += pm * p.u;
      ca += pm * p.a;
    }
    const chunkCom = { u: cu / m, a: ca / m };
    const offset = this.bodyToWorld(chunkCom.u, chunkCom.a, com);
    const dist = Math.hypot(offset.x, offset.y) || 1;
    this.debris.push({
      id: this.nextDebrisId++,
      parts: chunk,
      com: chunkCom,
      x: s.x + offset.x,
      y: s.y + offset.y,
      // Rocket velocity + spin carry-over + a shove away from the rocket.
      vx: s.vx - s.omega * offset.y + (offset.x / dist) * push,
      vy: s.vy + s.omega * offset.x + (offset.y / dist) * push,
      theta: s.theta,
      omega: s.omega + (Math.random() - 0.5) * 2,
      age: 0
    });

    if (everything) {
      this.vehicle = buildVehicle([], this.vehicle.rootGridX, this.vehicle.rootGridY);
      this.invalidateCom();
      this.version++;
      return;
    }
    const rest = this.vehicle.parts.filter(p => !ids.has(p.id));
    for (const id of ids) this.tanks.delete(id);
    this.vehicle = buildVehicle(rest, this.vehicle.rootGridX, this.vehicle.rootGridY);
    this.invalidateCom();
    // Keep the remaining parts where they were: move the state to their centre of mass.
    const newCom = this.com;
    const shift = this.bodyToWorld(newCom.u, newCom.a, com);
    s.x += shift.x;
    s.y += shift.y;
    this.version++;
  }

  private updateDebris(seconds: number): void {
    const keep: Debris[] = [];
    for (const d of this.debris) {
      // Several sub-steps keep tumbling chunks smooth at high frame times.
      const n = Math.max(1, Math.ceil(seconds / 0.02));
      const dt = seconds / n;
      let alive = true;
      for (let i = 0; i < n && alive; i++) {
        const g = gravityAt(d.x, d.y);
        const rho = airDensity(d.y);
        const sp = Math.hypot(d.vx, d.vy);
        const k = (0.5 * rho * sp * 0.15) / Math.max(20, d.parts.reduce((s, p) => s + p.dryMass, 0));
        d.vx += (g.x - k * d.vx) * dt;
        d.vy += (g.y - k * d.vy) * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.theta += d.omega * dt;
        d.age += dt;
        if (d.y <= 0 || moonAltitude(d.x, d.y) <= 0 || d.age > 90) alive = false;
      }
      if (alive) keep.push(d);
    }
    this.debris = keep;
  }

  // ---------------------------------------------------------------------------
  // Touchdown
  // ---------------------------------------------------------------------------

  private checkContact(): void {
    const s = this.state;
    if (this.vehicle.parts.length === 0) return;
    const nearMoon = moonAltitude(s.x, s.y) < 200;
    const body: BodyId = nearMoon ? 'MOON' : 'EARTH';
    const surfaceHeight = body === 'EARTH' ? s.y : moonAltitude(s.x, s.y);
    const bottom = surfaceHeight + this.lowestPointOffset(body);
    if (bottom > 0) return;

    const up = localUp(body, s.x, s.y);
    // Put the lowest corner back on the surface.
    s.x -= up.x * bottom;
    s.y -= up.y * bottom;

    const impactSpeed = Math.hypot(s.vx, s.vy);
    const tilt = Math.abs(wrapAngle(s.theta - Math.atan2(up.y, up.x)));
    if (impactSpeed > LIMITS.crashSpeed && impactSpeed <= LIMITS.bounceSpeed && tilt < LIMITS.maxLandingTilt) {
      const radial = s.vx * up.x + s.vy * up.y;
      const bounceUp = Math.abs(radial) * LIMITS.bounceRestitution + 2;
      const tangential = (s.vx * up.y - s.vy * up.x) * 0.5;
      s.vx = up.x * bounceUp + tangential * up.y;
      s.vy = up.y * bounceUp - tangential * up.x;
      s.omega += (Math.random() - 0.5) * 0.6;
      this.stats.bounces++;
      this.emit('BOUNCE', `BOING! ${Math.round(impactSpeed)} m/s is too hard — land under ${LIMITS.crashSpeed} m/s`);
      return;
    }

    this.stats.impactSpeed = impactSpeed;
    if (impactSpeed > LIMITS.crashSpeed || tilt > LIMITS.maxLandingTilt) {
      this.phase = 'CRASHED';
      this.stats.crashedOn = body;
      const why = tilt > LIMITS.maxLandingTilt && impactSpeed <= LIMITS.crashSpeed ? 'tipped over' : `hit at ${Math.round(impactSpeed)} m/s`;
      this.emit('CRASH', `${body === 'MOON' ? 'Crashed on the Moon' : 'Crashed'} — ${why}`);
      s.vx = 0;
      s.vy = 0;
      return;
    }

    s.vx = 0;
    s.vy = 0;
    s.omega = 0;
    // A hop of a few centimetres off the pad isn't a landing.
    if (!this.hasLeftGround || this.stats.maxAltitude < 3) {
      this.onGround = true;
      return;
    }
    this.phase = 'LANDED';
    this.stats.landedOn = body;
    if (body === 'MOON') {
      this.stats.touchdownAt = moonAngleOf(s.x, s.y);
      this.emit('LANDED', `TOUCHDOWN ON THE MOON — ${impactSpeed.toFixed(1)} m/s`);
    } else {
      this.stats.touchdownAt = s.x;
      this.emit('LANDED', `Landed back home — ${impactSpeed.toFixed(1)} m/s`);
    }
  }

  private updateStats(q: number): void {
    const s = this.state;
    const st = this.stats;
    st.maxAltitude = Math.max(st.maxAltitude, s.y);
    st.maxSpeed = Math.max(st.maxSpeed, Math.hypot(s.vx, s.vy));
    st.maxQ = Math.max(st.maxQ, q);
    st.closestMoonApproach = Math.min(st.closestMoonApproach, moonAltitude(s.x, s.y));

    if (!st.reachedSpace && s.y >= WORLD.atmosphereTop) {
      st.reachedSpace = true;
      this.emit('SPACE', 'Edge of space!');
    }
    if (!st.reachedMoonSoi && insideMoonSoi(s.x, s.y)) {
      st.reachedMoonSoi = true;
      this.emit('MOON_SOI', 'Entered the Moon’s gravity!');
    }
    const climbing = s.vy > 0;
    if (this.wasClimbing && !climbing && !st.reachedMoonSoi && this.hasLeftGround) {
      this.emit('APEX', `Peaked at ${Math.round(s.y)} m — falling back!`);
    }
    this.wasClimbing = climbing;
  }

  private emit(kind: FlightEventKind, message: string): void {
    this.events.push({ kind, time: this.state.time, message });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Top up the tanks (pickups). Returns how much actually fit. */
  public refuel(kg: number): number {
    let room = 0;
    for (const p of this.vehicle.parts) if (p.fuelCapacity > 0) room += p.fuelCapacity - (this.tanks.get(p.id) ?? 0);
    const added = Math.max(0, Math.min(kg, room));
    if (added <= 0) return 0;
    for (const p of this.vehicle.parts) {
      if (p.fuelCapacity <= 0) continue;
      const free = p.fuelCapacity - (this.tanks.get(p.id) ?? 0);
      this.tanks.set(p.id, (this.tanks.get(p.id) ?? 0) + (added * free) / room);
    }
    this.stats.fuelCollected += added;
    this.mecoAnnounced = false;
    this.invalidateCom();
    return added;
  }

  /** Where each part is in the world right now (for collisions and drawing). */
  public partPositions(): Array<{ part: FlightPart; x: number; y: number }> {
    const com = this.com;
    return this.vehicle.parts.map(part => {
      const w = this.bodyToWorld(part.u, part.a, com);
      return { part, x: this.state.x + w.x, y: this.state.y + w.y };
    });
  }

  /**
   * How high the rocket will get (gravity + drag): either burning its
   * remaining fuel straight on and then coasting, or — with `coastOnly` — if
   * the engines were cut right now. Lets the HUD show "you'll make it" early.
   */
  public predictApex(coastOnly = false): { altitude: number; reachesMoon: boolean } {
    let { x, y, vx, vy } = this.state;
    let fuel = coastOnly ? 0 : this.fuel;
    const v = this.vehicle;
    const dir = { x: Math.cos(this.state.theta), y: Math.sin(this.state.theta) };
    const dt = 0.1;
    let maxY = y;
    for (let i = 0; i < 4000; i++) {
      const mass = v.dryMass + (coastOnly ? this.fuel : fuel);
      let thrust = 0;
      if (fuel > 0 && this.state.throttle > 0 && v.engineCount > 0) {
        const burn = Math.min(fuel, v.maxMassFlow * this.state.throttle * dt);
        thrust = (v.thrust * this.state.throttle * burn) / (v.maxMassFlow * this.state.throttle * dt);
        fuel -= burn;
      }
      const sp = Math.hypot(vx, vy);
      const rho = airDensity(y);
      const k = (0.5 * rho * sp * v.dragArea) / mass;
      const g = gravityAt(x, y);
      vx += (g.x - k * vx + (thrust * dir.x) / mass) * dt;
      vy += (g.y - k * vy + (thrust * dir.y) / mass) * dt;
      x += vx * dt;
      y += vy * dt;
      maxY = Math.max(maxY, y);
      if (insideMoonSoi(x, y)) return { altitude: maxY, reachesMoon: true };
      if (vy < 0 && fuel <= 0) break;
      if (y < 0) break;
    }
    return { altitude: maxY, reachesMoon: false };
  }

  /** Where a coasting object released right now (optionally with extra velocity) would hit the Moon. */
  public predictMoonImpact(extraVx = 0, extraVy = 0, horizon = 900): { angle: number; x: number; y: number; time: number } | null {
    let { x, y } = this.state;
    let vx = this.state.vx + extraVx;
    let vy = this.state.vy + extraVy;
    const dt = 0.25;
    for (let t = 0; t < horizon; t += dt) {
      const g = gravityAt(x, y);
      vx += g.x * dt;
      vy += g.y * dt;
      x += vx * dt;
      y += vy * dt;
      if (moonAltitude(x, y) <= 0) return { angle: moonAngleOf(x, y), x, y, time: t };
      if (!insideMoonSoi(x, y)) return null;
    }
    return null;
  }

  /** Everything needed to rewind to this moment (phase checkpoints). */
  public snapshot(): FlightSnapshot {
    return {
      parts: this.vehicle.parts.map(p => ({ ...p })),
      rootGridX: this.vehicle.rootGridX,
      rootGridY: this.vehicle.rootGridY,
      state: { ...this.state },
      tanks: [...this.tanks],
      phase: this.phase,
      onGround: this.onGround,
      hasLeftGround: this.hasLeftGround,
      stats: { ...this.stats },
      startFuel: this.startFuel,
      initialVehicle: this.initialVehicle
    };
  }

  public static restore(snap: FlightSnapshot): FlightSim {
    const sim = new FlightSim(snap.initialVehicle);
    sim.vehicle = buildVehicle(snap.parts.map(p => ({ ...p })), snap.rootGridX, snap.rootGridY);
    sim.state = { ...snap.state };
    sim.tanks = new Map(snap.tanks);
    sim.phase = snap.phase;
    sim.onGround = snap.onGround;
    sim.hasLeftGround = snap.hasLeftGround;
    sim.stats = { ...snap.stats };
    sim.version = 1;
    return sim;
  }

  public getTelemetry(): FlightTelemetry {
    const s = this.state;
    const v = this.vehicle;
    const body = dominantBody(s.x, s.y);
    const up = localUp(body, s.x, s.y);
    const upAngle = Math.atan2(up.y, up.x);
    const earthAlt = s.y;
    const moonAlt = moonAltitude(s.x, s.y);
    const speed = Math.hypot(s.vx, s.vy);
    const rho = airDensity(s.y);
    const fuel = this.fuel;
    const mass = v.dryMass + fuel;
    const g = gravityAt(s.x, s.y);
    const localG = Math.max(0.01, -(g.x * up.x + g.y * up.y));
    const thrust = this.isFinished ? 0 : this.lastThrust;
    return {
      time: s.time,
      phase: this.phase,
      onGround: this.onGround,
      body,
      altitude: body === 'EARTH' ? earthAlt : moonAlt,
      earthAltitude: earthAlt,
      moonAltitude: moonAlt,
      speed,
      verticalSpeed: s.vx * up.x + s.vy * up.y,
      // Horizontal: along local "right" (clockwise tangent).
      horizontalSpeed: s.vx * up.y - s.vy * up.x,
      mach: rho > 0 ? speed / WORLD.speedOfSound : 0,
      dynamicPressure: this.lastQ,
      airDensity: rho,
      wind: rho > 0 ? windAt(s.y, s.time) : 0,
      pitchFromVertical: wrapAngle(s.theta - upAngle),
      progradeFromVertical: speed > 0.5 ? wrapAngle(Math.atan2(s.vy, s.vx) - upAngle) : 0,
      angleOfAttack: speed > 0.5 ? wrapAngle(s.theta - Math.atan2(s.vy, s.vx)) : 0,
      mass,
      fuel,
      fuelFraction: fuel / this.startFuel,
      throttle: s.throttle,
      thrust,
      twr: mass > 0 ? thrust / (mass * localG) : 0,
      gForce: this.lastProperAccel / G0,
      moonOrbit: insideMoonSoi(s.x, s.y)
        ? orbitFromState({ x: s.x - MOON_CENTER.x, y: s.y - MOON_CENTER.y }, { x: s.vx, y: s.vy }, MOON.mu, MOON.radius)
        : null
    };
  }
}
