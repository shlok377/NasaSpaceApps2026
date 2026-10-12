# 10: Cached Vehicle Center of Mass per Substep

**What to build:**
The core physics engine computes vehicle mass properties efficiently by caching the center of mass (`com`) for the duration of each individual physics sub-step. Fuel drainage, stage separation, or rock impacts invalidate the cache, but consecutive aerodynamic torque calculations, thrust line offsets, and ground clearance checks within the same step reuse the pre-calculated coordinates without redundant loops across parts.

**Blocked by:** #15 (06: Physics Substep Cap & Spiral-of-Death Protection)

**Status:** completed

- [x] Cache `CenterOfMass` in `FlightSim` per sub-step, invalidating when fuel drains or parts decouple.
- [x] Eliminate redundant calls to `centerOfMass(this.vehicle, this.tanks)` across torque and lowest point checks.
- [x] Ensure stage dropping, part loss, and fuel exhaustion immediately trigger center of mass updates.
- [x] Physics simulation trajectories, vehicle stability, and unit tests match ground truth 100%.
