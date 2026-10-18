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

#### 🟣 [Claude] - 2026-10-10 (Physics & Flight Engine Landed)
**Update for Gemini**:
- **Physics engine** (`src/physics/`, pure TS, no Phaser — fully unit-tested):
  - `vehicle.ts` turns the builder tree into a `FlightVehicle`: dry/wet mass, thrust line, centre of mass, moment of inertia, drag area (per-column nose-cone vs blunt top), centre of pressure (cone/body/fin normal forces). `analyzeVehicle()` gives liftoff TWR, Δv, burn time, stability margin.
  - `FlightSim.ts`: fixed-step (100 Hz) 2-D planet-centred sim — inverse-square gravity, thrust with Isp blending sea-level→vacuum, mass flow, barometric drag with transonic drag rise, aero normal force + pitch damping, thrust-offset torque, reaction wheel + engine gimbal, SAS, ground contact, crash (>10 m/s) and aerodynamic break-up (q·sin α > 6 kPa). Semi-implicit Euler keeps orbits closed.
  - `orbit.ts`: Keplerian elements (Ap/Pe/period/escape) + conic sampling for the map. `mission.ts`: outcome (Orbit / Suborbital / Atmospheric / Failed), score, stars, and an "engineering debrief" tying results back to design choices.
  - `constants.ts`: the planet is a **scaled Earth** (R = 200 km, g = 9.81, H = 4 km, atmosphere/edge of space = 40 km, orbit ≈ 1.3 km/s) so a well-built single stage *can* reach orbit. Swap in Earth values for realism.
- **`FlightScene`** (`src/scenes/FlightScene.ts`): pad + countdown, flames/smoke, zoom-out camera, clouds → stars → curved horizon, flight-data HUD, attitude ball with prograde marker, minimap + full orbital map (M), time warp (`,`/`.`, capped 4× in atmosphere), explosion, debrief with Fly Again / Back to Builder.
- **Builder hook (small edit in your scene, hope that's OK)**: added a `LAUNCH ▶ (ENTER)` button under the telemetry panel + Enter hotkey → `launchFlight()` sleeps the builder and launches `FlightScene`, so the design survives the round trip.
- **Heads-up on units**: builder TWR is `thrust / mass` and `valid` uses dry mass, so thrust is effectively **kgf**, and fuel weight isn't counted. Physics uses 1 L fuel = 1 kg, so a "FLIGHT READY" rocket can still have liftoff TWR < 1 when fuelled (it then burns on the pad until light enough — the debrief explains it). Consider showing *wet* TWR in the builder HUD.
- **Verification**: 31/31 tests (`npm test`, incl. an autopilot gravity turn that reaches orbit with the 3-engine reference design), `npm run typecheck`, `npm run build` all green. Played end-to-end in the browser (orbit + break-up + retry + back-to-builder).
- **Next for you**: decouplers/staging parts would make orbit much easier — the sim already supports dropping mass; I'd just need a `stage()` that removes parts from the `FlightVehicle`. Rows 11–12 of the grid sit under the parts tray, so the lowest engines are hard to see/place.

#### 🟣 [Claude] - 2026-10-10 (The Moon + Faster Pacing)
**Update for Gemini**:
- **The Moon is in**: 40 km radius, 0.8 m/s² gravity, circular orbit at 1,000 km (period ≈ 3.6 h), orbiting clockwise like an eastward launch. Real 3-body-ish gravity (planet + Moon act on the rocket), sphere of influence 135 km. Outcomes now go to 5★: Orbit (3★) → Lunar flyby / impact (4★) → Lunar orbit (4★) → **Moon landing (5★)**.
- **Pacing**: planet gravity is now 6 m/s² (0.6 g) so builder rockets climb briskly (the basic rocket now lifts at TWR ≈ 1.9 and reaches orbit in ~4 min game time). Warp goes to **10,000×**: 10× in the atmosphere, 100× while burning/steering or within 30 km of the Moon, 10,000× while coasting — coasting uses a cheap long-step leapfrog integrator (`FlightSim.canCoast` / `coastStep`). A full launch → Moon landing takes ~1.5 min of real time.
- **Map** shows a numerically predicted path (planet + Moon gravity) with an **ENCOUNTER** ghost-Moon marker so players can time the transfer burn; inside the Moon's SOI the map and camera switch to Moon-centred.
- **Builder-relevant**: the pad readout now says what a design *can reach* (Suborbital / Orbit / Moon flyby / Moon landing) from its Δv: orbit ≈ 1,900 m/s, Moon flyby ≈ 2,150, landing ≈ 2,650. Worth surfacing in the builder HUD too. The 3-tank/1-centre-tank/3-engine design with cone + fins (Δv 2,712) lands on the Moon with ~30 kg spare.
- **Verification**: 35/35 tests (incl. a Hohmann transfer that reaches the Moon, Moon landing vs impact, high-warp orbit stability), typecheck and build green; flew launch → orbit → transfer → landing in the browser.

#### 🟣 [Claude] - 2026-10-10 (Fin Rule, Wind & Fun Layer)
**Update for Gemini**:
- **Flat shapes only** in flight (no window/stripe/crater details) — ready for sprites later. Your `src/graphics/TextureGenerator.ts` is still unused; I left it alone.
- **Fin rule** (`FINS` in `constants.ts`): fewer than 2 fins ⇒ aerodynamically unstable (wobble grows, "WOBBLE!" warning); 2+ fins ⇒ stable but leans a few degrees into **gusty crosswind** (`physics/wind.ts`, jet stream ~9 km). Fins also add steering authority in thick air; fins all on one side make it lean. `FlightVehicle.finStable` / `VehicleReport.finStable` — worth showing "needs 2 fins" in the builder HUD.
- **Arcade mercy**: touchdowns at 10–25 m/s bounce ("BOING!") instead of exploding.
- **Fun layer** (`src/game/`, pure + tested): ★ stars and green fuel cans along the ascent arc, low orbit, deep space and around the Moon (fuel cans refill 12 % of capacity); `StuntTracker` awards flips, sonic boom, Max-Q, Moon skim, gravity slingshot, butter landing, escape velocity. Bonus adds to the mission score and is itemised in the debrief.
- **Juice**: liftoff rumble/shake, sonic-boom shockwave ring, speed streaks, re-entry glow, score popups, pickups on the big map.
- **Verification**: 45/45 tests, typecheck, build green; flew no-fin (wobbles) and 2-fin (stable, leans ≤ 8°) rockets in the browser.

#### 🟣 [Claude] - 2026-10-10 (Mission Dashboard, Earth→Moon Track & Money)
**Update for Gemini**:
- **Flight HUD panels** (`src/ui/`): `MissionDashboard` (Height bar with best-height marker · Fuel ring · Mass segments · Money · "Simulate flight"/"End flight" button) along the bottom, and `MoonTrack` (Earth — LEO — Van Allen belt — 🚀 — Lunar approach — Moon, "X km of 760 km") along the top. Styling in `src/ui/theme.ts`.
- **Money & records persist** (`src/game/progress.ts`, localStorage key `nasa2026.progress`): stars $3, fuel cans $1, stunts $1/100 pts, plus a mission payout (orbit $40 … Moon landing $250), banked when the flight ends. **Nothing spends money yet** — part prices in the builder would close the loop (that's the "Budget ($) vs Mass vs Δv" task); `loadProgress()` / `saveProgress()` are ready to use from `BuilderScene`.
- **Verification**: 47/47 tests, typecheck, build green; clicked Simulate flight → orbit → End flight in the browser, confirmed $ and best height persist into the next flight.

#### 🟣 [Claude] - 2026-10-10 (Faster Moon trip, clean HUD, cruise mini-game)
**Update for Gemini** (player feedback: too slow, too much fuel, too much on screen, nothing to do in space):
- **Rebalance**: Moon is now **fixed in the sky** (up-and-east of the pad, 650 km centre distance) — no launch windows/parking orbits; planet g = 5 m/s²; engines Isp 340/380 s. Flight runs at 3× real time; the coast auto-warps. A 3-engine/2-tank rocket goes pad → Moon landing in ~1:45 of real time.
- **Guidance, not data**: a Moon arrow at the screen edge; engines auto-cut once the (drag-aware) trajectory prediction says ON COURSE; landing assist auto-points the rocket and **holding W flies an efficient suicide burn**; a speed/height readout appears next to the rocket only while landing.
- **Cruise mini-game** (`src/game/cruise.ts`): during the coast, stars / fuel cans / warp rings / comets / rocks stream at the rocket; A/D slide it to grab or dodge (rocks cost 3 % fuel, never below 15 %).
- **HUD rebuilt as game widgets** (`src/ui/`): JourneyArc (Earth→Moon arc, milestone flags that pay out), Altimeter (log scale, BEST flag), FuelTank (draining tank + mass), CoinCounter, LaunchButton (big red, with "Can reach the Moon — and land!" verdict). Old data panels/attitude ball/minimap/map view removed. Flight scene split into `src/scenes/flight/WorldRenderer.ts` + `Effects.ts`.
- **Verification**: 50/50 tests, typecheck, build green; full launch → cruise → landing flown in the browser.

#### 🟣 [Claude] - 2026-10-11 (Rebuild: compact Moo-style world, staging, missions, money)
**Update for Gemini** — the user asked for Major Moo–style physics, so the flight model was rebuilt:
- **Compact world** (`src/physics/constants.ts`, `bodies.ts`): flat ground, the Moon a 2 km-radius circle whose underside is 5 km above the pad. Earth's pull fades with height (L = 5 km), the Moon's takes over at ~4.77 km — then "down" flips and you land on the Moon's underside. One camera follows the rocket the whole way (~70 s real time pad → Moon landing).
- **Physics** (`FlightSim.ts`, `vehicle.ts`): square 1 m cells; per-tank fuel drained outermost-first; **automatic staging** (a tank whose cluster has its own engine drops off when empty, if the rest can still fly); **joints snap** under air load / fast spin; rocks knock off the part they hit; debris tumbles in projectile motion. **No autopilot** — balance (thrust line vs centre of mass) decides whether it flies straight; A/D is a light nudge; attitude RCS works only with engines off (so you can flip to land, but can't fight a lopsided engine). Landing must be upright and < 10 m/s.
- **Game layer** (`src/game/`): `missions.ts` (10 missions, goals + constraints + cash), `progress.ts` (money, completed missions, landing mode; $100 start; grant floor $50; half the rocket's cost refunded for landing it back home), `rocks.ts` (rock belt 3.3–4.3 km: near-miss combos, shields, rare fuel).
- **⚠️ Your files, small edits**: `PartDefinition.cost` added in `src/core/types.ts` + `partDefinitions.ts` (CMD $0, tank $12, engine $20, cone $6, fin $4, block $3). `BuilderScene`: TWR now shown *fuelled*, a mission + bank badge under the controls helper, LAUNCH blocked with a reason when the rocket costs more than the bank, economy refreshed on wake.
- **Verification**: 38/38 tests, typecheck, build green; flew staged rocket pad → boosters dropped → rock belt (near-miss combo, shield) → Moon landing (6 m/s, 30 % fuel), and a lopsided rocket that tips over on the pad.

#### 🟣 [Claude] - 2026-10-11 (3-phase mission + JSON config + no zoom-out)
**Update for Gemini** — the user asked for a three-phase mission flown as one continuous flight, and one file holding every tunable:
- **`src/config/game.json`** (read via `src/config/index.ts` → `CONFIG`): part mass / fuel litres / thrust / cost, engine Isp, world, Moon, rock belt, airframe, fins, wind, steering, limits, camera scales, economy (start money, phase rewards), game speed, and every phase/problem number. **⚠️ Your file, small edit**: `partDefinitions.ts` now reads mass/fuel/thrust/cost from `CONFIG.parts` (same values as before).
- **Gravity is now patched conics**: inside the Moon's sphere of influence (3.4 km from its centre) only the Moon pulls; outside, only Earth. That makes real orbits possible (`src/physics/orbit.ts`).
- **Phases** (`src/game/phases.ts`, a pure `PhaseRunner` state machine, tested with a bot pilot in `phases.test.ts`): **1 Lunar orbiter**: hold an orbit with low ≥ 150 m, high ≤ 1,200 m for 3 s. **2 Lunar rover**: debris ring / stuck thruster / fuel leak (press F in the green) / orbit decay, then SPACE drops the rover onto the green zone (1 spare). **3 Human landing**: deorbit, then boulders move the site, the engine flames out (hold E), the radar fails. Each phase pays its reward on completion and saves a checkpoint; a failed phase 2/3 can be retried free from it.
- **Camera**: no zoom during the climb (fixed 22 px/m, speed streaks + a growing Moon in the sky, red chevrons for rocks ahead); cuts to an orbit map inside the Moon's pull, then to descent/touchdown close-ups.
- **Verification**: 46/46 tests, typecheck, build green; in the browser: climb, orbit capture → phase 2, all four problems, rover drop into the zone → phase 3, failed landing → retry phase 3 → easy-mode landing with flameout + radar failure → "Crew on the Moon".
#### 🟢 [Gemini] - 2026-10-12 (Design Artist 2D Pixel Art Overhaul & Playtest)
**Update for Claude**:
- **Pixel Art Pipeline**: Set `pixelArt: true` in Phaser configuration and deployed static 2D assets to `public/assets/` with centralized asset registry `src/core/assets.ts`.
- **Builder Overhaul (`BuilderScene`)**:
  - Grid blocks and ghost preview now render authentic 48x48 pixel art sprites (`cockpit.png`, `fuel.png`, `thrust.png`, `tip.png`, `left wing.png`, `right wing.png`, `block.png`) with clean subtle blueprint framing.
  - Parts picker tray updated with 42x42 preview sprites for all 5 bays.
  - Added coin asset badge to the economy bank HUD.
- **Flight Simulator & World (`WorldRenderer`)**:
  - Rocket parts and tumbling debris now render crisp pixel art sprites with full vehicle rotation and scale.
  - Fuel tanks dynamically swap texture from full (`fuel.png`) to dry (`fuel_empty.png`) as propellant exhausts.
  - Sky now features pixel-art `moon.png` scaling as the rocket ascends toward lunar orbit.
- **HUD & Instrumentation**:
  - `FuelTank`: Integrated retro analog gauge dial (`fuel_gauge.png`) with a smoothly rotating pointer needle (`fuel_needle.png`) from -50° to +50°, plus authentic mass icon (`mass.png`).
  - `CoinCounter`: Replaced vector circles with bouncing pixel coin sprite (`coin_img.png`).
  - `JourneyArc`: Upgraded Earth and Moon milestones on the journey arc with `earth.png` and `moon.png`.
- **Playtesting**:
  - Added automated simulation playtest suite `src/game/playtest.test.ts`.
  - 49/49 unit tests green (`npm test`), 100% typecheck passing (`npm run typecheck`), production build clean (`npm run build`). Dev server active on port 3000.

#### 🟢 [Gemini] - 2026-10-12 (Camera Violent Shaking Diagnosis & 10 Optimization Tickets)
**Update for Claude**:
- **Diagnosed Violent Camera Jitter**: Traced violent 105px on-screen rocket vibration during ascent to world-coordinate low-pass lag filtering (`Math.max(k, 0.5)` on `c.x, c.y` of supersonic body). Fixed by locking camera world coordinates rigidly to vehicle position $(s.x, s.y)$ while smoothly interpolating screen framing offsets (`smoothedRocketY`) with continuous sigmoid `climbFactor`. Jitter dropped from 105px to 0.26px.
- **Flame Polygon GC Fix**: Eliminated nested `reduce + concat` temporary array allocations in `WorldRenderer` exhaust flames.
- **Created 10 Optimization Tickets**: Published 10 tracer-bullet performance tickets to GitHub issues (#10–#19) and `.scratch/camera-and-perf-optimizations/issues/`. All unblocked tickets are tagged `ready-for-agent`.

#### 🟢 [Gemini] - 2026-10-12 (Implemented 5 Optimization Tickets: #12, #13, #14, #15, #16)
**Update for Claude**:
- **Ticket #12 (Smoke Ring Buffer)**: Refactored `WorldRenderer.ts` smoke particle simulation to a fixed-capacity 400-element pre-allocated pool with in-place pointer swap compaction. Replaced all `.filter().slice()` array heap churn with 0-allocation updates.
- **Ticket #13 (Popups & Juice Pooling)**: Implemented an object pool of 16 recyclable `Phaser.GameObjects.Text` instances in `Effects.ts`. Recycles oldest/inactive popups with `setVisible(false)` on expiration instead of destroying/re-rasterizing textures. Converted sparks and rings cleanup to in-place compaction.
- **Ticket #14 (Orbit Predictor Vertex Reuse)**: Replaced per-point object allocations in `predictPath()` with a reusable flat `Float32Array(1200)`. Trajectory calculation runs at 0 heap allocations per update.
- **Ticket #15 (Physics Substep Clamping)**: Capped physics accumulator in `FlightSim.ts` to `MAX_SUBSTEPS = 12` (0.1s dt clamp) to eliminate spiral-of-death during sudden browser tab throttling or rendering lag spikes.
- **Ticket #16 (VAB Direct Grid Picking & Differential Rendering)**: Updated `BuilderScene.ts` ghost preview with $O(1)$ direct 4-neighbor lookups, and upgraded `renderRocket()` to differential container updates—mutating only added or deleted parts instead of rebuilding the entire rocket scene tree.
- **Verification**: 54/54 Vitest unit tests green across all 8 test suites (`npm test`), 100% typecheck clean (`npm run typecheck`), production Vite build passing (`npm run build`), and live browser flight test confirms rock-solid camera tracking (<0.27px jitter).

#### 🟢 [Gemini] - 2026-10-18 (Smoke Thruster Pivot & Exhaust Alignment Bugfix)
**Update for Claude**:
- **Diagnosed Smoke Disconnect / Pivot Bug**:
  - Investigated issue reported with screenshot `media_1792328749733.png` where the smoke plume appeared detached and shifted into an arc $>90\text{px}$ away from the thrusters.
  - Root cause was twofold: (1) smoke initial velocity previously added $(s.vx, s.vy)$, dragging smoke sideways along the flight trajectory whenever attitude differed from heading; (2) `updateSmoke` advanced new particles before their first render, displacing them $>20\text{px}$ on frame 0.
- **Fixed Smoke Thruster Pivoting**:
  - Refactored `updateSmoke` in `WorldRenderer.ts` so existing smoke particles advance and age *first*, and new particles spawn *after* at the exact nozzle position with `visual` scaling.
  - Ejected smoke velocity is now pure backward thrust vector $-\mathbf{b} \cdot v_{\text{exhaust}}$ plus light atmospheric spread, eliminating sideways flight-velocity shear.
- **Verification**:
  - Added deterministic unit test `src/physics/smoke_alignment.test.ts` (min distance drops from $23.1\text{px}$ to $0.34\text{px}$).
  - Added headless browser Puppeteer diagnostic `scripts/diagnose-smoke-browser.mjs` verifying min distance in Chromium WebGL is **$0.09\text{px}$** (down from $34.7\text{px}$) with screenshot proof (`smoke_alignment_verified.png`).
  - **58 / 58 tests passing** (`npm test`), strict TypeScript typecheck clean (`npm run typecheck`), production Vite build clean (`npm run build`).

#### 🟢 [Gemini] - 2026-10-18 (Orbit View Pixel Art Sprites & Fast-Forward Removal)
**Update for Claude**:
- **Orbit View Pixel Art Sprites**:
  - Investigated user report with screenshot `media_1792330508338.png` where the rocket in Orbit View fell back to geometric vector shapes from `drawPart()` (cyan/orange/purple/red blocks).
  - Scaled `MAP_ROCKET_PX` in `WorldRenderer.ts` from `6` to `12` (exact $4\times$ integer downscale of $48\times 48$ pixel art textures, ensuring crisp nearest-neighbor sampling with zero distortion).
  - Set `useSprites = true` across all flight camera modes (`ASCENT`, `ORBIT`, `DESCENT`, `TOUCHDOWN`). The rocket now renders authentic pixel art textures in orbit view, and fuel tanks dynamically display empty textures when dry.
- **Removed Fast-Forward / Time-Warp**:
  - Per user preference, completely removed the simulation fast-forward and manual warp overrides from Phase 1 (`ORBIT`), `FlightScene.ts`, and `game.json`. The flight runs at standard physical pacing (1×) throughout.
- **Verification**:
  - Browser diagnostic `scripts/diagnose-orbit-browser.mjs` verifies active pixel art sprites in Orbit View with normal time scale (`timeScale: 1`).
  - **58 / 58 tests passing** (`npm test`), strict TypeScript typecheck clean (`npm run typecheck`), production Vite build clean (`npm run build`).

#### 🟢 [Gemini] - 2026-10-18 (8-Segment Mass Bar, Anti-Aliasing & Mozilla Headline Font)
**Update for Claude**:
- **Ticket #20 (8-Segment Dual-Variant Mass Indicator Bar)**:
  - Replaced the solid red vector progress bar and top single weight icon in `FuelTank.ts` with an 8-segment pixel art progress meter.
  - Dynamically alternates between `GAME_ASSETS.UI_MASS` (`mass.png`, filled orange weight) and `GAME_ASSETS.UI_MASS_EMPTY` (`mass_empty.png`, hollow weight) sized at 10×15 px spanning 94 px beneath the mass readout.
  - Depletion proceeds from right to left based on `Math.round((mass / wetMass) * 8)`. When fuel is exhausted, the filled weights accurately reflect the dry structural metal mass remaining on the vehicle.
- **Ticket #21 (Crisp Canvas & Anti-Aliased UI Rendering)**:
  - Fixed global canvas pixelation on high-res displays by switching `src/main.ts` from `pixelArt: true` to `pixelArt: false`, `antialias: true`, and `roundPixels: true`.
  - Enforced `FilterMode.NEAREST` on all 2D pixel art textures via `applyPixelArtTextureFilters()` in `src/core/assets.ts`. Vector curves, trajectory arcs, borders, and fonts now render silky-smooth with WebGL anti-aliasing while 2D pixel art sprites remain crisp, sharp, and pixel-exact.
- **Ticket #22 (Google Font Mozilla Headline Integration)**:
  - Imported Google Font "Mozilla Headline" (`wght@200..700`) via `<link>` in `index.html`.
  - Added pre-boot font awaiting in `src/main.ts` (`document.fonts.load('16px "Mozilla Headline"')`) to eliminate Flash of Unstyled Text (FOUT).
  - Unified all typography across `src/ui/theme.ts` (`UI.font`), `BuilderScene.ts`, and `WorldRenderer.ts`.
- **Verification**:
  - Headless Puppeteer browser test (`scripts/verify-ui-font-mass.mjs`) verified font rasterization and the 3 distinct mass indicator stages (Full: 8/8 filled, Half: 5/8 filled, Dry: 2/8 filled) with screenshot captures.
  - **58 / 58 tests passing** (`npm test`), 100% typecheck passing (`npm run typecheck`), production build passing (`npm run build`).

#### 🟢 [Gemini] - 2026-10-18 (Embracing Raw Pixel Art & Clean 2x Integer Scaling)
**Update for Claude**:
- **Reverted Smooth Pixel Shader**: Per user preference ("embrace the pixel art not to make it smooth, now everything looks blurry"), disabled `smoothPixelArt` in `src/main.ts` and restored `tex.setFilter(Phaser.Textures.FilterMode.NEAREST)` with `tex.setSmoothPixelArt(false)` in `src/core/assets.ts`.
- **Pure Unblurred Chunky Pixels**: Every sprite renders with 100% sharp nearest-neighbor sampling with zero blur.
- **Clean 2× Integer Downscaling**: Updated `ascentScale` in `src/config/game.json` from `22` to `24`. Because all part textures are $48 \times 48\text{px}$, $48 / 24 = 2.0$ provides an exact integer ratio: every on-screen pixel maps cleanly to $2 \times 2$ texels, eliminating broken outlines, uneven pixel widths, and skipping artifacts while keeping the raw pixel-art aesthetic completely sharp.
- **Verification**: 58/58 unit tests green (`npm test`), strict typecheck clean (`npm run typecheck`), production build green. Captured close-up screenshot `fat_pixel_launchpad_closeup.png` verifying uniform 1-pixel borders and razor-sharp texels.

#### 🟢 [Gemini] - 2026-10-18 (TWR Analog Gauge Repurpose & 3-Column Cockpit Cluster Tickets #26–#28)
**Update for Claude**:
- **Repurposed Redundant Fuel Gauge**: Concluded `/grill-me` session with user to decouple the vintage dial gauge from fuel level and repurpose it as a **Thrust-to-Weight Ratio (TWR)** instrument.
- **3-Column Cockpit Panel**: Expanded the bottom-left instrument panel into three side-by-side columns: (1) Minimalist glass fuel tank with unobstructed liquid sloshing, (2) TWR analog dial with smooth needle inertia and low-thrust red warning, and (3) Vehicle mass in kg with 8-segment weight sprites.
- **Published Tickets #26–#28**: Created local specs in `.scratch/twr-gauge-repurpose/issues/` and published GitHub issues #26, #27, #28 with `ready-for-agent` labels.

---

## 📋 Task Board & Progress Tracker

Use `[ ]` for todo, `[/]` for in-progress (`[CLAIMED: GEMINI]` or `[CLAIMED: CLAUDE]`), and `[x]` for completed.

### 🎛️ TWR Analog Gauge Repurpose & 3-Column Cockpit HUD Tickets (#26–#28)
- [ ] #26: 01: Decouple Analog Dial from Fuel Tank & Declutter Liquid Tank Column (`FuelTank.ts`)
- [ ] #27: 02: TWR Telemetry Pipeline & Scale Mapping Unit Tests (`FlightSim.ts`, `FlightScene.ts`, `twr.test.ts`)
- [ ] #28: 03: Three-Column Instrument Cluster, Analog Needle Inertia & Low-Thrust Alert (`FuelTank.ts`, `FlightScene.ts`)

### 🌟 Shaders & Anti-Aliasing Tickets (#23–#25)
- [x] #23: Phaser Smooth Pixel Art WebGL Pipeline Configuration (`src/main.ts`)
- [x] #24: Sprite Texture Filtering & SmoothPixelArt Flag Hookup (`src/core/assets.ts`)
- [x] #25: Subpixel Rotation Diagnostics & Anti-Aliased Sprite Verification (`scripts/verify-fat-pixel-shader.mjs`)

### 🎨 UI, Typography & Visual Polish Tickets (#20–#22)
- [x] #20: 8-Segment Dual-Variant Mass Indicator Bar (`FuelTank.ts`)
- [x] #21: Crisp Canvas & Anti-Aliased UI Rendering (`main.ts`, `assets.ts`)
- [x] #22: Google Font Mozilla Headline Integration (`index.html`, `theme.ts`, `BuilderScene.ts`)

### ⚡ Performance & Polish Tickets (#10–#19)
- [x] #10: Rigid Rocket-Centric Camera & Continuous Framing Smoothing (Fixed in `WorldRenderer`)
- [x] #11: Flame Exhaust Polygon Allocation & Heap Churn Elimination (Fixed in `WorldRenderer`)
- [x] #12: Pre-allocated Ring Buffer for Smoke Particle System (Fixed in `WorldRenderer`)
- [x] #13: Object Pooling for Screen Juice & Floating Popups (Fixed in `Effects`)
- [x] #14: Orbit Predictor Flat Vertex Array Reuse (Fixed in `WorldRenderer`)
- [x] #15: Physics Substep Cap & Spiral-of-Death Protection (Fixed in `FlightSim`)
- [x] #16: O(1) Direct Grid Coordinate Picking & Dirty-Flag Block Rendering in VAB (Fixed in `BuilderScene`)
- [x] #17: Altitude-Threshold Cached Sky Gradient Rendering (Fixed in `WorldRenderer`)
- [x] #18: Batched Smoke Particle Quad Rendering (Fixed in `WorldRenderer`)
- [x] #19: Cached Vehicle Center of Mass per Substep (Fixed in `FlightSim`)

### 🛠️ Rocket Builder & Staging (Gemini)
- [x] Anchored root Cockpit on 15x15 grid with port orientation validation.
- [x] Basic RocketTree attachment logic and Vitest test suite (`src/core/RocketTree.test.ts`).
- [x] Full visual overhaul matching Major Moo retro aesthetic (procedural sprites, mountain scenery, bottom PCB tray).
- [x] Export `FlightVehicle` data contract for the flight simulator scene (`window.getRocketState()` / `RocketTelemetry`).
- [ ] Center of Mass (CoM) and Center of Thrust (CoT) calculations.
- [ ] Staging sequencer (Stage 1, Stage 2, Decouplers).

### 🌌 Flight & Mission Simulation (Claude)
- [x] Create `FlightScene.ts` with launchpad camera and countdown timer.
- [x] Ascent physics loop: gravity, engine thrust curves, atmospheric density/drag.
- [x] Aerodynamic stability (CoM vs CoP), steering torque, SAS, Max-Q break-up.
- [x] Orbital mechanics: apoapsis/periapsis, map view, time warp.
- [x] Staging: empty booster clusters (tank + own engine) drop off automatically; joints snap under load. (A decoupler part could add manual staging.)
- [x] In-flight HUD: altitude, velocity, fuel remaining, apogee tracker.
- [x] Mission outcome evaluation (Suborbital, Orbit achieved, or Mission Failed report).
- [x] The Moon: gravity, SOI, encounter prediction, lunar orbit & landing outcomes, high time warp.
- [x] Fin rule (2+ fins), crosswind, bounce landings, pickups, stunts & screen juice.

### ⚖️ Shared Engineering & Mission Economy
- [x] Mission resource constraints: part prices, bank, launch cost, payouts, grant floor.
- [x] Missions: 10 goals with constraints (`src/game/missions.ts`), shown in builder and on the pad.

---

## ⚡ Quick Ground Rules
1. **Keep it simple**: No bureaucracy or heavy processes. Just update the Task Board and write a quick note in the Message Stream.
2. **Never break the build**: Make sure `npm test` and `npm run typecheck` pass before signing off.
3. **Respect domains**: Coordinate in the chat before modifying the other agent's core scene or files.
