# 02: TWR Telemetry Pipeline & Scale Mapping Unit Tests

**What to build:** 
A real-time Thrust-to-Weight Ratio (TWR) telemetry pipeline is established between `FlightSim` physics and `FlightScene`. When engines fire, active TWR ($F_{\text{thrust}} / (m \cdot g)$) is tracked; when unpowered or coasting, active TWR is $0.0\times$. A pure mathematical converter maps TWR values to analog needle angles:
- $0.0\times \to -50^\circ$ (idle / coasting)
- $0.0 - 1.0\times \to -50^\circ \text{ to } -25^\circ$ (red zone / underpowered)
- $1.5\times \to 0^\circ$ (center tick / nominal cruising thrust)
- $2.5 - 4.0\times+ \to +25^\circ \text{ to } +50^\circ$ (green zone / peak punch)
Comprehensive unit tests verify angle calculations, boundary clamping, and zero-thrust coasting behavior.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Mathematical mapping function `twrToNeedleAngle(twr: number, throttleActive: boolean): number` created and verified.
- [x] Active TWR telemetry piped from `FlightSim` / `FlightTelemetry` in `FlightScene.ts`.
- [x] Automated Vitest suite created covering all key milestone ratios (0, 0.5, 1.0, 1.5, 2.5, 4.0, 10.0+).
- [x] 100% clean typecheck and test pass (`npm test`, `npm run typecheck`).
