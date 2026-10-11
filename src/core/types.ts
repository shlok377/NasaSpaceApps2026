export type PortDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export type PartType =
  | 'COCKPIT'
  | 'FUEL_TANK'
  | 'ENGINE'
  | 'NOSE_CONE'
  | 'FIN'
  | 'STRUCTURAL';

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
