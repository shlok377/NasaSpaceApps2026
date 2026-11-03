# 01: Payload mass and objective definitions

**What to build:** Each payload (SATELLITE, ROVER, COCKPIT/crew) has its own mass from game.json and a defined mission objective. The payload card in the lab describes in one short line what the player must do to succeed. Nothing is added to the lab controls menu.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Payload masses in game.json: SATELLITE < ROVER < COCKPIT, counted in rocket mass/TWR
- [ ] Objective per payload exists as data (satellite: orbit+eject, rover: orbit+sprite crash-land, crew: soft landing on site)
- [ ] Payload card description states the success condition
- [ ] Tests, typecheck green
