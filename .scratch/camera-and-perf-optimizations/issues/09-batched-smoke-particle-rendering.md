# 09: Batched Smoke Particle Quad Rendering

**What to build:**
Exhaust smoke during liftoff and ascent renders as a single batched GPU draw call rather than issuing hundreds of individual canvas vector circle calls per frame. Up to 400 smoke puffs billow, drift, and fade behind active engines with crisp pixel-art aesthetics while maintaining silky 60 FPS performance on lower-power devices.

**Blocked by:** #12 (03: Pre-allocated Ring Buffer for Smoke Particle System)

**Status:** completed

- [x] Migrate `WorldRenderer`'s smoke puff rendering from `g.fillCircle()` loop into a Texture Sprite Batch quad pool.
- [x] Align particle positions and velocities with rocket exhaust and atmospheric wind shear.
- [x] Maintain particle alpha decay and radial expansion matching original physics curves.
- [x] Collapse hundreds of separate canvas draw commands down to a single GPU batch.
