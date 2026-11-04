import { PayloadKind } from '../core/types';
import { FlightSim, FlightTelemetry } from '../physics/FlightSim';

export type ChallengeId = 'MAX_Q' | 'WIND_SHEAR' | 'STAGING_FAULT' | 'RADIATION_BELT' | 'TRANS_LUNAR_BURN';

/** What a challenge sees each frame. */
export interface ChallengeContext {
  sim: FlightSim;
  t: FlightTelemetry;
  /** Game seconds since the last update (physics time). */
  dt: number;
  /** Real seconds since the last update (for timers the player races with the keyboard). */
  realDt: number;
  payload: PayloadKind;
}

/** A stretch of the climb, drawn on the HEIGHT panel. */
export interface ChallengeBand {
  from: number;
  to: number;
  label: string;
  color: number;
}

/** What the challenge card shows while a challenge is live. All meter values are 0..1 along the bar. */
export interface ChallengeStatus {
  id: ChallengeId;
  title: string;
  howTo: string;
  /** Bar fill (or the needle position when `needle` is set). */
  meter: number;
  needle?: boolean;
  /** A limit line on the bar: stay left of it. */
  line?: number;
  /** A green target stretch on the bar: keep the needle inside it. */
  zone?: { from: number; to: number };
  /** Something is going wrong right now (red bar, buzzer). */
  danger: boolean;
  detail: string;
  color: number;
  /** Seconds left on a timed challenge. */
  timeLeft?: number;
}

export type ChallengeEvent =
  | { kind: 'START'; id: ChallengeId; message: string; height: number }
  | { kind: 'END'; id: ChallengeId; message: string; good: boolean; award?: { label: string; points: number } };

/** One self-contained flight challenge. Modules only touch the sim through its public hooks. */
export interface ChallengeModule {
  readonly id: ChallengeId;
  /** Where it sits on the climb (null for challenges set off by an action, not a height). */
  readonly band: ChallengeBand | null;
  /** Readouts scramble while this is true. */
  readonly glitch: boolean;
  update(ctx: ChallengeContext): void;
  status(): ChallengeStatus | null;
  /** A separation key was pressed; return true to swallow it. */
  onSeparationKey?(key: string, ctx: ChallengeContext): boolean;
  drainEvents(): ChallengeEvent[];
}
