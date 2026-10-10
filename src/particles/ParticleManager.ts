import Phaser from 'phaser';
import { ParticleEffectType } from './particleTypes';

/**
 * ParticleManager
 * Modular VFX and particle helper designed for Phaser 3 scenes.
 * Generates procedural particle textures dynamically and manages emitters.
 */
export class ParticleManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initProceduralTextures();
  }

  /**
   * Generates procedural particle textures so effects can run standalone
   * without needing external sprite sheets.
   */
  private initProceduralTextures(): void {
    // 1. Soft Glow Particle (for flames, sparks, glows)
    if (!this.scene.textures.exists('particle_glow')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.3, 'rgba(255, 240, 200, 0.8)');
        grad.addColorStop(0.7, 'rgba(255, 120, 30, 0.3)');
        grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);
        this.scene.textures.addCanvas('particle_glow', canvas);
      }
    }

    // 2. Soft Smoke Puff (for plume trails, blast clouds, vents)
    if (!this.scene.textures.exists('particle_smoke')) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(200, 210, 225, 0.7)');
        grad.addColorStop(0.5, 'rgba(150, 165, 185, 0.4)');
        grad.addColorStop(0.8, 'rgba(100, 115, 135, 0.15)');
        grad.addColorStop(1, 'rgba(80, 95, 115, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        this.scene.textures.addCanvas('particle_smoke', canvas);
      }
    }

    // 3. Sharp Spark / Debris Dot (for mechanical docking, sparks, RUD fragments)
    if (!this.scene.textures.exists('particle_spark')) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(8, 8, 5, 0, Math.PI * 2);
        ctx.fill();
        this.scene.textures.addCanvas('particle_spark', canvas);
      }
    }
  }

  /**
   * Spawns a one-shot burst or configured emitter for a specific effect.
   */
  public triggerEffect(type: ParticleEffectType, x: number, y: number, options?: Record<string, unknown>): void {
    switch (type) {
      case 'SOCKET_SNAP':
        this.createSnapBurst(x, y);
        break;
      case 'REJECTION_ERROR':
        this.createErrorBurst(x, y);
        break;
      case 'PART_DISASSEMBLE':
        this.createDisassembleBurst(x, y);
        break;
      default:
        console.log(`[ParticleManager] Triggered effect ${type} at (${x}, ${y})`, options);
        break;
    }
  }

  private createSnapBurst(x: number, y: number): void {
    if (!this.scene.textures.exists('particle_spark')) return;
    const emitter = this.scene.add.particles(x, y, 'particle_spark', {
      speed: { min: 40, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x38bdf8, 0x0284c7, 0xffffff],
      lifespan: 350,
      quantity: 12,
      emitting: false
    });
    emitter.explode(12);
    this.scene.time.delayedCall(400, () => emitter.destroy());
  }

  private createErrorBurst(x: number, y: number): void {
    if (!this.scene.textures.exists('particle_spark')) return;
    const emitter = this.scene.add.particles(x, y, 'particle_spark', {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xef4444, 0xf87171],
      lifespan: 300,
      quantity: 10,
      emitting: false
    });
    emitter.explode(10);
    this.scene.time.delayedCall(350, () => emitter.destroy());
  }

  private createDisassembleBurst(x: number, y: number): void {
    if (!this.scene.textures.exists('particle_smoke')) return;
    const emitter = this.scene.add.particles(x, y, 'particle_smoke', {
      speed: { min: 20, max: 60 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0.9 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 400,
      quantity: 8,
      emitting: false
    });
    emitter.explode(8);
    this.scene.time.delayedCall(450, () => emitter.destroy());
  }
}
