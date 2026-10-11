# 🌌 Particle Systems & VFX Catalog

This directory houses standalone particle and visual effects for both the **Vehicle Assembly Building (VAB)** and the **Flight & Launch Simulation**. It operates completely modularly without modifying existing game logic.

---

## 📋 Comprehensive List of Needed Particle Effects

### 🛠️ 1. Vehicle Assembly Building (VAB / Builder)
| Effect Name | Trigger / Context | Visual Description |
|---|---|---|
| **Socket Snap** (`SOCKET_SNAP`) | Successful part placement on open port | High-tech magnetic burst; cyan/electric-blue sparks and concentric energy ring. |
| **Part Disassembly** (`PART_DISASSEMBLE`) | Right-click leaf part removal | Mechanical decoupling puff; light grey pneumatic smoke and miniature bolts. |
| **Rejection Error** (`REJECTION_ERROR`) | Invalid attachment or parent deletion attempt | Crimson/red electrical zap with warning buzz effect. |
| **VAB Ambient Dust** (`VAB_AMBIENT_DUST`) | Continuous scene background | Subtle floating dust specks catching industrial lighting inside the hangar. |

---

### 🚀 2. Propulsion & Launch Pad (Ascent Physics)
| Effect Name | Trigger / Context | Visual Description |
|---|---|---|
| **Engine Core Plume** (`ENGINE_PLUME`) | Active engine burn | High-velocity continuous gradient flame: white-hot core $\to$ bright yellow $\to$ deep orange/red tail. |
| **Exhaust Smoke Trail** (`ENGINE_SMOKE`) | Atmospheric flight ascent | Dense billows of expanding grey/white smoke lingering and dispersing behind the ascending rocket. |
| **Launchpad Blast Cloud** (`LAUNCHPAD_BLAST`) | T-0 ignition at ground level | Huge horizontal billows of dense steam and fire deflector smoke rolling across the pad floor. |
| **Exhaust Embers & Sparks** (`ENGINE_SPARKS`) | Engine firing under high load | Fast-flickering glowing embers streaming down the plume centerline. |
| **RCS Attitude Control** (`RCS_PUFF`) | Steering adjustments / roll control | Short, crisp bursts of cold white gas jetting sideways from reaction thrusters. |

---

### 💨 3. Aerodynamics & Atmospheric Entry
| Effect Name | Trigger / Context | Visual Description |
|---|---|---|
| **Transonic Vapor Cone** (`MAX_Q_VAPOR`) | Approaching Mach 1 / Max-Q pressure | Prandtl-Glauert condensation collar cone flashing across the rocket fuselage. |
| **Re-entry / High-Speed Plasma** (`REENTRY_PLASMA`) | Extreme velocities inside atmosphere | Glowing atmospheric compression shockwave; orange/red ionization heat shield envelope. |
| **Speed Streaks** (`SPEED_STREAKS`) | High acceleration / terminal ascent | High-velocity vertical wind streaks rushing past the camera viewport. |

---

### 💥 4. Staging, Jettison & Space
| Effect Name | Trigger / Context | Visual Description |
|---|---|---|
| **Stage Separation Blast** (`STAGE_SEPARATION`) | Jettisoning spent booster or lower stage | Explosive bolt flash, small burst of white gas/smoke, and tumbling mechanical debris. |
| **Fairing Jettison** (`FAIRING_JETTISON`) | Leaving dense atmosphere ($> 70\text{km}$) | Pneumatic gas push and gentle spin drift as fairing clamshells release payload. |
| **Orbital Star Dust** (`ORBITAL_STARDUST`) | Space vacuum travel | Micro-meteoroid dust and distant star parallax motes drifting relative to camera velocity. |
| **Cryogenic Venting** (`FUEL_VENTING`) | High-pressure boil-off / pre-ignition | Thin, wispy cold-gas ice crystals venting from tank relief valves. |

---

### ⚠️ 5. Catastrophic Failures
| Effect Name | Trigger / Context | Visual Description |
|---|---|---|
| **RUD Fireball Explosion** (`EXPLOSION_FIREBALL`) | Structural failure, ground impact, or overheat | Expanding fiery fireball core with shockwave flash and heavy black smoke plume. |
| **Explosion Debris** (`EXPLOSION_DEBRIS`) | Catastrophic explosion | Blazing structural metal shards tumbling outward with trailing smoke. |
| **Engine Flameout / Sputter** (`ENGINE_SPUTTER`) | Fuel depletion or insufficient pressure | Erractic dark smoke coughs and sputtering spark bursts before flame extinguishes. |
