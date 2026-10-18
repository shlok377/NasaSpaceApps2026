# 05: Major-Moo Physical Collisions, Combos & Seamless Exit Restoration

**What to build:**
Completes the full gameplay loop for the Debris Challenge. When a rock collides with the vehicle in runner mode, an outer part is sheared off into physical tumbling debris (or absorbed if an active shield was collected). Passing near rocks without touching awards near-miss combo multipliers. Upon ascending past 3,400m altitude, the runway lines cleanly fade out, simulation speed smoothly accelerates from 35% back to 100%, camera tracking returns to normal vehicle centering, and an alert banner celebrates: `DEBRIS CLEARED // FULL THRUST RESTORED`.

**Blocked by:** 04: Snappy 120ms Lane-Shifting Controls & Thruster FX (#32)

**Status:** completed

- [x] Direct rock collisions shear off outer vehicle parts using `sim.hitPart()`, spawning tumbling debris pieces.
- [x] Active shields absorb collisions with burst particle ring, preserving rocket integrity.
- [x] Near misses in runner mode increment combo counters and popup awards.
- [x] Crossing 3,400m altitude deactivates runner mode and smoothly restores time scale to 1.0.
- [x] Dotted runway lines fade out, and camera seamlessly transitions back to vehicle tracking.
- [x] Banner displays `DEBRIS CLEARED // FULL THRUST RESTORED` upon exit.
- [x] End-to-end flight tests verify complete sequence from entry prompt, runner dodging, to clean orbital exit.
- [x] `npm test`, `npm run typecheck`, and `npm run build` all pass 100% green.
