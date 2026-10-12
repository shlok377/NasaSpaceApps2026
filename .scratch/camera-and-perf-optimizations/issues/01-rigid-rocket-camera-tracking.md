# 01: Rigid Rocket-Centric Camera & Continuous Framing Smoothing

**What to build:** 
The flight camera tracks the rocket with rock-solid stability across all ascent, cruise, and descent speeds. In the player's viewport, the rocket stays anchored at its target screen framing without high-frequency vibration, jitter, or frame-lag oscillations caused by variable delta time. When transitioning between climbing and falling at apogee, the framing target smoothly glides via a continuous velocity factor rather than popping instantaneously.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Camera world coordinates ($c.x, c.y$) follow the rocket's center of mass $(s.x, s.y)$ 1:1 without world-coordinate low-pass lag filters.
- [ ] Framing target offset (`smoothedRocketY`) interpolates smoothly between ascent ($470\text{px}$) and descent/falling ($260\text{px}$) using a continuous sigmoid function of vertical velocity.
- [ ] Frame-to-frame on-screen rocket position jitter is guaranteed $<1.0\text{px}$ across 1500 frames of varying $\Delta t$.
- [ ] Unit regression test in `src/physics/camera_tracking.test.ts` passes consistently.
