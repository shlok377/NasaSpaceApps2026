import type Phaser from 'phaser';
import satelliteMeta from '../../animated_sprites/satellite/satellite.json';
import roverMeta from '../../animated_sprites/rover/rover.json';
import crewMeta from '../../animated_sprites/crew/crew.json';

/**
 * The animated sprite sheets (made by `animated_sprites/tools/gen-*.mjs`, copied here by `npm run sprites`).
 * Each sheet is a grid of equal frames, 10 per row; a clip is one row. The clip list, frame counts and timings
 * come straight from the JSON next to each generator, so a regenerated sheet needs no code change.
 */
export interface SheetClip {
  row: number;
  frames: number;
  frameMs: number;
  loop: boolean;
}

export interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, SheetClip>;
}

export const SHEET_COLUMNS = 10;

export const SPRITE_SHEETS = {
  satellite: { key: 'sprite_satellite', path: 'assets/sprites/satellite.png', meta: satelliteMeta as SheetMeta },
  rover: { key: 'sprite_rover', path: 'assets/sprites/rover.png', meta: roverMeta as SheetMeta },
  crew: { key: 'sprite_crew', path: 'assets/sprites/crew.png', meta: crewMeta as SheetMeta }
} as const;

export type SheetName = keyof typeof SPRITE_SHEETS;

/** Phaser animation key for one clip of one sheet, e.g. `rover_land`. */
export function animKey(sheet: SheetName, clip: string): string {
  return `${sheet}_${clip}`;
}

/** Queue every sheet for loading (skips the ones already in the texture cache). Returns true if anything is pending. */
export function preloadSpriteSheets(scene: Phaser.Scene): boolean {
  let pending = false;
  for (const sheet of Object.values(SPRITE_SHEETS)) {
    if (scene.textures.exists(sheet.key)) continue;
    scene.load.spritesheet(sheet.key, sheet.path, { frameWidth: sheet.meta.frameWidth, frameHeight: sheet.meta.frameHeight });
    pending = true;
  }
  return pending;
}

/** Keep the pixels crisp (nearest-neighbour) once the sheets are loaded. */
export function applySpriteSheetFilters(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SPRITE_SHEETS)) {
    if (!scene.textures.exists(sheet.key)) continue;
    const tex = scene.textures.get(sheet.key);
    if (typeof tex.setSmoothPixelArt === 'function') tex.setSmoothPixelArt(false);
    tex.setFilter(1); // NEAREST
  }
}

/** Is this sheet loaded and ready to draw? (False in the unit tests' fake scenes.) */
export function sheetReady(scene: Phaser.Scene, sheet: SheetName): boolean {
  return Boolean(scene.textures?.exists?.(SPRITE_SHEETS[sheet].key));
}

/** Register one Phaser animation per clip. Safe to call again: existing animations are left alone. */
export function createSpriteAnimations(scene: Phaser.Scene): void {
  if (!scene.anims) return;
  for (const [name, sheet] of Object.entries(SPRITE_SHEETS) as Array<[SheetName, (typeof SPRITE_SHEETS)[SheetName]]>) {
    if (!scene.textures.exists(sheet.key)) continue;
    for (const [clip, def] of Object.entries(sheet.meta.animations)) {
      const key = animKey(name, clip);
      if (scene.anims.exists(key)) continue;
      const start = def.row * SHEET_COLUMNS;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheet.key, { start, end: start + def.frames - 1 }),
        frameRate: 1000 / def.frameMs,
        repeat: def.loop ? -1 : 0
      });
    }
  }
}
