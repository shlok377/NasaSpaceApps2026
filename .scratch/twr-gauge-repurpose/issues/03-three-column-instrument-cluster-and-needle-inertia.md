# 03: Three-Column Instrument Cluster, Analog Needle Inertia & Low-Thrust Alert

**What to build:** 
The bottom-left instrument HUD is widened into a balanced three-column cockpit panel:
1. Column 1: Minimalist Fuel Tank (clean glass column, sloshing liquid, percentage).
2. Column 2: TWR Dial (vintage gauge dial, needle with smooth exponential spring inertia, digital ratio text `TWR 2.1×` / `0.0×`, and subtle glowing red warning text `LOW` if engines are active but TWR < 1.0).
3. Column 3: Vehicle Mass ('MASS' header, formatted kg readout, 8-segment mass progress icons).
The needle smoothly sweeps up when throttling or staging, and glides back to rest at 0 when coasting in space.

**Blocked by:** 
- #26 (01: Decouple Analog Dial from Fuel Tank & Declutter Liquid Tank Column)
- #27 (02: TWR Telemetry Pipeline & Scale Mapping Unit Tests)

**Status:** completed

- [x] Instrument backdrop enlarged to ~304px width with three cleanly separated columns.
- [x] TWR gauge and rotating needle mounted in Column 2 with 'TWR' header and live ratio text.
- [x] Needle dynamics implemented with smooth exponential smoothing (`currentAngle += (targetAngle - currentAngle) * dt * damping`).
- [x] Subtle glowing red alert (`LOW`) activates when engines are firing with TWR < 1.0.
- [x] Mass column cleanly positioned in Column 3 with responsive 8-segment mass indicators.
- [x] End-to-end flight test and automated test suite pass (`npm test`, `npm run typecheck`, `npm run build`).
