import Phaser from 'phaser';
import { GAME_ASSETS } from '../core/assets';
import { formatDistance, glassPanel, hudWell, TEXT_STYLE, UI } from './theme';

export interface TrackMilestone {
  label: string;
  /** Height of the tick (m). */
  height: number;
  /** Optional top of a band (m), drawn as hatching from `height` up to here (the rock band). */
  to?: number;
}

/**
 * The tall Earth→Moon progress track in the right column: the journey arc and
 * the height gauge in one. The rocket icon rides up the track with its height
 * beside it, milestone ticks turn gold once passed, and a gold flag marks the
 * player's best height.
 */
export class ProgressTrack {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly ticks: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[];
  private readonly heightText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private lastPassed = '';

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly top: number,
    private readonly bottom: number,
    private readonly max: number,
    private readonly milestones: TrackMilestone[]
  ) {
    const panel = glassPanel(scene, x - 112, top - 40, 138, bottom - top + 74);
    const bg = scene.add.graphics();
    // The track: a recessed well, banded from ground green up to the black of space.
    hudWell(bg, x - 6, top - 2, 12, bottom - top + 4);
    const bands = [0x07060b, 0x10142a, 0x1b2a4a, 0x2a4a6e, 0x3f6e5a, 0x4f8a3c];
    const h = bottom - top;
    for (let i = 0; i < bands.length; i++) {
      bg.fillStyle(bands[i], 0.85);
      bg.fillRect(x - 4, top + (i * h) / bands.length, 8, Math.ceil(h / bands.length));
    }
    const moon = scene.add.image(x, top - 18, GAME_ASSETS.UI_MOON.key).setDisplaySize(24, 24);
    const earth = scene.add.image(x, bottom + 18, GAME_ASSETS.UI_EARTH.key).setDisplaySize(24, 24);
    this.ticks = scene.add.graphics();
    this.labels = milestones.map(m => {
      const y = m.to !== undefined ? (this.toY(m.height) + this.toY(m.to)) / 2 : this.toY(m.height);
      return scene.add.text(x - 16, y, m.label, TEXT_STYLE(10, UI.textMuted)).setOrigin(1, 0.5);
    });
    this.gfx = scene.add.graphics();
    this.heightText = scene.add.text(x - 18, bottom, '', TEXT_STYLE(13)).setOrigin(1, 0.5);
    this.bestText = scene.add.text(x + 8, bottom, 'BEST', TEXT_STYLE(9, UI.goldText)).setOrigin(0, 0.5);
    this.container = scene.add
      .container(0, 0, [panel, bg, moon, earth, this.ticks, ...this.labels, this.gfx, this.bestText, this.heightText])
      .setDepth(20);
    this.drawTicks(milestones.map(() => false));
  }

  private toY(height: number): number {
    const k = Phaser.Math.Clamp(height / this.max, 0, 1);
    return this.bottom - k * (this.bottom - this.top);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /** Horizontal offset (px) for the liftoff slide-in; 0 = in place. */
  public setSlide(dx: number): void {
    this.container.x = dx;
  }

  private drawTicks(passed: boolean[]): void {
    const g = this.ticks;
    g.clear();
    this.milestones.forEach((m, i) => {
      const color = passed[i] ? UI.gold : 0xffffff;
      const alpha = passed[i] ? 1 : 0.6;
      if (m.to !== undefined) {
        // A band (the rocks): hatching either side of the track.
        const y0 = this.toY(m.to);
        const y1 = this.toY(m.height);
        g.fillStyle(passed[i] ? UI.gold : 0xb89a78, passed[i] ? 0.9 : 0.7);
        for (let yy = y0; yy < y1; yy += 6) {
          g.fillRect(this.x - 10, yy, 4, 3);
          g.fillRect(this.x + 6, yy + 3, 4, 3);
        }
      } else {
        const y = Math.round(this.toY(m.height));
        g.fillStyle(color, alpha);
        g.fillRect(this.x - 11, y - 1, 5, 2);
        g.fillRect(this.x + 6, y - 1, 5, 2);
      }
      this.labels[i].setColor(passed[i] ? UI.goldText : UI.textMuted);
    });
  }

  /** `reached` is the highest point of this flight (milestones below it are lit); `best` the record. */
  public update(height: number, reached: number, best: number): void {
    const passed = this.milestones.map(m => reached >= (m.to ?? m.height));
    const key = passed.join();
    if (key !== this.lastPassed) {
      this.lastPassed = key;
      this.drawTicks(passed);
    }

    const g = this.gfx;
    g.clear();
    const y = Math.round(this.toY(height));
    // Climbed so far: a bright column of 4 px blocks.
    g.fillStyle(UI.sky, 1);
    for (let yy = this.bottom - 4; yy >= y + 8; yy -= 5) g.fillRect(this.x - 3, yy, 6, 4);

    if (best > 0) {
      const by = Math.round(this.toY(best));
      g.fillStyle(UI.gold, 1);
      g.fillRect(this.x + 6, by - 1, 6, 2);
      g.fillRect(this.x + 10, by - 9, 2, 9);
      g.fillRect(this.x + 12, by - 9, 8, 5);
      this.bestText.setPosition(this.x + 7, by + 8).setVisible(true);
    } else {
      this.bestText.setVisible(false);
    }

    // The rocket icon: a little pixel rocket pointing up, riding the track.
    const x = this.x;
    g.fillStyle(0x07060b, 1);
    g.fillRect(x - 5, y - 11, 10, 20);
    g.fillRect(x - 8, y + 1, 16, 10);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x - 3, y - 7, 6, 14);
    g.fillRect(x - 1, y - 10, 2, 3);
    g.fillStyle(UI.red, 1);
    g.fillRect(x - 6, y + 3, 3, 6);
    g.fillRect(x + 3, y + 3, 3, 6);
    g.fillRect(x - 3, y - 7, 6, 3);
    g.fillStyle(UI.amber, 1);
    g.fillRect(x - 2, y + 7, 4, 3);

    this.heightText.setPosition(x - 14, y).setText(formatDistance(Math.max(0, height)));
  }
}
