import { CONFIG } from '../config';
import { PartDefinition, PartType } from './types';

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
