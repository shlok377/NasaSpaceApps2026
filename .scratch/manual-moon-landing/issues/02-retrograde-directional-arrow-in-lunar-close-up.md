# 02: Retrograde Directional Arrow in Lunar Close-Up Views

**What to build:**
During lunar descent and touchdown, the player receives clean passive flight vector guidance to help them cancel horizontal and vertical velocity. In close-up views (`DESCENT` and `TOUCHDOWN`), a high-contrast directional arrow with a dashed stem and arrowhead extends outward from the rocket pointing opposite to the current velocity vector (retrograde). This indicates the exact attitude heading needed to burn engines and brake, fading out smoothly when landing velocity drops below 0.5 m/s so it doesn't clutter the final touchdown.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] In `WorldRenderer.ts`, calculate the vehicle's retrograde vector in screen space when in `DESCENT` or `TOUCHDOWN` camera modes.
- [x] Render a directional arrow with a dashed stem and an arrowhead extending outward from the vehicle pointing opposite to velocity.
- [x] Smoothly fade out the arrow when vehicle speed drops below 0.5 m/s.
- [x] Arrow renders cleanly behind or around rocket without obscuring rocket pixel art or ground terrain.
- [x] Visual regression and unit tests verify correct vector calculation and rotation math.
