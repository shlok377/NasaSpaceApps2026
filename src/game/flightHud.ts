import { FuelKind } from '../core/types';
import { FlightPart, TankFuel } from '../physics/vehicle';
import { TimeOfDay } from './timeOfDay';

/**
 * Flight HUD model: what the flight instruments show, worked out from the sim.
 * Pure (no drawing); the HUD widgets render it.
 */

/** Tilt past this many degrees turns the attitude ball's rim amber. */
export const TILT_AMBER_DEGREES = 20;
/** Tilt past this many degrees turns it red. */
export const TILT_RED_DEGREES = 35;
/** More tanks than this and repeated tanks are grouped as ×n. */
export const MAX_UNGROUPED_TANKS = 6;
/** Wind speed (m/s) drawn as a full-strength arrow. */
export const FULL_WIND_SPEED = 20;

export type TiltWarning = 'NORMAL' | 'AMBER' | 'RED';

/** One mini tank in the fuel row (or a ×n group of identical tanks). */
export interface HudTank {
  /** Part id of the (first) tank; stable across frames, so widgets can key on it. */
  id: string;
  /** Every tank in this entry (one unless grouped). */
  partIds: string[];
  fuelKind: FuelKind;
  /** Fill, 0–1 (averaged over a group). 0 once detached. */
  fraction: number;
  /** False once the tank has dropped away with its booster. */
  attached: boolean;
  /** How many tanks this entry stands for (the ×n badge when > 1). */
  count: number;
}

export interface HudWind {
  /** Which way it blows: +1 to the right, −1 to the left, 0 when calm. */
  direction: -1 | 0 | 1;
  /** Arrow length, 0–1 (|speed| / FULL_WIND_SPEED, clamped). */
  strength: number;
  /** Signed wind speed (m/s, + = blowing right). */
  speed: number;
}

export interface FlightHudModel {
  tanks: HudTank[];
  /** True when repeated tanks were grouped (more than six tanks). */
  grouped: boolean;
  /** Fuel left as a whole percentage of what the rocket launched with (0–100). */
  totalFuelPercent: number;
  /** Tilt from vertical in degrees (+ = nose to the left, − = to the right). */
  tiltDegrees: number;
  tiltWarning: TiltWarning;
  wind: HudWind;
  /** Launch time, for the attitude ball's sky palette. */
  timeOfDay: TimeOfDay;
}

/** The slice of the flight sim the HUD reads (a FlightSim fits). */
export interface HudSimView {
  /** The rocket as launched: every tank that ever existed. */
  readonly initialVehicle: { readonly parts: readonly FlightPart[] };
  /** What is still attached. */
  readonly vehicle: { readonly parts: readonly FlightPart[] };
  /** Fuel left per tank (kg), keyed by part id. */
  readonly tanks: TankFuel;
}

/** The slice of telemetry the HUD reads (a FlightTelemetry fits). */
export interface HudTelemetry {
  /** Nose relative to local vertical (rad, + = tilted left/CCW). */
  pitchFromVertical: number;
  /** Horizontal wind (m/s, + = blowing right). */
  wind: number;
}

export function tiltWarning(tiltDegrees: number): TiltWarning {
  const tilt = Math.abs(tiltDegrees);
  if (tilt > TILT_RED_DEGREES) return 'RED';
  if (tilt > TILT_AMBER_DEGREES) return 'AMBER';
  return 'NORMAL';
}

export function hudWind(speed: number): HudWind {
  const calm = Math.abs(speed) < 0.05;
  return {
    direction: calm ? 0 : speed > 0 ? 1 : -1,
    strength: calm ? 0 : Math.min(1, Math.abs(speed) / FULL_WIND_SPEED),
    speed
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function flightHudModel(sim: HudSimView, telemetry: HudTelemetry, timeOfDay: TimeOfDay = 'DAWN'): FlightHudModel {
  const attachedIds = new Set(sim.vehicle.parts.map(p => p.id));
  const tankParts = sim.initialVehicle.parts.filter(p => p.fuelCapacity > 0);

  let capacity = 0;
  let left = 0;
  const single = tankParts.map(p => {
    const attached = attachedIds.has(p.id);
    const kg = attached ? (sim.tanks.get(p.id) ?? 0) : 0;
    capacity += p.fuelCapacity;
    left += kg;
    return {
      part: p,
      tank: {
        id: p.id,
        partIds: [p.id],
        fuelKind: p.fuelKind ?? 'STANDARD',
        fraction: clamp01(kg / p.fuelCapacity),
        attached,
        count: 1
      } as HudTank
    };
  });

  const grouped = single.length > MAX_UNGROUPED_TANKS;
  const tanks = grouped ? groupTanks(single) : single.map(s => s.tank);

  const tiltDegrees = (telemetry.pitchFromVertical * 180) / Math.PI;
  return {
    tanks,
    grouped,
    totalFuelPercent: capacity > 0 ? Math.round(clamp01(left / capacity) * 100) : 0,
    tiltDegrees,
    tiltWarning: tiltWarning(tiltDegrees),
    wind: hudWind(telemetry.wind),
    timeOfDay
  };
}

/**
 * Repeated tanks (same fuel, size, distance from the cockpit and attached
 * state, e.g. a pair of side boosters) share one entry; they drain together,
 * so their fill is averaged. Order follows the first tank of each group.
 */
function groupTanks(single: Array<{ part: FlightPart; tank: HudTank }>): HudTank[] {
  const groups = new Map<string, HudTank>();
  for (const { part, tank } of single) {
    const key = `${tank.fuelKind}|${part.fuelCapacity}|${part.depth}|${tank.attached}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...tank, partIds: [...tank.partIds] });
      continue;
    }
    g.fraction = (g.fraction * g.count + tank.fraction) / (g.count + 1);
    g.count++;
    g.partIds.push(part.id);
  }
  return [...groups.values()];
}
