import { PayloadKind } from '../core/types';
import { TimeOfDay } from '../game/timeOfDay';
import { FlightSim, FlightTelemetry } from '../physics/FlightSim';

export type ChallengeId = 'MAX_Q' | 'WIND_SHEAR' | 'STAGING_FAULT' | 'RADIATION_BELT' | 'TRANS_LUNAR_BURN' | 'ROCK_BELT';

/** What a challenge sees each frame. */
export interface ChallengeContext {
  sim: FlightSim;
  t: FlightTelemetry;
  /** Game seconds since the last update (physics time). */
  dt: number;
  /** Real seconds since the last update (for timers the player races with the keyboard). */
  realDt: number;
  payload: PayloadKind;
  /** Launch time picked on the pad (sets the rock belt's difficulty). */
  timeOfDay: TimeOfDay;
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
  | { kind: 'END'; id: ChallengeId; message: string; good: boolean; award?: { label: string; points: number } }
  /** A rock struck the rocket at (x, y): a boulder knocked a part off, a small one chipped the health. */
  | { kind: 'ROCK_HIT'; id: ChallengeId; x: number; y: number; boulder: boolean }
  /** A rock passed close without touching. */
  | { kind: 'NEAR_MISS'; id: ChallengeId };

/** One self-contained flight challenge. Modules only touch the sim through its public hooks. */
export interface ChallengeModule {
  readonly id: ChallengeId;
  /** Where it sits on the climb (null for challenges set off by an action, not a height). */
  readonly band: ChallengeBand | null;
  /** Readouts scramble while this is true. */
  readonly glitch: boolean;
  /** Game-speed multiplier this challenge asks for (1 = normal). */
  readonly timeScale?: number;
  update(ctx: ChallengeContext): void;
  status(): ChallengeStatus | null;
  /** A separation key was pressed; return true to swallow it. */
  onSeparationKey?(key: string, ctx: ChallengeContext): boolean;
  drainEvents(): ChallengeEvent[];
}
