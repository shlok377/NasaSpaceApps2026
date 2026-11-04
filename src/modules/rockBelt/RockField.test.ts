import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { Combo, difficultyLevel, PART_RADIUS, Rock, RockField, rockX, SPAWN_EXTRA } from './RockField';

const CFG = CONFIG.rockBelt;
const seq = (...values: number[]) => () => values.shift() ?? 0.5;
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

/** A rock placed by hand: level with y, at x, still. */
function still(x: number, y: number, radius = 2): Rock {
  return { id: 0, y, xAt: x, tAt: 0, vx: 0, radius, boulder: false, seed: 0.5, closest: Infinity, hit: false, passed: false };
}
const rocketAt = (x: number, y: number) => [
  { id: 'nose', x, y: y + 1 },
  { id: 'body', x, y },
  { id: 'tail', x, y: y - 1 }
];

describe('Rock field', () => {
  it('reads each difficulty rating from config, clamped to 1..5', () => {
    expect(difficultyLevel(1)).toBe(CFG.difficulty['1']);
    expect(difficultyLevel(9)).toBe(CFG.difficulty['5']);
    expect(difficultyLevel(0)).toBe(CFG.difficulty['1']);
    expect(CFG.difficulty['4'].rocksPer100m).toBeGreaterThan(CFG.difficulty['1'].rocksPer100m);
  });

  it('spawns ahead of the rocket, across its whole view plus the margin, aimed where it will be', () => {
    const field = new RockField(lcg(3), difficultyLevel(4));
    const x = 900;
    const vx = 30;
    for (let y = CFG.bottom - 400; y < CFG.top; y += 50) field.spawn(x + vx * ((y - CFG.bottom) / 150), y, vx, 150, (y - CFG.bottom) / 150);
    expect(field.rocks.length).toBeGreaterThan(10);
    for (const r of field.rocks) {
      expect(r.y).toBeGreaterThanOrEqual(CFG.bottom);
      expect(r.y).toBeLessThanOrEqual(CFG.top);
      // Where the rocket will be when it gets level with the rock.
      const rocketX = x + vx * ((r.y - CFG.bottom) / 150);
      expect(Math.abs(rockX(r, r.tAt) - rocketX)).toBeLessThanOrEqual(CFG.fieldHalfWidth + 1);
    }
  });

  it('never spawns a rock closer than the warning range, so nothing pops up beside the rocket', () => {
    const field = new RockField(lcg(5), difficultyLevel(5));
    field.spawn(0, CFG.bottom + 300, 0, 120, 0);
    const lowest = Math.min(...field.rocks.map(r => r.y));
    expect(field.rocks.every(r => r.y <= CFG.bottom + 300 + CFG.warningDistance + SPAWN_EXTRA)).toBe(true);
    expect(lowest).toBeGreaterThanOrEqual(CFG.bottom);
  });

  it('drifts in a straight line: no wrapping, no jumps', () => {
    const r = { ...still(0, 3000), vx: 12 };
    expect(rockX(r, 10)).toBe(120);
    expect(rockX(r, 100)).toBe(1200);
  });

  it('a hit counts once and the rock is gone', () => {
    const field = new RockField(seq(), difficultyLevel(1));
    field.rocks = [still(0, 3000)];
    expect(field.check(rocketAt(0, 3000), 0).hits).toHaveLength(1);
    expect(field.rocks[0].hit).toBe(true);
    expect(field.check(rocketAt(0, 3000), 0).hits).toHaveLength(0);
  });

  it('a near miss is judged once the rock is behind, and the rock stays in the field', () => {
    const field = new RockField(seq(), difficultyLevel(1));
    const margin = difficultyLevel(1).nearMissMargin;
    const rock = still(2 + PART_RADIUS + margin / 2, 3000);
    field.rocks = [rock];
    expect(field.check(rocketAt(0, 3000), 0).nearMisses).toHaveLength(0); // level with it: not yet
    const after = field.check(rocketAt(0, 3000 + 20), 0);
    expect(after.nearMisses).toEqual([rock]);
    expect(field.rocks).toContain(rock);
    expect(rock.hit).toBe(false);
    expect(field.check(rocketAt(0, 3000 + 40), 0).nearMisses).toHaveLength(0); // once only
  });

  it('no near miss for a rock that was never close, or one that hit', () => {
    const field = new RockField(seq(), difficultyLevel(1));
    const far = still(30, 3000);
    const hit = still(0, 3002);
    field.rocks = [far, hit];
    field.check(rocketAt(0, 3000), 0);
    expect(field.check(rocketAt(0, 3030), 0).nearMisses).toHaveLength(0);
  });

  it('forgets rocks far below', () => {
    const field = new RockField(seq(), difficultyLevel(1));
    field.rocks = [still(0, 2800), still(0, 3500)];
    field.prune(3200);
    expect(field.rocks.map(r => r.y)).toEqual([3500]);
  });
});

describe('Near-miss combo', () => {
  it('builds with close shaves in a row and lapses after a lull', () => {
    const c = new Combo();
    expect(c.nearMiss(0)).toBe(1);
    expect(c.nearMiss(1)).toBe(2);
    expect(c.nearMiss(1 + CFG.comboWindow + 1)).toBe(1);
    c.reset();
    expect(c.count).toBe(0);
  });
});
