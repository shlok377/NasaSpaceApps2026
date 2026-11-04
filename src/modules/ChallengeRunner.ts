import { CONFIG } from '../config';
import { MaxQChallenge } from './maxQ/MaxQChallenge';
import { RadiationBeltChallenge } from './radiationBelt/RadiationBeltChallenge';
import { RockBeltChallenge } from './rockBelt/RockBeltChallenge';
import { Rock } from './rockBelt/RockField';
import { StagingFaultChallenge } from './stagingFault/StagingFaultChallenge';
import { TransLunarBurnChallenge } from './transLunarBurn/TransLunarBurnChallenge';
import { ChallengeBand, ChallengeContext, ChallengeEvent, ChallengeModule, ChallengeStatus } from './types';
import { WindShearChallenge } from './windShear/WindShearChallenge';

/** Runs the flight's challenges side by side; the scene only talks to this. */
export class ChallengeRunner {
  private events: ChallengeEvent[] = [];

  constructor(public readonly modules: readonly ChallengeModule[]) {}

  public update(ctx: ChallengeContext): void {
    for (const m of this.modules) {
      m.update(ctx);
      this.events.push(...m.drainEvents());
    }
  }

  /** A shell-separation key was pressed: true if a challenge swallowed it. */
  public onSeparationKey(key: string, ctx: ChallengeContext): boolean {
    for (const m of this.modules) {
      const used = m.onSeparationKey?.(key, ctx) ?? false;
      this.events.push(...m.drainEvents());
      if (used) return true;
    }
    return false;
  }

  public drainEvents(): ChallengeEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** The live challenge for the HUD card (the first in the list wins). */
  public get status(): ChallengeStatus | null {
    for (const m of this.modules) {
      const s = m.status();
      if (s) return s;
    }
    return null;
  }

  /** Some challenge is scrambling the readouts. */
  public get glitch(): boolean {
    return this.modules.some(m => m.glitch);
  }

  /** How fast game time runs (the rock belt slows it a little). */
  public get timeScale(): number {
    return this.modules.reduce((k, m) => k * (m.timeScale ?? 1), 1);
  }

  /** The rock belt's rocks, for the renderer. */
  public get rocks(): readonly Rock[] {
    return this.modules.find((m): m is RockBeltChallenge => m instanceof RockBeltChallenge)?.rocks ?? [];
  }

  /** The stretches of the climb to mark on the HEIGHT panel. */
  public get bands(): ChallengeBand[] {
    return this.modules.flatMap(m => (m.band ? [m.band] : []));
  }
}

/** Every challenge switched on in game.json, the timed one first so its card wins. */
export function createChallenges(random: () => number = Math.random): ChallengeRunner {
  const on = CONFIG.challenges;
  const modules: ChallengeModule[] = [];
  if (on.stagingFault.enabled) modules.push(new StagingFaultChallenge(random));
  if (on.maxQ.enabled) modules.push(new MaxQChallenge());
  if (on.windShear.enabled) modules.push(new WindShearChallenge(random));
  if (CONFIG.rockBelt.enabled) modules.push(new RockBeltChallenge(random));
  if (on.radiationBelt.enabled) modules.push(new RadiationBeltChallenge());
  if (on.transLunarBurn.enabled) modules.push(new TransLunarBurnChallenge());
  return new ChallengeRunner(modules);
}
