import { CONFIG } from '../../config';
import { BandChallenge, CLEAN_DAMAGE } from '../Challenge';
import { ChallengeContext, ChallengeStatus } from '../types';

const CFG = CONFIG.challenges.maxQ;
/** The pressure bar runs to this many times the limit. */
const BAR_SPAN = 1.5;

/**
 * Max-Q: the stretch where speed and air together push hardest on the rocket.
 * Above the pressure limit the airframe strains and health drops with the overshoot;
 * easing the throttle keeps it under the line.
 */
export class MaxQChallenge extends BandChallenge {
  public readonly id = 'MAX_Q' as const;
  private dealt = 0;

  constructor() {
    super({ from: CFG.from, to: CFG.to, label: 'max-Q', color: 0xff9f43 });
  }

  protected startMessage(): string {
    return 'MAX-Q: peak air pressure! Ease the throttle (S) to keep the bar under the line';
  }

  protected during({ sim, t, dt }: ChallengeContext): void {
    const over = Math.max(0, t.dynamicPressure - CFG.limit) / CFG.limit;
    if (over <= 0) return;
    const hit = CFG.damagePerSecond * over * dt;
    sim.damage(hit);
    this.dealt += hit;
  }

  protected statusNow({ t }: ChallengeContext): ChallengeStatus {
    const share = t.dynamicPressure / CFG.limit;
    return {
      id: this.id,
      title: 'MAX-Q',
      howTo: 'Ease the throttle (S): keep the bar left of the line',
      meter: Math.min(1, share / BAR_SPAN),
      line: 1 / BAR_SPAN,
      danger: share > 1,
      detail: `pressure ${Math.round(t.dynamicPressure).toLocaleString()} Pa  ·  limit ${CFG.limit.toLocaleString()}${this.dealt >= 0.5 ? `  ·  −${Math.round(this.dealt)} health` : ''}`,
      color: this.band.color
    };
  }

  protected judge() {
    const clean = this.dealt < CLEAN_DAMAGE;
    return {
      kind: 'END' as const,
      id: this.id,
      good: clean,
      message: clean ? 'Smooth through max-Q!' : `Through max-Q: the strain cost ${Math.round(this.dealt)} health`,
      ...(clean ? { award: { label: 'SMOOTH MAX-Q', points: CFG.reward } } : {})
    };
  }
}
