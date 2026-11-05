import { ChallengeBand, ChallengeContext, ChallengeEvent, ChallengeId, ChallengeModule, ChallengeStatus } from './types';

/** Health lost below this still counts as a clean pass (a scratch from a late reaction). */
export const CLEAN_DAMAGE = 2.5;

/** Event queue and status slot shared by every challenge. */
export abstract class Challenge implements ChallengeModule {
  public abstract readonly id: ChallengeId;
  public abstract readonly band: ChallengeBand | null;
  public glitch = false;
  protected current: ChallengeStatus | null = null;
  private events: ChallengeEvent[] = [];

  public abstract update(ctx: ChallengeContext): void;

  public status(): ChallengeStatus | null {
    return this.current;
  }

  public drainEvents(): ChallengeEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  protected emit(e: ChallengeEvent): void {
    this.events.push(e);
  }
}

/**
 * A challenge that lives in a stretch of the climb: it starts when the rocket enters the band,
 * runs while it is inside, and is judged once when the rocket leaves through the top.
 * Dropping back out of the bottom just pauses it.
 */
export abstract class BandChallenge extends Challenge {
  private inside = false;
  private passed = false;

  constructor(public readonly band: ChallengeBand) {
    super();
  }

  /** The banner when the rocket enters. */
  protected abstract startMessage(): string;
  /** Called every frame inside the band. */
  protected abstract during(ctx: ChallengeContext): void;
  /** The card while inside. */
  protected abstract statusNow(ctx: ChallengeContext): ChallengeStatus;
  /** The verdict once the rocket is through. */
  protected abstract judge(ctx: ChallengeContext): Extract<ChallengeEvent, { kind: 'END' }>;
  /** Clean-up when the rocket leaves, either way. */
  protected leave(_ctx: ChallengeContext): void {}

  /** Inside the band right now (subclasses can stretch it). */
  protected contains(ctx: ChallengeContext): boolean {
    const alt = ctx.t.earthAltitude;
    return ctx.t.body === 'EARTH' && alt >= this.band.from && alt < this.band.to;
  }

  /** Left through the top (rather than falling back out of the bottom). */
  protected passedThrough(ctx: ChallengeContext): boolean {
    return ctx.t.earthAltitude >= this.band.to || ctx.t.body !== 'EARTH';
  }

  public update(ctx: ChallengeContext): void {
    const live = ctx.sim.phase === 'FLYING' && !this.passed && this.contains(ctx);
    if (live) {
      if (!this.inside) {
        this.inside = true;
        this.emit({ kind: 'START', id: this.id, message: this.startMessage(), height: ctx.t.earthAltitude });
      }
      this.during(ctx);
      this.current = this.statusNow(ctx);
      return;
    }
    if (this.inside) {
      this.inside = false;
      this.leave(ctx);
      if (ctx.sim.phase === 'FLYING' && this.passedThrough(ctx)) {
        this.passed = true;
        this.emit(this.judge(ctx));
      }
    }
    this.current = null;
  }
}
