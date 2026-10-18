import type Phaser from 'phaser';
import { PartType } from './types';

export const GAME_ASSETS = {
  // Rocket Parts
  PART_COCKPIT: { key: 'part_cockpit', path: 'assets/cockpit.png' },
  PART_FUEL: { key: 'part_fuel', path: 'assets/fuel.png' },
  PART_FUEL_EMPTY: { key: 'part_fuel_empty', path: 'assets/fuel_empty.png' },
  PART_FUEL_TRANSPARENT: { key: 'part_fuel_transparent', path: 'assets/fuel_transparent.png' },
  PART_ENGINE: { key: 'part_thrust', path: 'assets/thrust.png' },
  PART_NOSE_CONE: { key: 'part_tip', path: 'assets/tip.png' },
  PART_LEFT_WING: { key: 'part_left_wing', path: 'assets/left_wing.png' },
  PART_RIGHT_WING: { key: 'part_right_wing', path: 'assets/right_wing.png' },
  PART_BLOCK: { key: 'part_block', path: 'assets/block.png' },

  // UI & Gauges
  UI_FUEL_GAUGE: { key: 'ui_fuel_gauge', path: 'assets/fuel_gauge.png' },
  UI_FUEL_NEEDLE: { key: 'ui_fuel_needle', path: 'assets/fuel_needle.png' },
  UI_COIN: { key: 'ui_coin', path: 'assets/coin_img.png' },
  UI_EARTH: { key: 'ui_earth', path: 'assets/earth.png' },
  UI_MOON: { key: 'ui_moon', path: 'assets/moon.png' },
  UI_MASS: { key: 'ui_mass', path: 'assets/mass.png' },
  UI_MASS_EMPTY: { key: 'ui_mass_empty', path: 'assets/mass_empty.png' }
} as const;

/**
 * Enforce nearest-neighbor filtering on all 2D pixel art textures so they remain crisp
 * without blurring when rendered at non-integer scales, while keeping vector UI anti-aliased.
 * FilterMode 1 = NEAREST, 0 = LINEAR.
 */
export function applyPixelArtTextureFilters(scene: Phaser.Scene): void {
  for (const asset of Object.values(GAME_ASSETS)) {
    if (scene.textures.exists(asset.key)) {
      scene.textures.get(asset.key).setFilter(1);
    }
  }
}

/**
 * Preload all game assets into Phaser texture cache if not already loaded.
 */
export function preloadGameAssets(scene: Phaser.Scene): void {
  let hasPendingLoads = false;
  for (const asset of Object.values(GAME_ASSETS)) {
    if (!scene.textures.exists(asset.key)) {
      scene.load.image(asset.key, asset.path);
      hasPendingLoads = true;
    }
  }
  if (hasPendingLoads) {
    scene.load.once('complete', () => {
      applyPixelArtTextureFilters(scene);
    });
  } else {
    applyPixelArtTextureFilters(scene);
  }
}

/**
 * Resolve the texture key for any rocket part based on type, orientation, and fuel level.
 */
export function getPartTextureKey(
  type: PartType,
  finOrientation?: 'LEFT' | 'RIGHT',
  fuel?: number
): string {
  switch (type) {
    case 'COCKPIT':
      return GAME_ASSETS.PART_COCKPIT.key;
    case 'FUEL_TANK':
      if (typeof fuel === 'number' && fuel <= 0.001) {
        return GAME_ASSETS.PART_FUEL_EMPTY.key;
      }
      return GAME_ASSETS.PART_FUEL.key;
    case 'ENGINE':
      return GAME_ASSETS.PART_ENGINE.key;
    case 'NOSE_CONE':
      return GAME_ASSETS.PART_NOSE_CONE.key;
    case 'FIN':
      return finOrientation === 'RIGHT'
        ? GAME_ASSETS.PART_RIGHT_WING.key
        : GAME_ASSETS.PART_LEFT_WING.key;
    case 'STRUCTURAL':
      return GAME_ASSETS.PART_BLOCK.key;
    default:
      return GAME_ASSETS.PART_BLOCK.key;
  }
}
