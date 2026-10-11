import raw from './game.json';

/**
 * The game's tunable numbers live in `game.json` next to this file. This
 * module just gives them types and derives the handful of values that are
 * easier to state in other units there (degrees, kgf).
 */
export type GameConfig = typeof raw;
export const CONFIG: GameConfig = raw;

export const deg = (d: number) => (d * Math.PI) / 180;
