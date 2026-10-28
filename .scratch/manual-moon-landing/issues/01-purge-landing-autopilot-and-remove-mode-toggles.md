# 01: Purge Landing Autopilot & Remove Mode Toggles

**What to build:**
Moon landing becomes a completely manual, player-controlled flight experience. In Phase 3 (Human Landing), the flight computer never takes over or overrides the player's throttle or steering inputs. The player retains direct, continuous command over engine throttle using W/S/X and attitude steering using A/D. The redundant "EASY" and "NORMAL" landing mode toggle and its launch pad HUD prompt are completely removed, establishing a unified, skill-driven flight model for all players.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Remove `landingAssist`, `brakePlan()`, and automatic throttle/steering overrides from `FlightScene.ts`.
- [x] In Phase 3 landing, holding `W`/`UP` ramps throttle up, `S`/`DOWN` ramps throttle down, and `X` cuts throttle to zero, exactly matching ascent and orbital flight controls.
- [x] Remove `landingMode` property, the `L` key toggle, and the `Landing: EASY ... · L to switch` pad text from `FlightScene.ts` and `progress.ts`.
- [x] Existing unit tests in `progress.test.ts` / `game.test.ts` and `FlightScene` tests updated and passing without regressions.
