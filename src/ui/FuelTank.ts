import Phaser from 'phaser';
import { TEXT_STYLE, UI } from './theme';

/**
 * A fuel tank that visibly drains (with a sloshing surface), plus the
 * vehicle's weight next to it — the lighter it gets, the faster it goes.
 */
export class FuelTank {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly percentText: Phaser.GameObjects.Text;
  private readonly massText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly w = 58;
  private readonly h = 128;

  constructor(scene: Phaser.Scene, private readonly x: number, private readonly y: number) {
    const bg = scene.add.graphics();
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(x - 14, y - 34, 214, this.h + 48, 16);

    const fuelLabel = scene.add.text(x + this.w / 2, y - 26, 'FUEL', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    const massLabel = scene.add.text(x + 82, y + 34, 'MASS', TEXT_STYLE(11, UI.textMuted));
    this.gfx = scene.add.graphics();
    this.percentText = scene.add.text(x + this.w / 2, y + this.h / 2, '', TEXT_STYLE(16)).setOrigin(0.5);
    this.massText = scene.add.text(x + 82, y + 52, '', TEXT_STYLE(16));
    this.container = scene.add.container(0, 0, [bg, fuelLabel, massLabel, this.gfx, this.percentText, this.massText]);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public update(fraction: number, mass: number, wetMass: number, time: number): void {
    const g = this.gfx;
    g.clear();
    const { x, y, w, h } = this;
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    const low = f < 0.15;
    const color = low ? UI.red : f < 0.35 ? UI.amber : UI.green;

    // Liquid with a gently sloshing surface.
    if (f > 0.001) {
      const level = y + h - f * h;
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x + 3, y + h - 3)];
      for (let i = 0; i <= 10; i++) {
        const px = x + 3 + ((w - 6) * i) / 10;
        const wave = f < 0.99 ? Math.sin(time / 260 + i * 0.9) * 2.5 : 0;
        pts.push(new Phaser.Math.Vector2(px, Math.max(y + 3, level + wave)));
      }
      pts.push(new Phaser.Math.Vector2(x + w - 3, y + h - 3));
      g.fillStyle(color, 0.9);
      g.fillPoints(pts, true);
    }

    // Tank shell; blinks red when nearly empty.
    const blink = low && Math.floor(time / 300) % 2 === 0;
    g.lineStyle(3, blink ? UI.red : 0xe5e7eb, 1);
    g.strokeRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, 0xe5e7eb, 0.6);
    g.lineBetween(x + w * 0.3, y - 6, x + w * 0.7, y - 6);
    this.percentText.setText(`${Math.round(f * 100)}%`);

    // Weight: a kettlebell and a bar that shrinks as fuel burns off.
    const kx = x + 98;
    const ky = y + 14;
    g.lineStyle(3, 0xe5e7eb, 1);
    g.beginPath();
    g.arc(kx, ky - 4, 7, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(0xe5e7eb, 1);
    g.fillCircle(kx, ky + 7, 10);
    const barW = 96;
    const share = wetMass > 0 ? Phaser.Math.Clamp(mass / wetMass, 0, 1) : 0;
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(x + 82, y + 80, barW, 8, 4);
    g.fillStyle(UI.red, 1);
    g.fillRoundedRect(x + 82, y + 80, Math.max(8, barW * share), 8, 4);
    this.massText.setText(`${Math.round(mass).toLocaleString()} kg`);
  }
}
