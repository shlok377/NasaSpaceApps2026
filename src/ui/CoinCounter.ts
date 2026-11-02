import Phaser from 'phaser';
import { hudPanel, TEXT_STYLE, UI } from './theme';
import { GAME_ASSETS } from '../core/assets';

/** Money, top-right: a pixel panel that grows with the amount, and a coin that hops whenever cash comes in. */
export class CoinCounter {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly coinSprite: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private shown = 0;
  private hop = 0;
  private panelW = 0;
  private static readonly H = 46;

  constructor(scene: Phaser.Scene, private readonly right: number, private readonly y: number) {
    this.bg = scene.add.graphics();
    this.coinSprite = scene.add.image(0, y, GAME_ASSETS.UI_COIN.key).setDisplaySize(28, 28);
    this.text = scene.add.text(right - 16, y, '$0', TEXT_STYLE(22, UI.goldText)).setOrigin(1, 0.5);
    this.container = scene.add.container(0, 0, [this.bg, this.coinSprite, this.text]).setDepth(20);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /** Screen position of the coin, for "money flies here" effects. */
  public get target(): { x: number; y: number } {
    return { x: this.coinSprite.x, y: this.y };
  }

  public update(money: number, dt: number): void {
    // Count up smoothly rather than jumping.
    if (money > this.shown) {
      this.shown = Math.min(money, this.shown + Math.max(1, (money - this.shown) * 8 * dt));
      this.hop = 1;
    } else {
      this.shown = money;
    }
    this.hop = Math.max(0, this.hop - dt * 4);
    this.text.setText(`$${Math.floor(this.shown).toLocaleString()}`);

    // Panel: coin + gap + digits + padding, redrawn only when the width changes.
    const w = Math.ceil(this.text.width) + 70;
    if (w !== this.panelW) {
      this.panelW = w;
      this.bg.clear();
      hudPanel(this.bg, this.right - w, this.y - CoinCounter.H / 2, w, CoinCounter.H, UI.gold);
    }
    this.coinSprite.setPosition(this.right - w + 28, this.y - Math.sin(this.hop * Math.PI) * 7);
  }
}
