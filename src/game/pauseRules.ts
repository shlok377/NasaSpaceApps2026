import type { PhaseId } from './phases';

/** What the pause menu is paused over. */
export type PauseContext = 'FLIGHT' | 'LAB';

export type PauseAction = 'CONTINUE' | 'RESTART_PHASE' | 'LAUNCH_AGAIN' | 'BUILDER' | 'QUIT';

export interface PauseItem {
  action: PauseAction;
  label: string;
  enabled: boolean;
  /** Why a greyed-out item is unavailable (shown on the item). */
  reason?: string;
  /** When set, the first click only arms the item and shows this text; the second click does it. */
  confirm?: string;
}

/** Everything the rules need to know about the flight that is being paused. */
export interface FlightPauseState {
  /** Engines lit: the countdown has finished. */
  launched: boolean;
  /** The rocket has been paid for (the countdown started). It is not refunded. */
  paid: boolean;
  /** The checkpoint saved at the start of the current phase, if any. */
  checkpointPhase: PhaseId | null;
  /** Price of the rocket ($). */
  cost: number;
}

/**
 * Items of the flight pause menu, in order. Unavailable items stay in place, greyed out with a reason,
 * so the buttons never move.
 *
 * - RESTART PHASE rewinds to the start of the current phase (free). The first phase (ORBIT) has no
 *   useful checkpoint: restarting it would be LAUNCH AGAIN.
 * - LAUNCH AGAIN puts the rocket back on the pad. The rocket was already paid for and is not refunded.
 * - BUILDER and QUIT drop a paid flight, so they ask first. QUIT also leaves the lab, which loses the design.
 */
export function flightPauseItems(s: FlightPauseState): PauseItem[] {
  const canRestartPhase = s.launched && s.checkpointPhase !== null && s.checkpointPhase !== 'ORBIT';
  return [
    { action: 'CONTINUE', label: 'CONTINUE', enabled: true },
    {
      action: 'RESTART_PHASE',
      label: 'RESTART PHASE',
      enabled: canRestartPhase,
      reason: canRestartPhase ? undefined : s.launched ? 'NO CHECKPOINT' : 'NOT LAUNCHED'
    },
    {
      action: 'LAUNCH_AGAIN',
      label: 'LAUNCH AGAIN',
      enabled: s.paid,
      reason: s.paid ? undefined : 'NOT LAUNCHED',
      confirm: s.paid ? `SURE? $${s.cost} SPENT` : undefined
    },
    { action: 'BUILDER', label: 'BUILDER', enabled: true, confirm: s.paid ? 'SURE? FLIGHT LOST' : undefined },
    { action: 'QUIT', label: 'QUIT TO MAIN MENU', enabled: true, confirm: s.paid ? 'SURE? FLIGHT LOST' : 'SURE? DESIGN LOST' }
  ];
}

/** The lab has nothing running, so it only needs a way out. The rocket design is not saved, so leaving loses it. */
export function labPauseItems(): PauseItem[] {
  return [
    { action: 'CONTINUE', label: 'CONTINUE', enabled: true },
    { action: 'QUIT', label: 'QUIT TO MAIN MENU', enabled: true, confirm: 'SURE? DESIGN LOST' }
  ];
}

/** Moves the highlight to the next enabled item, wrapping around. Returns the same index if none is enabled. */
export function nextEnabled(items: readonly PauseItem[], from: number, step: 1 | -1): number {
  for (let i = 1; i <= items.length; i++) {
    const idx = (from + step * i + items.length * 2) % items.length;
    if (items[idx].enabled) return idx;
  }
  return from;
}
