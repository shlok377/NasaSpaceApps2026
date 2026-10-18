import Phaser from 'phaser';
import { TEXT_STYLE, UI } from './theme';
import { GAME_ASSETS } from '../core/assets';

/**
 * A fuel tank that visibly drains (with a sloshing surface and analog gauge),
 * plus the vehicle's weight next to it.
 */
export class FuelTank {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly gaugeSprite: Phaser.GameObjects.Image;
  private readonly needleSprite: Phaser.GameObjects.Image;
  private readonly massSprites: Phaser.GameObjects.Image[];
  private readonly percentText: Phaser.GameObjects.Text;
  private readonly massText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly w = 58;
  private readonly h = 128;
  private static readonly MASS_SEGMENTS = 8;

  constructor(scene: Phaser.Scene, private readonly x: number, private readonly y: number) {
    const bg = scene.add.graphics();
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(x - 14, y - 34, 214, this.h + 48, 16);

    const fuelLabel = scene.add.text(x + this.w / 2, y - 26, 'FUEL', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    const massLabel = scene.add.text(x + 82, y + 34, 'MASS', TEXT_STYLE(11, UI.textMuted));

    // Vintage analog fuel gauge dial + needle
    this.gaugeSprite = scene.add.image(x + this.w / 2, y + 18, GAME_ASSETS.UI_FUEL_GAUGE.key).setDisplaySize(54, 30);
    this.needleSprite = scene.add.image(x + this.w / 2, y + 28, GAME_ASSETS.UI_FUEL_NEEDLE.key).setDisplaySize(6, 16).setOrigin(0.5, 0.85);

    // 8-segment mass indicator progress bar
    this.massSprites = [];
    for (let i = 0; i < FuelTank.MASS_SEGMENTS; i++) {
      const sprite = scene.add.image(x + 82 + i * 12, y + 80, GAME_ASSETS.UI_MASS.key)
        .setOrigin(0, 0)
        .setDisplaySize(10, 15);
      this.massSprites.push(sprite);
    }

    this.gfx = scene.add.graphics();
    this.percentText = scene.add.text(x + this.w / 2, y + this.h - 18, '', TEXT_STYLE(14)).setOrigin(0.5);
    this.massText = scene.add.text(x + 82, y + 52, '', TEXT_STYLE(16));
    this.container = scene.add.container(0, 0, [
      bg,
      fuelLabel,
      massLabel,
      this.gaugeSprite,
      this.needleSprite,
      ...this.massSprites,
      this.gfx,
      this.percentText,
      this.massText
    ]);
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

    // Rotate analog needle: Empty (-50 deg) to Full (+50 deg)
    this.needleSprite.setAngle(Phaser.Math.Linear(-50, 50, f));

    // 8-segment mass indicator: turns empty from right to left as fuel burns off
    const share = wetMass > 0 ? Phaser.Math.Clamp(mass / wetMass, 0, 1) : 0;
    const activeCount = Math.round(share * FuelTank.MASS_SEGMENTS);
    for (let i = 0; i < FuelTank.MASS_SEGMENTS; i++) {
      const key = i < activeCount ? GAME_ASSETS.UI_MASS.key : GAME_ASSETS.UI_MASS_EMPTY.key;
      if (this.massSprites[i].texture.key !== key) {
        this.massSprites[i].setTexture(key);
      }
    }
    this.massText.setText(`${Math.round(mass).toLocaleString()} kg`);
  }
}
