import type Phaser from 'phaser';

/** Sound effects in public/assets/sound, keyed by what they are for. */
export const SFX = {
  UI_CLICK: { key: 'sfx_ui_click', path: 'assets/sound/UI_click.wav', volume: 0.5 },
  UI_HOVER: { key: 'sfx_ui_hover', path: 'assets/sound/UI_hover.wav', volume: 0.25 },
  UI_BLOCK_DELETE: { key: 'sfx_ui_block_delete', path: 'assets/sound/UI_delete.ogg', volume: 0.5 },
  CLICK_FAIL: { key: 'sfx_click_fail', path: 'assets/sound/click_fail.wav', volume: 0.5 },
  BUZZER: { key: 'sfx_buzzer', path: 'assets/sound/buzzer.wav', volume: 0.45 },
  EXPLOSION: { key: 'sfx_explosion', path: 'assets/sound/explosion.wav', volume: 0.7 },
  /** The explosion filtered to sound watery (ffmpeg: band-passed, phaser, flanger, echo). */
  SPLASH: { key: 'sfx_splash', path: 'assets/sound/splash.wav', volume: 1 },
  GAME_OVER: { key: 'sfx_game_over', path: 'assets/sound/game_over.wav', volume: 0.6 },
  ROCKET_DAMAGE: { key: 'sfx_rocket_damage', path: 'assets/sound/rocket_damage.wav', volume: 0.6 },
  /** The RCS thrusters: heard while A / D steer with an open shell. */
  ROCKET_ENGINE: { key: 'sfx_rocket_engine', path: 'assets/sound/rocket_engine.wav', volume: 0.55 },
  /** The main engine's roar while the rocket flies. */
  ROCKET_FLYING: { key: 'sfx_rocket_flying', path: 'assets/sound/rocket_flying.wav', volume: 0.85 },
  /** Lift-off: plays once the countdown hits GO!. */
  ROCKET_LAUNCH: { key: 'sfx_rocket_launch', path: 'assets/sound/rocket_launch.wav', volume: 1 },
  ROCKET_SEPARATION: { key: 'sfx_rocket_separation', path: 'assets/sound/rocket_separation.wav', volume: 0.6 }
} as const;

export type SfxName = keyof typeof SFX;

/** Queue every sound effect not loaded yet (call from a scene's preload). */
export function preloadSounds(scene: Phaser.Scene): void {
  for (const s of Object.values(SFX)) {
    if (!scene.cache?.audio?.exists(s.key)) scene.load?.audio?.(s.key, s.path);
  }
}

/** Fire-and-forget one-shot. Silently does nothing when audio isn't available (tests, blocked autoplay). */
export function playSfx(scene: Phaser.Scene, name: SfxName, volume = 1): void {
  const s = SFX[name];
  if (!scene.cache?.audio?.exists(s.key)) return;
  scene.sound?.play?.(s.key, { volume: s.volume * volume });
}

/** A looping sound that is either on or off (e.g. the warning buzzer while a warning lasts). */
export class LoopSfx {
  private sound: Phaser.Sound.BaseSound | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly name: SfxName) {}

  public set(on: boolean): void {
    if (!on) return this.stop();
    if (this.sound) return;
    const s = SFX[this.name];
    if (!this.scene.cache?.audio?.exists(s.key)) return;
    this.sound = this.scene.sound?.add?.(s.key, { loop: true, volume: s.volume }) ?? null;
    this.sound?.play();
  }

  public stop(): void {
    this.sound?.stop();
    this.sound?.destroy();
    this.sound = null;
  }
}

/** An engine loop whose volume follows a level (0 = silent), eased so it swells and fades instead of cutting. */
export class EngineLoop {
  private sound: Phaser.Sound.BaseSound | null = null;
  private level = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly name: SfxName = 'ROCKET_FLYING') {}

  public update(throttle: number, dt: number): void {
    const s = SFX[this.name];
    const target = Math.max(0, Math.min(1, throttle));
    this.level += (target - this.level) * (1 - Math.exp(-dt * 8));
    if (!this.sound) {
      if (target <= 0 || !this.scene.cache?.audio?.exists(s.key)) return;
      this.sound = this.scene.sound?.add?.(s.key, { loop: true, volume: 0 }) ?? null;
      this.sound?.play();
    }
    (this.sound as Phaser.Sound.WebAudioSound | null)?.setVolume?.(s.volume * this.level);
  }

  public stop(): void {
    this.sound?.stop();
    this.sound?.destroy();
    this.sound = null;
    this.level = 0;
  }
}
