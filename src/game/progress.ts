import { CONFIG } from '../config';
import { MissionOutcome, OUTCOME_PAYOUT } from '../physics/mission';
import { Award } from './stunts';

export type LandingMode = 'EASY' | 'NORMAL';

/** What the player keeps between flights. */
export interface PlayerProgress {
  money: number;
  /** Highest altitude ever reached (m). */
  bestHeight: number;
  completedMissions: string[];
  landingMode: LandingMode;
}

/** Minimal slice of the Web Storage API, so tests can pass a fake. */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'nasa2026.progress';
export const STARTING_MONEY = CONFIG.economy.startingMoney;
/** If you're broke, the agency tops you up to this so you can always fly something. */
export const GRANT_FLOOR = CONFIG.economy.grantFloor;

const fresh = (): PlayerProgress => ({ money: STARTING_MONEY, bestHeight: 0, completedMissions: [], landingMode: 'EASY' });

/** Cash for in-flight awards. */
const AWARD_CASH: Partial<Record<Award['id'], number>> = {
  NEAR_MISS: 2,
  PICKUP_FUEL: 1,
  MILESTONE: 5,
  STAGE: 3,
  BULLSEYE: 25
};

function defaultStorage(): ProgressStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(storage: ProgressStorage | null = defaultStorage()): PlayerProgress {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const base = fresh();
    return {
      money: Number.isFinite(parsed.money) ? Math.max(0, Number(parsed.money)) : base.money,
      bestHeight: Number.isFinite(parsed.bestHeight) ? Math.max(0, Number(parsed.bestHeight)) : 0,
      completedMissions: Array.isArray(parsed.completedMissions) ? parsed.completedMissions.filter(m => typeof m === 'string') : [],
      landingMode: parsed.landingMode === 'NORMAL' ? 'NORMAL' : 'EASY'
    };
  } catch {
    return fresh();
  }
}

export function saveProgress(progress: PlayerProgress, storage: ProgressStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Private mode or blocked storage: progress just won't persist.
  }
}

/** Money earned in flight: pickups and feats pay directly, other stunts $1 per 100 points. */
export function cashFromAwards(awards: readonly Award[]): number {
  let cash = 0;
  for (const a of awards) {
    if (a.id === 'MISSION') continue; // mission rewards are paid separately
    cash += AWARD_CASH[a.id] ?? Math.floor(a.points / 100);
  }
  return cash;
}

export interface FlightEarnings {
  outcome: number;
  awards: number;
  mission: number;
  /** Half the rocket's price back for landing it intact back home (reusable rockets!). */
  recovery: number;
  total: number;
}

/** `phasePaid`: phase rewards already paid out during the flight (so they aren't paid twice). */
export function flightEarnings(outcome: MissionOutcome, awards: readonly Award[], missionReward: number, rocketCost: number, landedHome: boolean, phasePaid = 0): FlightEarnings {
  const e = {
    outcome: Math.max(0, OUTCOME_PAYOUT[outcome] - phasePaid),
    awards: cashFromAwards(awards),
    mission: missionReward,
    recovery: landedHome ? Math.round(rocketCost * CONFIG.economy.recoveryRefund) : 0
  };
  return { ...e, total: e.outcome + e.awards + e.mission + e.recovery };
}

/** Never let the player get stuck unable to afford a rocket. */
export function withGrant(progress: PlayerProgress): { progress: PlayerProgress; grant: number } {
  if (progress.money >= GRANT_FLOOR) return { progress, grant: 0 };
  const grant = GRANT_FLOOR - progress.money;
  return { progress: { ...progress, money: GRANT_FLOOR }, grant };
}
