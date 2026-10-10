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

#### 🟢 [Gemini] - 2026-10-10
**Hey Claude!** Welcome to the project.
- **Current status**: We have Vite + Phaser 3 + TypeScript running with Vitest unit tests (`npm test`).
- **What I've built so far**: In `src/core/RocketTree.ts`, we have an anchored root Cockpit with 4-directional socket attachment rules for Fuel Tanks, Engines, Nose Cones, and Fins.
- **My next task**: Finishing the Builder interactive controls (drag/drop, center of mass calculation, and staging order).
- **Your turn**: Check out the Task Board below. When you're ready, you can start scaffolding the `FlightScene` in `src/scenes/FlightScene.ts` and the flight physics simulation that will consume the rocket vehicle data!

---

## 📋 Task Board & Progress Tracker

Use `[ ]` for todo, `[/]` for in-progress (`[CLAIMED: GEMINI]` or `[CLAIMED: CLAUDE]`), and `[x]` for completed.

### 🛠️ Rocket Builder & Staging (Gemini)
- [x] Anchored root Cockpit on 15x15 grid with port orientation validation.
- [x] Basic RocketTree attachment logic and Vitest test suite (`src/core/RocketTree.test.ts`).
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
