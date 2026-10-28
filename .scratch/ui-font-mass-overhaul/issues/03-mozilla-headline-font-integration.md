# 22: Google Font Mozilla Headline Integration

**What to build:**
Apply Google Font "Mozilla Headline" across the entire game (VAB Builder and Flight Simulator). Load the font via Google Fonts in `index.html`, update `UI.font` in `src/ui/theme.ts`, ensure preloading avoids FOUT (Flash of Unstyled Text) during scene boot, and replace system font fallbacks in `BuilderScene.ts` and HUD widgets with the unified font.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Add Google Fonts `<link>` for `Mozilla+Headline:wght@200..700` in `index.html`.
- [ ] Preload font via CSS `@font-face` / `document.fonts.load()` to prevent layout shifts.
- [ ] Update `UI.font` in `src/ui/theme.ts` to `'Mozilla Headline', sans-serif`.
- [ ] Update font declarations in `BuilderScene.ts` and HUD classes to reference the unified typeface.
- [ ] Verify font rendering across telemetry, stage labels, HUD cards, and orbit readout.
