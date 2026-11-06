import { CONFIG } from '../config';
import { MOON, MOON_CENTER } from '../physics/constants';
import { orbitFromState } from '../physics/orbit';
import { RoverCapsule, stepRover, SurfaceZone } from './phases';

const NET = CONFIG.network;

export type AssetKind = 'SATELLITE' | 'ROVER';

/** A satellite or rover left on the Moon's side for later flights. It serves one launch per "day" of battery. */
export interface DeployedAsset {
  /** Also its label on the panel, e.g. SAT-7. */
  id: string;
  kind: AssetKind;
  /** Launches it can still serve. */
  daysLeft: number;
  maxDays: number;
  /** Satellite: its orbit state when it was left (Moon frame, m and m/s). */
  orbit?: { x: number; y: number; vx: number; vy: number };
  /** Rover: where it sits on the Moon (surface angle). */
  angle?: number;
}

/** A place the network can scout for a landing: a zone plus who found it (DEFAULT = nothing scouted yet). */
export interface ScoutSite extends SurfaceZone {
  source: 'DEFAULT' | AssetKind;
}

export const newSatellite = (id: string, body: Pick<RoverCapsule, 'x' | 'y' | 'vx' | 'vy'>): DeployedAsset => ({
  id,
  kind: 'SATELLITE',
  daysLeft: NET.satellite.days,
  maxDays: NET.satellite.days,
  orbit: { x: body.x, y: body.y, vx: body.vx, vy: body.vy }
});

export const newRover = (id: string, angle: number): DeployedAsset => ({ id, kind: 'ROVER', daysLeft: NET.rover.days, maxDays: NET.rover.days, angle });

/** Read assets back from storage, dropping anything that doesn't look right. */
export function sanitizeAssets(raw: unknown): DeployedAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: DeployedAsset[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string') continue;
    if (a.kind !== 'SATELLITE' && a.kind !== 'ROVER') continue;
    const maxDays = NET[a.kind === 'SATELLITE' ? 'satellite' : 'rover'].days;
    const daysLeft = Number.isFinite(a.daysLeft) ? Math.min(maxDays, Math.floor(a.daysLeft)) : 0;
    if (daysLeft <= 0) continue;
    if (a.kind === 'SATELLITE') {
      const o = a.orbit;
      if (!o || ![o.x, o.y, o.vx, o.vy].every(Number.isFinite)) continue;
      out.push({ id: a.id, kind: 'SATELLITE', daysLeft, maxDays, orbit: { x: o.x, y: o.y, vx: o.vx, vy: o.vy } });
    } else if (Number.isFinite(a.angle)) {
      out.push({ id: a.id, kind: 'ROVER', daysLeft, maxDays, angle: a.angle });
    }
  }
  return out;
}

/** One launch spends one day of battery; flat batteries are retired. */
export function spendDay(assets: readonly DeployedAsset[]): DeployedAsset[] {
  return assets.map(a => ({ ...a, daysLeft: a.daysLeft - 1 })).filter(a => a.daysLeft > 0);
}

export function counts(assets: readonly DeployedAsset[]): { satellites: number; rovers: number } {
  return { satellites: assets.filter(a => a.kind === 'SATELLITE').length, rovers: assets.filter(a => a.kind === 'ROVER').length };
}

/** How many landing spots the network can scout in all (capped at what the number keys can pick). */
export function siteTotal(assets: readonly DeployedAsset[]): number {
  const c = counts(assets);
  return Math.min(NET.maxSites, c.satellites * NET.satellite.siteCount + c.rovers * NET.rover.siteCount);
}

export type SiteMission = 'ROVER' | 'LANDING';

/** The width every spot gets from the size of the network: more satellites and rovers, wider and surer spots. */
function widen(assets: readonly DeployedAsset[]): number {
  return Math.min(NET.widenCap, 1 + NET.widenPerAsset * Math.max(0, assets.length - 1));
}

/** The crew lands with a lot of help from the rovers and satellites already there. */
export function crewAssist(assets: readonly DeployedAsset[]): number {
  const c = counts(assets);
  return Math.min(NET.crewAssist.cap, 1 + NET.crewAssist.perRover * c.rovers + NET.crewAssist.perSatellite * c.satellites);
}

export function siteHalfWidth(source: ScoutSite['source'], mission: SiteMission, base: number, assets: readonly DeployedAsset[]): number {
  if (source === 'DEFAULT') return base;
  const own = source === 'SATELLITE' ? NET.satellite.width : NET.rover.width;
  return base * own * widen(assets) * (mission === 'LANDING' ? crewAssist(assets) : 1);
}

/**
 * The spots to pick from for this flight's rover drop or crew landing. With nothing deployed it is the single default zone.
 * Otherwise every satellite and rover adds its own, spread round the Moon (new places each flight).
 */
export function scoutSites(assets: readonly DeployedAsset[], mission: SiteMission, base: SurfaceZone, random: () => number): ScoutSite[] {
  const n = siteTotal(assets);
  if (n === 0) return [{ ...base, source: 'DEFAULT' }];
  const sources: AssetKind[] = [];
  for (const a of assets) for (let i = 0; i < (a.kind === 'SATELLITE' ? NET.satellite.siteCount : NET.rover.siteCount); i++) sources.push(a.kind);
  // Satellites first, so a capped list keeps their wide-view spots.
  sources.sort((a, b) => (a === b ? 0 : a === 'SATELLITE' ? -1 : 1));
  const slot = (2 * Math.PI) / n;
  const jitter = Math.max(0, slot - (2 * NET.minSiteGapMetres) / MOON.radius) / 2;
  const start = random() * 2 * Math.PI;
  return sources.slice(0, n).map((source, i) => ({
    angle: start + i * slot + (random() - 0.5) * jitter,
    halfWidth: siteHalfWidth(source, mission, base.halfWidth, assets),
    source
  }));
}

/** Share of the Moon's surface (0..1) the network's spots cover, measured on the rover zone. */
export function coverage(assets: readonly DeployedAsset[], roverBase: number): number {
  const sites = scoutSites(assets, 'ROVER', { angle: 0, halfWidth: roverBase }, () => 0.5);
  if (assets.length === 0) return 0;
  return Math.min(1, sites.reduce((sum, s) => sum + 2 * s.halfWidth, 0) / (2 * Math.PI * MOON.radius));
}

/**
 * A satellite as it is when this flight starts: left on its orbit, but some time has passed since, so it sits anywhere along it.
 * (It stays on the orbit it was deployed in.)
 */
export function liveSatellite(asset: DeployedAsset, random: () => number): RoverCapsule | null {
  const o = asset.orbit;
  if (!o) return null;
  const el = orbitFromState({ x: o.x - MOON_CENTER.x, y: o.y - MOON_CENTER.y }, { x: o.vx, y: o.vy }, MOON.mu, MOON.radius);
  if (el.escaping || !Number.isFinite(el.period)) return null;
  const body: RoverCapsule = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, landed: false, angle: null, inZone: false };
  stepRover(body, random() * el.period);
  return body;
}
