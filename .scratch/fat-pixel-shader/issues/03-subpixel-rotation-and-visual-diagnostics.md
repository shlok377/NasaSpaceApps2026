# 25: Subpixel Rotation Diagnostics & Anti-Aliased Sprite Verification

**What to build:**
Create an automated browser diagnostic test using Puppeteer that inspects the rocket rendering on the launchpad at $22\text{px}$ scale and during pitch rotation ($15^\circ$ gravity turn). Capture high-resolution close-ups to confirm that jagged staircases, missing outline segments, and rotational shimmering are eliminated while maintaining crisp, chunky pixel-art styling.

**Blocked by:** 24 (Sprite Texture Filtering & SmoothPixelArt Flag Hookup).

**Status:** ready-for-agent

- [ ] Create `scripts/verify-fat-pixel-shader.mjs` using Puppeteer.
- [ ] Capture launchpad close-up screenshot showing uniform outline thickness on scaled-down sprites.
- [ ] Capture rotated in-flight screenshot ($15^\circ$ tilt) verifying smooth subpixel edges without jagged nearest-neighbor steps.
- [ ] Document before-and-after visual comparisons in `walkthrough.md`.
- [ ] Verify all 58 unit tests, typecheck, and production build remain 100% green.
