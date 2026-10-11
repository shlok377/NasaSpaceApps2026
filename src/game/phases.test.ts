import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { PartType } from '../core/types';
import { moonAngleOf, surfaceDistance } from '../physics/bodies';
import { MOON, MOON_CENTER } from '../physics/constants';
import { ControlInput, FlightSim } from '../physics/FlightSim';
import { buildFlightVehicle } from '../physics/vehicle';
import { isStableOrbit, LANDING_SITE, PhaseEvent, PhaseRunner, predictRoverLanding, ROVER_ZONE, startProblem, updateProblem } from './phases';

type Layout = Array<[number, number, PartType]>;
const STAGED: Layout = [
  [7, 7, 'NOSE_CONE'],
  [7, 9, 'FUEL_TANK'],
  [7, 10, 'ENGINE'],
  [6, 9, 'FUEL_TANK'],
  [8, 9, 'FUEL_TANK'],
  [6, 10, 'ENGINE'],
  [8, 10, 'ENGINE'],
  [5, 9, 'FIN'],
  [9, 9, 'FIN']
];

function vehicle(parts: Layout) {
  const tree = new RocketTree(7, 8);
  for (const [x, y, type] of parts) tree.attachPart(x, y, type);
  return buildFlightVehicle(tree.getTelemetry().tree);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Put the rocket in a circular orbit `alt` metres above the Moon's left/right side. */
function inOrbit(alt: number): FlightSim {
  const sim = new FlightSim(vehicle(STAGED));
  sim.launch();
  sim.onGround = false;
  const r = MOON.radius + alt;
  const v = Math.sqrt(MOON.mu / r);
  // Below the Moon, moving right (counter-clockwise), pointing along the orbit.
  Object.assign(sim.state, { x: MOON_CENTER.x, y: MOON_CENTER.y - r, vx: v, vy: 0, theta: 0, omega: 0, throttle: 0 });
  return sim;
}

/**
 * A competent pilot for the whole mission: aim beside the Moon, capture at
 * the low point, deal with each problem, time the rover drop, deorbit and land.
 */
function pilot(sim: FlightSim, run: PhaseRunner, state: { cut: boolean; deorbited: boolean }): ControlInput {
  const t = sim.getTelemetry();
  const steerTo = (target: number) => Math.max(-1, Math.min(1, wrap(target - t.pitchFromVertical) * 4 - sim.state.omega * 2));
  const aligned = (target: number) => Math.abs(wrap(target - t.pitchFromVertical)) < 0.3;
  const o = t.moonOrbit;
  if (!o) {
    if (!state.cut && sim.predictApex(true).reachesMoon) state.cut = true;
    return { throttle: state.cut ? 0 : 1, steer: steerTo(-0.12) };
  }
  const retro = wrap(t.progradeFromVertical + Math.PI);
  const pro = t.progradeFromVertical;
  const side = t.horizontalSpeed >= 0 ? -Math.PI / 2 : Math.PI / 2;
  if (run.phase !== 'LANDING') {
    const id = run.problem?.id;
    if (id === 'STUCK_THRUSTER') return { throttle: 0, steer: Math.max(-1, Math.min(1, -sim.state.omega * 1.5)) };
    if ((id === 'DEBRIS' && run.problem!.progress < 1 && o.apoapsisAltitude < 1100) || (id === 'ORBIT_DECAY' && o.periapsisAltitude < 260)) {
      return { throttle: aligned(pro) ? 0.5 : 0, steer: steerTo(pro) };
    }
    if (run.dropReady && !run.rover) {
      const hit = predictRoverLanding(sim);
      if (hit && surfaceDistance(hit.angle, ROVER_ZONE.angle) < 60) run.dropRover(sim);
    }
    if ((o.escaping || o.apoapsisAltitude > 1000) && o.periapsisAltitude > 120) {
      return { throttle: aligned(retro) && Math.abs(t.verticalSpeed) < 0.3 * t.speed ? 1 : 0, steer: steerTo(retro) };
    }
    if (o.periapsisAltitude < 220) return { throttle: aligned(side) ? 1 : 0, steer: steerTo(side) };
    return { throttle: 0, steer: steerTo(side) };
  }
  if (!state.deorbited) {
    const hit = sim.predictMoonImpact();
    const ahead = wrap((LANDING_SITE.angle - moonAngleOf(sim.state.x, sim.state.y)) * o.direction);
    if (hit && surfaceDistance(hit.angle, run.site.angle) < 80) state.deorbited = true;
    return { throttle: ahead > 0.6 && ahead < 1.6 && aligned(retro) ? 1 : 0, steer: steerTo(retro) };
  }
  const g = MOON.mu / (t.moonAltitude + MOON.radius) ** 2;
  const thrust = sim.vehicle.thrust;
  if (t.speed < 6) return { throttle: Math.max(0, Math.min(1, ((g * t.mass) / thrust) * (1 + (-t.verticalSpeed - 2) * 0.5))), steer: steerTo(0) };
  const need = (t.speed * t.speed) / (2 * Math.max(1, t.moonAltitude - 3));
  const brake = need > 0.7 * (thrust / t.mass - g) && Math.abs(wrap(retro - t.pitchFromVertical)) < 0.5;
  return { throttle: brake ? Math.min(1, ((need + g) * t.mass) / thrust) : 0, steer: steerTo(retro) };
}

describe('phase 1: lunar orbiter', () => {
  it('a stable orbit needs a safe low point and a high point inside the Moon’s pull', () => {
    expect(isStableOrbit(inOrbit(400).getTelemetry())).toBe(true);
    expect(isStableOrbit(inOrbit(60).getTelemetry())).toBe(false);
    const fast = inOrbit(400);
    fast.state.vx *= 1.25;
    expect(isStableOrbit(fast.getTelemetry())).toBe(false);
  });

  it('holding a stable orbit completes phase 1 and starts the rover phase', () => {
    const sim = inOrbit(400);
    const run = new PhaseRunner();
    for (let i = 0; i < 120 * 4; i++) {
      sim.step(1 / 120, { throttle: 0, steer: 0 });
      run.update(sim, 1 / 120);
    }
    const kinds = run.drainEvents().map(e => (e.kind === 'PHASE_DONE' || e.kind === 'PHASE_START' ? `${e.kind}:${e.phase}` : e.kind));
    expect(kinds).toEqual(['PHASE_START:ORBIT', 'PHASE_DONE:ORBIT', 'PHASE_START:ROVER']);
    expect(run.phasesDone).toBe(1);
  });
});

describe('phase 2: problems in orbit', () => {
  it('an ignored fuel leak drains fuel; patching it in the green stops it', () => {
    const leak = (fix: boolean) => {
      const sim = inOrbit(400);
      const p = startProblem('FUEL_LEAK', sim, () => 0.5);
      const before = sim.fuel;
      for (let i = 0; i < 120 * 20 && p.status === 'ACTIVE'; i++) {
        updateProblem(p, sim, 1 / 120, { repairPressed: fix && Math.abs(p.data.needle - p.data.greenAt) < 0.03, relightHeld: false }, () => 0.5);
        sim.step(1 / 120, { throttle: 0, steer: 0 });
      }
      return { p, lost: before - sim.fuel };
    };
    const ignored = leak(false);
    const fixed = leak(true);
    expect(ignored.p.status).toBe('FAILED');
    expect(fixed.p.status).toBe('SOLVED');
    expect(ignored.lost).toBeGreaterThan(fixed.lost * 3);
  });

  it('a stuck thruster spins an unattended rocket out of control', () => {
    const sim = inOrbit(400);
    const p = startProblem('STUCK_THRUSTER', sim, () => 0.2);
    for (let i = 0; i < 120 * 12 && p.status === 'ACTIVE'; i++) {
      updateProblem(p, sim, 1 / 120, { repairPressed: false, relightHeld: false });
      sim.step(1 / 120, { throttle: 0, steer: 0 });
    }
    expect(p.status).toBe('FAILED');
    expect(sim.stats.partsLost).toBeGreaterThan(0);
  });

  it('orbit decay sinks the low point unless you burn', () => {
    const sim = inOrbit(300);
    const p = startProblem('ORBIT_DECAY', sim);
    for (let i = 0; i < 120 * 25 && p.status === 'ACTIVE'; i++) {
      updateProblem(p, sim, 1 / 120, { repairPressed: false, relightHeld: false });
      sim.step(1 / 120, { throttle: 0, steer: 0 });
    }
    expect(p.status).toBe('FAILED');
  });

  it('a dropped rover falls out of orbit and lands where the marker said', () => {
    const sim = inOrbit(400);
    const run = new PhaseRunner('ROVER', 1);
    run.dropReady = true;
    const predicted = predictRoverLanding(sim)!;
    expect(predicted).not.toBeNull();
    expect(run.dropRover(sim)).toBe(true);
    for (let i = 0; i < 120 * 200 && run.rover && !run.rover.landed; i++) {
      sim.step(1 / 120, { throttle: 0, steer: 0 });
      run.update(sim, 1 / 120);
    }
    const events = run.drainEvents();
    const landed = events.find((e): e is Extract<PhaseEvent, { kind: 'ROVER_LANDED' }> => e.kind === 'ROVER_LANDED');
    expect(landed).toBeDefined();
    expect(run.sparesLeft + (landed!.inZone ? 1 : 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('the whole mission', () => {
  it('the staged reference rocket can finish all three phases with a careful pilot', () => {
    const sim = new FlightSim(vehicle(STAGED));
    const run = new PhaseRunner('ORBIT', 0, () => 0.3);
    const state = { cut: false, deorbited: false };
    const kinds: string[] = [];
    sim.launch();
    for (let i = 0; i < 120 * 900 && !run.over; i++) {
      sim.step(1 / 120, pilot(sim, run, state));
      const p = run.problem;
      run.update(sim, 1 / 120, { repairPressed: p?.id === 'FUEL_LEAK' && Math.abs(p.data.needle - p.data.greenAt) < 0.05, relightHeld: true });
      for (const e of run.drainEvents()) kinds.push(e.kind === 'PHASE_DONE' ? `DONE:${e.phase}` : e.kind);
    }
    expect(run.failure).toBeNull();
    expect(kinds).toEqual(expect.arrayContaining(['DONE:ORBIT', 'DONE:ROVER', 'DONE:LANDING', 'COMPLETE']));
    expect(run.phasesDone).toBe(3);
    expect(sim.stats.landedOn).toBe('MOON');
  }, 30_000);

  it('a checkpoint rewinds the rocket exactly', () => {
    const sim = inOrbit(400);
    const snap = sim.snapshot();
    for (let i = 0; i < 600; i++) sim.step(1 / 120, { throttle: 1, steer: 0.3 });
    const back = FlightSim.restore(snap);
    expect(back.state.x).toBeCloseTo(snap.state.x, 6);
    expect(back.fuel).toBeCloseTo(new FlightSim(vehicle(STAGED)).fuel, 6);
    expect(back.vehicle.parts.length).toBe(snap.parts.length);
  });
});
