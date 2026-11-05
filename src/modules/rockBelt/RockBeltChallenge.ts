import { CONFIG } from '../../config';
import { timeOfDayRockDifficulty } from '../../game/timeOfDay';
import { Challenge } from '../Challenge';
import { ChallengeContext } from '../types';
import { difficultyLevel, Rock, RockField, rockX, SPAWN_EXTRA } from './RockField';

const CFG = CONFIG.rockBelt;

/**
 * The rock belt, part of the normal flight: no lanes, no prompt. Rocks drift across the rocket's
 * path, red chevrons at the top edge show what is coming, and time slows a little inside.
 * Burn (W) to slip through a gap sooner, or slide sideways with A / D (faster with each open RCS).
 * A small rock chips the health; a boulder knocks off the part it hits.
 */
export class RockBeltChallenge extends Challenge {
  public readonly id = 'ROCK_BELT' as const;
  public readonly band = { from: CFG.bottom, to: CFG.top, label: 'rocks', color: 0xc9b08f };
  /** Eases down to rockBelt.slowMotion inside the belt and back to 1 outside. */
  public timeScale = 1;
  private field: RockField | null = null;
  private inside = false;
  private done = false;
  private hits = 0;

  constructor(private readonly random: () => number) {
    super();
  }

  public get rocks(): readonly Rock[] {
    return this.field?.rocks ?? [];
  }

  public update(ctx: ChallengeContext): void {
    const { sim, t, realDt } = ctx;
    const y = sim.state.y;
    const flying = sim.phase === 'FLYING' && t.body === 'EARTH';
    const inBelt = flying && y >= CFG.bottom && y < CFG.top;

    const target = inBelt ? CFG.slowMotion : 1;
    const step = (realDt / CFG.slowMotionEaseSeconds) * (1 - CFG.slowMotion);
    this.timeScale += Math.max(-step, Math.min(step, target - this.timeScale));

    sim.dodge = inBelt ? dodgeFor(sim.rcsReady ? sim.activeRcsCount : 0) : null;
    if (!flying) return;
    if (!this.field && y >= CFG.bottom - CFG.warningDistance - SPAWN_EXTRA) {
      this.field = new RockField(this.random, difficultyLevel(timeOfDayRockDifficulty(ctx.timeOfDay)));
    }
    if (!this.field) return;

    if (inBelt && !this.inside && !this.done) {
      this.inside = true;
      this.emit({ kind: 'START', id: this.id, message: 'ROCK BELT! Red arrows show rocks coming: burn (W) through the gaps, slide sideways with A / D', height: y });
    }
    if (this.inside && y >= CFG.top) {
      this.inside = false;
      this.done = true;
      this.emit({ kind: 'END', id: this.id, good: this.hits === 0, message: this.hits === 0 ? 'Through the rock belt without a scratch!' : `Through the rock belt: ${this.hits} hit${this.hits === 1 ? '' : 's'}` });
    }

    const s = sim.state;
    this.field.spawn(s.x, y, s.vx, s.vy, s.time);
    const parts = sim.partPositions().map(p => ({ id: p.part.id, x: p.x, y: p.y }));
    const { hits, nearMisses } = this.field.check(parts, s.time);
    for (const { rock, partId } of hits) {
      this.hits++;
      this.strike(ctx, rock.boulder, partId);
      this.emit({ kind: 'ROCK_HIT', id: this.id, x: rockX(rock, s.time), y: rock.y, boulder: rock.boulder });
    }
    for (const _ of nearMisses) this.emit({ kind: 'NEAR_MISS', id: this.id });
    this.field.prune(y);
  }

  /** A boulder knocks the part off (the command module can't come off: it takes a part's worth of damage); a small rock chips the health. */
  private strike({ sim }: ChallengeContext, boulder: boolean, partId: string): void {
    if (!boulder) {
      sim.damage(this.field!.level.smallRockDamage);
      return;
    }
    const part = sim.vehicle.parts.find(p => p.id === partId);
    if (part && part.parentId !== null) sim.hitPart(partId);
    else sim.damage(CONFIG.hull.perPart);
  }
}

/** How hard the rocket slides sideways in the belt: a base for every rocket, more for each open RCS. */
export function dodgeFor(openRcs: number): { accel: number; maxSpeed: number } {
  const d = CFG.dodge;
  return { accel: d.accel + d.accelPerRcs * openRcs, maxSpeed: d.maxSpeed + d.maxSpeedPerRcs * openRcs };
}
