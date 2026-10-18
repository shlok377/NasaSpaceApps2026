# 24: Sprite Texture Filtering & SmoothPixelArt Flag Hookup

**What to build:**
Configure all 2D pixel art textures to utilize the Smooth Pixel Art shader pipeline. In `src/core/assets.ts`, set `texture.smoothPixelArt = true` and configure linear texture sampling (`FilterMode.LINEAR` / `0`) on all loaded rocket part and UI pixel art assets. This enables the hardware linear sampler to blend texel boundaries while the GLSL shader clamps texel centers to flat, solid pixel-art colors.

**Blocked by:** 23 (Phaser Smooth Pixel Art WebGL Pipeline Configuration).

**Status:** ready-for-agent

- [ ] Update `src/core/assets.ts` to flag all `GAME_ASSETS` textures with `smoothPixelArt = true`.
- [ ] Set texture filter mode to `LINEAR` (`0`) on pixel-art textures so the derivative shader can perform subpixel seam blending.
- [ ] Verify that sprites in both `BuilderScene` and `WorldRenderer` in `FlightScene` render with fat-pixel anti-aliasing.
- [ ] Maintain clean passing Vitest unit tests and TypeScript typecheck.
