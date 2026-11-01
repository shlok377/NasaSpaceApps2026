import { CONFIG } from '../config';
import { EngineKind, FuelKind, PartDefinition, PartType, PayloadKind } from './types';

/** Fuel choices offered for tanks, in picker order. `extraCost` is added to the tank's base price. */
export const FUEL_KINDS: Record<FuelKind, { label: string; color: number; extraCost: number; description: string }> = {
  STANDARD: { label: 'KEROSENE', color: 0xffba00, extraCost: 0, description: 'Cheap, dense and reliable.' },
  GREEN: { label: 'METHANE', color: 0x36ff12, extraCost: 4, description: 'Clean burn. Can be made on Mars.' },
  PURPLE: { label: 'HYDROGEN', color: 0xc000ff, extraCost: 10, description: 'Most efficient. Kept super cold.' }
};

/** Engine choices offered in the builder, in picker order. `extraCost` is added to the engine's base price. */
export const ENGINE_KINDS: Record<EngineKind, { label: string; color: number; extraCost: number; description: string }> = {
  STANDARD: { label: 'STANDARD', color: 0xef4444, extraCost: 0, description: 'Simple, trusty workhorse.' },
  TWIN: { label: 'TWIN', color: 0x3b6fd8, extraCost: 12, description: 'Two bells under one cover.' },
  LANDER: { label: 'LANDER', color: 0xf4eee6, extraCost: 8, description: 'Built for soft Moon landings.' }
};

/** Payload choices for the root slot, in picker order. `extraCost` is added to the cockpit's base price. */
export const PAYLOADS: Record<PayloadKind, { label: string; color: number; extraCost: number; description: string }> = {
  CREW: { label: 'CREW', color: 0xe8e4f0, extraCost: 0, description: 'Seats for a brave crew.' },
  SATELLITE: { label: 'SATELLITE', color: 0x4fa3ff, extraCost: 10, description: 'No crew. Goes into orbit.' },
  ROVER: { label: 'ROVER', color: 0xf0c040, extraCost: 15, description: 'Drives on the Moon.' }
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
    label: 'THRUST',
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
  engineKind?: EngineKind;
  payload?: PayloadKind;
}

/** Price of one part ($): the base price plus the extra for its fuel, engine or payload type. */
export function partCost(part: PartType | PricedPart): number {
  const p = typeof part === 'string' ? { type: part } : part;
  const extra =
    (p.type === 'FUEL_TANK' && p.fuelKind ? FUEL_KINDS[p.fuelKind].extraCost : 0) +
    (p.type === 'ENGINE' && p.engineKind ? ENGINE_KINDS[p.engineKind].extraCost : 0) +
    (p.type === 'COCKPIT' && p.payload ? PAYLOADS[p.payload].extraCost : 0);
  return PART_DEFINITIONS[p.type].cost + extra;
}
