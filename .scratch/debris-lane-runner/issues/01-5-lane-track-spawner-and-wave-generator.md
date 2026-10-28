# 01: 5-Lane Track Spawner & Telegraphed Wave Generator

**What to build:**
A procedural spawner and configuration for 5 discrete lanes (`[-60m, -30m, 0m, +30m, +60m]`) spanning the rock corridor (2,700m to 3,400m). Rocks spawn organized into telegraphed waves spaced vertically, with every wave guaranteeing at least 1–2 open safe lanes. Pickups (shields and fuel cans) spawn cleanly inside open lanes to reward weaving. Existing random-drift generation is preserved as fallback when the runner is not activated.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] `evasiveRunner` configuration added to `src/config/game.json` defining lanes `[-60, -30, 0, 30, 60]`, wave interval, and safe lane constraints.
- [x] `generateLaneWaves()` procedural generator implemented in `src/game/rocks.ts`.
- [x] Every generated wave between 2,700m and 3,400m has at least 1–2 open safe lanes.
- [x] Pickups (shields and fuel cans) spawn positioned cleanly in open lane corridors.
- [x] Automated unit tests in `src/game/game.test.ts` verify wave intervals, lane alignment, safe corridor guarantees, and pickup placement.
- [x] `npm test` and `npm run typecheck` pass cleanly.
