import { Vec2 } from './bodies';

/** Keplerian description of an unpowered trajectory around one body. */
export interface OrbitElements {
  energy: number;
  eccentricity: number;
  semiLatusRectum: number;
  /** Direction of periapsis (rad). */
  argumentOfPeriapsis: number;
  periapsisRadius: number;
  apoapsisRadius: number; // Infinity when unbound
  periapsisAltitude: number;
  apoapsisAltitude: number;
  period: number;
  escaping: boolean;
  /** +1 counter-clockwise, −1 clockwise. */
  direction: number;
}

/** Orbit elements from a position and velocity relative to the body's centre. */
export function orbitFromState(pos: Vec2, vel: Vec2, mu: number, bodyRadius: number): OrbitElements {
  const r = Math.hypot(pos.x, pos.y);
  const v2 = vel.x * vel.x + vel.y * vel.y;
  const energy = v2 / 2 - mu / r;
  const h = pos.x * vel.y - pos.y * vel.x;
  const rv = pos.x * vel.x + pos.y * vel.y;
  const ex = ((v2 - mu / r) * pos.x - rv * vel.x) / mu;
  const ey = ((v2 - mu / r) * pos.y - rv * vel.y) / mu;
  const eccentricity = Math.hypot(ex, ey);
  const semiLatusRectum = (h * h) / mu;
  const periapsisRadius = semiLatusRectum / (1 + eccentricity);
  const escaping = energy >= 0;
  const a = Math.abs(energy) < 1e-12 ? Infinity : -mu / (2 * energy);
  const apoapsisRadius = escaping ? Infinity : 2 * a - periapsisRadius;
  return {
    energy,
    eccentricity,
    semiLatusRectum,
    argumentOfPeriapsis: eccentricity > 1e-9 ? Math.atan2(ey, ex) : Math.atan2(pos.y, pos.x),
    periapsisRadius,
    apoapsisRadius,
    periapsisAltitude: periapsisRadius - bodyRadius,
    apoapsisAltitude: apoapsisRadius - bodyRadius,
    period: escaping ? Infinity : 2 * Math.PI * Math.sqrt(a ** 3 / mu),
    escaping,
    direction: h >= 0 ? 1 : -1
  };
}

/** Points along the conic (relative to the body's centre), clipped to `maxRadius`. */
export function sampleOrbit(o: OrbitElements, maxRadius: number, samples = 180): Vec2[] {
  const { eccentricity: e, semiLatusRectum: p, argumentOfPeriapsis: w } = o;
  if (p <= 1e-6) return [];
  let nuMax = Math.PI;
  if (o.escaping || e >= 1) {
    const asymptote = Math.acos(-1 / Math.max(e, 1 + 1e-9)) - 1e-3;
    const cosAtMax = (p / maxRadius - 1) / e;
    nuMax = cosAtMax >= -1 && cosAtMax <= 1 ? Math.min(asymptote, Math.acos(cosAtMax)) : asymptote;
  }
  const out: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const nu = -nuMax + (2 * nuMax * i) / samples;
    const r = p / (1 + e * Math.cos(nu));
    if (!(r > 0) || r > maxRadius) continue;
    out.push({ x: r * Math.cos(w + nu), y: r * Math.sin(w + nu) });
  }
  return out;
}
