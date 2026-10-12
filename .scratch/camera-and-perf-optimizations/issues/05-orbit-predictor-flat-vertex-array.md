# 05: Orbit Predictor Flat Vertex Array Reuse

**What to build:**
When viewing the lunar orbit map, future Keplerian and patched-conics trajectory paths update smoothly every 120ms without allocating hundreds of temporary point objects. Trajectory forecasting executes 500 integration steps directly into a reusable flat coordinate array, eliminating heap churn while maintaining sub-meter orbit accuracy.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Replace dynamic `const pts = [{ x, y }]` point object array allocation in `WorldRenderer.predictPath` with a pre-allocated flat array or typed array (`Float32Array(1000)`).
- [x] Maintain an explicit vertex count or length tracker for rendering the path line segments.
- [x] Ground collision and Sphere of Influence exit condition checks remain fully functional.
- [x] Trajectory rendering visual quality on the orbital map remains identical.
