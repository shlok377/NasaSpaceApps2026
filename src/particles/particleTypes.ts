/**
 * Particle & VFX Types for NASA Space Apps 2026
 * Standalone particle definitions for VAB builder and Flight simulation.
 */

export type ParticleEffectType =
  // VAB / Builder Effects
  | 'SOCKET_SNAP'
  | 'PART_DISASSEMBLE'
  | 'REJECTION_ERROR'
  | 'VAB_AMBIENT_DUST'

  // Propulsion & Engine Effects
  | 'ENGINE_PLUME'
  | 'ENGINE_SMOKE'
  | 'LAUNCHPAD_BLAST'
  | 'ENGINE_SPARKS'
  | 'RCS_PUFF'

  // Aerodynamic & Flight Effects
  | 'MAX_Q_VAPOR'
  | 'REENTRY_PLASMA'
  | 'SPEED_STREAKS'

  // Staging & Separation
  | 'STAGE_SEPARATION'
  | 'FAIRING_JETTISON'

  // Space & Orbital
  | 'ORBITAL_STARDUST'
  | 'FUEL_VENTING'

  // Failure / Explosions
  | 'EXPLOSION_FIREBALL'
  | 'EXPLOSION_DEBRIS'
  | 'ENGINE_SPUTTER';

export interface ParticleConfig {
  textureKey: string;
  lifespan: number | { min: number; max: number };
  speed?: number | { min: number; max: number };
  scale?: number | { start: number; end: number };
  alpha?: number | { start: number; end: number };
  tint?: number | number[];
  blendMode?: string;
  gravityY?: number;
  quantity?: number;
  frequency?: number;
}
