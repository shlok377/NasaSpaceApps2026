import { CONFIG, deg } from '../config';
import { gravityAt, insideMoonSoi, moonAltitude, moonAngleOf, surfaceDistance } from '../physics/bodies';
import { MOON, MOON_CENTER, WORLD } from '../physics/constants';
import { FlightSim, FlightSnapshot, FlightTelemetry } from '../physics/FlightSim';
import { momentOfInertia } from '../physics/vehicle';

/**
 * The mission, as one continuous flight in three phases:
 *  1. LUNAR ORBITER — reach the Moon and settle into a stable orbit;
 *  2. LUNAR ROVER   — survive problems in orbit, then drop the rover into its zone;
 *  3. HUMAN LANDING — bring the crew down on the landing site through landing problems.
 * Each phase starts automatically when the previous one succeeds.
 */
export type PhaseId = 'ORBIT' | 'ROVER' | 'LANDING';
export const PHASES: PhaseId[] = ['ORBIT', 'ROVER', 'LANDING'];

export const PHASE_INFO: Record<PhaseId, { number: number; title: string; goal: string }> = {
  ORBIT: { number: 1, title: 'LUNAR ORBITER', goal: 'Reach the Moon and burn sideways into a stable orbit' },
  ROVER: { number: 2, title: 'LUNAR ROVER', goal: 'Handle the problems in orbit, then drop the rover in the green zone' },
  LANDING: { number: 3, title: 'HUMAN LANDING', goal: 'Burn against your motion to drop out of orbit, then land the crew on the site' }
};

export type OrbitProblemId = 'DEBRIS' | 'STUCK_THRUSTER' | 'FUEL_LEAK' | 'ORBIT_DECAY';
export type LandingProblemId = 'BOULDERS' | 'FLAMEOUT' | 'RADAR_FAILURE';
export type ProblemId = OrbitProblemId | LandingProblemId;

export const PROBLEM_INFO: Record<ProblemId, { title: string; howTo: string }> = {
  DEBRIS: { title: 'DEBRIS SWARM INCOMING', howTo: 'Get out of the red ring before it arrives: burn to raise or lower your orbit' },
  STUCK_THRUSTER: { title: 'THRUSTER STUCK ON', howTo: 'It’s spinning you: hold A / D against the spin until the timer runs out' },
  FUEL_LEAK: { title: 'FUEL LEAK', howTo: 'Press F when the needle is in the green: 3 patches seal it' },
  ORBIT_DECAY: { title: 'ORBIT DECAYING', howTo: 'Something is slowing you down: point along your motion (arrow) and burn W to keep your low point up' },
  BOULDERS: { title: 'BOULDERS ON THE SITE', howTo: 'The site is blocked: tilt with A / D and fly to the new green site' },
  FLAMEOUT: { title: 'ENGINE FLAMEOUT', howTo: 'Hold E to relight the engine, and fast!' },
  RADAR_FAILURE: { title: 'RADAR FAILURE', howTo: 'No height or speed readout: land by eye' }
};

const ORBIT_CFG = CONFIG.phases.orbit;
const ROVER_CFG = CONFIG.phases.rover;
const LANDING_CFG = CONFIG.phases.landing;

export interface SurfaceZone {
  angle: number;
  halfWidth: number;
}

export const ROVER_ZONE: SurfaceZone = { angle: deg(ROVER_CFG.zoneAngleDegrees), halfWidth: ROVER_CFG.zoneHalfWidth };
export const LANDING_SITE: SurfaceZone = { angle: deg(LANDING_CFG.siteAngleDegrees), halfWidth: LANDING_CFG.siteHalfWidth };
export const BOULDER_FIELD: SurfaceZone = { angle: LANDING_SITE.angle, halfWidth: LANDING_CFG.boulderFieldHalfWidth };

export function inZone(angle: number | null, zone: SurfaceZone): boolean {
  return angle !== null && surfaceDistance(angle, zone.angle) <= zone.halfWidth;
}

function moonRadius(sim: FlightSim): number {
  return Math.hypot(sim.state.x - MOON_CENTER.x, sim.state.y - MOON_CENTER.y);
}

// ---------------------------------------------------------------------------
// Phase 1: orbit check
// ---------------------------------------------------------------------------

/** A closed orbit whose low point clears the surface and high point stays in the Moon's pull. */
export function isStableOrbit(t: FlightTelemetry): boolean {
  const o = t.moonOrbit;
  if (!o || o.escaping) return false;
  return o.periapsisAltitude >= ORBIT_CFG.minPeriapsis && o.apoapsisAltitude <= ORBIT_CFG.maxApoapsis;
}

/** On a path that meets the surface (committed to coming down). */
export function onImpactCourse(t: FlightTelemetry): boolean {
  return t.moonOrbit !== null && t.moonOrbit.periapsisAltitude < 0;
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

export type ProblemStatus = 'ACTIVE' | 'SOLVED' | 'FAILED';

export interface ActiveProblem {
  id: ProblemId;
  status: ProblemStatus;
  /** Game seconds since it started. */
  elapsed: number;
  /** 0..1 progress towards solving it (for the HUD). */
  progress: number;
  /** Seconds left, if it has a deadline. */
  timeLeft: number | null;
  /** Extra state per problem (needle position, patches, ring radius…). */
  data: Record<string, number>;
  /** What happened, once it's over. */
  message?: string;
}

export interface ProblemInput {
  /** F pressed this frame (fuel-leak repair). */
  repairPressed: boolean;
  /** E held (engine relight). */
  relightHeld: boolean;
}

export const NO_INPUT: ProblemInput = { repairPressed: false, relightHeld: false };

export function startProblem(id: ProblemId, sim: FlightSim, random: () => number = Math.random): ActiveProblem {
  const p: ActiveProblem = { id, status: 'ACTIVE', elapsed: 0, progress: 0, timeLeft: null, data: {} };
  const pr = ROVER_CFG.problems;
  switch (id) {
    case 'DEBRIS':
      // The swarm sweeps the ring the rocket is on now.
      p.data.ringRadius = moonRadius(sim);
      p.timeLeft = pr.DEBRIS.warningSeconds;
      break;
    case 'STUCK_THRUSTER':
      p.timeLeft = pr.STUCK_THRUSTER.seconds;
      p.data.direction = random() < 0.5 ? 1 : -1;
      break;
    case 'FUEL_LEAK':
      p.timeLeft = pr.FUEL_LEAK.timeLimit;
      p.data.needle = 0;
      p.data.patched = 0;
      p.data.misses = 0;
      p.data.greenAt = 0.25 + random() * 0.5;
      break;
    case 'ORBIT_DECAY':
      p.timeLeft = pr.ORBIT_DECAY.seconds;
      break;
    case 'FLAMEOUT':
      p.data.hold = 0;
      break;
    case 'RADAR_FAILURE':
      p.timeLeft = LANDING_CFG.problems.RADAR_FAILURE.seconds;
      break;
    case 'BOULDERS':
      break;
  }
  return p;
}

/** Knock off an outer part (never the command module). */
function loseOuterPart(sim: FlightSim): void {
  const parts = sim.vehicle.parts;
  const leaves = parts.filter(q => q.parentId !== null && !parts.some(c => c.parentId === q.id));
  const victim = leaves.find(q => q.type === 'FIN' || q.type === 'NOSE_CONE') ?? leaves[leaves.length - 1];
  if (victim) sim.hitPart(victim.id);
}

/**
 * Advance a problem by `dt` game seconds: apply what it does to the rocket
 * and check whether the player has dealt with it.
 */
export function updateProblem(p: ActiveProblem, sim: FlightSim, dt: number, input: ProblemInput, random: () => number = Math.random): void {
  if (p.status !== 'ACTIVE') return;
  p.elapsed += dt;
  if (p.timeLeft !== null) p.timeLeft = Math.max(0, p.timeLeft - dt);
  const d = sim.disturbance;
  const pr = ROVER_CFG.problems;

  switch (p.id) {
    case 'DEBRIS': {
      const clearance = Math.abs(moonRadius(sim) - p.data.ringRadius);
      const need = pr.DEBRIS.bandHalfHeight;
      p.progress = Math.min(1, clearance / need);
      if (p.timeLeft === 0) {
        if (clearance >= need) {
          p.status = 'SOLVED';
          p.message = 'The debris swarm missed you';
        } else {
          p.status = 'FAILED';
          p.message = 'Debris tore a part off the rocket';
          loseOuterPart(sim);
        }
      }
      break;
    }
    case 'STUCK_THRUSTER': {
      const cfg = pr.STUCK_THRUSTER;
      // Push the same spin rate into any rocket, big or small.
      d.torque = deg(cfg.spinAccelerationDegPerSec2) * momentOfInertia(sim.vehicle, sim.tanks, sim.com) * p.data.direction;
      const limit = deg(cfg.maxSpinDegPerSec);
      const tooFast = Math.abs(sim.state.omega) > limit;
      p.data.over = tooFast ? (p.data.over ?? 0) + dt : Math.max(0, (p.data.over ?? 0) - dt);
      p.data.spin = Math.min(1.5, Math.abs(sim.state.omega) / limit);
      p.progress = Math.min(1, p.elapsed / cfg.seconds);
      if (p.data.over >= cfg.graceSeconds) {
        d.torque = 0;
        p.status = 'FAILED';
        p.message = 'Spun out of control: a part flew off';
        loseOuterPart(sim);
      } else if (p.timeLeft === 0) {
        d.torque = 0;
        p.status = 'SOLVED';
        p.message = 'Thruster fixed';
      }
      break;
    }
    case 'FUEL_LEAK': {
      const cfg = pr.FUEL_LEAK;
      d.leakRate = cfg.leakPerSecond * sim.initialVehicle.fuelCapacity;
      // A needle sweeps back and forth; F inside the green patches one hole.
      p.data.needle = (Math.sin(p.elapsed * cfg.needleSpeed * Math.PI - Math.PI / 2) + 1) / 2;
      if (input.repairPressed) {
        if (Math.abs(p.data.needle - p.data.greenAt) <= cfg.greenZone / 2) {
          p.data.patched++;
          p.data.greenAt = 0.15 + random() * 0.7;
        } else {
          p.data.misses++;
        }
      }
      p.progress = p.data.patched / cfg.repairsNeeded;
      if (p.data.patched >= cfg.repairsNeeded) {
        d.leakRate = 0;
        p.status = 'SOLVED';
        p.message = 'Leak sealed';
      } else if (p.timeLeft === 0 || sim.fuel <= 0) {
        d.leakRate = 0;
        p.status = 'FAILED';
        p.message = 'Couldn’t seal it in time: lost a lot of fuel';
      }
      break;
    }
    case 'ORBIT_DECAY': {
      const cfg = pr.ORBIT_DECAY;
      const speed = Math.hypot(sim.state.vx, sim.state.vy) || 1;
      d.accelX = (-sim.state.vx / speed) * cfg.pull;
      d.accelY = (-sim.state.vy / speed) * cfg.pull;
      const pe = sim.getTelemetry().moonOrbit?.periapsisAltitude ?? -1;
      p.progress = Math.min(1, p.elapsed / cfg.seconds);
      p.data.periapsis = pe;
      if (p.timeLeft === 0) {
        d.accelX = d.accelY = 0;
        p.status = pe >= cfg.safePeriapsis ? 'SOLVED' : 'FAILED';
        p.message = p.status === 'SOLVED' ? 'Orbit held' : pe < 0 ? 'The orbit decayed into the surface' : 'Your orbit sank low';
      }
      break;
    }
    case 'FLAMEOUT': {
      d.engineOut = true;
      const need = LANDING_CFG.problems.FLAMEOUT.restartHoldSeconds;
      p.data.hold = input.relightHeld ? p.data.hold + dt : Math.max(0, p.data.hold - dt * 2);
      p.progress = Math.min(1, p.data.hold / need);
      if (p.data.hold >= need) {
        d.engineOut = false;
        p.status = 'SOLVED';
        p.message = 'Engine relit!';
      }
      break;
    }
    case 'RADAR_FAILURE':
      p.progress = Math.min(1, p.elapsed / LANDING_CFG.problems.RADAR_FAILURE.seconds);
      if (p.timeLeft === 0) {
        p.status = 'SOLVED';
        p.message = 'Radar back online';
      }
      break;
    case 'BOULDERS':
      // Judged at touchdown: anywhere outside the boulder field is safe.
      break;
  }
}

/** Clear every disturbance (between problems or on retry). */
export function clearDisturbances(sim: FlightSim): void {
  sim.disturbance = { torque: 0, accelX: 0, accelY: 0, leakRate: 0, engineOut: false };
}

// ---------------------------------------------------------------------------
// Phase 2: the rover
// ---------------------------------------------------------------------------

export interface RoverCapsule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  landed: boolean;
  /** Where it came down (Moon angle), or null if it never did. */
  angle: number | null;
  inZone: boolean;
}

/** The rover's own little retro-rocket: this push against the orbit drops it out of the sky. */
function dropKick(sim: FlightSim): { x: number; y: number } {
  const speed = Math.hypot(sim.state.vx, sim.state.vy) || 1;
  return { x: (-sim.state.vx / speed) * ROVER_CFG.dropKick, y: (-sim.state.vy / speed) * ROVER_CFG.dropKick };
}

/** Where the rover would come down if released right now. */
export function predictRoverLanding(sim: FlightSim): { angle: number; x: number; y: number; time: number } | null {
  const k = dropKick(sim);
  return sim.predictMoonImpact(k.x, k.y);
}

export function releaseRover(sim: FlightSim): RoverCapsule {
  const k = dropKick(sim);
  return { x: sim.state.x, y: sim.state.y, vx: sim.state.vx + k.x, vy: sim.state.vy + k.y, landed: false, angle: null, inZone: false };
}

/** Falls under the Moon's gravity onto its airbags. */
export function stepRover(rover: RoverCapsule, dt: number): void {
  if (rover.landed) return;
  const n = Math.max(1, Math.ceil(dt / 0.05));
  const h = dt / n;
  for (let i = 0; i < n && !rover.landed; i++) {
    const g = gravityAt(rover.x, rover.y);
    rover.vx += g.x * h;
    rover.vy += g.y * h;
    rover.x += rover.vx * h;
    rover.y += rover.vy * h;
    if (moonAltitude(rover.x, rover.y) <= 0) {
      rover.landed = true;
      rover.angle = moonAngleOf(rover.x, rover.y);
      rover.inZone = inZone(rover.angle, ROVER_ZONE);
    } else if (!insideMoonSoi(rover.x, rover.y)) {
      rover.landed = true;
      rover.angle = null;
      rover.inZone = false;
    }
  }
}

// ---------------------------------------------------------------------------
// The runner: one continuous flight through all three phases
// ---------------------------------------------------------------------------

export type PhaseEvent =
  | { kind: 'PHASE_START'; phase: PhaseId }
  | { kind: 'PHASE_DONE'; phase: PhaseId }
  | { kind: 'PROBLEM_START'; problem: ActiveProblem }
  | { kind: 'PROBLEM_END'; problem: ActiveProblem }
  | { kind: 'DROP_READY' }
  | { kind: 'ROVER_RELEASED' }
  | { kind: 'ROVER_LANDED'; inZone: boolean; sparesLeft: number; angle: number | null }
  | { kind: 'SITE_MOVED'; site: SurfaceZone }
  | { kind: 'FAILED'; reason: string }
  | { kind: 'COMPLETE'; onSite: boolean };

/** Where to rewind to when a phase fails. */
export interface Checkpoint {
  phase: PhaseId;
  phasesDone: number;
  snapshot: FlightSnapshot;
  /** Stunt awards earned before the checkpoint. */
  awardCount: number;
}

export class PhaseRunner {
  public phase: PhaseId;
  public phasesDone: number;
  /** Seconds the orbit has been stable (phase 1). */
  public stableFor = 0;
  public problem: ActiveProblem | null = null;
  public solved = 0;
  public failedProblems = 0;
  /** The rover is ready to drop (phase 2, after its problems). */
  public dropReady = false;
  public rover: RoverCapsule | null = null;
  public sparesLeft: number = ROVER_CFG.spareRovers;
  /** The landing site the crew should aim for (moves if boulders block it). */
  public site: SurfaceZone = { ...LANDING_SITE };
  public bouldersSeen = false;
  public failure: string | null = null;
  public complete = false;

  private queue: ProblemId[] = [];
  private gap = 0;
  private triggered = new Set<LandingProblemId>();
  private events: PhaseEvent[] = [];

  constructor(start: PhaseId = 'ORBIT', phasesDone = 0, private readonly random: () => number = Math.random) {
    this.phase = start;
    this.phasesDone = phasesDone;
    this.enter(start);
  }

  public get over(): boolean {
    return this.complete || this.failure !== null;
  }

  public drainEvents(): PhaseEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private enter(phase: PhaseId): void {
    this.phase = phase;
    this.stableFor = 0;
    this.problem = null;
    this.dropReady = false;
    this.rover = null;
    if (phase === 'ROVER') {
      this.queue = [...(ROVER_CFG.problemOrder as OrbitProblemId[])];
      this.gap = ROVER_CFG.secondsBetweenProblems;
    }
    if (phase === 'LANDING') {
      this.site = { ...LANDING_SITE };
      this.triggered.clear();
      this.bouldersSeen = false;
    }
    this.events.push({ kind: 'PHASE_START', phase });
  }

  private finishPhase(sim: FlightSim): void {
    clearDisturbances(sim);
    this.events.push({ kind: 'PHASE_DONE', phase: this.phase });
    this.phasesDone++;
    if (this.phase === 'ORBIT') this.enter('ROVER');
    else if (this.phase === 'ROVER') this.enter('LANDING');
  }

  private fail(sim: FlightSim, reason: string): void {
    if (this.over) return;
    clearDisturbances(sim);
    this.failure = reason;
    this.events.push({ kind: 'FAILED', reason });
  }

  /** How fast the scene may run time right now (quiet stretches in orbit go by faster). */
  public timeScale(sim: FlightSim): number {
    if (this.over || sim.phase !== 'FLYING' || this.problem) return 1;

    if (this.phase === 'ORBIT') {
      const t = sim.getTelemetry();
      // Drop to 1x when burning engines or when orbit is already stable (for clear 3s hold countdown)
      if (t.thrust > 0 || isStableOrbit(t)) return 1;
      // Coasting in space outside atmosphere or inside Moon SOI
      if (insideMoonSoi(sim.state.x, sim.state.y) || sim.state.y >= WORLD.atmosphereTop) {
        return ORBIT_CFG.orbitFastForward;
      }
      return 1;
    }

    if (this.phase === 'ROVER') {
      if (this.rover && !this.rover.landed) return ROVER_CFG.orbitFastForward;
      if (this.dropReady && !this.rover) {
        if (sim.getTelemetry().thrust > 0) return 1;
        const hit = predictRoverLanding(sim);
        if (hit && surfaceDistance(hit.angle, ROVER_ZONE.angle) < ROVER_ZONE.halfWidth * 5) return 1;
        return ROVER_CFG.orbitFastForward;
      }
      return 1;
    }

    return 1;
  }

  /** Let the rover go (phase 2). */
  public dropRover(sim: FlightSim): boolean {
    if (this.phase !== 'ROVER' || !this.dropReady || this.rover || sim.phase !== 'FLYING' || this.over) return false;
    this.rover = releaseRover(sim);
    this.events.push({ kind: 'ROVER_RELEASED' });
    return true;
  }

  public update(sim: FlightSim, dt: number, input: ProblemInput = NO_INPUT): void {
    if (this.over) return;
    const t = sim.getTelemetry();

    if (sim.phase === 'CRASHED') {
      this.fail(sim, sim.stats.crashedOn === 'MOON' ? 'The rocket crashed on the Moon' : 'The rocket was destroyed');
      return;
    }
    if (sim.phase === 'LANDED') {
      if (this.phase === 'LANDING' && sim.stats.landedOn === 'MOON') this.judgeTouchdown(sim);
      else this.fail(sim, sim.stats.landedOn === 'EARTH' ? 'Landed back on Earth' : 'Landed before finishing the orbit phases');
      return;
    }
    if (sim.phase !== 'FLYING') return;

    if (sim.stats.reachedMoonSoi && !t.moonOrbit && sim.state.y > MOON_CENTER.y) {
      this.fail(sim, 'Flew past the Moon into deep space');
      return;
    }

    switch (this.phase) {
      case 'ORBIT':
        this.stableFor = isStableOrbit(t) ? this.stableFor + dt : 0;
        if (this.stableFor >= ORBIT_CFG.holdSeconds) this.finishPhase(sim);
        break;
      case 'ROVER':
        this.updateRoverPhase(sim, t, dt, input);
        break;
      case 'LANDING':
        this.updateLandingPhase(sim, t, dt, input);
        break;
    }
  }

  private runProblem(sim: FlightSim, dt: number, input: ProblemInput): void {
    const p = this.problem;
    if (!p) return;
    updateProblem(p, sim, dt, input, this.random);
    if (p.status === 'ACTIVE') return;
    if (p.status === 'SOLVED') this.solved++;
    else this.failedProblems++;
    this.events.push({ kind: 'PROBLEM_END', problem: p });
    this.problem = null;
  }

  private updateRoverPhase(sim: FlightSim, t: FlightTelemetry, dt: number, input: ProblemInput): void {
    if (!t.moonOrbit) {
      this.fail(sim, 'Drifted out of the Moon’s gravity');
      return;
    }
    if (this.problem) {
      this.runProblem(sim, dt, input);
      if (!this.problem && this.queue.length === 0) this.gap = 2;
      return;
    }
    if (this.queue.length > 0) {
      this.gap -= dt;
      if (this.gap <= 0) {
        this.problem = startProblem(this.queue.shift()!, sim, this.random);
        this.gap = ROVER_CFG.secondsBetweenProblems;
        this.events.push({ kind: 'PROBLEM_START', problem: this.problem });
      }
      return;
    }
    if (!this.dropReady) {
      this.gap -= dt;
      if (this.gap <= 0) {
        this.dropReady = true;
        this.events.push({ kind: 'DROP_READY' });
      }
      return;
    }
    if (!this.rover) return;
    stepRover(this.rover, dt);
    if (!this.rover.landed) return;
    const ok = this.rover.inZone;
    if (ok) {
      this.events.push({ kind: 'ROVER_LANDED', inZone: true, sparesLeft: this.sparesLeft, angle: this.rover.angle });
      this.finishPhase(sim);
    } else if (this.sparesLeft > 0) {
      this.sparesLeft--;
      this.events.push({ kind: 'ROVER_LANDED', inZone: false, sparesLeft: this.sparesLeft, angle: this.rover.angle });
      this.rover = null;
    } else {
      this.events.push({ kind: 'ROVER_LANDED', inZone: false, sparesLeft: 0, angle: this.rover.angle });
      this.fail(sim, 'No rovers left: none landed in the zone');
    }
  }

  private updateLandingPhase(sim: FlightSim, t: FlightTelemetry, dt: number, input: ProblemInput): void {
    if (this.problem) this.runProblem(sim, dt, input);
    if (!onImpactCourse(t)) return;
    const order: LandingProblemId[] = ['BOULDERS', 'FLAMEOUT', 'RADAR_FAILURE'];
    for (const id of order) {
      if (this.triggered.has(id) || this.problem) continue;
      if (t.moonAltitude > LANDING_CFG.problems[id].atAltitude) continue;
      this.triggered.add(id);
      if (id === 'BOULDERS') {
        // Divert further along the direction of travel.
        const dir = t.moonOrbit?.direction ?? 1;
        this.site = { angle: LANDING_SITE.angle + (dir * LANDING_CFG.problems.BOULDERS.divert) / MOON.radius, halfWidth: LANDING_CFG.siteHalfWidth };
        this.bouldersSeen = true;
        this.events.push({ kind: 'SITE_MOVED', site: this.site });
        continue;
      }
      this.problem = startProblem(id, sim, this.random);
      this.events.push({ kind: 'PROBLEM_START', problem: this.problem });
    }
  }

  /** Did the crew land somewhere safe? */
  private judgeTouchdown(sim: FlightSim): void {
    const at = sim.stats.touchdownAt;
    if (this.bouldersSeen && inZone(at, BOULDER_FIELD)) {
      this.fail(sim, 'Landed in the boulder field');
      return;
    }
    clearDisturbances(sim);
    this.events.push({ kind: 'PHASE_DONE', phase: 'LANDING' });
    this.phasesDone = 3;
    this.complete = true;
    this.events.push({ kind: 'COMPLETE', onSite: inZone(at, this.site) });
  }
}
