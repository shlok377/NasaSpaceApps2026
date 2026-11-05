import type Phaser from 'phaser';
import { SHEET_COLUMNS, SPRITE_SHEETS, SheetName, animKey, createSpriteAnimations, sheetReady } from '../../core/spriteSheets';

type Sprite = Phaser.GameObjects.Sprite;

/** A point on screen with the size the sprite frame is drawn at. */
export interface SpriteSpot {
  x: number;
  y: number;
  size: number;
}

export interface LandedRoverSpot extends SpriteSpot {
  /** Tilt so the rover stands on the Moon's surface at that spot. */
  rotation: number;
  /** In the zone: it unpacks and drives. Missed: the airbag deflates and it stays dead. */
  ok: boolean;
}

export interface CrewSpot extends SpriteSpot {
  /** Landed right on the site: plants the flag. Otherwise it just waves. */
  onSite: boolean;
}

/** Where the ground sits inside each frame, so a sprite can be pinned to a point on the surface. */
const ROVER_FALL_CENTRE_Y = 43 / 64;
const ROVER_GROUND_Y = 58 / 64;
const CREW_HATCH_X = 6 / 48;
const CREW_GROUND_Y = 45 / 48;

const DEPTH = 6;

/**
 * The animated payload sprites: the satellite once it is ejected, the rover's airbag while it falls and the rovers
 * that came down, and the crew after the rocket touches down. Callers hand over screen positions every frame;
 * anything not updated in a frame is hidden by `endFrame`.
 */
export class PayloadSprites {
  private satellite: Sprite | null = null;
  private satelliteOn = false;
  private roverFall: Sprite | null = null;
  private landed: Array<{ sprite: Sprite; ok: boolean }> = [];
  private crew: { sprite: Sprite; onSite: boolean } | null = null;
  private shown = new Set<Sprite>();
  private animsReady = false;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Can this sheet be drawn? (Not before it has loaded, and not in the unit tests' fake scenes.) */
  public ready(sheet: SheetName): boolean {
    return sheetReady(this.scene, sheet);
  }

  /** The ejected satellite: it opens up (deploy), then keeps working in a loop. Pass null once it is gone. */
  public updateSatellite(at: SpriteSpot | null): boolean {
    if (!at) {
      this.satelliteOn = false;
      return false;
    }
    if (!this.ready('satellite')) return false;
    if (!this.satellite) this.satellite = this.make('satellite');
    if (!this.satelliteOn) {
      this.satelliteOn = true;
      this.playClips(this.satellite, 'satellite', ['deploy', 'working']);
    }
    this.place(this.satellite, at, 0.5, 0.5);
    return true;
  }

  /** The airbag ball while it drops: one still frame, nothing moves until it hits the ground. */
  public updateRoverFall(at: SpriteSpot | null): boolean {
    if (!at || !this.ready('rover')) return false;
    if (!this.roverFall) {
      this.roverFall = this.make('rover');
      this.roverFall.setFrame?.(SPRITE_SHEETS.rover.meta.animations.fall.row * SHEET_COLUMNS);
    }
    this.place(this.roverFall, at, 0.5, ROVER_FALL_CENTRE_Y);
    return true;
  }

  /** Rovers on the ground, oldest first. A new one starts its landing the moment it appears. */
  public updateLandedRovers(spots: readonly LandedRoverSpot[]): boolean {
    if (!this.ready('rover')) return false;
    while (this.landed.length > spots.length) this.landed.pop()?.sprite.destroy?.();
    spots.forEach((spot, i) => {
      let entry = this.landed[i];
      if (!entry) {
        const sprite = this.make('rover');
        entry = { sprite, ok: spot.ok };
        this.landed.push(entry);
        if (!spot.ok) sprite.setTint?.(0x8a829c);
        this.playClips(sprite, 'rover', spot.ok ? ['land', 'deploy', 'drive'] : ['land']);
      }
      this.place(entry.sprite, spot, 0.5, ROVER_GROUND_Y);
      entry.sprite.setRotation?.(spot.rotation);
    });
    return true;
  }

  /**
   * The astronaut beside the rocket. `at` is the rocket's side (x) and the ground (y); the clip puts the hatch there.
   * Pass null to clear it (a retry), otherwise it starts the moment it first appears.
   */
  public updateCrew(at: CrewSpot | null): boolean {
    if (!at) {
      this.crew?.sprite.destroy?.();
      this.crew = null;
      return false;
    }
    if (!this.ready('crew')) return false;
    if (!this.crew) {
      const sprite = this.make('crew');
      this.crew = { sprite, onSite: at.onSite };
      this.playClips(sprite, 'crew', at.onSite ? ['exit', 'plant', 'wave_flag'] : ['exit', 'wave']);
    }
    this.place(this.crew.sprite, at, CREW_HATCH_X, CREW_GROUND_Y);
    this.crew.sprite.setDepth?.(DEPTH + 1);
    return true;
  }

  /** Hide whatever was not placed this frame. Call once at the end of rendering. */
  public endFrame(): void {
    const all = [this.satellite, this.roverFall, this.crew?.sprite, ...this.landed.map((l) => l.sprite)];
    for (const sprite of all) if (sprite && !this.shown.has(sprite)) sprite.setVisible?.(false);
    this.shown.clear();
  }

  private make(sheet: SheetName): Sprite {
    if (!this.animsReady) {
      createSpriteAnimations(this.scene);
      this.animsReady = true;
    }
    const s = this.scene.add.sprite(0, 0, SPRITE_SHEETS[sheet].key, 0);
    s.setDepth?.(DEPTH);
    return s;
  }

  private place(sprite: Sprite, at: SpriteSpot, originX: number, originY: number): void {
    sprite.setOrigin?.(originX, originY);
    sprite.setPosition?.(at.x, at.y);
    sprite.setDisplaySize?.(at.size, at.size);
    sprite.setVisible?.(true);
    this.shown.add(sprite);
  }

  /** Play the clips one after the other; a looping clip (always last) never ends, so it keeps going. */
  private playClips(sprite: Sprite, sheet: SheetName, clips: readonly string[]): void {
    const [first, ...rest] = clips;
    sprite.removeAllListeners?.('animationcomplete');
    sprite.play?.(animKey(sheet, first));
    if (rest.length > 0) sprite.once?.('animationcomplete', () => this.playClips(sprite, sheet, rest));
  }
}
