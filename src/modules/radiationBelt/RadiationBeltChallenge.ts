import { CONFIG } from '../../config';
import { BandChallenge } from '../Challenge';
import { ChallengeContext, ChallengeStatus } from '../types';

const CFG = CONFIG.challenges.radiationBelt;

/**
 * Radiation belt: charged particles fry the electronics. The readouts glitch while inside
 * and health drains every second, a crewed ship faster. The quicker the crossing, the
 * smaller the dose.
 */
export class RadiationBeltChallenge extends BandChallenge {
  public readonly id = 'RADIATION_BELT' as const;
  private dose = 0;

  constructor() {
    super({ from: CFG.from, to: CFG.to, label: 'radiation', color: 0xc084fc });
  }

  protected startMessage(): string {
    return 'RADIATION BELT! Readouts will glitch: cross it as fast as you can';
  }

  protected during({ sim, dt, payload }: ChallengeContext): void {
    this.glitch = true;
    const hit = CFG.dosePerSecond * (payload === 'CREW' ? CFG.crewFactor : 1) * dt;
    sim.damage(hit);
    this.dose += hit;
  }

  protected leave(): void {
    this.glitch = false;
  }

  protected statusNow({ t, payload }: ChallengeContext): ChallengeStatus {
    const through = (t.earthAltitude - this.band.from) / (this.band.to - this.band.from);
    const speed = Math.max(0, t.verticalSpeed);
    return {
      id: this.id,
      title: 'RADIATION BELT',
      howTo: payload === 'CREW' ? 'The crew soaks up more: climb out fast (W)' : 'Climb out fast (W): every second costs health',
      meter: Math.min(1, Math.max(0, through)),
      danger: true,
      detail: `dose −${Math.round(this.dose)} health  ·  ${speed > 1 ? `out in ~${Math.ceil((this.band.to - t.earthAltitude) / speed)} s` : 'not climbing!'}`,
      color: this.band.color
    };
  }

  protected judge() {
    const clean = this.dose <= CFG.cleanDose;
    return {
      kind: 'END' as const,
      id: this.id,
      good: clean,
      message: `Out of the radiation belt: the dose cost ${Math.round(this.dose)} health`,
      ...(clean ? { award: { label: 'FAST CROSSING', points: CFG.reward } } : {})
    };
  }
}
