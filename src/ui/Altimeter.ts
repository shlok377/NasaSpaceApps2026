import Phaser from 'phaser';
import { formatDistance, hudPanel, hudWell, TEXT_STYLE, TITLE_STYLE, UI } from './theme';

export interface AltimeterMark {
  label: string;
  height: number; // m
}

/**
 * A tall gauge on the right edge, ground to Moon. The amber flag is the
 * player's record; the cyan "COAST" tick shows how high the rocket would get
 * if the engines were cut right now — cut when it touches the Moon.
 */
export class Altimeter {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly coastText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bottom: number;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly top: number,
    height: number,
    private readonly max: number,
    marks: AltimeterMark[],
    band?: { from: number; to: number; label: string }
  ) {
    this.bottom = top + height;
    const bg = scene.add.graphics();
    hudPanel(bg, x - 84, top - 44, 118, height + 66);
    // Track: a recessed well, banded from ground green up to the black of space.
    hudWell(bg, x - 6, top - 2, 12, height + 4);
    const bands = [0x07060b, 0x10142a, 0x1b2a4a, 0x2a4a6e, 0x3f6e5a, 0x4f8a3c];
    for (let i = 0; i < bands.length; i++) {
      bg.fillStyle(bands[i], 0.85);
      bg.fillRect(x - 4, top + (i * height) / bands.length, 8, Math.ceil(height / bands.length));
    }
    const items: Phaser.GameObjects.GameObject[] = [bg];
    if (band) {
      const y0 = this.toY(band.to);
      const y1 = this.toY(band.from);
      for (let yy = y0; yy < y1; yy += 6) {
        bg.fillStyle(0xb89a78, 0.7);
        bg.fillRect(x - 10, yy, 4, 3);
        bg.fillRect(x + 6, yy + 3, 4, 3);
      }
      items.push(scene.add.text(x - 16, (y0 + y1) / 2, band.label, TEXT_STYLE(10, '#d9c3a2')).setOrigin(1, 0.5));
    }
    items.push(scene.add.text(x - 25, top - 34, 'HEIGHT', TITLE_STYLE(8, UI.textMuted)).setOrigin(0.5, 0));
    for (const m of marks) {
      const y = Math.round(this.toY(m.height));
      bg.fillStyle(0xffffff, 0.65);
      bg.fillRect(x - 10, y - 1, 4, 2);
      bg.fillRect(x + 6, y - 1, 4, 2);
      items.push(scene.add.text(x - 16, y, m.label, TEXT_STYLE(10, UI.textMuted)).setOrigin(1, 0.5));
    }
    this.gfx = scene.add.graphics();
    this.valueText = scene.add.text(x - 14, this.bottom, '', TEXT_STYLE(13)).setOrigin(1, 0.5);
    this.bestText = scene.add.text(x + 12, this.bottom, 'BEST', TEXT_STYLE(9, UI.goldText)).setOrigin(0, 0.5);
    this.coastText = scene.add.text(x + 12, this.bottom, 'COAST', TEXT_STYLE(9, '#67e8f9')).setOrigin(0, 0.5);
    items.push(this.gfx, this.valueText, this.bestText, this.coastText);
    this.container = scene.add.container(0, 0, items);
  }

  private toY(height: number): number {
    const k = Phaser.Math.Clamp(height / this.max, 0, 1);
    return this.bottom - k * (this.bottom - this.top);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /** `coast` = predicted top height with engines cut now (null to hide). */
  public update(height: number, best: number, coast: number | null): void {
    const g = this.gfx;
    g.clear();
    const y = Math.round(this.toY(height));
    // Climbed so far: a bright column made of 4 px blocks.
    g.fillStyle(UI.sky, 1);
    for (let yy = this.bottom - 4; yy >= y; yy -= 5) g.fillRect(this.x - 3, yy, 6, 4);

    if (best > 0) {
      const by = this.toY(best);
      g.fillStyle(UI.gold, 1);
      g.fillRect(this.x + 6, by - 1, 8, 2);
      g.fillRect(this.x + 12, by - 8, 2, 8);
      g.fillRect(this.x + 14, by - 8, 8, 5);
      this.bestText.setPosition(this.x + 8, by + 9).setVisible(true);
    } else {
      this.bestText.setVisible(false);
    }

    if (coast !== null && coast > height + 5) {
      const cy = this.toY(coast);
      g.fillStyle(0x67e8f9, 1);
      g.fillRect(this.x - 10, cy - 2, 20, 4);
      g.fillStyle(0x67e8f9, 0.45);
      for (let yy = cy + 4; yy < y; yy += 8) g.fillRect(this.x - 1, yy, 2, 4);
      this.coastText.setPosition(this.x + 12, cy).setVisible(true);
    } else {
      this.coastText.setVisible(false);
    }

    // Pointer: a little pixel arrow.
    g.fillStyle(0xffffff, 1);
    g.fillRect(this.x - 14, y - 6, 4, 12);
    g.fillRect(this.x - 10, y - 4, 4, 8);
    g.fillRect(this.x - 6, y - 2, 2, 4);
    this.valueText.setPosition(this.x - 15, y).setText(formatDistance(Math.max(0, height)));
  }
}
