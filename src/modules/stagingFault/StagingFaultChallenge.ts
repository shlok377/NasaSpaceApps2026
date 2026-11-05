import { CONFIG } from '../../config';
import { Challenge } from '../Challenge';
import { ChallengeContext } from '../types';

const CFG = CONFIG.challenges.stagingFault;
const COLOR = 0xf87171;

/**
 * Staging fault: the first shell separation of a flight may jam. Whatever hangs on the shell
 * stays aboard until the key is tapped a few more times; run out of time and the bolts blow
 * the shell off, costing health.
 */
export class StagingFaultChallenge extends Challenge {
  public readonly id = 'STAGING_FAULT' as const;
  public readonly band = null;
  private rolled = false;
  private jam: { key: string; taps: number; timeLeft: number } | null = null;

  constructor(private readonly random: () => number) {
    super();
  }

  public onSeparationKey(key: string, { sim, t }: ChallengeContext): boolean {
    const k = key.toUpperCase();
    if (this.jam) {
      // Other shells' keys still work while one is stuck.
      if (k !== this.jam.key) return false;
      this.jam.taps++;
      if (this.jam.taps >= CFG.taps) {
        this.jam = null;
        this.current = null;
        sim.separate(k);
        this.emit({ kind: 'END', id: this.id, good: true, message: 'Shell freed!', award: { label: 'UNJAMMED', points: CFG.reward } });
      }
      return true;
    }
    if (this.rolled || sim.phase !== 'FLYING' || !sim.closedShellKeys.includes(k)) return false;
    this.rolled = true;
    if (this.random() >= CFG.chance) return false;
    this.jam = { key: k, taps: 0, timeLeft: CFG.timeLimit };
    this.emit({ kind: 'START', id: this.id, message: `SHELL JAMMED! Tap ${k} ${CFG.taps} times to free it`, height: t.earthAltitude });
    return true;
  }

  public update({ sim, realDt }: ChallengeContext): void {
    const jam = this.jam;
    if (!jam || sim.phase !== 'FLYING') {
      this.jam = null;
      this.current = null;
      return;
    }
    jam.timeLeft -= realDt;
    if (jam.timeLeft <= 0) {
      this.jam = null;
      this.current = null;
      sim.separate(jam.key);
      sim.damage(CFG.damage);
      this.emit({ kind: 'END', id: this.id, good: false, message: `The bolts blew: the shell tore off (−${CFG.damage} health)` });
      return;
    }
    this.current = {
      id: this.id,
      title: 'SHELL JAMMED',
      howTo: `Tap ${jam.key} to free it before the bolts blow`,
      meter: jam.taps / CFG.taps,
      danger: true,
      detail: `taps ${'●'.repeat(jam.taps)}${'○'.repeat(CFG.taps - jam.taps)}`,
      color: COLOR,
      timeLeft: jam.timeLeft
    };
  }
}
