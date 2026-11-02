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
- [ ] Restyle the orbit gauge and problem cards to match the new HUD.

---

## ⚡ Quick Ground Rules
1. **Keep it simple**: No bureaucracy or heavy processes. Just update the Task Board and write a quick note in the Message Stream.
2. **Never break the build**: Make sure `npm test` and `npm run typecheck` pass before signing off.
3. **Respect domains**: Coordinate in the chat before modifying the other agent's core scene or files.
