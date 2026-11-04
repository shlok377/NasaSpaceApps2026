import { CONFIG } from '../../config';
import { Vec2 } from '../../physics/bodies';
import { ENGINE, G0, MOON, MOON_CENTER } from '../../physics/constants';
import { FlightSim } from '../../physics/FlightSim';
import { orbitFromState } from '../../physics/orbit';
import { BandChallenge } from '../Challenge';
import { ChallengeContext, ChallengeStatus } from '../types';

const CFG = CONFIG.challenges.transLunarBurn;
/** The needle's scale: predicted low point over the Moon (m). */
const SCALE_MIN = -1000;
const SCALE_MAX = 2600;
const onScale = (pe: number) => Math.min(1, Math.max(0, (pe - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)));

/** Lowest point of the Moon pass if the rocket coasted from here with only the Moon pulling (m above its surface). */
export function predictedPass(sim: FlightSim): number {
  const s = sim.state;
  return orbitFromState({ x: s.x - MOON_CENTER.x, y: s.y - MOON_CENTER.y }, { x: s.vx, y: s.vy }, MOON.mu, MOON.radius).periapsisAltitude;
}

/**
 * The smallest sideways kick (m/s, across the direction of travel) that puts the Moon pass inside
 * [low, high], or null if none within `maxDv` does. `pos` is relative to the Moon's centre.
 */
export function correctionKick(pos: Vec2, vel: Vec2, low: number, high: number, maxDv: number): Vec2 | null {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed < 1e-6) return null;
  const nx = -vel.y / speed;
  const ny = vel.x / speed;
  for (let dv = 1; dv <= maxDv; dv += 1) {
    for (const sign of [1, -1]) {
      const kick = { x: sign * dv * nx, y: sign * dv * ny };
      const pe = orbitFromState(pos, { x: vel.x + kick.x, y: vel.y + kick.y }, MOON.mu, MOON.radius).periapsisAltitude;
      if (pe >= low && pe <= high) return kick;
    }
  }
  return null;
}

/** Fuel (kg) a burn of `dv` m/s costs a rocket of `mass` kg (rocket equation, booster efficiency). */
export function burnFuel(mass: number, dv: number): number {
  return mass * (1 - Math.exp(-dv / (ENGINE.isp * G0)));
}

/**
 * Trans-lunar burn window: the end of the coast, before the Moon's pull takes over. A needle shows
 * where the rocket would pass the Moon; the green stretch is a pass you can turn into an orbit.
 * Arriving off course triggers an automatic correction burn that costs extra fuel.
 */
export class TransLunarBurnChallenge extends BandChallenge {
  public readonly id = 'TRANS_LUNAR_BURN' as const;

  constructor() {
    super({ from: CFG.from, to: CFG.to, label: 'TLI', color: 0x4ade80 });
  }

  /** The window stays open past the band's top, right up to the Moon's pull. */
  protected contains({ sim, t }: ChallengeContext): boolean {
    return t.body === 'EARTH' && t.earthAltitude >= this.band.from && !sim.stats.reachedMoonSoi;
  }

  protected passedThrough({ sim }: ChallengeContext): boolean {
    return sim.stats.reachedMoonSoi;
  }

  protected startMessage(): string {
    return 'TRANS-LUNAR WINDOW: put the needle in the green to pass beside the Moon';
  }

  protected during(): void {}

  protected statusNow({ sim }: ChallengeContext): ChallengeStatus {
    const pe = predictedPass(sim);
    const onCourse = pe >= CFG.lowPeriapsis && pe <= CFG.highPeriapsis;
    const howTo = !sim.rcsReady
      ? onCourse
        ? 'On course: coast on to the Moon'
        : 'Off course and no RCS to turn: a correction burn will cost fuel'
      : pe < 0
        ? 'IMPACT COURSE: turn sideways (A / D) and burn (W)'
        : pe < CFG.lowPeriapsis
          ? 'Too close: push a little wider (A / D, then W)'
          : pe > CFG.highPeriapsis
            ? 'Too wide: aim back toward the Moon (A / D, then W)'
            : 'On course: coast on to the Moon';
    return {
      id: this.id,
      title: 'TRANS-LUNAR WINDOW',
      howTo,
      meter: onScale(pe),
      needle: true,
      zone: { from: onScale(CFG.lowPeriapsis), to: onScale(CFG.highPeriapsis) },
      danger: !onCourse,
      detail: `Moon pass ${pe < 0 ? 'below the surface' : `${Math.round(pe).toLocaleString()} m`}  ·  green ${CFG.lowPeriapsis}–${CFG.highPeriapsis.toLocaleString()} m`,
      color: this.band.color
    };
  }

  protected judge({ sim }: ChallengeContext) {
    const pe = predictedPass(sim);
    if (pe >= CFG.lowPeriapsis && pe <= CFG.highPeriapsis) {
      return { kind: 'END' as const, id: this.id, good: true, message: 'Right on course for the Moon!', award: { label: 'ON COURSE', points: CFG.reward } };
    }
    return { kind: 'END' as const, id: this.id, good: false, message: this.correct(sim) };
  }

  /** Off course at the Moon's pull: kick the path back into the green, paying extra fuel for it. */
  private correct(sim: FlightSim): string {
    const s = sim.state;
    const kick = correctionKick({ x: s.x - MOON_CENTER.x, y: s.y - MOON_CENTER.y }, { x: s.vx, y: s.vy }, CFG.lowPeriapsis, CFG.highPeriapsis, CFG.maxCorrection);
    if (!kick) return 'Way off course: too far out for a correction burn';
    if (sim.vehicle.engineCount === 0 || sim.boosterFuel <= 1e-6) return 'Off course, and no engine fuel left for a correction burn';
    const dv = Math.hypot(kick.x, kick.y);
    const mass = sim.vehicle.dryMass + sim.fuel;
    const need = burnFuel(mass, dv * CFG.correctionPenalty);
    // Short of fuel: only part of the kick.
    const share = Math.min(1, sim.boosterFuel / need);
    const spent = sim.spendFuel(need * share);
    s.vx += kick.x * share;
    s.vy += kick.y * share;
    return share < 1
      ? `Off course: the correction burn ran dry after ${Math.round(spent)} kg of fuel`
      : `Off course: a correction burn cost ${Math.round(spent)} kg of fuel`;
  }
}
