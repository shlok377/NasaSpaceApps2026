# 21: Crisp Canvas & Anti-Aliased UI Rendering

**What to build:**
Resolve the global canvas pixelation issue across vector curves, HUD panels, and text while preserving pixel-perfect nearest-neighbor filtering on 2D pixel art sprites. Change Phaser game configuration in `src/main.ts` from `pixelArt: true` to `pixelArt: false, antialias: true`, and explicitly enforce `Phaser.Textures.FilterMode.NEAREST` on loaded pixel art textures in `src/core/assets.ts`.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Change `pixelArt: false` and enable `antialias: true` in `src/main.ts`.
- [ ] In `src/core/assets.ts`, implement a texture filter pass that sets `FilterMode.NEAREST` on all loaded pixel art textures (`GAME_ASSETS`).
- [ ] Ensure canvas CSS does not force `image-rendering: pixelated` on high-resolution displays.
- [ ] Verify that UI curves, fonts, and borders render smooth anti-aliased edges while pixel-art sprites retain sharp, unblurred pixels.
