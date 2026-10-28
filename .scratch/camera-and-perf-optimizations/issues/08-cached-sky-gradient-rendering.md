# 08: Altitude-Threshold Cached Sky Gradient Rendering

**What to build:**
The background atmospheric sky renders efficiently without forcing expensive software canvas gradient redraws across the entire $1280 \times 720$ canvas every frame. Sky gradient transitions from sea-level cyan to deep space navy-black smoothly as the vehicle ascends, re-evaluating gradient steps only when altitude shifts noticeably ($>50\text{m}$), cutting CPU/GPU fillrate load.

**Blocked by:** #10 (01: Rigid Rocket-Centric Camera & Continuous Framing Smoothing)

**Status:** completed

- [x] Cache sky gradient rendering to avoid clearing and repainting full-canvas gradients each frame.
- [x] Update sky gradient only when altitude changes by an intentional threshold or upon camera mode cut.
- [x] Maintain atmospheric blending transitions seamlessly into orbital starspace.
- [x] Celestial pixel art moon scaling and alpha fading remain correctly positioned.
