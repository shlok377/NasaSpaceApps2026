# 02: Manual Space Prompt & Bullet-Time Activation Flow

**What to build:**
As the rocket ascends toward the debris belt, approaching 2,400m altitude, the flight HUD displays a high-visibility alert banner and a 3-second countdown prompt: `DEBRIS FIELD AHEAD: PRESS [SPACE] TO ENGAGE EVASIVE RUNNER`. If `[SPACE]` is pressed before 2,700m, simulation speed slows to 35% (bullet-time) and the vehicle transitions into the Evasive Runner state, snapping its target lane to the nearest lane. If `[SPACE]` is not pressed within the prompt window, the rocket enters the belt in standard Newtonian physics as a strict manual challenge.

**Blocked by:** 01: 5-Lane Track Spawner & Telegraphed Wave Generator (#29)

**Status:** completed

- [x] Approaching 2,400m altitude triggers a 3-second prompt on the HUD banner.
- [x] Pressing `[SPACE]` within the 3s window successfully engages `evasiveRunnerActive`.
- [x] Engaging the mode scales simulation time step to 35% speed (bullet-time) with smooth audio/visual cue.
- [x] Rocket's initial target lane aligns to the closest discrete lane based on entry position.
- [x] If `[SPACE]` is not pressed, the prompt expires at 2,700m and the vehicle braves the belt with unmodified physics.
- [x] Unit tests verify prompt triggering, timer expiration, and state transition flags.
- [x] `npm test` and `npm run typecheck` pass cleanly.
