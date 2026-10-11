import { CONFIG } from '../config';
import { FINS, LIMITS, MOON, WORLD } from './constants';
import { FlightPhase, FlightStats } from './FlightSim';
import { VehicleReport } from './vehicle';

/**
 * How far the three-phase mission got: crew on the Moon > rover delivered >
 * in lunar orbit > reached the Moon's pull > space > sky > nothing.
 */
export type MissionOutcome = 'CREW_LANDED' | 'ROVER_DEPLOYED' | 'IN_ORBIT' | 'MOON_SOI' | 'SPACE' | 'SKY' | 'FAILED';

export interface MissionResult {
  outcome: MissionOutcome;
  title: string;
  summary: string;
  /** 0–5 */
  stars: number;
  score: number;
  /** Engineering feedback tying the result back to design decisions. */
  insights: string[];
}

export interface MissionInput {
  phase: FlightPhase;
  stats: FlightStats;
  report: VehicleReport;
  fuelFraction: number;
  /** Mission phases finished (0 = none, 1 = orbit, 2 = rover, 3 = crew landed). */
  phasesDone: number;
  /** Points from stunts, rocks and pickups, added on top. */
  bonus?: number;
  /** Why the current phase failed, if it did. */
  failure?: string;
}

export const MAX_STARS = 5;
/** Below this the flight barely left the pad. */
const SKY_ALTITUDE = 500;

const ECON = CONFIG.economy;

/** Contract payout for how far the flight got: every phase finished pays its reward. */
export const OUTCOME_PAYOUT: Record<MissionOutcome, number> = {
  FAILED: 0,
  SKY: ECON.partialRewards.SKY,
  SPACE: ECON.partialRewards.SPACE,
  MOON_SOI: ECON.partialRewards.MOON_SOI,
  IN_ORBIT: ECON.phaseRewards.ORBIT,
  ROVER_DEPLOYED: ECON.phaseRewards.ORBIT + ECON.phaseRewards.ROVER,
  CREW_LANDED: ECON.phaseRewards.ORBIT + ECON.phaseRewards.ROVER + ECON.phaseRewards.LANDING
};

export function outcomeFor(stats: FlightStats, phasesDone: number): MissionOutcome {
  if (phasesDone >= 3) return 'CREW_LANDED';
  if (phasesDone === 2) return 'ROVER_DEPLOYED';
  if (phasesDone === 1) return 'IN_ORBIT';
  if (stats.reachedMoonSoi) return 'MOON_SOI';
  if (stats.reachedSpace) return 'SPACE';
  if (stats.maxAltitude > SKY_ALTITUDE) return 'SKY';
  return 'FAILED';
}

const TEXT: Record<MissionOutcome, { title: string; stars: number }> = {
  CREW_LANDED: { title: 'CREW ON THE MOON', stars: 5 },
  ROVER_DEPLOYED: { title: 'ROVER DELIVERED', stars: 4 },
  IN_ORBIT: { title: 'LUNAR ORBIT ACHIEVED', stars: 3 },
  MOON_SOI: { title: 'REACHED THE MOON', stars: 2 },
  SPACE: { title: 'MADE IT TO SPACE', stars: 1 },
  SKY: { title: 'INTO THE SKY', stars: 1 },
  FAILED: { title: 'MISSION FAILED', stars: 0 }
};

export function evaluateMission({ phase, stats, report, fuelFraction, phasesDone, bonus = 0, failure }: MissionInput): MissionResult {
  const outcome = outcomeFor(stats, phasesDone);
  const { title, stars } = TEXT[outcome];
  let summary: string;
  switch (outcome) {
    case 'CREW_LANDED':
      summary = `All three phases done — the crew touched down at ${stats.impactSpeed.toFixed(1)} m/s.`;
      break;
    case 'ROVER_DEPLOYED':
      summary = failure ?? 'The rover is on the Moon, but the crew didn’t make it down.';
      break;
    case 'IN_ORBIT':
      summary = failure ?? 'You reached lunar orbit, but the rover never reached its zone.';
      break;
    case 'MOON_SOI':
      summary =
        stats.crashedOn === 'MOON'
          ? `You hit the Moon at ${Math.round(stats.impactSpeed)} m/s. To orbit, arrive off-centre and burn sideways.`
          : failure ?? 'You reached the Moon’s pull but didn’t settle into orbit. Burn sideways near the Moon.';
      break;
    case 'SPACE':
      summary = `Peak ${Math.round(stats.maxAltitude).toLocaleString()} m — past the edge of space, short of the Moon at ${MOON.altitude.toLocaleString()} m.`;
      break;
    case 'SKY':
      summary = `Peak ${Math.round(stats.maxAltitude).toLocaleString()} m. Space starts at ${WORLD.atmosphereTop.toLocaleString()} m.`;
      break;
    default:
      summary = 'The rocket barely left the pad.';
  }

  let score = Math.round(Math.min(stats.maxAltitude, MOON.altitude) / 2);
  if (stats.reachedSpace) score += 500;
  if (stats.reachedMoonSoi) score += 1_000;
  score += Math.min(phasesDone, 3) * 2_000;
  if (phasesDone >= 3) score += Math.round(fuelFraction * 1_000);
  score += bonus;

  return { outcome, title, summary, stars, score, insights: buildInsights(phase, stats, report, outcome) };
}

function buildInsights(phase: FlightPhase, stats: FlightStats, report: VehicleReport, outcome: MissionOutcome): string[] {
  const out: string[] = [];
  if (report.liftoffTwr < 1) {
    out.push(`Too heavy: engines push ${report.liftoffTwr.toFixed(2)}× the rocket's weight. Add engines or drop a tank.`);
  } else if (report.liftoffTwr < 1.25) {
    out.push(`Sluggish liftoff (${report.liftoffTwr.toFixed(2)}× weight) — most of the fuel goes into just hovering. Aim for 1.4 or more.`);
  }
  if (Math.abs(report.thrustOffset) > 0.15) {
    out.push('Unbalanced: the engines push off-centre, so the rocket tips over. Mirror your engines and tanks left/right.');
  }
  if (!report.finStable) {
    out.push(`Only ${report.finCount} fin${report.finCount === 1 ? '' : 's'} — you need at least ${FINS.minimumForStability} or every gust makes it wobble.`);
  }
  if (stats.partsLost > 0) {
    out.push(`${stats.partsLost} part${stats.partsLost === 1 ? '' : 's'} broke off — flying sideways fast, spinning, rocks or debris.`);
  }
  if ((outcome === 'SKY' || outcome === 'SPACE') && report.stageCount === 0) {
    out.push('Try boosters: tanks with their own engine on the sides drop off when empty, making the rest lighter and faster.');
  }
  if (outcome === 'MOON_SOI') {
    out.push('To orbit: aim to pass beside the Moon, not at it, then burn sideways so you circle instead of falling in.');
  }
  if (outcome === 'IN_ORBIT' || outcome === 'ROVER_DEPLOYED') {
    out.push('Bring more fuel — orbit fixes and the landing burn all cost fuel. Side boosters help.');
  }
  if (phase === 'CRASHED' && stats.impactSpeed > 0 && stats.impactSpeed < LIMITS.crashSpeed * 2) {
    out.push(`Touch down under ${LIMITS.crashSpeed} m/s and upright.`);
  }
  return out.slice(0, 3);
}
