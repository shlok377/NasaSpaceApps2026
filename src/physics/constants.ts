import { CONFIG, deg } from '../config';

/**
 * Physical constants for the flight simulator, read from
 * `src/config/game.json` (edit the numbers there, not here).
 *
 * A compact, "Learn to Fly"-style world: flat ground, the Moon hanging about
 * 5 km overhead. Outside the Moon's sphere of influence only Earth pulls
 * (weakening with height); inside it only the Moon does — the "patched
 * conics" trick real mission planners and Kerbal Space Program use — which
 * is what makes stable lunar orbits possible.
 */

/** Standard gravity, used for Isp ↔ exhaust velocity and kgf ↔ N. */
export const G0 = 9.80665;

export const WORLD = CONFIG.world;

const moon = CONFIG.moon;
export const MOON = {
  radius: moon.radius,
  surfaceGravity: moon.surfaceGravity,
  mu: moon.surfaceGravity * moon.radius * moon.radius,
  /** Height of the Moon's lowest point above the pad (m). */
  altitude: moon.altitude,
  /** Inside this distance from the Moon's centre, only the Moon's gravity applies. */
  sphereOfInfluence: moon.sphereOfInfluence
} as const;

export const MOON_CENTER = { x: 0, y: MOON.altitude + MOON.radius } as const;

export const ROCK_BELT = { bottom: CONFIG.rockBelt.bottom, top: CONFIG.rockBelt.top } as const;

/** Bulk density of the propellant: 1 L of builder fuel weighs 1 kg. */
export const PROPELLANT_DENSITY = 1.0;

export const ENGINE = {
  isp: CONFIG.engine.isp,
  gimbalRange: deg(CONFIG.engine.gimbalDegrees)
} as const;

/** Airframe geometry: every grid cell is a 1 m × 1 m block. */
export const AIRFRAME = {
  cellLength: 1.0,
  columnSpacing: 1.0,
  ...CONFIG.airframe
} as const;

export const FINS = CONFIG.fins;
export const WIND = CONFIG.wind;
export const STEERING = CONFIG.steering;

export const LIMITS = {
  crashSpeed: CONFIG.limits.crashSpeed,
  bounceSpeed: CONFIG.limits.bounceSpeed,
  bounceRestitution: CONFIG.limits.bounceRestitution,
  maxLandingTilt: deg(CONFIG.limits.maxLandingTiltDegrees),
  jointStrength: CONFIG.limits.jointStrength,
  maxSpin: CONFIG.limits.maxSpin
} as const;
