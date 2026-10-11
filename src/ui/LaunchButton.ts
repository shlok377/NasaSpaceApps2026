import Phaser from 'phaser';
import { TEXT_STYLE, UI } from './theme';

/** The big red button on the pad, with a one-line verdict on what the rocket can reach. */
export class LaunchButton {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly container: Phaser.GameObjects.Container;
  private readonly zone: Phaser.GameObjects.Zone;
  private hover = false;
  private visible = true;

  constructor(
    scene: Phaser.Scene,
    private readonly cx: number,
    private readonly cy: number,
    verdict: string,
    verdictColor: string,
    caption: string,
    onPress: () => void
  ) {
    this.gfx = scene.add.graphics();
    const label = scene.add.text(cx, cy, 'LAUNCH', TEXT_STYLE(17, '#ffffff')).setOrigin(0.5);
    const captionText = scene.add.text(cx, cy + 58, caption, TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5);
    const verdictText = scene.add.text(cx, cy - 66, verdict, TEXT_STYLE(15, verdictColor)).setOrigin(0.5);
    this.zone = scene.add.zone(cx, cy, 100, 100).setInteractive({ useHandCursor: true });
    this.zone.on('pointerover', () => (this.hover = true));
    this.zone.on('pointerout', () => (this.hover = false));
    this.zone.on('pointerdown', onPress);
    this.container = scene.add.container(0, 0, [this.gfx, label, captionText, verdictText, this.zone]);
  }

  public setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.container.setVisible(visible);
    if (visible) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }

  public update(time: number): void {
    const g = this.gfx;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);
    g.fillStyle(UI.red, 0.18 + 0.18 * pulse);
    g.fillCircle(this.cx, this.cy, 52 + pulse * 8);
    g.fillStyle(0x7f1d1d, 1);
    g.fillCircle(this.cx, this.cy + 5, 42);
    g.fillStyle(this.hover ? 0xf87171 : UI.red, 1);
    g.fillCircle(this.cx, this.cy, 42);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeCircle(this.cx, this.cy, 42);
  }
}
