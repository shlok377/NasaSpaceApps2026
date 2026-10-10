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

#### 🟢 [Gemini] - 2026-10-10 (Layout, Centering & HitArea Bugfix)
**Update for Claude**:
- **Fixed Canvas Centering**: Resolved the double-centering bug caused by CSS flexbox on `#game-container` colliding with Phaser's `autoCenter: CENTER_BOTH`. Canvas is now mathematically centered on any viewport resolution.
- **Fixed Interactive HitArea Offset**: Resolved a 44px horizontal offset on palette bay containers caused by passing centered coordinates `[-w/2, -h/2]` into `Container.setInteractive()` instead of `[0, 0, w, h]` (Phaser automatically normalizes container origins by adding `displayOriginX`).
- **Cursor & Ghost Preview Alignment**: Ghost preview locks to hovered cells inside the grid (green for valid attachment, red for invalid, soft outline for unconnected space) with precision `crosshair` cursor. Fixed deletion shake animation bug.
- **Dynamic ScaleManager Bounds Sync**: Added listeners on window resize and scroll to immediately synchronize Phaser's `canvasBounds`.
- **Cockpit Anchor Position**: Moved root Cockpit (`CMD`) 4 blocks down from Row 4 to Row 8 (`Col 7, Row 8`).
- **Verification**: All 11 Vitest unit tests, typechecks, and automated Puppeteer diagnostics 100% green.

#### 🟢 [Gemini] - 2026-10-10 (Enlarged Grid, Parts Picker & High-Readability Fonts)
**Update for Claude**:
- **Enlarged Blueprint Grid**: Scaled grid up to 54px cells across 15 columns and 13 rows ($810 \times 702\text{px}$). Fills the widescreen canvas centered at $(x: 235, y: 9)$.
- **High-Contrast Visible Lines**: Grid lines boosted to sharp `0x273b56` with center axis accent lines (`0x3d5a80`) and outer frame border (`0x47638f`, 2.5px).
- **Enlarged Parts Picker**: Bottom console tray expanded to 128px height with 108x98px bays, 36x36px preview icons, 13px bold text, and 13px hotkey tags.
- **Crystal Clear Typography**: Upgraded all text elements (Telemetry, Status, Stats, Controls guide, Bay labels, and Block labels) to large bold system fonts with dark outline strokes (`strokeThickness: 3`) for 100% contrast against colored blocks and dark blueprint backing.
- **Intentional UI Overlap**: UI panels (HUD and parts tray) now cleanly overlay the grid without blocking grid interactions or cluttering the workspace.
- **Verification**: 100% passing tests (`npm test`, `npm run typecheck`), Puppeteer hotkey/click-placement tests, and visual screenshot confirmation.

#### 🟢 [Gemini] - 2026-10-10 (Physics Engine Handoff to Claude)
**Hey Claude! 🚀 The launchpad is prepped and ready for you to build the Physics & Flight Engine.**

Here's the technical handover and everything you need to hit the ground running:

1. **Rocket Data Contract**:
   - You can get the complete assembled rocket state at any time via:
     - `window.getRocketState()` or `window.__ROCKET_TREE__.getTelemetry()`
     - Schema: `RocketTelemetry` in `src/core/types.ts`:
       ```ts
       {
         valid: boolean,        // true when Cockpit + Fuel Tank + Engine attached and Thrust >= Mass
         partCount: number,     // total active parts
         totalMass: number,     // kg (wet mass)
         totalThrust: number,   // kN
         totalFuel: number,     // L
         twr: number,           // Thrust-to-weight ratio (totalThrust / (totalMass * 0.00981))
         tree: HierarchicalRocketNode // Full tree with part types, gridX, gridY, mass, fuel, thrust
       }
       ```
   - When transitioning from `BuilderScene` to `FlightScene`, you can pass this data via `this.scene.start('FlightScene', { rocketTree, telemetry })`.

2. **Assembly Geometry**:
   - The root Cockpit is anchored at `gridX = 7, gridY = 8`.
   - All parts have relative grid offsets: `dx = node.gridX - 7`, `dy = node.gridY - 8`.
   - In flight, you can reconstruct the rocket container/sprite by placing each part at `(dx * CELL_SIZE, dy * CELL_SIZE)` (using `CELL_SIZE = 54` or your preferred flight scale).
   - Part colors & default properties are in `src/core/partDefinitions.ts`.

3. **Recommended Physics Model**:
   - **Tsiolkovsky / Rocket Equation & Acceleration**:
     - Net Acceleration: $a = \frac{F_{\text{thrust}} - F_{\text{drag}}}{m(t)} - g(h)$
     - Mass depletion: $\dot{m}_{\text{fuel}} = \frac{F_{\text{thrust}}}{I_{sp} \cdot g_0}$ until fuel reaches 0 ($m(t) = m_{\text{dry}} + \text{fuel}(t)$).
   - **Atmospheric Drag**:
     - Drag equation: $F_{\text{drag}} = \frac{1}{2} \cdot \rho(h) \cdot v^2 \cdot C_d \cdot A$
     - Barometric density: $\rho(h) = \rho_0 \cdot e^{-h / H}$ (e.g., scale height $H \approx 8500\text{m}$, Karman line at $100\text{km}$).
   - **Coordinate System**:
     - Keep altitude $h$ in meters (positive upwards) and velocity $v$ in m/s.
     - Map camera/rocket position on canvas relative to altitude.

4. **Flight Scene Hookup**:
   - Add `FlightScene` to `src/main.ts` config: `scene: [BuilderScene, FlightScene]`.
   - In `BuilderScene`, we can launch into `FlightScene` whenever telemetry `valid === true`. Feel free to add a "LAUNCH" button in the HUD or handle the transition however you prefer!
   - All 11 unit tests pass (`npm test`), and typechecking is 100% clean (`npm run typecheck`).

Take it away, fly safe! 🛰️

---

## 📋 Task Board & Progress Tracker

Use `[ ]` for todo, `[/]` for in-progress (`[CLAIMED: GEMINI]` or `[CLAIMED: CLAUDE]`), and `[x]` for completed.

### 🛠️ Rocket Builder & Staging (Gemini)
- [x] Anchored root Cockpit on 15x15 grid with port orientation validation.
- [x] Basic RocketTree attachment logic and Vitest test suite (`src/core/RocketTree.test.ts`).
- [x] Full visual overhaul matching Major Moo retro aesthetic (procedural sprites, mountain scenery, bottom PCB tray).
- [x] Export `FlightVehicle` data contract for the flight simulator scene (`window.getRocketState()` / `RocketTelemetry`).
- [ ] Center of Mass (CoM) and Center of Thrust (CoT) calculations.
- [ ] Staging sequencer (Stage 1, Stage 2, Decouplers).

### 🌌 Flight & Mission Simulation (Claude)
- [/] [CLAIMED: CLAUDE] Create `FlightScene.ts` with launchpad camera and countdown timer.
- [/] [CLAIMED: CLAUDE] Ascent physics loop: gravity, engine thrust curves, atmospheric density/drag.
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
