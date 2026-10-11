import { MOON, MOON_CENTER, WORLD } from './constants';

export interface Vec2 {
  x: number;
  y: number;
}

export type BodyId = 'EARTH' | 'MOON';

/** Earth's pull straight down, weakening with height. */
export function earthGravity(altitude: number): number {
  const k = WORLD.gravityFalloff / (WORLD.gravityFalloff + Math.max(0, altitude));
  return WORLD.surfaceGravity * k * k;
}

/** Moon's pull towards its centre at a given distance from that centre. */
export function moonGravity(distance: number): number {
  return MOON.mu / (distance * distance);
}

export function distanceToMoonCenter(x: number, y: number): number {
  return Math.hypot(x - MOON_CENTER.x, y - MOON_CENTER.y);
}

/** Inside the Moon's sphere of influence only the Moon pulls; outside, only Earth. */
export function insideMoonSoi(x: number, y: number): boolean {
  return distanceToMoonCenter(x, y) < MOON.sphereOfInfluence;
}

/** Total gravitational acceleration at a point (patched conics). */
export function gravityAt(x: number, y: number): Vec2 {
  if (!insideMoonSoi(x, y)) return { x: 0, y: -earthGravity(y) };
  const dx = MOON_CENTER.x - x;
  const dy = MOON_CENTER.y - y;
  const d = Math.hypot(dx, dy);
  const gm = moonGravity(d);
  return { x: (gm * dx) / d, y: (gm * dy) / d };
}

/** Distance from a point to the Moon's surface (m). */
export function moonAltitude(x: number, y: number): number {
  return distanceToMoonCenter(x, y) - MOON.radius;
}

/** Which body's frame describes the vehicle: the Moon's inside its sphere of influence. */
export function dominantBody(x: number, y: number): BodyId {
  return insideMoonSoi(x, y) ? 'MOON' : 'EARTH';
}

/** Local "up" direction relative to a body. */
export function localUp(body: BodyId, x: number, y: number): Vec2 {
  if (body === 'EARTH') return { x: 0, y: 1 };
  const dx = x - MOON_CENTER.x;
  const dy = y - MOON_CENTER.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/** Height above the pad where the Moon's sphere of influence begins (straight below the Moon). */
export function moonSoiAltitude(): number {
  return MOON_CENTER.y - MOON.sphereOfInfluence;
}

/** World position of a point on the Moon's surface at a given angle from its centre. */
export function moonSurfacePoint(angle: number, height = 0): Vec2 {
  const r = MOON.radius + height;
  return { x: MOON_CENTER.x + Math.cos(angle) * r, y: MOON_CENTER.y + Math.sin(angle) * r };
}

/** Angle (from the Moon's centre) of a world point. */
export function moonAngleOf(x: number, y: number): number {
  return Math.atan2(y - MOON_CENTER.y, x - MOON_CENTER.x);
}

/** Distance along the Moon's surface between two angles (m). */
export function surfaceDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * MOON.radius;
}
