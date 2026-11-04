import { CONFIG } from '../config';
import { partCost, PricedPart } from '../core/partDefinitions';
import { PartType, PayloadKind } from '../core/types';
import { FlightStats } from '../physics/FlightSim';
import { VehicleReport } from '../physics/vehicle';
import { Award } from './stunts';

/** Everything a mission can look at once a flight is over. */
export interface MissionContext {
  stats: FlightStats;
  report: VehicleReport;
  /** What the rocket cost to build ($). */
  cost: number;
  awards: readonly Award[];
  /** Mission phases finished: 1 orbit, 2 rover, 3 crew landed. */
  phasesDone: number;
  /** What the rocket carried. */
  payload: PayloadKind;
  /** The payload's own objective was finished. */
  objectiveDone: boolean;
  /** Problems the player fixed in orbit and on the way down. */
  problemsSolved: number;
  /** Problems that went wrong. */
  problemsFailed: number;
}

export interface Mission {
  id: string;
  title: string;
  /** One plain-language line for the pad and the builder. */
  goal: string;
  reward: number;
  /** Only this payload can finish it; it is skipped for the others. */
  payload?: PayloadKind;
  check(ctx: MissionContext): boolean;
}

const nearMisses = (ctx: MissionContext) => ctx.awards.filter(a => a.id === 'NEAR_MISS').length;

/** In order of difficulty — the first one not yet done is the "current" mission. */
export const MISSIONS: Mission[] = [
  { id: 'liftoff', title: 'Liftoff', goal: 'Get 200 m off the ground', reward: 20, check: c => c.stats.maxAltitude >= 200 },
  { id: 'clouds', title: 'Above the clouds', goal: 'Climb past 1,500 m', reward: 30, check: c => c.stats.maxAltitude >= 1_500 },
  { id: 'cheap-space', title: 'Space on a budget', goal: 'Reach space with a rocket costing $70 or less', reward: 60, check: c => c.stats.reachedSpace && c.cost <= 70 },
  { id: 'staging', title: 'Staging', goal: 'Drop an empty booster in flight', reward: 40, check: c => c.stats.stagesDropped >= 1 },
  { id: 'rock-dodger', title: 'Rock dodger', goal: 'Get 3 near misses in the rock belt', reward: 50, check: c => nearMisses(c) >= 3 },
  { id: 'moon-soi', title: 'Moonbound', goal: 'Reach the Moon’s gravity', reward: 60, check: c => c.stats.reachedMoonSoi },
  { id: 'orbiter', title: 'Phase 1: Lunar orbiter', goal: 'Get into a stable orbit around the Moon', reward: 80, check: c => c.phasesDone >= 1 },
  { id: 'satellite', title: 'Satellite out', goal: 'Eject a satellite from a stable lunar orbit', reward: 80, payload: 'SATELLITE', check: c => c.payload === 'SATELLITE' && c.objectiveDone },
  { id: 'rover', title: 'Rover delivered', goal: 'Crash a rover onto its landing zone', reward: 100, payload: 'ROVER', check: c => c.payload === 'ROVER' && c.objectiveDone },
  { id: 'crew', title: 'Human landing', goal: 'Land the crew on the Moon', reward: 150, payload: 'CREW', check: c => c.payload === 'CREW' && c.objectiveDone },
  { id: 'cool-head', title: 'Cool head', goal: 'Finish any mission without a single problem going wrong', reward: 200, check: c => c.objectiveDone && c.problemsFailed === 0 },
  { id: 'lean-lander', title: 'Lean lander', goal: 'Land the crew with a rocket costing $120 or less', reward: 250, payload: 'CREW', check: c => c.payload === 'CREW' && c.objectiveDone && c.cost <= 120 }
];

/** What the chosen payload asks of the pilot, in a line, and what finishing it pays (sum of its phases). */
export function payloadObjective(payload: PayloadKind): { goal: string; reward: number } {
  const pay = CONFIG.economy.phaseRewards;
  switch (payload) {
    case 'SATELLITE': return { goal: 'Orbit the Moon, then eject the satellite', reward: pay.ORBIT + pay.DEPLOY };
    case 'ROVER': return { goal: 'Orbit the Moon, then drop the rover', reward: pay.ORBIT + pay.ROVER };
    case 'CREW': return { goal: 'Orbit the Moon, then land the crew', reward: pay.ORBIT + pay.LANDING };
  }
}

/** The first mission not yet done that the chosen payload can actually finish. */
export function currentMission(completed: readonly string[], payload?: PayloadKind): Mission | null {
  return MISSIONS.find(m => !completed.includes(m.id) && (!payload || !m.payload || m.payload === payload)) ?? null;
}

/** Missions newly completed by this flight. */
export function newlyCompleted(ctx: MissionContext, completed: readonly string[]): Mission[] {
  return MISSIONS.filter(m => !completed.includes(m.id) && m.check(ctx));
}

/** Price of a rocket from its parts ($), including the extra for picked fuel / engine / payload types. */
export function rocketCost(parts: readonly (PartType | PricedPart)[]): number {
  return parts.reduce((sum, p) => sum + partCost(p), 0);
}
