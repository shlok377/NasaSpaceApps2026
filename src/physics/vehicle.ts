import { HierarchicalRocketNode, PartType } from '../core/types';
import { AIRFRAME, ENGINE, FINS, G0, PROPELLANT_DENSITY, WORLD } from './constants';

/** One part placed in the vehicle's body frame (origin at the command module). */
export interface FlightPart {
  id: string;
  type: PartType;
  gridX: number;
  gridY: number;
  finOrientation?: 'LEFT' | 'RIGHT';
  /** The part this one is bolted to (null for the command module). */
  parentId: string | null;
  /** Joints between this part and the command module. */
  depth: number;
  /** Lateral position (m, + to the right of the cockpit). */
  u: number;
  /** Axial position (m, + towards the nose). */
  a: number;
  dryMass: number; // kg
  fuelCapacity: number; // kg
  thrust: number; // N
  /** Normal-force coefficient for centre-of-pressure / aero torque. */
  normalForceCoeff: number;
}

export interface AeroSurface {
  a: number;
  cn: number;
}

export interface CenterOfMass {
  u: number;
  a: number;
}

/** Fuel held by each tank, keyed by part id (kg). */
export type TankFuel = ReadonlyMap<string, number>;

/** Everything the physics loop needs to know about a (possibly partial) rocket. */
export interface FlightVehicle {
  parts: FlightPart[];
  rootGridX: number;
  rootGridY: number;
  dryMass: number;
  fuelCapacity: number;
  wetMass: number;
  engineCount: number;
  thrust: number; // N, all engines at full throttle
  maxMassFlow: number; // kg/s at full throttle
  /** Thrust line, in body frame. */
  thrustU: number;
  thrustA: number;
  /** Drag area Cd·A (m²) before Mach and angle-of-attack corrections. */
  dragArea: number;
  referenceArea: number;
  aeroSurfaces: AeroSurface[];
  hasNoseCone: boolean;
  finCount: number;
  leftFins: number;
  rightFins: number;
  /** Nose-to-tail length (m). */
  length: number;
  /** Game rule: enough fins to fly straight (see FINS.minimumForStability). */
  finStable: boolean;
  hasCommandModule: boolean;
}

/** Design-time numbers shown on the launch pad and used by missions. */
export interface VehicleReport {
  partCount: number;
  wetMass: number;
  dryMass: number;
  fuelMass: number;
  liftoffTwr: number;
  deltaV: number; // m/s, single stage, no staging
  burnTime: number; // s at full throttle
  /** Worst lateral gap between thrust line and centre of mass over the burn (m). 0 = balanced. */
  thrustOffset: number;
  finCount: number;
  finStable: boolean;
  /** Booster stages that will drop off on their own when empty. */
  stageCount: number;
}

function normalForceFor(type: PartType): number {
  if (type === 'NOSE_CONE') return AIRFRAME.normalForceNoseCone;
  if (type === 'FIN') return AIRFRAME.normalForceFin;
  return AIRFRAME.normalForceBody;
}

function flatten(node: HierarchicalRocketNode, depth: number, out: Array<[HierarchicalRocketNode, number]>): void {
  out.push([node, depth]);
  for (const child of node.children) flatten(child, depth + 1, out);
}

/** Turn the builder's tree into flight parts. */
export function partsFromTree(tree: HierarchicalRocketNode): FlightPart[] {
  const nodes: Array<[HierarchicalRocketNode, number]> = [];
  flatten(tree, 0, nodes);
  return nodes.map(([node, depth]) => ({
    id: node.id,
    type: node.type,
    gridX: node.gridX,
    gridY: node.gridY,
    finOrientation: node.finOrientation,
    parentId: node.parentId,
    depth,
    u: (node.gridX - tree.gridX) * AIRFRAME.columnSpacing,
    a: -(node.gridY - tree.gridY) * AIRFRAME.cellLength,
    dryMass: node.mass,
    fuelCapacity: node.fuel * PROPELLANT_DENSITY,
    thrust: node.thrust * G0,
    normalForceCoeff: normalForceFor(node.type)
  }));
}

/** Build a vehicle from any set of parts (the whole rocket, or what's left after staging). */
export function buildVehicle(parts: FlightPart[], rootGridX: number, rootGridY: number): FlightVehicle {
  let dryMass = 0;
  let fuelCapacity = 0;
  let thrust = 0;
  let thrustU = 0;
  let thrustA = 0;
  let engineCount = 0;
  for (const p of parts) {
    dryMass += p.dryMass;
    fuelCapacity += p.fuelCapacity;
    if (p.thrust > 0) {
      thrust += p.thrust;
      thrustU += p.u * p.thrust;
      thrustA += p.a * p.thrust;
      engineCount++;
    }
  }
  if (thrust > 0) {
    thrustU /= thrust;
    thrustA /= thrust;
  }

  // Drag: every body column presents one reference area; its topmost part
  // decides whether the airflow meets a nose cone or a blunt face.
  const topOfColumn = new Map<number, FlightPart>();
  for (const p of parts) {
    if (p.type === 'FIN') continue;
    const top = topOfColumn.get(p.gridX);
    if (!top || p.gridY < top.gridY) topOfColumn.set(p.gridX, p);
  }
  const finCount = parts.filter(p => p.type === 'FIN').length;
  const leftFins = parts.filter(p => p.type === 'FIN' && p.finOrientation === 'LEFT').length;
  const rows = parts.map(p => p.gridY);
  const length = parts.length > 0 ? (Math.max(...rows) - Math.min(...rows) + 1) * AIRFRAME.cellLength : 0;
  let dragArea = 0;
  for (const top of topOfColumn.values()) {
    dragArea += (top.type === 'NOSE_CONE' ? AIRFRAME.cdNoseCone : AIRFRAME.cdBlunt) * AIRFRAME.columnReferenceArea;
  }
  dragArea += finCount * AIRFRAME.cdPerFin * AIRFRAME.columnReferenceArea;

  return {
    parts,
    rootGridX,
    rootGridY,
    dryMass,
    fuelCapacity,
    wetMass: dryMass + fuelCapacity,
    engineCount,
    thrust,
    maxMassFlow: thrust / (ENGINE.isp * G0),
    thrustU,
    thrustA,
    dragArea,
    referenceArea: AIRFRAME.columnReferenceArea,
    aeroSurfaces: parts.map(p => ({
      a: p.type === 'FIN' ? p.a - AIRFRAME.finPressureOffset : p.a,
      cn: p.normalForceCoeff
    })),
    hasNoseCone: parts.some(p => p.type === 'NOSE_CONE'),
    finCount,
    leftFins,
    rightFins: finCount - leftFins,
    length,
    finStable: finCount >= FINS.minimumForStability,
    hasCommandModule: parts.some(p => p.type === 'COCKPIT')
  };
}

export function buildFlightVehicle(tree: HierarchicalRocketNode): FlightVehicle {
  return buildVehicle(partsFromTree(tree), tree.gridX, tree.gridY);
}

/** A part and everything bolted to it, further from the command module. */
export function subtreeIds(parts: readonly FlightPart[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of parts) {
      if (p.parentId !== null && ids.has(p.parentId) && !ids.has(p.id)) {
        ids.add(p.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Full tanks for every tank in the vehicle. */
export function fullTanks(vehicle: FlightVehicle): Map<string, number> {
  const tanks = new Map<string, number>();
  for (const p of vehicle.parts) if (p.fuelCapacity > 0) tanks.set(p.id, p.fuelCapacity);
  return tanks;
}

export function totalFuel(tanks: TankFuel): number {
  let sum = 0;
  for (const kg of tanks.values()) sum += kg;
  return sum;
}

export function centerOfMass(vehicle: FlightVehicle, tanks: TankFuel): CenterOfMass {
  let m = 0;
  let mu = 0;
  let ma = 0;
  for (const p of vehicle.parts) {
    const pm = p.dryMass + (tanks.get(p.id) ?? 0);
    m += pm;
    mu += pm * p.u;
    ma += pm * p.a;
  }
  return m > 0 ? { u: mu / m, a: ma / m } : { u: 0, a: 0 };
}

/** Pitch moment of inertia about the centre of mass (kg·m²), parts as uniform blocks. */
export function momentOfInertia(vehicle: FlightVehicle, tanks: TankFuel, com: CenterOfMass): number {
  const blockTerm = (AIRFRAME.cellLength * AIRFRAME.cellLength) / 6;
  let inertia = 0;
  for (const p of vehicle.parts) {
    const pm = p.dryMass + (tanks.get(p.id) ?? 0);
    const du = p.u - com.u;
    const da = p.a - com.a;
    inertia += pm * (du * du + da * da + blockTerm);
  }
  return Math.max(inertia, 1);
}

/**
 * Booster stages: a fuel tank (not the command module's own) whose cluster of
 * attached parts carries an engine. Those drop off once their fuel is gone.
 */
export function boosterStages(vehicle: FlightVehicle): string[] {
  return vehicle.parts
    .filter(p => p.fuelCapacity > 0 && p.depth > 0)
    .filter(p => {
      const ids = subtreeIds(vehicle.parts, p.id);
      return vehicle.parts.some(q => ids.has(q.id) && q.thrust > 0);
    })
    .map(p => p.id);
}

/**
 * Worst lateral gap between the thrust line and the centre of mass over the
 * burn. Outer tanks drain first, so a rocket balanced when full can end up
 * lopsided halfway through.
 */
function worstThrustOffset(vehicle: FlightVehicle): number {
  if (vehicle.engineCount === 0) return 0;
  const tanks = fullTanks(vehicle);
  const depths = [...new Set(vehicle.parts.filter(p => p.fuelCapacity > 0).map(p => p.depth))].sort((a, b) => b - a);
  let worst = vehicle.thrustU - centerOfMass(vehicle, tanks).u;
  for (const depth of depths) {
    for (const p of vehicle.parts) if (p.fuelCapacity > 0 && p.depth === depth) tanks.set(p.id, 0);
    const offset = vehicle.thrustU - centerOfMass(vehicle, tanks).u;
    if (Math.abs(offset) > Math.abs(worst)) worst = offset;
  }
  return worst;
}

export function analyzeVehicle(vehicle: FlightVehicle): VehicleReport {
  const weight = vehicle.wetMass * WORLD.surfaceGravity;
  return {
    partCount: vehicle.parts.length,
    wetMass: vehicle.wetMass,
    dryMass: vehicle.dryMass,
    fuelMass: vehicle.fuelCapacity,
    liftoffTwr: weight > 0 ? vehicle.thrust / weight : 0,
    deltaV: vehicle.dryMass > 0 && vehicle.thrust > 0 ? ENGINE.isp * G0 * Math.log(vehicle.wetMass / vehicle.dryMass) : 0,
    burnTime: vehicle.maxMassFlow > 0 ? vehicle.fuelCapacity / vehicle.maxMassFlow : 0,
    thrustOffset: worstThrustOffset(vehicle),
    finCount: vehicle.finCount,
    finStable: vehicle.finStable,
    stageCount: boosterStages(vehicle).length
  };
}
