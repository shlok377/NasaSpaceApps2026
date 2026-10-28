# 23: Phaser Smooth Pixel Art WebGL Pipeline Configuration

**What to build:**
Enable the native WebGL "Fat Pixel" anti-aliasing pipeline (`smoothPixelArt: true`) in Phaser's game render configuration. This configures the WebGL batch pipeline with the derivative-based `getBlockyTexCoord` shader addition (`GL_OES_standard_derivatives`), preserving blocky retro pixels while applying 1-pixel subpixel anti-aliasing across pixel boundaries and diagonal silhouette edges.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Enable `smoothPixelArt: true` in `render` game configuration in `src/main.ts`.
- [ ] Ensure `antialias: true` and `antialiasGL: true` are enabled so hardware blending and multisampling are active.
- [ ] Ensure WebGL context loads with standard derivatives enabled without console errors.
- [ ] Verify test suite and TypeScript typecheck pass cleanly.
