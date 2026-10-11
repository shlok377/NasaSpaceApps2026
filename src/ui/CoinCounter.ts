import Phaser from 'phaser';
import { TEXT_STYLE, UI } from './theme';
import { GAME_ASSETS } from '../core/assets';

/** Money, top-right: a coin that hops whenever cash comes in. */
export class CoinCounter {
  private readonly coinSprite: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private shown = 0;
  private hop = 0;

  constructor(scene: Phaser.Scene, private readonly right: number, private readonly y: number) {
    const bg = scene.add.graphics();
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(right - 150, y - 24, 150, 48, 24);
    this.coinSprite = scene.add.image(right - 124, y, GAME_ASSETS.UI_COIN.key).setDisplaySize(30, 30);
    this.text = scene.add.text(right - 18, y, '$0', TEXT_STYLE(24, UI.goldText)).setOrigin(1, 0.5);
    this.container = scene.add.container(0, 0, [bg, this.coinSprite, this.text]);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /** Screen position of the coin, for "money flies here" effects. */
  public get target(): { x: number; y: number } {
    return { x: this.right - 124, y: this.y };
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
    const cy = this.y - Math.sin(this.hop * Math.PI) * 7;
    this.coinSprite.setY(cy);
    this.text.setText(`$${Math.floor(this.shown).toLocaleString()}`);
  }
}
