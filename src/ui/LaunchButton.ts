import { playSfx } from '../core/sound';
import Phaser from 'phaser';
import { drawPixelPanel } from './pixel';
import { TEXT_STYLE, TITLE_STYLE, UI } from './theme';

/** The big red arcade button on the pad (same as the lab's LAUNCH!), with a one-line verdict on what the rocket can reach. */
export class LaunchButton {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly container: Phaser.GameObjects.Container;
  private readonly label: Phaser.GameObjects.Text;
  private readonly zone: Phaser.GameObjects.Zone;
  private hover = false;
  private visible = true;
  private static readonly W = 240;
  private static readonly H = 64;

  constructor(
    scene: Phaser.Scene,
    private readonly cx: number,
    private readonly cy: number,
    verdict: string,
    verdictColor: string,
    caption: string,
    onPress: () => void
  ) {
    const { W, H } = LaunchButton;
    this.gfx = scene.add.graphics();
    this.label = scene.add.text(cx, cy - 2, 'LAUNCH!', TITLE_STYLE(20, '#ffffff')).setOrigin(0.5);
    const verdictText = scene.add.text(cx, cy - H / 2 - 14, verdict, TEXT_STYLE(14, verdictColor)).setOrigin(0.5, 1);
    const captionText = scene.add.text(cx, cy + H / 2 + 12, caption, TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 0);
    this.zone = scene.add.zone(cx, cy, W, H).setInteractive({ useHandCursor: true });
    this.zone.on('pointerover', () => {
      this.hover = true;
      playSfx(scene, 'UI_HOVER');
    });
    this.zone.on('pointerout', () => (this.hover = false));
    this.zone.on('pointerdown', onPress);
    this.container = scene.add.container(0, 0, [this.gfx, this.label, verdictText, captionText, this.zone]).setDepth(15);
  }

  public setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.container.setVisible(visible);
    if (visible) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }

  public update(time: number): void {
    const { W, H } = LaunchButton;
    const g = this.gfx;
    g.clear();
    // A soft pixel halo that breathes, then the button; it sinks 3 px under the pointer.
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);
    const grow = Math.round(pulse * 3) * 2;
    g.fillStyle(UI.red, 0.12 + 0.12 * pulse);
    g.fillRect(this.cx - W / 2 - 8 - grow, this.cy - H / 2 - 2 - grow, W + 16 + grow * 2, H + 4 + grow * 2);
    g.fillRect(this.cx - W / 2 - 2 - grow, this.cy - H / 2 - 8 - grow, W + 4 + grow * 2, H + 16 + grow * 2);
    const sink = this.hover ? 3 : 0;
    drawPixelPanel(g, this.cx - W / 2, this.cy - H / 2 + sink, W, H, {
      fill: this.hover ? 0xf04a3a : 0xd8322f,
      fillAlpha: 1,
      border: 0xff8a5c,
      highlight: 0xffd0b0,
      u: 4
    });
    if (!this.hover) {
      g.fillStyle(0x8a1414, 1);
      g.fillRect(this.cx - W / 2 + 8, this.cy + H / 2 - 12, W - 16, 4);
    }
    this.label.setY(this.cy - 2 + sink);
  }
}
