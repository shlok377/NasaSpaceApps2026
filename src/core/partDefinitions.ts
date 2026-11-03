import { CONFIG } from '../config';
import { FuelKind, PartDefinition, PartType, PayloadKind } from './types';

/** Fuel choices offered for tanks, in picker order. `extraCost` is added to the tank's base price. */
export const FUEL_KINDS: Record<FuelKind, { label: string; color: number; extraCost: number; description: string }> = {
  KEROSENE: { label: 'KEROSENE', color: 0xffba00, extraCost: 0, description: 'Starter fuel for boosters.' },
  HYDROGEN: { label: 'HYDROGEN', color: 0xc000ff, extraCost: 10, description: 'Light booster fuel, goes furthest.' },
  COLD_GAS: { label: 'COLD GAS', color: 0x36ff12, extraCost: 2, description: 'Feeds RCS thrusters only.' }
};

/** Fuels that feed the boosters (ENGINE parts); cold gas only feeds RCS. */
export const isBoosterFuel = (kind: FuelKind | undefined): boolean => (kind ?? 'KEROSENE') !== 'COLD_GAS';

/** How many launches a player needs before they can pick this fuel. */
export const fuelUnlockCost = (kind: FuelKind): number => CONFIG.fuelTypes[kind].unlockCost;

/** Payload choices for the root slot, in picker order. `extraCost` is added to the cockpit's base price. */
export const PAYLOADS: Record<PayloadKind, { label: string; color: number; extraCost: number; description: string; mass: number }> = {
  CREW: { label: 'CREW', color: 0xe8e4f0, extraCost: 0, mass: CONFIG.payloads.CREW.mass, description: 'WIN: land softly on the marked site.' },
  SATELLITE: { label: 'SATELLITE', color: 0x4fa3ff, extraCost: 10, mass: CONFIG.payloads.SATELLITE.mass, description: 'WIN: reach a stable orbit, then SPACE to eject it.' },
  ROVER: { label: 'ROVER', color: 0xf0c040, extraCost: 15, mass: CONFIG.payloads.ROVER.mass, description: 'WIN: orbit, then drop the rover onto the target.' }
};

/** How each fuel behaves: kg per litre, and multipliers on engine efficiency and push while burning it. */
export const FUEL_STATS: Record<FuelKind, { density: number; isp: number; thrust: number }> = {
  KEROSENE: CONFIG.fuelTypes.KEROSENE,
  HYDROGEN: CONFIG.fuelTypes.HYDROGEN,
  COLD_GAS: CONFIG.fuelTypes.COLD_GAS
};

/** Mass / fuel / thrust / cost come from src/config/game.json so they can be tuned in one place. */
const stats = (type: PartType) => {
  const p = CONFIG.parts[type];
  return { mass: p.mass, fuel: p.fuelLiters, thrust: p.thrust, cost: p.cost };
};

export const PART_DEFINITIONS: Record<PartType, PartDefinition> = {
  COCKPIT: {
    type: 'COCKPIT',
    label: 'CMD',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    ...stats('COCKPIT'),
    color: 0x3b82f6, // Blue
    textureKey: 'tex_cockpit'
  },
  FUEL_TANK: {
    type: 'FUEL_TANK',
    label: 'FUEL',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    ...stats('FUEL_TANK'),
    color: 0xeab308, // Yellow
    textureKey: 'tex_fuel'
  },
  ENGINE: {
    type: 'ENGINE',
    label: 'BOOSTER',
    defaultPorts: ['NORTH'],
    ...stats('ENGINE'),
    color: 0xef4444, // Red
    textureKey: 'tex_engine'
  },
  NOSE_CONE: {
    type: 'NOSE_CONE',
    label: 'CONE',
    defaultPorts: ['SOUTH'],
    ...stats('NOSE_CONE'),
    color: 0x06b6d4, // Cyan
    textureKey: 'tex_cone'
  },
  FIN: {
    type: 'FIN',
    label: 'FINS',
    defaultPorts: ['EAST', 'WEST'],
    ...stats('FIN'),
    color: 0xa855f7, // Purple
    textureKey: 'tex_fin_left'
  },
  RCS: {
    type: 'RCS',
    label: 'RCS',
    // Bolts to the side of the rocket; parts can hang below its shell.
    defaultPorts: ['EAST', 'WEST', 'SOUTH'],
    ...stats('RCS'),
    color: 0x9fe8ff,
    textureKey: 'tex_rcs'
  },
  STRUCTURAL: {
    type: 'STRUCTURAL',
    label: 'BLOCK',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    ...stats('STRUCTURAL'),
    color: 0x64748b, // Slate Grey
    textureKey: 'tex_hull'
  }
};

/** A part as priced: its type plus whichever look was picked for it in the builder. */
export interface PricedPart {
  type: PartType;
  fuelKind?: FuelKind;
  payload?: PayloadKind;
}

/** Price of one part ($): the base price plus the extra for its fuel, engine or payload type. */
export function partCost(part: PartType | PricedPart): number {
  const p = typeof part === 'string' ? { type: part } : part;
  const extra =
    (p.type === 'FUEL_TANK' && p.fuelKind ? FUEL_KINDS[p.fuelKind].extraCost : 0) +
    (p.type === 'COCKPIT' && p.payload ? PAYLOADS[p.payload].extraCost : 0);
  return PART_DEFINITIONS[p.type].cost + extra;
}
