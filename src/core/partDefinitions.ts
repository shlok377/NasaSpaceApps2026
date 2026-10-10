import { PartDefinition, PartType } from './types';

export const PART_DEFINITIONS: Record<PartType, PartDefinition> = {
  COCKPIT: {
    type: 'COCKPIT',
    label: 'CMD',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 100,
    fuel: 0,
    thrust: 0,
    color: 0x3b82f6, // Blue
    textureKey: 'tex_cockpit'
  },
  FUEL_TANK: {
    type: 'FUEL_TANK',
    label: 'FUEL',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 50,
    fuel: 200,
    thrust: 0,
    color: 0xeab308, // Yellow
    textureKey: 'tex_fuel'
  },
  ENGINE: {
    type: 'ENGINE',
    label: 'THRUST',
    defaultPorts: ['NORTH'],
    mass: 80,
    fuel: 0,
    thrust: 500,
    color: 0xef4444, // Red
    textureKey: 'tex_engine'
  },
  NOSE_CONE: {
    type: 'NOSE_CONE',
    label: 'CONE',
    defaultPorts: ['SOUTH'],
    mass: 30,
    fuel: 0,
    thrust: 0,
    color: 0x06b6d4, // Cyan
    textureKey: 'tex_cone'
  },
  FIN: {
    type: 'FIN',
    label: 'FINS',
    defaultPorts: ['EAST', 'WEST'],
    mass: 20,
    fuel: 0,
    thrust: 0,
    color: 0xa855f7, // Purple
    textureKey: 'tex_fin_left'
  },
  STRUCTURAL: {
    type: 'STRUCTURAL',
    label: 'BLOCK',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 40,
    fuel: 0,
    thrust: 0,
    color: 0x64748b, // Slate Grey
    textureKey: 'tex_hull'
  }
};
