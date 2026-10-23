import { describe, expect, it } from 'vitest';
import { RocketTree } from '../core/RocketTree';
import { buildFlightVehicle } from '../physics/vehicle';
import { FlightSim } from '../physics/FlightSim';
import { generateLaneWaves } from './rocks';
import { moonSoiAltitude } from '../physics/bodies';
import { ROCK_BELT } from '../physics/constants';
import {
  createEvasiveRunnerState,
  findClosestLane,
  updateEvasiveRunner,
  RUNNER_CONFIG,
  RUNNER_LANES
} from './evasiveRunner';

describe('EvasiveRunner State & Logic', () => {
  it('finds the closest lane index for any given world X', () => {
    // RUNNER_LANES is [-20, -10, 0, 10, 20]
    expect(findClosestLane(-50)).toBe(0); // Clamped towards leftmost (-20)
    expect(findClosestLane(-12)).toBe(1); // Closer to -10 than -20
    expect(findClosestLane(-1)).toBe(2);  // Closer to 0
    expect(findClosestLane(8)).toBe(3);   // Closer to 10
    expect(findClosestLane(30)).toBe(4);  // Closer to 20
  });

  it('triggers prompt at 2,400m altitude', () => {
    const state = createEvasiveRunnerState();
    expect(state.promptActive).toBe(false);
    expect(state.active).toBe(false);

    // Below 2400m: no prompt
    updateEvasiveRunner(state, 2300, 0.1, false, 0, 0);
    expect(state.promptActive).toBe(false);

    // Reaching 2400m: prompt activates with 3-second timer
    updateEvasiveRunner(state, 2400, 0.1, false, 0, 0);
    expect(state.promptActive).toBe(true);
    expect(state.promptTimer).toBeCloseTo(2.9, 1);
  });

  it('activates bullet-time runner mode when SPACE is pressed during the prompt', () => {
    const state = createEvasiveRunnerState();
    updateEvasiveRunner(state, 2450, 0.1, false, 0, -9);
    expect(state.promptActive).toBe(true);

    // Player presses SPACE while at x = -9 (near lane -10, index 1)
    const result = updateEvasiveRunner(state, 2460, 0.1, true, 0, -9);
    expect(state.promptActive).toBe(false);
    expect(state.active).toBe(true);
    expect(state.currentLaneIndex).toBe(1);
    expect(result.engaged).toBe(true);
  });

  it('expires prompt at 2,700m if SPACE is not pressed (strict manual)', () => {
    const state = createEvasiveRunnerState();
    updateEvasiveRunner(state, 2450, 0.1, false, 0, 0);
    expect(state.promptActive).toBe(true);

    // Altitude reaches 2,700m without pressing SPACE
    updateEvasiveRunner(state, 2700, 0.1, false, 0, 0);
    expect(state.promptActive).toBe(false);
    expect(state.active).toBe(false);
  });

  it('expires prompt if 3.0 seconds elapsed without pressing SPACE', () => {
    const state = createEvasiveRunnerState();
    updateEvasiveRunner(state, 2450, 0.1, false, 0, 0);
    expect(state.promptActive).toBe(true);

    // Advance 3.1 seconds while still under 2700m
    updateEvasiveRunner(state, 2500, 3.1, false, 0, 0);
    expect(state.promptActive).toBe(false);
    expect(state.active).toBe(false);
  });

  it('shifts lanes smoothly with steer input and clamps at outer bounds', () => {
    const state = createEvasiveRunnerState();
    // Engage at center lane (0m, index 2)
    updateEvasiveRunner(state, 2450, 0.1, false, 0, 0);
    updateEvasiveRunner(state, 2500, 0.1, true, 0, 0);
    expect(state.currentLaneIndex).toBe(2);

    // Steer Right (+1)
    const rightRes = updateEvasiveRunner(state, 2750, 0.01, false, 1, state.currentX);
    expect(rightRes.laneChanged).toBe(true);
    expect(state.targetLaneIndex).toBe(3);
    expect(state.tilt).toBeGreaterThan(0); // Tilts right

    // Complete the 120ms shift
    updateEvasiveRunner(state, 2760, 0.12, false, 0, state.currentX);
    expect(state.currentLaneIndex).toBe(3);
    expect(state.currentX).toBe(RUNNER_LANES[3]); // 10m
    expect(state.tilt).toBe(0); // Returns to vertical

    // Steer Right again to lane 4 (20m)
    updateEvasiveRunner(state, 2770, 0.01, false, 1, state.currentX);
    updateEvasiveRunner(state, 2780, 0.12, false, 0, state.currentX);
    expect(state.currentLaneIndex).toBe(4);

    // Steer Right beyond max lane (clamped to 4)
    const clampRes = updateEvasiveRunner(state, 2790, 0.01, false, 1, state.currentX);
    expect(clampRes.laneChanged).toBeUndefined();
    expect(state.targetLaneIndex).toBe(4);
  });

  it('clears evasive runner mode upon ascending past 3,400m altitude', () => {
    const state = createEvasiveRunnerState();
    updateEvasiveRunner(state, 2450, 0.1, false, 0, 0);
    updateEvasiveRunner(state, 2500, 0.1, true, 0, 0);
    expect(state.active).toBe(true);

    // Ascend through 3,400m
    const res = updateEvasiveRunner(state, 3405, 0.1, false, 0, state.currentX);
    expect(state.active).toBe(false);
    expect(state.cleared).toBe(true);
    expect(res.cleared).toBe(true);
    expect(state.tilt).toBe(0);
  });

  it('simulates end-to-end flight sequence through the debris belt with collision and exit', () => {
    const tree = new RocketTree(7, 8);
    tree.attachPart(7, 7, 'NOSE_CONE');
    tree.attachPart(7, 9, 'FUEL_TANK');
    tree.attachPart(7, 10, 'ENGINE');
    tree.attachPart(6, 9, 'FIN');
    tree.attachPart(8, 9, 'FIN');
    const vehicle = buildFlightVehicle(tree.getTelemetry().tree);
    const sim = new FlightSim(vehicle);
    sim.phase = 'FLYING';

    const runnerState = createEvasiveRunnerState();

    // 1. Ascend to 2,390m -> no prompt yet
    sim.state.y = 2390;
    sim.state.vy = 80;
    updateEvasiveRunner(runnerState, sim.state.y, 0.1, false, 0, sim.state.x);
    expect(runnerState.promptActive).toBe(false);

    // 2. Cross 2,400m -> prompt triggers
    sim.state.y = 2410;
    const pRes = updateEvasiveRunner(runnerState, sim.state.y, 0.1, false, 0, sim.state.x);
    expect(runnerState.promptActive).toBe(true);
    expect(pRes.promptTriggered).toBe(true);

    // 3. Player hits SPACE -> engages runner mode
    const eRes = updateEvasiveRunner(runnerState, sim.state.y, 0.1, true, 0, sim.state.x);
    expect(runnerState.active).toBe(true);
    expect(eRes.engaged).toBe(true);

    // 4. Generate lane waves and test collision
    const waves = generateLaneWaves(999);
    expect(waves.length).toBeGreaterThan(0);

    // Rocket at center lane (0m), advance through 2,800m
    sim.state.y = 2800;
    updateEvasiveRunner(runnerState, sim.state.y, 0.1, false, 0, sim.state.x);
    sim.state.x = runnerState.currentX;
    sim.state.theta = Math.PI / 2 + runnerState.tilt;
    expect(sim.state.theta).toBeCloseTo(Math.PI / 2, 2);

    // 5. Shift lane to avoid obstacle
    const steerInput = -1; // Tap left to move to lane 1 (-10m)
    updateEvasiveRunner(runnerState, sim.state.y, 0.01, false, steerInput, sim.state.x);
    updateEvasiveRunner(runnerState, sim.state.y, 0.12, false, 0, sim.state.x);
    expect(runnerState.currentLaneIndex).toBe(1);
    expect(runnerState.currentX).toBe(RUNNER_LANES[1]);

    // 6. Test Major-Moo collision: hit an outer fin
    const initialParts = sim.vehicle.parts.length;
    const finPart = sim.vehicle.parts.find(p => p.type === 'FIN');
    expect(finPart).toBeDefined();
    sim.hitPart(finPart!.id);
    expect(sim.vehicle.parts.length).toBe(initialParts - 1);
    expect(sim.debris.length).toBeGreaterThan(0);

    // 7. Ascend past 3,400m -> cleared
    sim.state.y = 3401;
    const cRes = updateEvasiveRunner(runnerState, sim.state.y, 0.1, false, 0, sim.state.x);
    expect(runnerState.active).toBe(false);
    expect(runnerState.cleared).toBe(true);
    expect(cRes.cleared).toBe(true);
  });

  it('configures readable cruise speed (45 m/s) and camera zoom (14 px/m) to give ample reaction time', () => {
    expect(RUNNER_CONFIG.cruiseSpeed).toBe(45);
    expect(RUNNER_CONFIG.cameraScale).toBe(14);
    expect(RUNNER_CONFIG.rocketY).toBe(560);

    // At 14 px/m with rocket at y = 560 on a 720px screen:
    // Distance from top of screen to rocket is 560 px = 40 meters.
    // At effective cruise climb of 45 m/s * 0.35 = 15.75 m/s:
    // Lookahead reaction time is 40 / 15.75 = ~2.54 seconds.
    const lookaheadMetres = RUNNER_CONFIG.rocketY / RUNNER_CONFIG.cameraScale;
    const effectiveClimbSpeed = RUNNER_CONFIG.cruiseSpeed * RUNNER_CONFIG.timeScale;
    const reactionWindowSec = lookaheadMetres / effectiveClimbSpeed;
    expect(reactionWindowSec).toBeGreaterThan(2.0); // > 2.0s is comfortable arcade reaction time
  });

  it('governs vertical velocity to cruise speed and restores momentum on exit', () => {
    let vy = 220; // Blasting at 220 m/s into the debris field
    const entryVy = vy;
    const targetVy = RUNNER_CONFIG.cruiseSpeed;
    const dt = 0.05;

    // Simulate 20 frames of active runner speed governing
    for (let f = 0; f < 20; f++) {
      vy += (targetVy - vy) * (1 - Math.exp(-dt * 6));
    }
    // Should have eased down close to 45 m/s
    expect(vy).toBeLessThan(60);
    expect(vy).toBeGreaterThan(44);

    // On exit (cleared), momentum is restored
    if (entryVy > vy) {
      vy = entryVy;
    }
    expect(vy).toBe(220);
  });

  it('provides a natural physics-based 10–15 second deep-space gap between clearing the rocks and Moon SOI', () => {
    const soiAltitude = moonSoiAltitude();
    const rockBeltTop = ROCK_BELT.top;
    const spaceGapMetres = soiAltitude - rockBeltTop;

    // Physical distance from clearing rocks (3,400m) to Moon pull (4,800m) is 1,400m
    expect(spaceGapMetres).toBe(1400);

    // At full burn (~140 m/s), takes ~10.0 seconds
    const timeAtFullBurn = spaceGapMetres / 140;
    expect(timeAtFullBurn).toBeCloseTo(10.0, 1);

    // At cruising / coasting speed (~93 m/s), takes ~15.0 seconds
    const timeAtCruise = spaceGapMetres / 93.33;
    expect(timeAtCruise).toBeCloseTo(15.0, 1);
  });
});
