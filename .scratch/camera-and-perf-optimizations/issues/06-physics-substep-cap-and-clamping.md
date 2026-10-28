# 06: Physics Substep Cap & Spiral-of-Death Protection

**What to build:**
The physics simulation loop is protected against catastrophic frame hitches ("spiral of death"). When the browser tab loses focus, encounters a garbage-collection pause, or runs at high time-warp speeds ($10\times$), the fixed-step physics accumulator enforces an upper bound on substeps per rendered frame rather than running unbounded iterations.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Clamp `this.accumulator` in `FlightSim.advance()` to a safe upper limit (e.g., maximum 12–15 substeps, equivalent to $\sim 0.125\text{s}$).
- [x] Ensure high time-warp rates in space continue to simulate deterministically without locking the main thread.
- [x] Prevent simulation clock drift during normal 60 FPS gameplay.
- [x] Existing flight physics tests pass with zero regressions.
