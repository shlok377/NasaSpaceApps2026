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

### 📝 Message Stream

<!-- Newest messages at the bottom -->

#### 🟢 [Gemini] - 2026-10-10 (Layout & Centering Overhaul)
**Update for Claude**:
- **Fixed Canvas Centering**: Resolved the double-centering bug caused by CSS flexbox on `#game-container` colliding with Phaser's `autoCenter: CENTER_BOTH`. Canvas is now mathematically centered on any viewport resolution.
- **Widescreen & Layout Geometry**: Scaled to 16:9 widescreen ($1280 \times 720$), centered the building grid ($15 \times 12$ cells @ 40px), removed HUD/grid overlap, and centered the bottom parts tray.
- **Cursor & Ghost Preview Alignment**: Fixed mouse-tracking jitter and pointer offset. Ghost preview cleanly locks to the cell under the cursor inside the grid (green for valid attachment, red for invalid, soft outline for unconnected space) with precision `crosshair` cursor. Fixed deletion shake animation bug.
- **Verification**: Puppeteer automated diagnosis test added in `scripts/diagnose-cursor.mjs`, all 11 Vitest unit tests and TypeScript typechecks 100% green.

---

## 📋 Task Board & Progress Tracker

Use `[ ]` for todo, `[/]` for in-progress (`[CLAIMED: GEMINI]` or `[CLAIMED: CLAUDE]`), and `[x]` for completed.

### 🛠️ Rocket Builder & Staging (Gemini)
- [x] Anchored root Cockpit on 15x15 grid with port orientation validation.
- [x] Basic RocketTree attachment logic and Vitest test suite (`src/core/RocketTree.test.ts`).
- [x] Full visual overhaul matching Major Moo retro aesthetic (procedural sprites, mountain scenery, bottom PCB tray).
- [ ] Center of Mass (CoM) and Center of Thrust (CoT) calculations.
- [ ] Staging sequencer (Stage 1, Stage 2, Decouplers).
- [ ] Export `FlightVehicle` data contract for the flight simulator scene.

### 🌌 Flight & Mission Simulation (Claude)
- [ ] Create `FlightScene.ts` with launchpad camera and countdown timer.
- [ ] Ascent physics loop: gravity, engine thrust curves, atmospheric density/drag.
- [ ] Staging trigger system: spacebar to activate next stage & jettison spent stages.
- [ ] In-flight HUD: altitude, velocity, fuel remaining, apogee tracker.
- [ ] Mission outcome evaluation (Suborbital, Orbit achieved, or Mission Failed report).

### ⚖️ Shared Engineering & Mission Economy
- [ ] Mission resource constraints: Budget ($) vs Mass (kg) vs Delta-V.
- [ ] Mission selection / objectives menu (e.g., Low Earth Orbit, Moon Probe).

---

## ⚡ Quick Ground Rules
1. **Keep it simple**: No bureaucracy or heavy processes. Just update the Task Board and write a quick note in the Message Stream.
2. **Never break the build**: Make sure `npm test` and `npm run typecheck` pass before signing off.
3. **Respect domains**: Coordinate in the chat before modifying the other agent's core scene or files.
