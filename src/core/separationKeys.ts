/** Key that cracks an RCS shell open unless the player picked another one in the lab. */
export const DEFAULT_SEPARATION_KEY = 'B';

/**
 * Keys already used in the lab (hotkeys 1-5, C) or in flight (steering, throttle, repair,
 * relight, camera, retry, pause, launch). They can't be bound to a shell.
 */
const RESERVED = new Set([
  'W', 'A', 'S', 'D', 'E', 'F', 'Z', 'X', 'R', 'C', 'P', '1', '2', '3', '4', '5',
  'SPACE', 'ENTER', 'ESC', 'SHIFT', 'CTRL', 'UP', 'DOWN', 'LEFT', 'RIGHT'
]);

/** A single letter or digit, upper-cased; anything else is not bindable. */
export function normalizeKey(raw: string): string | null {
  const k = raw.trim().toUpperCase();
  return /^[A-Z0-9]$/.test(k) ? k : null;
}

export function isReservedKey(key: string): boolean {
  return RESERVED.has(key.toUpperCase());
}
