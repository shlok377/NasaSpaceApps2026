import Phaser from 'phaser';
import { TEXT_STYLE, UI } from './theme';
import { GAME_ASSETS } from '../core/assets';
import { twrToNeedleAngle, isLowThrustAlert, TWR_MIN_ANGLE } from '../physics/twr';

export interface ClusterTelemetry {
  fraction: number;
  mass: number;
  wetMass: number;
  twr?: number;
  throttleActive?: boolean;
  time?: number;
  dt?: number;
}

/**
 * Three-column cockpit instrument cluster:
 * 1. Minimalist glass fuel tank with sloshing propellant & percentage
 * 2. Vintage analog TWR gauge with spring needle dynamics & low-thrust alert
 * 3. Vehicle mass readout with 8-segment consumption progress meter
 */
export class FuelTank {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly gaugeSprite: Phaser.GameObjects.Image;
  private readonly needleSprite: Phaser.GameObjects.Image;
  private readonly massSprites: Phaser.GameObjects.Image[];
  private readonly percentText: Phaser.GameObjects.Text;
  private readonly twrValueText: Phaser.GameObjects.Text;
  private readonly massText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly w = 58;
  private readonly h = 128;
  private static readonly MASS_SEGMENTS = 8;
  private needleAngle: number = TWR_MIN_ANGLE;

  constructor(scene: Phaser.Scene, private readonly x: number, private readonly y: number) {
    const bg = scene.add.graphics();
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(x - 14, y - 34, 318, this.h + 48, 16);

    // Column 1: Minimalist Fuel Tank
    const fuelLabel = scene.add
      .text(x + this.w / 2, y - 26, 'FUEL', TEXT_STYLE(11, UI.textMuted))
      .setOrigin(0.5, 0);

    // Column 2: TWR Analog Dial (1.5x Scale)
    const col2CenterX = x + 118;
    const twrLabel = scene.add
      .text(col2CenterX, y - 26, 'TWR', TEXT_STYLE(11, UI.textMuted))
      .setOrigin(0.5, 0);

    this.gaugeSprite = scene.add
      .image(col2CenterX, y + 40, GAME_ASSETS.UI_FUEL_GAUGE.key)
      .setDisplaySize(81, 45);
    this.needleSprite = scene.add
      .image(col2CenterX, y + 62, GAME_ASSETS.UI_FUEL_NEEDLE.key)
      .setDisplaySize(9, 26)
      .setOrigin(0.5, 0.82);
    this.needleSprite.setAngle(-70 + (this.needleAngle / 100) * 140);

    this.twrValueText = scene.add
      .text(col2CenterX, y + 86, '0.0×', TEXT_STYLE(14, UI.textMuted))
      .setOrigin(0.5, 0);

    // Column 3: Vehicle Mass Segments
    const col3X = x + 176;
    const massLabel = scene.add.text(col3X, y - 26, 'MASS', TEXT_STYLE(11, UI.textMuted));
    this.massText = scene.add.text(col3X, y + 8, '', TEXT_STYLE(16));

    this.massSprites = [];
    for (let i = 0; i < FuelTank.MASS_SEGMENTS; i++) {
      const sprite = scene.add
        .image(col3X + i * 11, y + 42, GAME_ASSETS.UI_MASS.key)
        .setOrigin(0, 0)
        .setDisplaySize(10, 15);
      this.massSprites.push(sprite);
    }

    this.gfx = scene.add.graphics();
    this.percentText = scene.add
      .text(x + this.w / 2, y + this.h - 18, '', TEXT_STYLE(14))
      .setOrigin(0.5);

    this.container = scene.add.container(0, 0, [
      bg,
      fuelLabel,
      twrLabel,
      this.gaugeSprite,
      this.needleSprite,
      this.twrValueText,
      massLabel,
      this.massText,
      ...this.massSprites,
      this.gfx,
      this.percentText
    ]);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public getNeedleAngle(): number {
    return this.needleAngle;
  }

  public update(
    fraction: number,
    mass: number,
    wetMass: number,
    twr: number = 0,
    throttleActive: boolean = false,
    time: number = 0,
    dt: number = 0.016
  ): void {
    const g = this.gfx;
    g.clear();
    const { x, y, w, h } = this;
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    const low = f < 0.15;
    const color = low ? UI.red : f < 0.35 ? UI.amber : UI.green;

    // --- Column 1: Unobstructed Sloshing Fuel Liquid ---
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
    g.lineStyle(3, blink ? UI.red : UI.backdrop, 1);
    g.strokeRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, UI.dim, 0.8);
    g.lineBetween(x + w * 0.3, y - 6, x + w * 0.7, y - 6);
    this.percentText.setText(`${Math.round(f * 100)}%`);

    // --- Column 2: TWR Dial with Analog Inertia & Alert ---
    const targetAngle = twrToNeedleAngle(twr, throttleActive);
    const safeDt = Math.min(Math.max(dt, 0.001), 0.1);
    // Smooth exponential damping towards target angle
    this.needleAngle += (targetAngle - this.needleAngle) * Math.min(1, safeDt * 10);
    this.needleSprite.setAngle(-70 + (this.needleAngle / 100) * 140);

    if (throttleActive && twr > 0) {
      if (isLowThrustAlert(twr, throttleActive)) {
        // Subtle glowing red alert when underpowered
        const glowAlpha = 0.75 + Math.sin(time / 200) * 0.25;
        this.twrValueText.setColor(UI.redText);
        this.twrValueText.setAlpha(glowAlpha);
        this.twrValueText.setText(`${twr.toFixed(1)}× LOW`);
      } else {
        this.twrValueText.setColor(UI.text);
        this.twrValueText.setAlpha(1.0);
        this.twrValueText.setText(`${twr.toFixed(1)}×`);
      }
    } else {
      this.twrValueText.setColor(UI.textMuted);
      this.twrValueText.setAlpha(1.0);
      this.twrValueText.setText('0.0×');
    }

    // --- Column 3: 8-Segment Mass Meter ---
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
