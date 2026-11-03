# 02: Flight follows the chosen objective

**What to build:** The flight no longer runs all three phases. Satellite: stable orbit, then SPACE ejects the rest of the rocket and spawns a temporary satellite sprite. Rover: stable orbit, then a temporary sprite separates and crash-lands in the target zone at any speed (mission ends on landing). Crew: soft touchdown on the marked site. Sprites are placeholders for now.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Each payload ends the flight on its own success/fail condition
- [ ] Result screen shows the objective outcome
- [ ] Tests for the three objective chains
