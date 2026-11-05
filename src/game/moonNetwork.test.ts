import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { MOON, MOON_CENTER } from '../physics/constants';
import { coverage, crewAssist, liveSatellite, newRover, newSatellite, sanitizeAssets, scoutSites, siteTotal, spendDay } from './moonNetwork';
import { loadProgress, saveProgress } from './progress';
import { ROVER_ZONE, LANDING_SITE } from './phases';

const r = MOON.radius + 700;
const sat = (id = 'SAT-1') => newSatellite(id, { x: MOON_CENTER.x, y: MOON_CENTER.y - r, vx: Math.sqrt(MOON.mu / r), vy: 0 });
const fixed = () => 0.5;

describe('the Moon network', () => {
  it('with nothing deployed there is just the default zone', () => {
    const sites = scoutSites([], 'ROVER', ROVER_ZONE, fixed);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ source: 'DEFAULT', halfWidth: ROVER_ZONE.halfWidth, angle: ROVER_ZONE.angle });
  });

  it('a satellite scouts one narrow spot, a rover three narrower ones', () => {
    expect(scoutSites([sat()], 'ROVER', ROVER_ZONE, fixed)).toHaveLength(1);
    const rovers = scoutSites([newRover('ROV-1', 1)], 'ROVER', ROVER_ZONE, fixed);
    expect(rovers).toHaveLength(3);
    const satSite = scoutSites([sat()], 'ROVER', ROVER_ZONE, fixed)[0];
    expect(satSite.halfWidth).toBeLessThan(ROVER_ZONE.halfWidth);
    expect(rovers[0].halfWidth).toBeLessThan(satSite.halfWidth);
  });

  it('every other asset widens the spots', () => {
    const one = scoutSites([sat()], 'ROVER', ROVER_ZONE, fixed)[0].halfWidth;
    const three = scoutSites([sat('A'), sat('B'), sat('C')], 'ROVER', ROVER_ZONE, fixed)[0].halfWidth;
    expect(three).toBeGreaterThan(one);
  });

  it('the crew gets much more help from rovers than from satellites', () => {
    expect(crewAssist([])).toBe(1);
    expect(crewAssist([newRover('R', 0)])).toBeGreaterThan(crewAssist([sat()]));
    const crew = scoutSites([newRover('R', 0)], 'LANDING', LANDING_SITE, fixed)[0].halfWidth;
    const rover = scoutSites([newRover('R', 0)], 'ROVER', LANDING_SITE, fixed)[0].halfWidth;
    expect(crew).toBeGreaterThan(rover);
  });

  it('counts the places it can scout and caps them', () => {
    expect(siteTotal([sat(), newRover('R', 0)])).toBe(4);
    expect(siteTotal([newRover('A', 0), newRover('B', 0), newRover('C', 0)])).toBe(CONFIG.network.maxSites);
    expect(coverage([], 150)).toBe(0);
    expect(coverage([sat(), newRover('R', 0)], 150)).toBeGreaterThan(0);
  });

  it('spots stay clear of each other', () => {
    const sites = scoutSites([newRover('R', 0)], 'ROVER', ROVER_ZONE, Math.random);
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const d = Math.abs(Math.atan2(Math.sin(sites[i].angle - sites[j].angle), Math.cos(sites[i].angle - sites[j].angle))) * MOON.radius;
        expect(d).toBeGreaterThan(CONFIG.network.minSiteGapMetres);
      }
    }
  });

  it('batteries last the set number of launches, then the asset is gone', () => {
    let assets = [sat(), newRover('R', 0)];
    for (let i = 0; i < CONFIG.network.rover.days - 1; i++) assets = spendDay(assets);
    expect(assets.map(a => a.kind)).toEqual(['SATELLITE', 'ROVER']);
    assets = spendDay(assets);
    expect(assets.map(a => a.kind)).toEqual(['SATELLITE']);
    expect(assets[0].daysLeft).toBe(CONFIG.network.satellite.days - CONFIG.network.rover.days);
  });

  it('a satellite stays on its own orbit however long it waits', () => {
    const a = sat();
    for (const t of [0.1, 0.4, 0.9]) {
      const body = liveSatellite(a, () => t)!;
      const radius = Math.hypot(body.x - MOON_CENTER.x, body.y - MOON_CENTER.y);
      expect(Math.abs(radius - r)).toBeLessThan(20);
    }
  });

  it('is saved with the player and bad entries are dropped', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const progress = { ...loadProgress(storage), assets: [sat(), newRover('ROV-2', 2.5)] };
    saveProgress(progress, storage);
    expect(loadProgress(storage).assets).toEqual(progress.assets);
    expect(sanitizeAssets([{ id: 'x', kind: 'ROVER', daysLeft: 3 }, { id: 'y', kind: 'WHAT' }, null, { id: 'z', kind: 'ROVER', daysLeft: 0, angle: 1 }])).toEqual([]);
  });
});
