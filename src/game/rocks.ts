import { CONFIG } from '../config';
import { ROCK_BELT } from '../physics/constants';

/**
 * The rock belt between the top of the air and the Moon. Rocks drift
 * sideways; they get denser and faster the higher you go. A hit knocks off
 * the part it strikes (unless a shield takes it); flying close without
 * touching scores a near miss, and near misses in a row build a combo.
 */
export type RockKind = 'ROCK' | 'SHIELD' | 'FUEL';

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
  laneIndex?: number;
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
  // A few helpers scattered through the belt, near the Moon's axis.
  for (const [kind, n] of [
    ['SHIELD', RB.shields],
    ['FUEL', RB.fuelCans]
  ] as const) {
    for (let i = 0; i < n; i++) {
      rocks.push({
        id: rocks.length,
        kind,
        x0: (rand() * 2 - 1) * BELT.halfWidth * 0.6,
        y: ROCK_BELT.bottom + rand() * span,
        vx: (rand() * 2 - 1) * 4,
        radius: 2.5,
        seed: rand(),
        spent: false
      });
    }
  }
  return rocks;
}

export function generateLaneWaves(seed = 2026): Rock[] {
  const rand = mulberry32(seed);
  const items: Rock[] = [];
  const cfg = RUNNER_CONFIG;
  const lanes = cfg.lanes;
  const interval = cfg.waveInterval;

  let waveIndex = 0;
  for (let y = ROCK_BELT.bottom + interval; y < ROCK_BELT.top; y += interval) {
    const numSafe = cfg.minSafeLanes + Math.floor(rand() * (cfg.maxSafeLanes - cfg.minSafeLanes + 1));
    const indices = [0, 1, 2, 3, 4];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }
    const safeLaneIndices = new Set(indices.slice(0, numSafe));

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const laneX = lanes[laneIdx];
      if (safeLaneIndices.has(laneIdx)) {
        if (waveIndex % 2 === 1 && rand() < 0.75) {
          const kind: RockKind = 'SHIELD';
          items.push({
            id: items.length,
            kind,
            x0: laneX,
            y,
            vx: 0,
            radius: 2.5,
            seed: rand(),
            spent: false,
            laneIndex: laneIdx
          });
        }
      } else {
        const radius = RB.rockRadiusMin + rand() * (RB.rockRadiusMax - RB.rockRadiusMin) * 0.65;
        items.push({
          id: items.length,
          kind: 'ROCK',
          x0: laneX,
          y: y + (rand() - 0.5) * 4,
          vx: 0,
          radius,
          seed: rand(),
          spent: false,
          laneIndex: laneIdx
        });
      }
    }
    waveIndex++;
  }

  // Guarantee at least one SHIELD pickup across the run
  const kinds: RockKind[] = ['SHIELD'];
  for (const kind of kinds) {
    if (!items.some(i => i.kind === kind)) {
      for (let y = ROCK_BELT.bottom + interval; y < ROCK_BELT.top; y += interval) {
        const waveItems = items.filter(i => Math.abs(i.y - y) < 15);
        const usedLanes = new Set(waveItems.map(i => i.x0));
        const openLanes = lanes.filter(l => !usedLanes.has(l));
        if (openLanes.length > 0) {
          items.push({
            id: items.length,
            kind,
            x0: openLanes[0],
            y,
            vx: 0,
            radius: 2.5,
            seed: rand(),
            spent: false,
            laneIndex: lanes.indexOf(openLanes[0])
          });
          break;
        }
      }
    }
  }

  return items;
}

export function rockX(rock: Rock, time: number): number {
  const w = BELT.halfWidth * 2;
  const x = rock.x0 + rock.vx * time + BELT.halfWidth;
  return (((x % w) + w) % w) - BELT.halfWidth;
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
