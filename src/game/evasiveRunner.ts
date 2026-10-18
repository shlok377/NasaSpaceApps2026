import { CONFIG } from '../config';
import { ROCK_BELT } from '../physics/constants';

export const RUNNER_CONFIG = CONFIG.rockBelt.evasiveRunner;
export const RUNNER_LANES = RUNNER_CONFIG.lanes;

export interface EvasiveRunnerState {
  promptActive: boolean;
  promptTimer: number;
  promptShown: boolean;
  active: boolean;
  currentLaneIndex: number;
  targetLaneIndex: number;
  shiftProgress: number; // 0..1
  startX: number;
  currentX: number;
  tilt: number; // in radians, for cosmetic banking
  cleared: boolean;
}

export interface EvasiveRunnerEvent {
  promptTriggered?: boolean;
  engaged?: boolean;
  laneChanged?: boolean;
  cleared?: boolean;
}

export function createEvasiveRunnerState(): EvasiveRunnerState {
  return {
    promptActive: false,
    promptTimer: 0,
    promptShown: false,
    active: false,
    currentLaneIndex: 2,
    targetLaneIndex: 2,
    shiftProgress: 1,
    startX: 0,
    currentX: 0,
    tilt: 0,
    cleared: false
  };
}

export function findClosestLane(x: number, lanes: readonly number[] = RUNNER_LANES): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const d = Math.abs(x - lanes[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Ease out quad for snappy responsive lane snapping */
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export function updateEvasiveRunner(
  state: EvasiveRunnerState,
  altitude: number,
  dt: number,
  spacePressed: boolean,
  steerInput: number, // -1 for left (A/Left), +1 for right (D/Right), 0 for none
  rocketX: number
): EvasiveRunnerEvent {
  const event: EvasiveRunnerEvent = {};
  const cfg = RUNNER_CONFIG;

  // 1. Check prompt trigger
  if (!state.promptShown && altitude >= cfg.promptAltitude && altitude < ROCK_BELT.bottom) {
    state.promptShown = true;
    state.promptActive = true;
    state.promptTimer = 3.0;
    event.promptTriggered = true;
  }

  // 2. Handle active prompt
  if (state.promptActive) {
    state.promptTimer = Math.max(0, state.promptTimer - dt);
    if (spacePressed) {
      state.promptActive = false;
      state.active = true;
      const closest = findClosestLane(rocketX);
      state.currentLaneIndex = closest;
      state.targetLaneIndex = closest;
      state.startX = rocketX;
      state.currentX = rocketX;
      state.shiftProgress = 1;
      state.tilt = 0;
      event.engaged = true;
    } else if (state.promptTimer <= 0 || altitude >= ROCK_BELT.bottom) {
      state.promptActive = false;
    }
  }

  // 3. Handle active runner mode
  if (state.active) {
    // Check exit condition
    if (altitude >= ROCK_BELT.top) {
      state.active = false;
      state.cleared = true;
      event.cleared = true;
      state.tilt = 0;
      return event;
    }

    // Lane shift input: steerInput < 0 is Left, steerInput > 0 is Right
    if (steerInput < 0 && state.targetLaneIndex > 0) {
      state.targetLaneIndex--;
      state.startX = state.currentX;
      state.shiftProgress = 0;
      event.laneChanged = true;
    } else if (steerInput > 0 && state.targetLaneIndex < RUNNER_LANES.length - 1) {
      state.targetLaneIndex++;
      state.startX = state.currentX;
      state.shiftProgress = 0;
      event.laneChanged = true;
    }

    // Advance shift tween
    const targetX = RUNNER_LANES[state.targetLaneIndex];
    if (state.shiftProgress < 1) {
      const duration = cfg.laneShiftDuration;
      state.shiftProgress = Math.min(1, state.shiftProgress + dt / duration);
      const k = easeOutQuad(state.shiftProgress);
      state.currentX = state.startX + (targetX - state.startX) * k;

      // Cosmetic tilt: ±10 degrees (0.174 rad) while moving, returning to 0
      const dir = targetX > state.startX ? 1 : -1;
      const tiltAngle = 0.174 * dir * Math.sin(state.shiftProgress * Math.PI);
      state.tilt = tiltAngle;

      if (state.shiftProgress >= 1) {
        state.currentLaneIndex = state.targetLaneIndex;
        state.tilt = 0;
      }
    } else {
      state.currentX = targetX;
      state.tilt = 0;
    }
  }

  return event;
}
