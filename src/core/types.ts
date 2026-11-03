export type PortDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export type PartType =
  | 'COCKPIT'
  | 'FUEL_TANK'
  | 'ENGINE'
  | 'NOSE_CONE'
  | 'FIN'
  | 'RCS'
  | 'STRUCTURAL';

/**
 * What a tank holds. Kerosene and liquid hydrogen feed the boosters (ENGINE parts);
 * cold gas only feeds the RCS thrusters that steer in space.
 */
export type FuelKind = 'KEROSENE' | 'HYDROGEN' | 'COLD_GAS';

/** What sits in the root slot in place of the crew cockpit (builder UI only for now). */
export type PayloadKind = 'CREW' | 'SATELLITE' | 'ROVER';

export interface PartDefinition {
  type: PartType;
  label: string;
  defaultPorts: PortDirection[];
  mass: number;
  fuel: number;
  thrust: number;
  /** Price in the builder ($). */
  cost: number;
  color: number;
  textureKey: string;
}

export interface RocketNode {
  id: string;
  type: PartType;
  gridX: number;
  gridY: number;
  parentId: string | null;
  parentPort: PortDirection | null;
  childrenIds: string[];
  /** Fins sit LEFT or RIGHT; an RCS can also sit on TOP of a part. */
  finOrientation?: 'LEFT' | 'RIGHT' | 'TOP';
  fuelKind?: FuelKind;
  payload?: PayloadKind;
  /** RCS only: the key that separates this shell in flight (default B). */
  separationKey?: string;
  mass: number;
  fuel: number;
  thrust: number;
}

export interface HierarchicalRocketNode extends RocketNode {
  children: HierarchicalRocketNode[];
}

export interface RocketTelemetry {
  valid: boolean;
  partCount: number;
  totalMass: number;
  totalThrust: number;
  totalFuel: number;
  /** Fuel on board in kg (litres × each fuel's density). */
  totalFuelMass: number;
  /** Total push at liftoff, after each fuel's push multiplier. */
  liftoffThrust: number;
  twr: number;
  /** Why the rocket can't fly yet (empty when it can). */
  missing: string;
  tree: HierarchicalRocketNode;
}
