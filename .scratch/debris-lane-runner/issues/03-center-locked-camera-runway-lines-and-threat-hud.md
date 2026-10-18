# 03: Center-Locked Camera, Retro Runway Lines & Threat HUD

**What to build:**
During Evasive Runner mode, the camera locks its horizontal focus to the corridor center (`c.x = 0`) rather than chasing the rocket's lateral position. The world renderer displays clean retro dotted runway lines along each of the 5 lanes from screen top to bottom. Warning chevrons flash at the top of incoming threat lane columns, giving the player intuitive telegraphing to identify safe lanes well in advance.

**Blocked by:** 02: Manual Space Prompt & Bullet-Time Activation Flow (#30)

**Status:** completed

- [x] Camera horizontal position locks firmly to `x = 0` during Evasive Runner mode while smoothly maintaining vertical ascent framing.
- [x] 5 discrete vertical lanes render with subtle retro dotted runway lines spanning across the screen viewport.
- [x] Top warning chevrons render dynamically above lane columns that contain incoming rocks within the warning window.
- [x] Safe open lanes remain uncluttered and distinct from threat lanes.
- [x] `npm test` and `npm run typecheck` pass cleanly.
