import { CONFIG } from '../config';

/**
 * When the player launches. Later in the day means gustier wind (harder to fly
 * straight) and a bigger payout: a difficulty ladder from DAWN to NIGHT.
 * Numbers live in game.json (`timeOfDay`); the look lives here.
 */
export type TimeOfDay = 'DAWN' | 'NOON' | 'DUSK' | 'NIGHT';
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['DAWN', 'NOON', 'DUSK', 'NIGHT'];

export interface TimeOfDayLook {
  label: string;
  /** One line for the picker. */
  blurb: string;
  /** Pixel sky, top to bottom. */
  sky: number[];
  /** Cloud body, rim and shaded underside. */
  cloud: [number, number, number];
  /** Which of the sky's clouds to paint (all when unset); night keeps just a couple. */
  clouds?: number[];
  /** Multiplied over the launch-site panorama (0xffffff = as painted). */
  landTint: number;
  /** The far range is further away, so it takes more of the sky colour. */
  farTint: number;
  /** Colour the smooth gradient fades from just above the horizon. */
  horizon: number;
  /** Lower part of the high sky (the gradient blends from here up to space). */
  skyLow: number;
  stars: boolean;
  /** Picker swatch. */
  accent: number;
}

export const TIME_LOOKS: Record<TimeOfDay, TimeOfDayLook> = {
  DAWN: {
    label: 'DAWN',
    blurb: 'Calm air',
    sky: [0x5d7fc4, 0x7d93cf, 0x9fa8d6, 0xc3b6d6, 0xe3bfc8, 0xf3c7b4, 0xf8d3a6, 0xfbe2b0],
    cloud: [0xfff1e6, 0xffd9c4, 0xe2b4b8],
    landTint: 0xf2dcd6,
    farTint: 0xf0c8c8,
    horizon: 0xf6cfb0,
    skyLow: 0x7d93cf,
    stars: false,
    accent: 0xf8b27a
  },
  NOON: {
    label: 'NOON',
    blurb: 'Breezy',
    sky: [0x7fb8e8, 0x8cc2ec, 0x9bcbef, 0xabd4f2, 0xbcdcf4, 0xcde5f6, 0xdcecf7, 0xe9f3f8],
    cloud: [0xffffff, 0xe8f1f8, 0xd6e6f2],
    landTint: 0xffffff,
    farTint: 0xffffff,
    horizon: 0xb9dcf5,
    skyLow: 0x6fb1e6,
    stars: false,
    accent: 0x7fc4f0
  },
  DUSK: {
    label: 'DUSK',
    blurb: 'Gusty',
    sky: [0x2b2a63, 0x45337a, 0x6a3f86, 0x934a84, 0xc0587a, 0xe0705f, 0xf08f4f, 0xf8b34e],
    cloud: [0xffb38a, 0xf08a6a, 0x9a4f78],
    landTint: 0xc89aa0,
    farTint: 0xb889a8,
    horizon: 0xf08f4f,
    skyLow: 0x45337a,
    stars: false,
    accent: 0xf0705f
  },
  NIGHT: {
    label: 'NIGHT',
    blurb: 'Stormy',
    sky: [0x05081a, 0x080d24, 0x0c132e, 0x101a38, 0x142142, 0x19294c, 0x1f3156, 0x263a60],
    cloud: [0x222b4a, 0x4f6094, 0x18203c],
    clouds: [0, 3],
    landTint: 0x4a5684,
    farTint: 0x3c4874,
    horizon: 0x263a60,
    skyLow: 0x0c132e,
    stars: true,
    accent: 0x6c7cc8
  }
};

export const timeOfDayWind = (t: TimeOfDay): number => CONFIG.timeOfDay[t].wind;
export const timeOfDayReward = (t: TimeOfDay): number => CONFIG.timeOfDay[t].reward;
/** Rock belt density multiplier: dawn sparsest, night densest (more drifters too). */
export const timeOfDayRocks = (t: TimeOfDay): number => CONFIG.timeOfDay[t].rocks;
