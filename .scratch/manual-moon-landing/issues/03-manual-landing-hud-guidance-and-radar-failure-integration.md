# 03: Manual Landing HUD Guidance & Radar Failure Instrument Integration

**What to build:**
Flight guidance prompts and cockpit instruments fully support the manual lunar landing flow and its emergency problems. The in-flight bottom guidance banner directs the player to align with the retrograde arrow to deorbit and brake. During the Phase 3 `RADAR_FAILURE` crisis, the altitude and speed telemetry beside the rocket blacks out (`RADAR OUT — — —`), while the dashed retrograde arrow remains visible as an inertial orientation cue, letting the player judge their deceleration by eye and land safely.

**Blocked by:**
- #34 (01: Purge Landing Autopilot & Remove Mode Toggles)
- #35 (02: Retrograde Directional Arrow in Lunar Close-Up Views)

**Status:** closed

- [x] Update `hintText` in `FlightScene.ts` during descent to prompt manual braking along the retrograde vector rather than automated computer braking.
- [x] Confirm speed/altitude readout (`readoutText`) displays `RADAR OUT — — —` during `RADAR_FAILURE` while the retrograde arrow continues tracking orientation.
- [x] Playtest end-to-end flight from lunar orbit through deorbit, radar failure, and touchdown under full manual control.
- [x] Unit and phase runner tests pass cleanly with 100% green status.
