import { CONFIG } from '../../config';
import { BandChallenge, CLEAN_DAMAGE } from '../Challenge';
import { ChallengeContext, ChallengeStatus } from '../types';

const CFG = CONFIG.challenges.windShear;
const BAR_SPAN = 1.5;

/** Gust (m/s) at a share `p` (0..1) of the way up the layer: one way in the lower half, the other way above. */
export function shearGust(p: number, direction: 1 | -1, strength: number): number {
  return direction * strength * Math.sin(2 * Math.PI * Math.min(1, Math.max(0, p)));
}

/**
 * Wind shear: a layer where the wind blows hard one way, then flips. It shoves the rocket
 * sideways; leaning past the tilt limit costs health. Windier launch times blow harder.
 */
export class WindShearChallenge extends BandChallenge {
  public readonly id = 'WIND_SHEAR' as const;
  private dealt = 0;
  private readonly direction: 1 | -1;

  constructor(random: () => number) {
    super({ from: CFG.from, to: CFG.to, label: 'wind', color: 0x7dd3fc });
    this.direction = random() < 0.5 ? 1 : -1;
  }

  protected startMessage(): string {
    return 'WIND SHEAR! Steer against the gusts (A / D) and keep the rocket upright';
  }

  private tiltDeg(ctx: ChallengeContext): number {
    return Math.abs((ctx.t.pitchFromVertical * 180) / Math.PI);
  }

  protected during(ctx: ChallengeContext): void {
    const { sim, t, dt } = ctx;
    const p = (t.earthAltitude - this.band.from) / (this.band.to - this.band.from);
    sim.gust = shearGust(p, this.direction, CFG.gust * sim.windScale);
    if (this.tiltDeg(ctx) <= CFG.maxTiltDegrees) return;
    const hit = CFG.damagePerSecond * dt;
    sim.damage(hit);
    this.dealt += hit;
  }

  protected leave({ sim }: ChallengeContext): void {
    sim.gust = 0;
  }

  protected statusNow(ctx: ChallengeContext): ChallengeStatus {
    const tilt = this.tiltDeg(ctx);
    const share = tilt / CFG.maxTiltDegrees;
    const gust = ctx.sim.gust;
    return {
      id: this.id,
      title: 'WIND SHEAR',
      // + pitch = leaning left, so D brings it back (and A the other way).
      howTo: ctx.t.pitchFromVertical > 0 ? 'Leaning left: tap D to stand it back up' : 'Leaning right: tap A to stand it back up',
      meter: Math.min(1, share / BAR_SPAN),
      line: 1 / BAR_SPAN,
      danger: share > 1,
      detail: `tilt ${Math.round(tilt)}°  ·  limit ${CFG.maxTiltDegrees}°  ·  gust ${Math.round(Math.abs(gust))} m/s${this.dealt >= 0.5 ? `  ·  −${Math.round(this.dealt)} health` : ''}`,
      color: this.band.color
    };
  }

  protected judge() {
    const clean = this.dealt < CLEAN_DAMAGE;
    return {
      kind: 'END' as const,
      id: this.id,
      good: clean,
      message: clean ? 'Rode out the wind shear!' : `Out of the wind shear: the shaking cost ${Math.round(this.dealt)} health`,
      ...(clean ? { award: { label: 'STEADY HANDS', points: CFG.reward } } : {})
    };
  }
}
