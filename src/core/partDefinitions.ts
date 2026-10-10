import { PartDefinition, PartType } from './types';

export const PART_DEFINITIONS: Record<PartType, PartDefinition> = {
  COCKPIT: {
    type: 'COCKPIT',
    label: 'Cockpit',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 100,
    fuel: 0,
    thrust: 0,
    color: 0x3b82f6 // vibrant blue
  },
  FUEL_TANK: {
    type: 'FUEL_TANK',
    label: 'Fuel Tank',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 50,
    fuel: 200,
    thrust: 0,
    color: 0xeab308 // yellow/gold
  },
  ENGINE: {
    type: 'ENGINE',
    label: 'Engine',
    defaultPorts: ['NORTH'], // Connects via top port to a bottom port
    mass: 80,
    fuel: 0,
    thrust: 500,
    color: 0xef4444 // red
  },
  NOSE_CONE: {
    type: 'NOSE_CONE',
    label: 'Nose Cone',
    defaultPorts: ['SOUTH'], // Connects via bottom port to a top port
    mass: 30,
    fuel: 0,
    thrust: 0,
    color: 0x93c5fd // light cyan/blue
  },
  FIN: {
    type: 'FIN',
    label: 'Fin',
    defaultPorts: ['EAST', 'WEST'], // Can connect to either flank
    mass: 20,
    fuel: 0,
    thrust: 0,
    color: 0xa855f7 // purple
  },
  STRUCTURAL: {
    type: 'STRUCTURAL',
    label: 'Hull Block',
    defaultPorts: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
    mass: 40,
    fuel: 0,
    thrust: 0,
    color: 0x64748b // slate grey
  }
};
