import { CONFIG } from '../../config';

const CFG = CONFIG.rockBelt;
/** Rocks are placed this far beyond the warning range, so they slide into it rather than pop up. */
export const SPAWN_EXTRA = 40;
/** A part counts as a circle this big (m): every part is a 1 m cell. */
export const PART_RADIUS = 0.5;

/** One difficulty rating's numbers (game.json → rockBelt.difficulty). */
export type DifficultyLevel = (typeof CFG.difficulty)['1'];

/** The numbers for a rating, clamped to 1..5. */
export function difficultyLevel(rating: number): DifficultyLevel {
  const r = String(Math.min(5, Math.max(1, Math.round(rating)))) as '1' | '2' | '3' | '4' | '5';
  return CFG.difficulty[r];
}

export interface Rock {
  id: number;
  y: number;
  /** Sideways position `xAt` at sim time `tAt`, drifting at `vx` (m/s). */
  xAt: number;
  tAt: number;
  vx: number;
  radius: number;
  boulder: boolean;
  /** Fixed look of the rock (outline wobble, spin). */
  seed: number;
  /** Closest any part has come to it so far (m between the surfaces). */
  closest: number;
  hit: boolean;
  /** The rocket is past it (its near miss, if any, has been judged). */
  passed: boolean;
}

export const rockX = (rock: Rock, time: number): number => rock.xAt + rock.vx * (time - rock.tAt);

export interface PartPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * The rocks of one flight through the belt. They are spawned ahead of the rocket as it climbs,
 * spread across its whole view plus a margin (aimed at where it will be when it gets there),
 * so the belt can't be flown around. Rocks never wrap or jump.
 */
export class RockField {
  public rocks: Rock[] = [];
  private nextY = CFG.bottom;
  private nextId = 0;

  constructor(
    private readonly random: () => number,
    public readonly level: DifficultyLevel
  ) {}

  /** Spawn every rock the rocket's look-ahead has reached. (x, y), (vx, vy): the rocket now; `time`: sim time. */
  public spawn(x: number, y: number, vx: number, vy: number, time: number): void {
    const reach = Math.min(CFG.top, y + CFG.warningDistance + SPAWN_EXTRA);
    const r = this.random;
    while (this.nextY <= reach) {
      const h = this.nextY;
      // Gaps average 100 / rocksPer100m metres, never evenly spaced.
      this.nextY += (100 / this.level.rocksPer100m) * (0.4 + 1.2 * r());
      const eta = Math.max(0, h - y) / Math.max(vy, 20);
      const boulder = r() < this.level.boulderShare;
      this.rocks.push({
        id: this.nextId++,
        y: h,
        xAt: x + vx * eta + (r() * 2 - 1) * CFG.fieldHalfWidth,
        tAt: time + eta,
        vx: (r() * 2 - 1) * this.level.driftSpeedMax,
        radius: boulder ? this.level.boulderRadius : CFG.rockRadiusMin + r() * (this.level.rockRadiusMax - CFG.rockRadiusMin),
        boulder,
        seed: r(),
        closest: Infinity,
        hit: false,
        passed: false
      });
    }
  }

  /**
   * Test the rocket's parts (real positions, m) against the rocks around it. A rock hits at most once.
   * A near miss is judged once the rock is behind the rocket: it came within the margin and never touched.
   */
  public check(parts: readonly PartPoint[], time: number): { hits: Array<{ rock: Rock; partId: string }>; nearMisses: Rock[] } {
    const hits: Array<{ rock: Rock; partId: string }> = [];
    const nearMisses: Rock[] = [];
    if (parts.length === 0) return { hits, nearMisses };
    const top = Math.max(...parts.map(p => p.y)) + PART_RADIUS;
    const bottom = Math.min(...parts.map(p => p.y)) - PART_RADIUS;
    const margin = this.level.nearMissMargin;
    for (const rock of this.rocks) {
      if (rock.hit || rock.passed) continue;
      if (rock.y - rock.radius - margin > top) continue; // still ahead
      if (rock.y + rock.radius + margin < bottom) {
        rock.passed = true;
        if (rock.closest > 0 && rock.closest <= margin) nearMisses.push(rock);
        continue;
      }
      const rx = rockX(rock, time);
      let closest = Infinity;
      let partId = parts[0].id;
      for (const p of parts) {
        const d = Math.hypot(p.x - rx, p.y - rock.y) - rock.radius - PART_RADIUS;
        if (d < closest) {
          closest = d;
          partId = p.id;
        }
      }
      rock.closest = Math.min(rock.closest, closest);
      if (closest <= 0) {
        rock.hit = true;
        hits.push({ rock, partId });
      }
    }
    return { hits, nearMisses };
  }

  /** Forget rocks far below the rocket. */
  public prune(y: number): void {
    this.rocks = this.rocks.filter(r => r.y > y - 200);
  }
}

/** Near-miss combo: grows with each close shave, resets on a hit or a lull (game seconds). */
export class Combo {
  public count = 0;
  private lastAt = -Infinity;

  public nearMiss(time: number): number {
    if (time - this.lastAt > CFG.comboWindow) this.count = 0;
    this.count++;
    this.lastAt = time;
    return this.count;
  }

  public reset(): void {
    this.count = 0;
  }

  public active(time: number): boolean {
    return this.count > 0 && time - this.lastAt <= CFG.comboWindow;
  }
}
