import { CONFIG } from '../config';
import { ROCK_BELT } from '../physics/constants';
import { TimeOfDay, timeOfDayRocks } from './timeOfDay';

/**
 * The rock belt between the top of the air and the Moon. Rocks drift
 * sideways; they get denser and faster the higher you go. A hit knocks off
 * the part it strikes; flying close without
 * touching scores a near miss, and near misses in a row build a combo.
 */
export type RockKind = 'ROCK' | 'FUEL';

export interface Rock {
  id: number;
  kind: RockKind;
  /** Position at t = 0; rocks drift with vx and wrap around the belt's width. */
  x0: number;
  y: number;
  vx: number;
  radius: number;
  seed: number;
  /** Already scored as a near miss / used up. */
  spent: boolean;
  /** Lane of a lane rock (drifters have none). */
  laneIndex?: number;
  /**
   * Time at which the rock is at x0 (default 0). `null` means its clock has
   * not started yet (an evasive-runner rock before `anchorBelt`): it holds at x0.
   */
  t0?: number | null;
}

const RB = CONFIG.rockBelt;
export const RUNNER_CONFIG = RB.evasiveRunner;
export const RUNNER_LANES = RUNNER_CONFIG.lanes;
export const BELT = {
  /** Rocks crowd the flight corridor, this far either side of the Moon's axis (m). */
  halfWidth: RB.halfWidth,
  bandHeight: RB.bandHeight,
  /** Rocks per band at the bottom / top of the belt. */
  densityBottom: RB.densityBottom,
  densityTop: RB.densityTop,
  nearMissMargin: RB.nearMissMargin, // m beyond the rock's surface
  /** A combo ends if no near miss happens for this long (game s). */
  comboWindow: RB.comboWindow
} as const;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBelt(seed = 2026): Rock[] {
  const rand = mulberry32(seed);
  const rocks: Rock[] = [];
  const span = ROCK_BELT.top - ROCK_BELT.bottom;
  for (let y = ROCK_BELT.bottom; y < ROCK_BELT.top; y += BELT.bandHeight) {
    const k = (y - ROCK_BELT.bottom) / span;
    const density = BELT.densityBottom + (BELT.densityTop - BELT.densityBottom) * k;
    const count = Math.floor(density + rand());
    for (let i = 0; i < count; i++) {
      rocks.push({
        id: rocks.length,
        kind: 'ROCK',
        x0: (rand() * 2 - 1) * BELT.halfWidth,
        y: Math.min(ROCK_BELT.top, y + rand() * BELT.bandHeight),
        vx: (rand() * 2 - 1) * (4 + 12 * k),
        radius: RB.rockRadiusMin + rand() * (RB.rockRadiusMax - RB.rockRadiusMin) * (0.4 + 0.6 * k),
        seed: rand(),
        spent: false
      });
    }
  }
  // A few fuel cans scattered through the belt, near the Moon's axis.
  for (let i = 0; i < RB.fuelCans; i++) {
    rocks.push({
      id: rocks.length,
      kind: 'FUEL',
      x0: (rand() * 2 - 1) * BELT.halfWidth * 0.6,
      y: ROCK_BELT.bottom + rand() * span,
      vx: (rand() * 2 - 1) * 4,
      radius: 2.5,
      seed: rand(),
      spent: false
    });
  }
  return rocks;
}

/** Where the reserved safe route runs: lane `lane` is occupied from `from` to `to` (m). */
interface PathSpan {
  lane: number;
  from: number;
  to: number;
}

/** The player's runner rocket as the belt generator sees it. */
export const RUNNER_BODY = {
  halfLength: RUNNER_CONFIG.rocketHalfLength,
  halfWidth: RUNNER_CONFIG.rocketHalfWidth,
  /** Height climbed while a lane shift is under way (m). */
  shiftClimb: RUNNER_CONFIG.cruiseSpeed * RUNNER_CONFIG.laneShiftDuration
} as const;

/** Belt clock (s since the runner rocket crossed the belt's bottom) when it is at height y. */
export function beltTimeAt(y: number): number {
  return (y - ROCK_BELT.bottom) / RUNNER_CONFIG.cruiseSpeed;
}

/** Where `rock` is (m) at belt clock `beltTime` (s since its x0 moment), wrapped to the belt's width. */
export function beltX(rock: Rock, beltTime: number): number {
  const w = BELT.halfWidth * 2;
  const x = rock.x0 + rock.vx * beltTime + BELT.halfWidth;
  return (((x % w) + w) % w) - BELT.halfWidth;
}

/**
 * Does `rock` block a runner rocket centred on lane x `laneX` at height `y`? The
 * rocket climbs at the cruise speed, so the belt clock follows from `y`.
 */
export function rockBlocks(rock: Rock, laneX: number, y: number): boolean {
  if (rock.kind !== 'ROCK') return false;
  if (Math.abs(rock.y - y) >= rock.radius + RUNNER_BODY.halfLength) return false;
  return Math.abs(beltX(rock, beltTimeAt(y)) - laneX) < rock.radius + RUNNER_BODY.halfWidth;
}

/**
 * The evasive runner's belt. Rocks sit in the 5 lanes at their own heights
 * (no rows), denser towards the top; in the last third a few drift sideways
 * across lanes. A lane-weaving route is reserved first, so a rocket climbing
 * at the cruise speed with the normal lane-shift time can always get through.
 * `time` is the launch time: dawn is sparsest, night densest.
 *
 * Drifters move on the belt clock (0 when the rocket enters the belt). Until
 * `anchorBelt` starts that clock they hold at their belt-entry position.
 * The runner climbs at exactly the cruise speed inside the belt (the scene
 * clamps it), which is what the reserved route assumes.
 */
export function generateLaneWaves(seed = 2026, time: TimeOfDay = 'NOON'): Rock[] {
  const rand = mulberry32(seed);
  const cfg = RUNNER_CONFIG;
  const lanes = cfg.lanes;
  const mult = timeOfDayRocks(time);
  const span = ROCK_BELT.top - ROCK_BELT.bottom;
  const margin = cfg.pathMargin;

  // 1. The reserved route: hold a lane for a while, then shift to a neighbour.
  const path: PathSpan[] = [];
  let lane = Math.floor(rand() * lanes.length);
  let y = ROCK_BELT.bottom - 50;
  while (y < ROCK_BELT.top + 20) {
    const shiftAt = y + cfg.pathSegmentMin + rand() * (cfg.pathSegmentMax - cfg.pathSegmentMin);
    const next = lane === 0 ? 1 : lane === lanes.length - 1 ? lane - 1 : lane + (rand() < 0.5 ? -1 : 1);
    path.push({ lane, from: y, to: shiftAt + RUNNER_BODY.shiftClimb });
    lane = next;
    y = shiftAt;
  }
  path.push({ lane, from: y, to: Infinity });

  const pathLanesAt = (h: number): number[] => path.filter(p => h >= p.from && h <= p.to).map(p => p.lane);
  const clearOfPath = (rock: Rock): boolean => {
    const reach = rock.radius + RUNNER_BODY.halfLength + margin;
    for (let h = rock.y - reach; h <= rock.y + reach; h += 0.5) {
      const x = beltX(rock, beltTimeAt(h));
      for (const l of pathLanesAt(h)) {
        if (Math.abs(x - lanes[l]) < rock.radius + RUNNER_BODY.halfWidth + margin) return false;
      }
    }
    return true;
  };

  const items: Rock[] = [];
  const radius = () => RB.rockRadiusMin + rand() * (RB.rockRadiusMax - RB.rockRadiusMin) * cfg.rockRadiusFactor;
  const fitsAmongRocks = (laneIdx: number, h: number): boolean =>
    items.every(o => {
      if (o.laneIndex === undefined) return true;
      const d = Math.abs(o.y - h);
      if (o.laneIndex === laneIdx) return d >= cfg.sameLaneSpacing;
      if (Math.abs(o.laneIndex - laneIdx) === 1) return d >= cfg.rowTolerance;
      return true;
    });

  // 2. Lane rocks, each at its own height, density ramping bottom to top.
  const band = cfg.rockBand;
  const highest = ROCK_BELT.top - cfg.beltTopGap;
  for (let b = ROCK_BELT.bottom + cfg.beltBottomGap; b < highest; b += band) {
    const k = (b + band / 2 - ROCK_BELT.bottom) / span;
    const per100 = cfg.rocksPer100mBottom + (cfg.rocksPer100mTop - cfg.rocksPer100mBottom) * k;
    const count = Math.floor((per100 * mult * band) / 100 + rand());
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < cfg.rockAttempts; attempt++) {
        const laneIdx = Math.floor(rand() * lanes.length);
        const h = Math.min(highest, b + rand() * band);
        const rock: Rock = { id: 0, kind: 'ROCK', x0: lanes[laneIdx], y: h, vx: 0, radius: radius(), seed: rand(), spent: false, laneIndex: laneIdx, t0: null };
        if (fitsAmongRocks(laneIdx, h) && clearOfPath(rock)) {
          items.push(rock);
          break;
        }
      }
    }
  }

  // 3. Drifters in the last third, crossing the lanes as the rocket arrives. The
  //    no-rows rule holds for them too: when the rocket is level with a drifter,
  //    no lane rock in the lane it is crossing or a neighbouring one, and no other
  //    drifter, sits within rowTolerance of its height.
  const laneGap = lanes.length > 1 ? lanes[1] - lanes[0] : Infinity;
  const drifterFits = (xAtArrival: number, h: number): boolean =>
    items.every(o => {
      if (Math.abs(o.y - h) >= cfg.rowTolerance) return true;
      if (o.laneIndex === undefined) return false;
      return Math.abs(lanes[o.laneIndex] - xAtArrival) > laneGap * 1.5;
    });
  const drifters = Math.round(cfg.drifters * mult);
  const lastThird = ROCK_BELT.bottom + (span * 2) / 3;
  const laneSpan = lanes[lanes.length - 1] - lanes[0];
  const edge = cfg.drifterEdge;
  for (let i = 0; i < drifters; i++) {
    for (let attempt = 0; attempt < cfg.drifterAttempts; attempt++) {
      const h = lastThird + edge + rand() * (ROCK_BELT.top - lastThird - 2 * edge);
      const speed = cfg.drifterSpeedMin + rand() * (cfg.drifterSpeedMax - cfg.drifterSpeedMin);
      const vx = rand() < 0.5 ? -speed : speed;
      const xAtArrival = lanes[0] + rand() * laneSpan;
      const rock: Rock = { id: 0, kind: 'ROCK', x0: xAtArrival - vx * beltTimeAt(h), y: h, vx, radius: radius(), seed: rand(), spent: false, t0: null };
      if (drifterFits(xAtArrival, h) && clearOfPath(rock)) {
        items.push(rock);
        break;
      }
    }
  }

  items.forEach((r, i) => (r.id = i));
  return items;
}

/**
 * Start the belt clock from the rocket at height `y` at sim time `simTime`: the
 * clock reads 0 when a rocket climbing at the cruise speed is (or was) at the
 * belt's bottom. Call it again at the real belt entry to correct a prediction.
 */
export function anchorBelt(rocks: Rock[], simTime: number, y: number): void {
  const t0 = simTime - beltTimeAt(y);
  for (const r of rocks) r.t0 = t0;
}

/** Where `rock` is (m) at sim time `time`. A rock whose clock hasn't started holds at x0. */
export function rockX(rock: Rock, time: number): number {
  if (rock.t0 === null) return beltX(rock, 0);
  return beltX(rock, time - (rock.t0 ?? 0));
}

/**
 * Evasive-runner threat look-ahead: for each lane, the seconds until the rocket
 * (at height `y`, sim time `time`, climbing at the cruise speed) would meet a
 * rock in it, or null when nothing crosses that lane within `lookahead` s.
 * Drifters count at their x when the rocket reaches their height. Only rocks
 * more than `minAhead` m above the rocket count (rocks on screen show themselves).
 */
export function laneThreats(rocks: readonly Rock[], y: number, time: number, lookahead: number = RUNNER_CONFIG.threatLookahead, minAhead = 0): Array<number | null> {
  const speed = RUNNER_CONFIG.cruiseSpeed;
  return RUNNER_LANES.map(laneX => {
    let soonest: number | null = null;
    for (const r of rocks) {
      if (r.spent || r.kind !== 'ROCK') continue;
      const dy = r.y - y;
      if (dy <= minAhead) continue;
      const eta = dy / speed;
      if (eta > lookahead || (soonest !== null && eta >= soonest)) continue;
      if (Math.abs(rockX(r, time + eta) - laneX) < r.radius + RUNNER_BODY.halfWidth) soonest = eta;
    }
    return soonest;
  });
}

export interface PartPoint {
  id: string;
  x: number;
  y: number;
}

export interface BeltResult {
  /** Rock hits: which rock struck which part. */
  hits: Array<{ rock: Rock; partId: string }>;
  nearMisses: Rock[];
  pickups: Rock[];
}

/**
 * Test the rocket's parts against nearby rocks. `partRadius` is how big a
 * part counts as (m). Each rock scores or hits at most once.
 */
export function checkBelt(rocks: Rock[], parts: readonly PartPoint[], time: number, partRadius: number, rockScale = 1): BeltResult {
  const result: BeltResult = { hits: [], nearMisses: [], pickups: [] };
  if (parts.length === 0) return result;
  const cy = parts.reduce((s, p) => s + p.y, 0) / parts.length;
  for (const rock of rocks) {
    if (rock.spent || Math.abs(rock.y - cy) > 60 * rockScale) continue;
    const rx = rockX(rock, time);
    let closest = Infinity;
    let closestPart = parts[0].id;
    for (const p of parts) {
      const d = Math.hypot(p.x - rx, p.y - rock.y) - rock.radius * rockScale - partRadius;
      if (d < closest) {
        closest = d;
        closestPart = p.id;
      }
    }
    if (closest <= 0) {
      rock.spent = true;
      if (rock.kind === 'ROCK') result.hits.push({ rock, partId: closestPart });
      else result.pickups.push(rock);
    } else if (rock.kind === 'ROCK' && closest <= BELT.nearMissMargin * rockScale) {
      // Count it once the rocket is level with the rock.
      if (Math.abs(rock.y - cy) < 4 * rockScale) {
        rock.spent = true;
        result.nearMisses.push(rock);
      }
    }
  }
  return result;
}

/** Near-miss combo: grows with each close shave, resets on a hit or a lull. */
export class Combo {
  public count = 0;
  private lastAt = -Infinity;

  public nearMiss(time: number): number {
    if (time - this.lastAt > BELT.comboWindow) this.count = 0;
    this.count++;
    this.lastAt = time;
    return this.count;
  }

  public reset(): void {
    this.count = 0;
  }

  public active(time: number): boolean {
    return this.count > 0 && time - this.lastAt <= BELT.comboWindow;
  }
}
