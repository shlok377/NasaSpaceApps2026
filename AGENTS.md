# 🚀 NASA Space Apps 2026 — Agent Collaboration Ground

> **Core Challenge Statement**:
> *"Your challenge is to create an interactive game that allows participants to design, manage, and simulate a complete space mission while making engineering decisions, managing limited resources, and evaluating how each choice shapes the success of their mission."*

---

## 👥 The Two Agents & Division of Labor

| Agent | Lead Domain | Focus Areas |
|---|---|---|
| **Gemini (Antigravity)** | 🛠️ **Rocket Builder & Staging** | Vehicle Assembly Building (VAB), grid placement, part attachment validation, mass/TWR telemetry, staging logic, builder UI. |
| **Claude** | 🌌 **Launch & Flight Simulator** | Physics engine, gravity & atmospheric drag, thrust burn, staging execution, orbital trajectory, mission telemetry HUD & success scoring. |

---

## 💬 Chat & Handoff Board (Talk Here!)

> **Rule for both agents**: Before you start your turn, check the latest message here. When you finish your turn, write a short message below with what you did and what the other agent should pick up next!
>
> The board was cleared on 2026-11-02; older history lives in git (`git log -- AGENTS.md`) and in closed GitHub issues/PRs.

### 📝 Message Stream

#### 🟣 [Claude] - 2026-11-03 (Playtest fixes — branch `fixing_gameplay`)
Played the build in a headless browser against the original brief; fixed what the user flagged. Touched your files again (`RocketTree`, `BuilderScene`). `typecheck` + 135 tests green.
- **RCS mounting**: also allowed on TOP of a part (`finOrientation: 'TOP'`, nozzle up); never below.
- **Shell separation**: each RCS now shows its own open/closed art in flight (was: all opened when any key was pressed). `FlightSim.isShellOpen(id)`.
- **Lab**: payload cards say it in a few words ("Orbit, then eject."); TWIN LEG card shows the bare engine (the shell appears once placed); mission panel follows the chosen payload live (`currentMission(completed, payload)`); tooltip says SEPARATION KEY with a big key box, RCS parts carry a pulsing "!" badge.
- **Hazards are OFF** (`game.json` → `hazards.enabled: false`): none on the way up or on the Moon landing until we tune them. Tests flip the switch on when they need them.
- **Still open** (reported to the user, not yet decided): satellite deploy phase still shows the landing hint/banner text, pad verdict says "3 phases", "spares: 0" on the rover chip.

#### 🟣 [Claude] - 2026-11-03 (Payload objectives, RCS shell keys — branch `fixing_gameplay`)
**Hi Gemini — heads up, I touched your files (RocketTree port/mass/key rules + a lab tooltip).** Tickets in `.scratch/payload-objectives/issues/`. `npm run typecheck` and `npx vitest run` (124 tests) green.
- **Payload = objective** (`PhaseRunner(..., payload)`, `chainFor`): SATELLITE = stable orbit then SPACE ejects it; ROVER = orbit then a one-shot rover drop; CREW = orbit then soft landing. Payload masses in `game.json` → `payloads` (set in `RocketTree.setPayload`). Payload cards say how to win.
- **Rewards**: per-phase payouts (`economy.phaseRewards`), clean/cheap bonus (`economy.objectiveBonus`), mission ladder rewritten around the payload.
- **RCS** (`RocketTree`, `BuilderScene`): mounts only LEFT/RIGHT of other parts; has all four ports of its own. Hovering an RCS in the lab shows a tooltip: press a key to bind its shell-separation key (default B; reserved keys refused; warning if nothing hangs on it). Keys live in `core/separationKeys.ts`; no change to the controls menu.
- **Flight**: shells separate any time with their key (`FlightSim.separate(key)`, `openShells`); a shell with nothing on it is ready from launch. Hull integrity (`game.json` → `hull`) fails the flight at 0.
- **Also**: an open RCS steers in air at `rcs.airFraction` of its space power; no collectible power-ups in the rock belt; hull bar under the goal chip; readouts drift below 50% hull.
- **Hazards on the way up** (`game.json` → `hazards`, `planHazards`): a seeded roll at 3 altitudes (air / space) can trigger a leak, stuck thruster or flameout. The mission HUD follows each payload's own chain; the ejected satellite and falling rover show as sprites in the orbit view.
- **Open**: hazards during lunar orbit for rover/satellite flights, art for the sprites, playtest balance.

#### 🟣 [Claude] - 2026-11-02 (Handover: state of the game after PRs #40 and #49)
**Hi Gemini — here is where everything stands.** Two stacked PRs bring `main` up to date; merge **#40 first, then #49** (GitHub retargets #49 to `main` once #40 lands). Neither touches the same lines as `main`, so both merge clean. `npm run typecheck` and `npx vitest run` (101 tests) are green.

**Rocket Lab (`BuilderScene`, your domain — I made UI-only edits):**
- Retro pixel reskin (`src/ui/pixel.ts`: `PX` palette, Press Start 2P + VT323, stepped panels).
- Part variants: fuel KEROSENE / METHANE / HYDROGEN, engine STANDARD / TWIN / LANDER, payload COCKPIT / SATELLITE / ROVER, each with `extraCost` (`partDefinitions.ts`, `partCost`, `rocketCost`). Picked from a card fan on hover; C cycles the payload; BLOCK is selected on open.
- Fix: `RocketTree` ids are now a monotonic counter (removing then adding a part no longer reuses ids).

**Launch & flight (my domain):**
- **Seaside spaceport** (`flight/LaunchSite.ts`): unique centre piece (pad, complex, cliff, lighthouse) plus endless land tiles west, sea tiles east, pixel dirt / deep water below. `WorldRenderer.drawSiteLife` animates flags, sea glints, birds, pad steam and night lamps; `drawPad` draws the gantry.
- **Launch time** (`game/timeOfDay.ts`, `game.json` → `timeOfDay`): DAWN / NOON / DUSK / NIGHT picked on the pad with painted sky cards (`ui/SkyCards.ts`). Later = windier (`windScale`), denser rock belt (`rocks`), bigger payout (`reward`). Each time has its own dithered pixel sky (8×8 Bayer blend, no sun) in `LaunchSite.createDaySkyTexture`; night has the Milky Way, a moonlight path and a distant storm front.
- **Flight HUD** (`ui/CornerHud.ts`): goal panel top-left, money top-right, a tall **ROCKET** column bottom-left (per-tank capsule fuel tanks in fuel colours that drop out on staging, lift dial, attitude horizon, mass) and a tall **HEIGHT** tube on the right. Both columns are ~55 % see-through. The mission result panel keeps its classic look (`CLASSIC_TEXT_STYLE`).
- **Rock belt** (`game/rocks.ts`, `game.json` → `rockBelt` / `evasiveRunner`): now 2.7–3.9 km, ~30 s, 5 lanes. Climb speed ramps 63 → 90 m/s (`runnerSpeedAt`, `beltTimeAt`), ~2.5× more rocks at random heights, drifters from mid-belt, two-lane boulders, shields removed, always one reachable route (tested). Crashing into the sea splashes instead of exploding.

**Good next steps for you:**
- [ ] Staging sequencer / decoupler part (the flight sim already drops boosters automatically).
- [ ] Centre of mass / centre of thrust markers in the lab.
- [ ] Show each part variant's effect in the lab (e.g. HYDROGEN = more Δv) — today variants only change cost and looks.

---

## 📋 Task Board & Progress Tracker

Use `[ ]` for todo, `[/]` for in-progress (`[CLAIMED: GEMINI]` or `[CLAIMED: CLAUDE]`), and `[x]` for completed.

### 🛠️ Rocket Builder (Gemini)
- [ ] Staging sequencer and decoupler part.
- [ ] CoM / CoT markers in the lab.
- [ ] Gameplay effects for fuel / engine / payload variants.

### 🌌 Flight & Mission (Claude)
- [x] Seaside spaceport, endless scenery, launch time of day, pixel skies.
- [x] Corner flight HUD with ROCKET and HEIGHT columns.
- [x] Fast staggered rock belt with boulders and drifters.
- [x] Payload objectives, rewards, shell separation keys, hull integrity (`fixing_gameplay`).
- [ ] Restyle the orbit gauge and problem cards to match the new HUD.
- [x] Satellite / rover sprites, hazard scheduling, two-step mission HUD.

---

## ⚡ Quick Ground Rules
1. **Keep it simple**: No bureaucracy or heavy processes. Just update the Task Board and write a quick note in the Message Stream.
2. **Never break the build**: Make sure `npm test` and `npm run typecheck` pass before signing off.
3. **Respect domains**: Coordinate in the chat before modifying the other agent's core scene or files.
