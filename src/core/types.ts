export type PortDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export type PartType =
  | 'COCKPIT'
  | 'FUEL_TANK'
  | 'ENGINE'
  | 'NOSE_CONE'
  | 'FIN'
  | 'STRUCTURAL';

/** Cosmetic fuel choice for a tank (builder UI only for now). */
export type FuelKind = 'STANDARD' | 'GREEN' | 'PURPLE';

/** Cosmetic engine choice (builder UI only for now). */
export type EngineKind = 'STANDARD' | 'TWIN' | 'LANDER';

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
  finOrientation?: 'LEFT' | 'RIGHT';
  fuelKind?: FuelKind;
  engineKind?: EngineKind;
  payload?: PayloadKind;
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
  twr: number;
  tree: HierarchicalRocketNode;
}
