/**
 * Launch windows: the time of day the player picks before every launch. Each one
 * looks different at the pad and trades a little wind, fuel and toughness against
 * a launch fee and an earnings bonus.
 */
export type LaunchWindowId = 'DAY' | 'SUNSET' | 'NIGHT';

/** Physics knobs the flight sim applies for the chosen window (1 = unchanged). */
export interface FlightConditions {
  /** Multiplies the wind at every altitude. */
  windScale: number;
  /** Thrust per kg of propellant: 1.1 burns 10% less fuel for the same push. */
  fuelEfficiency: number;
  /** Multiplies how much load a joint takes before an outer part snaps off. */
  jointStrengthScale: number;
}

export const NEUTRAL_CONDITIONS: FlightConditions = { windScale: 1, fuelEfficiency: 1, jointStrengthScale: 1 };

export interface LaunchWindow {
  id: LaunchWindowId;
  name: string;
  /** Short mood line for the picker card. */
  blurb: string;
  /** Flat fee on top of the rocket's price; not refunded and not part of the rocket's cost. */
  fee: number;
  /** Extra share of everything the flight earns (0.2 = +20%). */
  earningsBonus: number;
  conditions: FlightConditions;
  /** How visible the debris-belt rocks are (1 = clear; lower is darker). */
  rockVisibility: number;
  /** Flight-effect chips shown on the picker card (fee and bonus get their own line). */
  chips: Array<{ text: string; good: boolean }>;
}

export const LAUNCH_WINDOWS: Record<LaunchWindowId, LaunchWindow> = {
  DAY: {
    id: 'DAY',
    name: 'Day',
    blurb: 'Bright skies, warm gusty thermals',
    fee: 0,
    earningsBonus: 0.1,
    conditions: { windScale: 1.5, fuelEfficiency: 1, jointStrengthScale: 1 },
    rockVisibility: 1,
    chips: [
      { text: 'GUSTY WIND', good: false },
      { text: 'CLEAR VIEW', good: true }
    ]
  },
  SUNSET: {
    id: 'SUNSET',
    name: 'Sunset',
    blurb: 'Calm golden air, the premium slot',
    fee: 15,
    earningsBonus: 0,
    conditions: { windScale: 0.6, fuelEfficiency: 1, jointStrengthScale: 1 },
    rockVisibility: 1,
    chips: [
      { text: 'CALM WIND', good: true },
      { text: 'CLEAR VIEW', good: true }
    ]
  },
  NIGHT: {
    id: 'NIGHT',
    name: 'Night',
    blurb: 'Still, cold air; dark skies, brittle joints',
    fee: 5,
    earningsBonus: 0.2,
    conditions: { windScale: 0.4, fuelEfficiency: 1.1, jointStrengthScale: 0.75 },
    rockVisibility: 0.55,
    chips: [
      { text: 'STILL AIR', good: true },
      { text: '+10% FUEL', good: true },
      { text: 'FRAGILE', good: false },
      { text: 'DARK ROCKS', good: false }
    ]
  }
};

export const WINDOW_ORDER: readonly LaunchWindowId[] = ['DAY', 'SUNSET', 'NIGHT'];
export const DEFAULT_WINDOW: LaunchWindowId = 'SUNSET';

/** What it costs to fly this rocket in this window. */
export function launchPrice(rocketCost: number, window: LaunchWindowId): number {
  return rocketCost + LAUNCH_WINDOWS[window].fee;
}

/** Earnings with the window's bonus applied (rounded to whole dollars). */
export function withWindowBonus(amount: number, window: LaunchWindowId): number {
  return Math.round(amount * (1 + LAUNCH_WINDOWS[window].earningsBonus));
}
