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

#### 🟣 [Claude] - 2026-11-06 (Moon network — branch `feature/moon-program`, no PR yet)
Deployed satellites and rovers now **stay** and help later flights (`game/moonNetwork.ts`, numbers in `game.json` → `network`).
- A **day = one launch**: a satellite lasts 15, a rover 5. Each launch spends one day on every asset (`spendDay`); flat ones are retired. Saved in `PlayerProgress.assets`; a flight that finishes its objective leaves a new one (satellite on its deployment orbit, rover where it landed in the zone).
- **Scouted landing spots** (`scoutSites`): satellite = 1 spot, rover = 3 spots, up to 9, new places each flight. Narrow (satellite ×0.7, rover ×0.5 of the mission's zone) but every other asset widens them (+25 % each, cap ×2.5). With nothing deployed the old fixed zone is the only spot. The **crew** gets extra width per rover (+40 %) and per satellite (+20 %), and rovers on the Moon switch the boulder surprise off (`PhaseRunner.scouted`).
- **Pick a spot** from orbit: number keys, TAB or click on the orbit map (rover: before the drop; crew: before the final descent). `PhaseRunner.roverZone / landingSite` hold the pick, and **landing in any scouted spot counts** (`extraRoverZones / extraLandingSites`).
- Deployed assets are drawn at half size on the orbit map (`PayloadSprites.updateNetwork`); satellites keep flying their own orbit. Touching one costs 5–10 health once per pass (`checkNetworkCollisions`), and the asset dies: any asset that hits the rocket or another asset falls into the Moon with an explosion and is deleted from the saved list whatever its battery (`doom` / `blowUp`). Name tags (SAT-1, ROV-2) float over each asset; rovers are drawn as big as satellites.
- **Bottom-right panel** (`ui/NetworkPanel.ts`): a satellite icon and a rover icon, each opens its list with the days of battery left, plus total scout spots and coverage of the Moon.
- Not flown by hand over many missions; balance numbers are first guesses.

#### 🟣 [Claude] - 2026-11-05 (Main menu — branch `feature/main-menu`)
New first scene, `src/scenes/MenuScene.ts`: CONTINUE, NEW GAME, FLIGHT SCHOOL, OPTIONS, EXIT (all five always shown; CONTINUE is greyed with no save, NEW GAME asks twice before wiping a save, FLIGHT SCHOOL is a controls guide, OPTIONS has sound and fullscreen, EXIT tries `window.close()`). The rocket stands on a pad in front of the lab's own dusk sky; PLAY/CONTINUE lifts it off and the lab fades in over it.
- **Shared sky**: the backdrop, stars, Moon and sparkles moved to `src/ui/labSky.ts` (`paintLabSky`); `BuilderScene.drawScenery` now just calls it, so menu and lab are pixel-identical and the hand-over has no cut. Gemini: this is the only change to your scene besides `init(data)` + `playMenuIntro()` (fade-in when `fromMenu`).
- **Scripts / tests**: `main.ts` now starts on the menu. Open `/?skipMenu` to land straight in the lab; the `scripts/*.mjs` already do. Typecheck + 144 tests green.
- Not done: no Flight School lesson (guide only), no way back to the menu from the lab.
#### 🟣 [Claude] - 2026-11-05 (Animated payload sprites — branch `feature/sprites`, PR #54)
The temporary static icons are replaced by pixel sprite sheets in the rocket parts' style. Sources and a preview page live in **`animated_sprites/`** (`npm run sprites` rebuilds the sheets and copies them to `public/assets/sprites/`; preview with `python3 -m http.server 8765 --directory animated_sprites`). `typecheck` + 152 tests green; played in headless Chromium.
- **Satellite** (SPACE in a stable orbit): pops out, panels unfold, mast + dish rise (`deploy`), then loops `working` with signal waves.
- **Rover**: the airbag ball is a **still frame** while it falls; the animation starts on touchdown (`land`: squash, two bounces, deflate), then in the zone `deploy` (shell opens) and `drive`; a missed rover only lands and is greyed out.
- **Crew** (after the rocket lands): astronaut beside the rocket's base: `exit`, then `plant` + `wave_flag` on the landing site, or `wave` (no flag) when down safely off the site. The flag is the cyan pennant from `flag_blue.png`.
- Code: `core/spriteSheets.ts` (load + anim keys; clip timings come from each sheet's JSON), `scenes/flight/PayloadSprites.ts` (+ test) draws them; `WorldRenderer` feeds it positions (`MissionOverlay.landedRoverOk`, `.crew`), `FlightScene` sets them on `ROVER_LANDED` / `COMPLETE`. If a sheet is missing, the old still sprite shows.
- The result panel now waits longer after a successful flight (6.5 s satellite, 5.2 s rover and crew) so the animation can play.
- **Orbit gauge** moved from the top centre to a vertical tube on the right (where the HEIGHT tube sits on the climb; they never show together).
- **Satellite ejection**: the satellite is pushed ahead and the spent stage backs off (`phases.satellite` in `game.json`, `deploySatellite`; both pushes are checked so each orbit holds), time runs ×3 so they drift apart, and on the orbit map the gap is stretched (`SATELLITE_PARTING_PX`) so it is easy to see. Satellite sprite is 96 px, crew `CREW_CELLS` 4.5.
- **Open**: the missed-rover and crash cases have no special clip; no sound yet; crew size is `CREW_CELLS` in `WorldRenderer` if it looks too small or big next to big rockets.

#### 🟣 [Claude] - 2026-11-05 (Lab animation: block placement — on `main`)
First lab animation. A newly placed block now starts tucked **behind its parent**, slides to its cell (`PLACE_SLIDE_MS` = 260 ms, `Cubic.easeOut`), then does the old scale bounce and snap burst. Code: `BuilderScene.animatePlacement`, called from `handleLeftClick`. Not visually playtested yet. More lab animations (removal, variant swap) can hang off the same pattern.

#### 🟣 [Claude] - 2026-11-05 (Rock belt rework — branch `fixing_gameplay`)
The SPACE-to-engage **evasive runner is gone** (`game/evasiveRunner.ts`, `game/rocks.ts`, lanes, speed lock, its tests). The belt is now a module, `src/modules/rockBelt/`, and part of the normal flight:
- Rocks spawn ahead of the rocket across its whole view plus a margin (`rockBelt.fieldHalfWidth`), so every flight crosses it; no wrapping or jumping rocks.
- Dodge with throttle timing (W) and RCS nudges (A / D). Edge chevrons warn as before (`warningDistance` unchanged). Time eases to `slowMotion` (60%) inside.
- A small rock costs `smallRockDamage` health; a boulder knocks off the part it hits (the command module takes a part's worth of damage instead of exploding).
- Difficulty 1–5 per launch time (`timeOfDay.*.rockDifficulty`: DAWN 1 … NIGHT 4), numbers in `rockBelt.difficulty`. Hands-off: ~1 hit at dawn, ~3 at night (tested).
- Near misses fixed: the rock no longer vanishes, and a near miss counts only once the rock is behind you, never on a hit.

#### 🟣 [Claude] - 2026-11-04 (Flight challenges — branch `fixing_gameplay`)
Five real-world hurdles on the way to the Moon, each in its own folder under **`src/modules/`** so they stay out of the core mechanics. Numbers and on/off switches: `game.json` → `challenges`. `typecheck` + all tests green.
- **Max-Q** (900–1,500 m): air pressure over `limit` costs health; ease the throttle.
- **Wind shear** (1,800–2,400 m): a gust that flips direction (stronger at windier launch times); leaning past 25° costs health.
- **Staging fault** (first shell separation): may jam; tap its key 3× or the bolts blow (−15 health).
- **Radiation belt** (3,950–4,300 m): readouts scramble, health drains per second (crew ×1.5).
- **Trans-lunar window** (4,350 m to the Moon's pull): a needle shows the predicted Moon pass; off course at the Moon, an automatic correction burn costs fuel.
- Hooks added to `FlightSim` (public, small): `damage()` (health without losing a part, `stats.damageTaken`), `gust`, `spendFuel()`. `ChallengeRunner` is the only thing `FlightScene` talks to. HEIGHT panel shows every band in its colour (lit while inside) and a red "!" where a shell jammed.

#### 🟣 [Claude] - 2026-11-03 (Playtest fixes — branch `fixing_gameplay`)
Played the build in a headless browser against the original brief; fixed what the user flagged. Touched your files again (`RocketTree`, `BuilderScene`). `typecheck` + 135 tests green.
- **RCS mounting**: side-only (LEFT / RIGHT of a part); never on top of or below a part.
- **Shell separation**: each RCS now shows its own open/closed art in flight (was: all opened when any key was pressed). `FlightSim.isShellOpen(id)`.
- **Lab**: payload cards say it in a few words ("Orbit, then eject."); TWIN LEG card shows the bare engine (the shell appears once placed); mission panel follows the chosen payload live (`currentMission(completed, payload)`); tooltip says SEPARATION KEY with a big key box, RCS parts carry a pulsing "!" badge.
- **Hazards are OFF** (`game.json` → `hazards.enabled: false`): none on the way up or on the Moon landing until we tune them. Tests flip the switch on when they need them.
- **Texts per payload**: satellite deploy phase has its own goal chip / hint / banner; crew-only "landed on the site" banner + bullseye; pad verdict judges the payload's own mission; rover chip no longer says "spares: 0".
- **Lab "!" badge** on an RCS disappears once that engine has been hovered.

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
- **Launch time** (`game/timeOfDay.ts`, `game.json` → `timeOfDay`): DAWN / NOON / DUSK / NIGHT picked on the pad with painted sky cards (`ui/SkyCards.ts`). Later = windier (`windScale`), denser rock belt (`rocks`), bigger payout (`reward`). Each time has its own dithered pixel sky (8×8 Bayer blend, no sun) in `LaunchSite.createDaySkyTexture`; night has the Milky Way, a moonlight path.
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
- [x] Rock belt as part of the flight (`src/modules/rockBelt`), difficulty per launch time.
- [x] Payload objectives, rewards, shell separation keys, hull integrity (`fixing_gameplay`).
- [x] Flight challenges in `src/modules/` (max-Q, wind shear, staging fault, radiation belt, trans-lunar window).
- [x] Moon network: deployed assets with batteries, scouted landing spots, bottom-right panel (`feature/moon-program`).
- [ ] Restyle the orbit gauge and problem cards to match the new HUD.
- [x] Animated satellite, rover and crew sprites (`animated_sprites/`, `feature/sprites`).
- [x] Satellite / rover sprites, hazard scheduling, two-step mission HUD.

---

## ⚡ Quick Ground Rules
1. **Keep it simple**: No bureaucracy or heavy processes. Just update the Task Board and write a quick note in the Message Stream.
2. **Never break the build**: Make sure `npm test` and `npm run typecheck` pass before signing off.
3. **Respect domains**: Coordinate in the chat before modifying the other agent's core scene or files.
