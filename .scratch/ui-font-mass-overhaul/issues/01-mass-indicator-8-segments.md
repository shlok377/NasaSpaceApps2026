# 20: 8-Segment Dual-Variant Mass Indicator Bar

**What to build:**
Replace the solid red rectangular progress bar in the flight HUD's mass card with an 8-segment pixel art meter made of `mass.png` (filled orange weight) and `mass_empty.png` (hollow weight). The meter spans 94 px directly beneath the mass readout text, turning empty from right to left based on `Math.round((mass / wetMass) * 8)`. The redundant single weight icon at the top of the card is removed.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Remove existing red vector fill rect and top single mass icon from `FuelTank.ts`.
- [ ] Add 8 image sprites sized at 10×15 px with a 2px gap at `(x + 82, y + 80)`.
- [ ] Update sprite textures on every frame: indices 0 to `activeCount - 1` use `UI_MASS.key`, and remaining indices use `UI_MASS_EMPTY.key`.
- [ ] Preserve dry mass display: remaining dry metal mass leaves the appropriate number of filled icons when fuel reaches zero.
- [ ] Vitest unit tests and browser visual verification passing.
