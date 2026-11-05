import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { RocketTree } from '../../core/RocketTree';
import { FlightSim } from '../../physics/FlightSim';
import { buildFlightVehicle } from '../../physics/vehicle';
import { TimeOfDay } from '../../game/timeOfDay';
import { flyingSim, frame } from '../testing';
import { dodgeFor, RockBeltChallenge } from './RockBeltChallenge';
import { Rock } from './RockField';

const CFG = CONFIG.rockBelt;
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

/** Park the rocket in the belt and drop one rock right on it. */
function rockOnRocket(boulder: boolean): { sim: FlightSim; belt: RockBeltChallenge } {
  const sim = flyingSim();
  sim.state.y = CFG.bottom + 100;
  sim.state.vy = 100;
  const belt = new RockBeltChallenge(() => 0.99);
  belt.update(frame(sim));
  belt.drainEvents();
  const body = sim.partPositions().find(p => p.part.type === 'FUEL_TANK' && p.part.parentId === sim.vehicle.parts.find(q => q.parentId === null)!.id)!;
  const rock: Rock = { id: 99, y: body.y, xAt: body.x, tAt: sim.state.time, vx: 0, radius: 1, boulder, seed: 0.5, closest: Infinity, hit: false, passed: false };
  (belt.rocks as Rock[]).push(rock);
  return { sim, belt };
}

describe('Rock belt', () => {
  it('eases time down inside the belt and back up after it', () => {
    const sim = flyingSim();
    const belt = new RockBeltChallenge(lcg(1));
    sim.state.y = CFG.bottom + 50;
    for (let i = 0; i < 40; i++) belt.update(frame(sim, {}, 0.1));
    expect(belt.timeScale).toBeCloseTo(CFG.slowMotion);
    sim.state.y = CFG.top + 50;
    belt.update(frame(sim, {}, 0.1));
    expect(belt.timeScale).toBeGreaterThan(CFG.slowMotion);
    expect(belt.timeScale).toBeLessThan(1); // eases, no snap
    for (let i = 0; i < 40; i++) belt.update(frame(sim, {}, 0.1));
    expect(belt.timeScale).toBe(1);
  });

  it('announces the belt once on the way in and judges it on the way out', () => {
    const sim = flyingSim();
    const belt = new RockBeltChallenge(lcg(2));
    sim.state.y = CFG.bottom + 1;
    belt.update(frame(sim));
    expect(belt.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'START', id: 'ROCK_BELT' }));
    sim.state.y = CFG.top + 1;
    belt.update(frame(sim));
    expect(belt.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'END', good: true }));
    expect(belt.status()).toBeNull(); // no card: the warnings live in the world
  });

  it('a small rock chips the health and leaves every part on', () => {
    const { sim, belt } = rockOnRocket(false);
    const parts = sim.vehicle.parts.length;
    belt.update(frame(sim));
    expect(belt.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'ROCK_HIT', boulder: false }));
    expect(sim.hull).toBe(100 - CFG.difficulty['1'].smallRockDamage);
    expect(sim.vehicle.parts.length).toBe(parts);
  });

  it('a boulder knocks off the part it hits', () => {
    const { sim, belt } = rockOnRocket(true);
    const parts = sim.vehicle.parts.length;
    belt.update(frame(sim));
    expect(belt.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'ROCK_HIT', boulder: true }));
    expect(sim.vehicle.parts.length).toBeLessThan(parts);
    expect(sim.phase).toBe('FLYING');
  });

  it('later launch times get a harder rating', () => {
    const r = CONFIG.timeOfDay;
    expect([r.DAWN, r.NOON, r.DUSK, r.NIGHT].map(t => t.rockDifficulty)).toEqual([1, 2, 3, 4]);
  });

  /** Hold A or D inside the belt for `seconds`, then let go for `coast`; returns the sideways move and speed. */
  function slide(openRcs: boolean, seconds: number, coast = 0): { moved: number; vx: number; theta: number } {
    const tree = new RocketTree(7, 8);
    for (const [x, y, type] of [[7, 9, 'FUEL_TANK'], [7, 10, 'ENGINE'], [6, 9, 'RCS'], [5, 9, 'FUEL_TANK']] as const) tree.attachPart(x, y, type);
    tree.attachPart(7, 7, 'FUEL_TANK', 'COLD_GAS'); // feeds the RCS once its shell is off
    const sim = new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
    sim.launch();
    sim.onGround = false;
    if (openRcs) sim.separate('B');
    Object.assign(sim.state, { y: CFG.bottom + 50, vy: 150, vx: 0, omega: 0 });
    const theta0 = sim.state.theta;
    const belt = new RockBeltChallenge(() => 0.99);
    const x0 = sim.state.x;
    for (let t = 0; t < seconds + coast; t += 1 / 120) {
      belt.update(frame(sim, {}, 1 / 120));
      sim.step(1 / 120, { throttle: 0, steer: t < seconds ? -1 : 0 });
    }
    return { moved: sim.state.x - x0, vx: sim.state.vx, theta: sim.state.theta - theta0 };
  }

  it('A / D slide the rocket sideways in the belt without leaning it, and it stops when let go', () => {
    const quick = slide(false, 1);
    expect(quick.moved).toBeGreaterThan(4); // a rock's width in about a second
    expect(Math.abs(quick.theta)).toBeLessThan(0.01);
    const stopped = slide(false, 1, 1.5);
    expect(Math.abs(stopped.vx)).toBeLessThan(0.5);
  });

  it('each open RCS makes the dodge quicker', () => {
    expect(dodgeFor(2).maxSpeed).toBeGreaterThan(dodgeFor(1).maxSpeed);
    expect(slide(true, 1).moved).toBeGreaterThan(slide(false, 1).moved + 1);
  });

  it('outside the belt the dodge is off', () => {
    const sim = flyingSim();
    const belt = new RockBeltChallenge(() => 0.99);
    belt.update(frame(sim));
    expect(sim.dodge).toBeNull();
  });

  /** The standard three-booster rocket coasting up through the belt with no hands on the controls. */
  function handsOffHits(time: TimeOfDay, flights: number): number {
    const tree = new RocketTree(7, 8);
    for (const [x, y, type] of [[7, 7, 'NOSE_CONE'], [7, 9, 'FUEL_TANK'], [7, 10, 'ENGINE'], [6, 9, 'FUEL_TANK'], [5, 9, 'FIN'], [6, 10, 'ENGINE'], [8, 9, 'FUEL_TANK'], [9, 9, 'FIN'], [8, 10, 'ENGINE']] as const) tree.attachPart(x, y, type);
    const start = new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
    start.launch();
    start.onGround = false;
    Object.assign(start.state, { y: CFG.bottom - 400, vy: 158, vx: 0 });
    const snap = start.snapshot();
    let hits = 0;
    for (let seed = 1; seed <= flights; seed++) {
      const sim = FlightSim.restore(snap);
      const belt = new RockBeltChallenge(lcg(seed * 7919));
      for (let i = 0; i < 120 * 40 && sim.state.y < CFG.top + 50 && sim.phase === 'FLYING'; i++) {
        sim.step(1 / 120, { throttle: 0, steer: 0 });
        belt.update({ ...frame(sim, {}, 1 / 120), timeOfDay: time });
        hits += belt.drainEvents().filter(e => e.kind === 'ROCK_HIT').length;
      }
    }
    return hits / flights;
  }

  it('a hands-off pilot gets hit about once at dawn and about three times at night', { timeout: 30000 }, () => {
    const dawn = handsOffHits('DAWN', 80);
    const night = handsOffHits('NIGHT', 80);
    expect(dawn).toBeGreaterThan(0.5);
    expect(dawn).toBeLessThan(1.7);
    expect(night).toBeGreaterThan(2.2);
    expect(night).toBeLessThan(4.2);
  });
});
