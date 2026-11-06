import { describe, expect, it } from 'vitest';
import { flightPauseItems, labPauseItems, nextEnabled, FlightPauseState } from './pauseRules';

const base: FlightPauseState = { launched: false, paid: false, checkpointPhase: null, cost: 120 };
const byAction = (items: ReturnType<typeof flightPauseItems>) => Object.fromEntries(items.map(i => [i.action, i]));

describe('flight pause menu', () => {
  it('always lists the five items in order', () => {
    expect(flightPauseItems(base).map(i => i.label)).toEqual(['CONTINUE', 'RESTART PHASE', 'LAUNCH AGAIN', 'BUILDER', 'QUIT TO MAIN MENU']);
  });

  it('on the pad before the countdown: restart and launch again are greyed out, nothing asks to confirm except quit', () => {
    const m = byAction(flightPauseItems(base));
    expect(m.CONTINUE.enabled).toBe(true);
    expect(m.RESTART_PHASE).toMatchObject({ enabled: false, reason: 'NOT LAUNCHED' });
    expect(m.LAUNCH_AGAIN).toMatchObject({ enabled: false, reason: 'NOT LAUNCHED' });
    expect(m.BUILDER.enabled).toBe(true);
    expect(m.BUILDER.confirm).toBeUndefined();
    expect(m.QUIT.confirm).toBe('SURE? DESIGN LOST');
  });

  it('during the countdown the rocket is paid for: launch again works and asks, restart phase is still greyed', () => {
    const m = byAction(flightPauseItems({ ...base, paid: true }));
    expect(m.LAUNCH_AGAIN).toMatchObject({ enabled: true, confirm: 'SURE? $120 SPENT' });
    expect(m.RESTART_PHASE).toMatchObject({ enabled: false, reason: 'NOT LAUNCHED' });
    expect(m.BUILDER.confirm).toBe('SURE? FLIGHT LOST');
    expect(m.QUIT.confirm).toBe('SURE? FLIGHT LOST');
  });

  it('in the first phase there is no checkpoint to restart from', () => {
    const m = byAction(flightPauseItems({ ...base, launched: true, paid: true, checkpointPhase: 'ORBIT' }));
    expect(m.RESTART_PHASE).toMatchObject({ enabled: false, reason: 'NO CHECKPOINT' });
    expect(m.LAUNCH_AGAIN.enabled).toBe(true);
  });

  it('with no checkpoint at all, restart phase is greyed out', () => {
    const m = byAction(flightPauseItems({ ...base, launched: true, paid: true, checkpointPhase: null }));
    expect(m.RESTART_PHASE).toMatchObject({ enabled: false, reason: 'NO CHECKPOINT' });
  });

  it('from the second phase on, restart phase is available and free (no confirm)', () => {
    const m = byAction(flightPauseItems({ ...base, launched: true, paid: true, checkpointPhase: 'LANDING' }));
    expect(m.RESTART_PHASE.enabled).toBe(true);
    expect(m.RESTART_PHASE.confirm).toBeUndefined();
  });
});

describe('lab pause menu', () => {
  it('has continue and a quit that warns the design is lost', () => {
    const items = labPauseItems();
    expect(items.map(i => i.action)).toEqual(['CONTINUE', 'QUIT']);
    expect(items[1].confirm).toBe('SURE? DESIGN LOST');
  });
});

describe('keyboard navigation', () => {
  it('skips greyed-out items and wraps around', () => {
    const items = flightPauseItems(base); // enabled: 0, 3, 4
    expect(nextEnabled(items, 0, 1)).toBe(3);
    expect(nextEnabled(items, 3, 1)).toBe(4);
    expect(nextEnabled(items, 4, 1)).toBe(0);
    expect(nextEnabled(items, 0, -1)).toBe(4);
    expect(nextEnabled(items, 3, -1)).toBe(0);
  });
});
