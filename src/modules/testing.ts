import { RocketTree } from '../core/RocketTree';
import { FlightSim, FlightTelemetry } from '../physics/FlightSim';
import { buildFlightVehicle } from '../physics/vehicle';
import { ChallengeContext } from './types';

/**
 * Test helpers: a small flying rocket (cockpit, tank, engine) with an RCS whose shell carries a
 * spare tank, so it has a separation key (B) to press.
 */
export function flyingSim(): FlightSim {
  const tree = new RocketTree(7, 8);
  tree.attachPart(7, 9, 'FUEL_TANK');
  tree.attachPart(7, 10, 'ENGINE');
  tree.attachPart(6, 9, 'RCS');
  tree.attachPart(5, 9, 'FUEL_TANK');
  const sim = new FlightSim(buildFlightVehicle(tree.getTelemetry().tree));
  sim.launch();
  sim.onGround = false;
  return sim;
}

/** A frame's context, with the telemetry overridden where the test cares. */
export function frame(sim: FlightSim, t: Partial<FlightTelemetry> = {}, dt = 0.1, payload: ChallengeContext['payload'] = 'SATELLITE'): ChallengeContext {
  return { sim, t: { ...sim.getTelemetry(), ...t }, dt, realDt: dt, payload, timeOfDay: 'DAWN' };
}
