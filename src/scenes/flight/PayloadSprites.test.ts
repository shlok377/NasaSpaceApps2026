import { describe, expect, it } from 'vitest';
import { PayloadSprites } from './PayloadSprites';
import { SPRITE_SHEETS, SHEET_COLUMNS, createSpriteAnimations } from '../../core/spriteSheets';

/** A sprite that only remembers what it was told, and lets the test finish a clip. */
class FakeSprite {
  visible = false;
  destroyed = false;
  played: string[] = [];
  displaySize = 0;
  x = 0;
  y = 0;
  tint: number | null = null;
  private done: Array<() => void> = [];
  setDepth() { return this; }
  setOrigin() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDisplaySize(w: number) { this.displaySize = w; return this; }
  setVisible(v: boolean) { this.visible = v; return this; }
  setRotation() { return this; }
  setFrame() { return this; }
  setTint(c: number) { this.tint = c; return this; }
  destroy() { this.destroyed = true; }
  removeAllListeners() { this.done = []; return this; }
  play(key: string) { this.played.push(key); return this; }
  once(_event: string, fn: () => void) { this.done.push(fn); return this; }
  /** The clip that is playing ends. */
  finishClip() { const fns = this.done; this.done = []; fns.forEach((f) => f()); }
}

function fakeScene(loaded = true) {
  const sprites: FakeSprite[] = [];
  const created: Array<{ key: string; repeat: number; frameRate: number; start: number; end: number }> = [];
  const scene = {
    add: { sprite: (_x: number, _y: number, key: string) => { const s = new FakeSprite(); sprites.push(s); void key; return s; } },
    textures: { exists: () => loaded },
    anims: {
      exists: (k: string) => created.some((c) => c.key === k),
      generateFrameNumbers: (_k: string, cfg: { start: number; end: number }) => cfg,
      create: (cfg: { key: string; repeat: number; frameRate: number; frames: { start: number; end: number } }) => {
        created.push({ key: cfg.key, repeat: cfg.repeat, frameRate: cfg.frameRate, start: cfg.frames.start, end: cfg.frames.end });
      }
    }
  };
  return { scene: scene as never, sprites, created };
}

const spot = { x: 100, y: 200, size: 48 };

describe('sprite sheet animations', () => {
  it('registers one animation per clip, on the right row, looping only where the sheet says so', () => {
    const { scene, created } = fakeScene();
    createSpriteAnimations(scene);
    createSpriteAnimations(scene); // calling again must not register twice
    const total = Object.values(SPRITE_SHEETS).reduce((n, s) => n + Object.keys(s.meta.animations).length, 0);
    expect(created).toHaveLength(total);
    const land = created.find((c) => c.key === 'rover_land')!;
    expect(land.start).toBe(SPRITE_SHEETS.rover.meta.animations.land.row * SHEET_COLUMNS);
    expect(land.end - land.start + 1).toBe(SPRITE_SHEETS.rover.meta.animations.land.frames);
    expect(land.repeat).toBe(0);
    expect(created.find((c) => c.key === 'satellite_working')!.repeat).toBe(-1);
    expect(created.find((c) => c.key === 'crew_wave_flag')!.repeat).toBe(-1);
  });

  it('every clip fits inside its sheet row', () => {
    for (const sheet of Object.values(SPRITE_SHEETS)) {
      for (const clip of Object.values(sheet.meta.animations)) expect(clip.frames).toBeLessThanOrEqual(SHEET_COLUMNS);
    }
  });
});

describe('PayloadSprites', () => {
  it('plays the satellite deploy clip, then the working loop, and restarts when it is ejected again', () => {
    const { scene, sprites } = fakeScene();
    const p = new PayloadSprites(scene);
    expect(p.updateSatellite(spot)).toBe(true);
    p.endFrame();
    const sat = sprites[0];
    expect(sat.played).toEqual(['satellite_deploy']);
    expect(sat.visible).toBe(true);
    p.endFrame();
    p.updateSatellite(spot); // later frames do not restart the clip
    p.endFrame();
    expect(sat.played).toEqual(['satellite_deploy']);
    sat.finishClip();
    expect(sat.played).toEqual(['satellite_deploy', 'satellite_working']);
    // gone (a retry), then ejected again: the deploy plays again
    p.updateSatellite(null);
    p.endFrame();
    expect(sat.visible).toBe(false);
    p.updateSatellite(spot);
    expect(sat.played.at(-1)).toBe('satellite_deploy');
  });

  it('shows the airbag as a still frame (no animation) while the rover falls', () => {
    const { scene, sprites } = fakeScene();
    const p = new PayloadSprites(scene);
    expect(p.updateRoverFall({ x: 5, y: 5, size: 64 })).toBe(true);
    expect(sprites[0].played).toEqual([]);
  });

  it('a rover in the zone lands, unpacks, then drives; one that missed only lands and is greyed out', () => {
    const { scene, sprites } = fakeScene();
    const p = new PayloadSprites(scene);
    const at = { ...spot, rotation: 0 };
    p.updateLandedRovers([{ ...at, ok: true }, { ...at, ok: false }]);
    const [good, bad] = sprites;
    good.finishClip();
    good.finishClip();
    expect(good.played).toEqual(['rover_land', 'rover_deploy', 'rover_drive']);
    bad.finishClip();
    expect(bad.played).toEqual(['rover_land']);
    expect(bad.tint).not.toBeNull();
    expect(good.tint).toBeNull();
    // a retry rewinds to fewer rovers: the extra one is removed
    p.updateLandedRovers([{ ...at, ok: true }]);
    expect(bad.destroyed).toBe(true);
    expect(good.destroyed).toBe(false);
  });

  it('the crew plants the flag only when it landed on the site', () => {
    const on = fakeScene();
    const a = new PayloadSprites(on.scene);
    a.updateCrew({ ...spot, onSite: true });
    on.sprites[0].finishClip();
    on.sprites[0].finishClip();
    expect(on.sprites[0].played).toEqual(['crew_exit', 'crew_plant', 'crew_wave_flag']);

    const off = fakeScene();
    const b = new PayloadSprites(off.scene);
    b.updateCrew({ ...spot, onSite: false });
    off.sprites[0].finishClip();
    expect(off.sprites[0].played).toEqual(['crew_exit', 'crew_wave']);
  });

  it('hides anything that is not placed in a frame, and clears the crew on a retry', () => {
    const { scene, sprites } = fakeScene();
    const p = new PayloadSprites(scene);
    p.updateCrew({ ...spot, onSite: true });
    p.endFrame();
    expect(sprites[0].visible).toBe(true);
    p.endFrame(); // next frame nothing placed it
    expect(sprites[0].visible).toBe(false);
    p.updateCrew(null);
    expect(sprites[0].destroyed).toBe(true);
  });

  it('does nothing (and reports it) when the sheets have not loaded, so the renderer can fall back to the still sprite', () => {
    const { scene, sprites } = fakeScene(false);
    const p = new PayloadSprites(scene);
    expect(p.updateSatellite(spot)).toBe(false);
    expect(p.updateRoverFall(spot)).toBe(false);
    expect(p.updateLandedRovers([])).toBe(false);
    expect(p.updateCrew({ ...spot, onSite: true })).toBe(false);
    expect(sprites).toHaveLength(0);
  });
});
