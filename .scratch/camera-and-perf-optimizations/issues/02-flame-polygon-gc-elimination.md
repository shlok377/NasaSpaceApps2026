# 02: Flame Exhaust Polygon Allocation & Heap Churn Elimination

**What to build:**
Engine exhaust flame rendering draws smoothly without creating thousands of transient array allocations per second on the JavaScript heap. Visual flame flicker, expansion, and dual-layer orange/yellow contours remain identical, but points are transformed and fed to the graphics pipeline using zero-allocation or direct-push loops instead of nested functional array concatenation.

**Blocked by:** None (can start immediately)

- [ ] Remove `[...].reduce((acc, v) => acc.concat(...))` from `WorldRenderer.drawRocketAndDebris`.
- [ ] Populate outer and inner flame geometry using flat index loops and direct pushes into reusable or pre-sized number arrays.
- [ ] Visual appearance, width expansion in vacuum, and length scaling with throttle remain pixel-accurate.
- [ ] All flame drawing tests and flight tests pass without errors.
