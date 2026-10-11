import Phaser from 'phaser';
import { formatDistance, TEXT_STYLE, UI } from './theme';

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
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(x - 78, top - 40, 112, height + 56, 16);
    bg.fillGradientStyle(0x050812, 0x050812, 0x4c7a3f, 0x4c7a3f, 1);
    bg.fillRoundedRect(x - 5, top, 10, height, 5);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    if (band) {
      const y0 = this.toY(band.to);
      const y1 = this.toY(band.from);
      bg.fillStyle(0x9a8c7a, 0.45);
      bg.fillRect(x - 8, y0, 16, y1 - y0);
      items.push(scene.add.text(x - 13, (y0 + y1) / 2, band.label, TEXT_STYLE(9, '#d6c7b0')).setOrigin(1, 0.5));
    }
    items.push(scene.add.text(x - 22, top - 30, '↑ HEIGHT', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0));
    for (const m of marks) {
      const y = this.toY(m.height);
      bg.lineStyle(1.5, 0xffffff, 0.5);
      bg.lineBetween(x - 9, y, x + 9, y);
      items.push(scene.add.text(x - 13, y, m.label, TEXT_STYLE(10, UI.textMuted)).setOrigin(1, 0.5));
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
    const y = this.toY(height);
    g.fillStyle(UI.sky, 0.9);
    g.fillRoundedRect(this.x - 3, y, 6, Math.max(0, this.bottom - y), 3);

    if (best > 0) {
      const by = this.toY(best);
      g.lineStyle(2, UI.gold, 1);
      g.lineBetween(this.x + 2, by, this.x + 12, by);
      g.fillStyle(UI.gold, 1);
      g.fillTriangle(this.x + 12, by - 7, this.x + 22, by - 3, this.x + 12, by + 1);
      this.bestText.setPosition(this.x + 8, by + 9).setVisible(true);
    } else {
      this.bestText.setVisible(false);
    }

    if (coast !== null && coast > height + 5) {
      const cy = this.toY(coast);
      g.lineStyle(3, 0x67e8f9, 1);
      g.lineBetween(this.x - 10, cy, this.x + 10, cy);
      g.lineStyle(1, 0x67e8f9, 0.5);
      g.lineBetween(this.x, cy, this.x, y);
      this.coastText.setPosition(this.x + 12, cy).setVisible(true);
    } else {
      this.coastText.setVisible(false);
    }

    g.fillStyle(0xffffff, 1);
    g.fillTriangle(this.x - 12, y - 6, this.x - 12, y + 6, this.x - 4, y);
    this.valueText.setPosition(this.x - 15, y).setText(formatDistance(Math.max(0, height)));
  }
}
