import { CONFIG } from '../config';
import { MissionOutcome, OUTCOME_PAYOUT } from '../physics/mission';
import { DeployedAsset, sanitizeAssets } from './moonNetwork';
import { Award } from './stunts';

/** What the player keeps between flights. */
export interface PlayerProgress {
  money: number;
  /** Highest altitude ever reached (m). */
  bestHeight: number;
  completedMissions: string[];
  /** Launches flown so far. */
  flights: number;
  /** Fuels bought in the lab (liquid hydrogen has a one-time unlock price). */
  unlockedFuels: string[];
  /** Satellites and rovers left on the Moon's side by earlier flights (they run on batteries, one day per launch). */
  assets: DeployedAsset[];
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

const fresh = (): PlayerProgress => ({ money: STARTING_MONEY, bestHeight: 0, completedMissions: [], flights: 0, unlockedFuels: [], assets: [] });

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
      flights: Number.isFinite(parsed.flights) ? Math.max(0, Math.floor(Number(parsed.flights))) : 0,
      unlockedFuels: Array.isArray(parsed.unlockedFuels) ? parsed.unlockedFuels.filter(f => typeof f === 'string') : [],
      assets: sanitizeAssets(parsed.assets)
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
  /** Extra for a clean flight (no part lost) and a cheap rocket, on a finished objective. */
  bonus: number;
  total: number;
}

/** The bonus lines on top of a finished objective's base payout ($). All 0 unless the objective was finished. */
export interface PayoutBreakdown {
  base: number;
  /** No part lost in flight. */
  clean: number;
  /** A cheap rocket. */
  cheap: number;
  /** Extra from launching later in the day. */
  time: number;
}

export function payoutBreakdown(objectiveDone: boolean, basePayout: number, partsLost: number, rocketCost: number, rewardScale = 1): PayoutBreakdown {
  if (!objectiveDone) return { base: basePayout, clean: 0, cheap: 0, time: 0 };
  const cfg = CONFIG.economy.objectiveBonus;
  return {
    base: basePayout,
    clean: partsLost === 0 ? Math.round(basePayout * cfg.noDamage) : 0,
    cheap: rocketCost <= cfg.cheapCost ? Math.round(basePayout * cfg.cheap) : 0,
    time: Math.round(basePayout * (rewardScale - 1))
  };
}

/** Clean + cheap bonus on a finished objective ($), before the time-of-day scale. */
export function objectiveBonus(objectiveDone: boolean, basePayout: number, partsLost: number, rocketCost: number): number {
  const b = payoutBreakdown(objectiveDone, basePayout, partsLost, rocketCost);
  return b.clean + b.cheap;
}

/** `phasePaid`: phase rewards already paid out during the flight (so they aren't paid twice). */
export function flightEarnings(
  outcome: MissionOutcome,
  awards: readonly Award[],
  missionReward: number,
  rocketCost: number,
  landedHome: boolean,
  phasePaid = 0,
  /** Launch-time bonus on the outcome and mission payouts (phasePaid is already scaled). */
  rewardScale = 1,
  bonus = 0
): FlightEarnings {
  const e = {
    outcome: Math.max(0, Math.round(OUTCOME_PAYOUT[outcome] * rewardScale) - phasePaid),
    awards: cashFromAwards(awards),
    mission: Math.round(missionReward * rewardScale),
    recovery: landedHome ? Math.round(rocketCost * CONFIG.economy.recoveryRefund) : 0,
    bonus: Math.round(bonus * rewardScale)
  };
  return { ...e, total: e.outcome + e.awards + e.mission + e.recovery + e.bonus };
}

/** Never let the player get stuck unable to afford a rocket. */
export function withGrant(progress: PlayerProgress): { progress: PlayerProgress; grant: number } {
  if (progress.money >= GRANT_FLOOR) return { progress, grant: 0 };
  const grant = GRANT_FLOOR - progress.money;
  return { progress: { ...progress, money: GRANT_FLOOR }, grant };
}
