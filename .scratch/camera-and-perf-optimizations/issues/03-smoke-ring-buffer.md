# 03: Pre-allocated Ring Buffer for Smoke Particle System

**What to build:**
Smoke puff emission and lifecycle updates during atmospheric climb run with zero per-frame array allocations. Exhaust plumes can sustain up to 400 active particles without triggering V8 garbage collection pauses, replacing `Array.prototype.filter()` and `Array.prototype.slice()` with an in-place two-pointer compaction or circular ring buffer.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Replace `this.smoke = this.smoke.filter(...).slice(-400)` with an in-place active array or circular ring buffer pool.
- [x] Ensure particles age, damp, drift, and fade out smoothly over their randomized lifetimes.
- [x] No temporary array instances are created during `updateSmoke` per frame.
- [x] Smoke behavior and visual count remain identical in flight simulator.
