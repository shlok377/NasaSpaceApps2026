# 01: Decouple Analog Dial from Fuel Tank & Declutter Liquid Tank Column

**What to build:** 
The liquid fuel tank in the flight HUD is decluttered into a clean, minimalist glass column. The vintage dial gauge and needle are detached from the fuel level calculations and no longer sit on top of the fuel tank. The fuel tank displays unobstructed sloshing liquid across its full 128px height, a centered percentage readout, and a blinking red border alert when fuel drops below 15%, without any dial overlay or intrusive tick marks.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Detach `gaugeSprite` and `needleSprite` from the liquid fuel column in `src/ui/FuelTank.ts`.
- [x] Fuel sloshing liquid wave and tank outline render cleanly across the full height of the 58x128px container.
- [x] Percentage readout displays cleanly at the bottom of the fuel tank without overlapping graphics.
- [x] Low-fuel red border flashing (<15% remaining) remains functional.
- [x] Unit tests and typechecks pass (`npm test`, `npm run typecheck`).
