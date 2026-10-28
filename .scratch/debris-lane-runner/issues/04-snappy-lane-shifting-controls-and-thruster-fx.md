# 04: Snappy 120ms Lane-Shifting Controls & Thruster FX

**What to build:**
In Evasive Runner mode, tapping `A` / `D` or `Left` / `Right` arrow keys smoothly glides the rocket to adjacent discrete lanes in 120ms. The transition features lateral RCS thruster puff particles, audio/visual punch, and a subtle starfighter banking tilt (±10°). The rocket remains vertically upright without tipping, tumbling, or spinning out from angular inertia.

**Blocked by:** 03: Center-Locked Camera, Retro Runway Lines & Threat HUD (#31)

**Status:** completed

- [x] Tapping `A` / `Left` decrements target lane index (clamped to leftmost lane).
- [x] Tapping `D` / `Right` increments target lane index (clamped to rightmost lane).
- [x] Rocket's X position smoothly transitions to the target lane over 120ms using an ease-out interpolation.
- [x] Lateral RCS thruster smoke puffs spawn on the opposite side of motion during the shift.
- [x] Rocket tilts cosmetically ±10° during lane shifts, returning to 0° upon arriving at the lane.
- [x] Attitude remains vertically locked without destabilizing flight physics.
- [x] `npm test` and `npm run typecheck` pass cleanly.
