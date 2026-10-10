import { PartDefinition, PartType } from './types';

export const PART_DEFINITIONS: Record<PartType, PartDefinition> = {
  COCKPIT: {
    type: 'COCKPIT',
    label: 'Cockpit',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 100,
    fuel: 0,
    thrust: 0,
    color: 0x427f80,
    textureKey: 'tex_cockpit'
  },
  FUEL_TANK: {
    type: 'FUEL_TANK',
    label: 'FUEL',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 50,
    fuel: 200,
    thrust: 0,
    color: 0x427f80,
    textureKey: 'tex_fuel'
  },
  ENGINE: {
    type: 'ENGINE',
    label: 'THRUST',
    defaultPorts: ['NORTH'],
    mass: 80,
    fuel: 0,
    thrust: 500,
    color: 0x273840,
    textureKey: 'tex_engine'
  },
  NOSE_CONE: {
    type: 'NOSE_CONE',
    label: 'CONE',
    defaultPorts: ['SOUTH'],
    mass: 30,
    fuel: 0,
    thrust: 0,
    color: 0xb04153,
    textureKey: 'tex_cone'
  },
  FIN: {
    type: 'FIN',
    label: 'FINS',
    defaultPorts: ['EAST', 'WEST'],
    mass: 20,
    fuel: 0,
    thrust: 0,
    color: 0x427f80,
    textureKey: 'tex_fin_left'
  },
  STRUCTURAL: {
    type: 'STRUCTURAL',
    label: 'BLOCK',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 40,
    fuel: 0,
    thrust: 0,
    color: 0x427f80,
    textureKey: 'tex_hull'
  }
};
