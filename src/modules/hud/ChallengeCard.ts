import Phaser from 'phaser';
import { drawPixelPanel } from '../../ui/pixel';
import { hudWell, TEXT_STYLE, UI } from '../../ui/theme';
import { ChallengeStatus } from '../types';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** The live challenge, top centre: its name, what to do, and one bar (fill, limit line or green target). */
export class ChallengeCard {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly howTo: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cx = 640;
  private readonly y = 104;
  private readonly w = 480;
  private readonly h = 128;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.gfx = scene.add.graphics();
    this.title = scene.add.text(this.cx, this.y + 10, '', TEXT_STYLE(18, '#ffffff')).setOrigin(0.5, 0);
    this.howTo = scene.add.text(this.cx, this.y + 36, '', TEXT_STYLE(13)).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(this.w - 30);
    this.detail = scene.add.text(this.cx, this.y + this.h - 10, '', TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.bg, this.gfx, this.title, this.howTo, this.detail]).setDepth(20).setVisible(false);
  }

  public update(s: ChallengeStatus | null, time: number): void {
    this.container.setVisible(s !== null);
    if (!s) return;
    const x0 = this.cx - this.w / 2;
    const flash = s.danger && Math.sin(time / 120) > 0.3;
    this.bg.clear();
    drawPixelPanel(this.bg, x0, this.y, this.w, this.h, { fill: 0x0d0b16, fillAlpha: 0.92, border: flash ? UI.red : s.color, highlight: s.color, u: 3 });

    this.title.setText(`${s.danger ? '⚠ ' : ''}${s.title}${s.timeLeft !== undefined ? `   ${Math.ceil(s.timeLeft)}s` : ''}`).setColor(hex(s.color));
    this.howTo.setText(s.howTo);
    this.detail.setText(s.detail).setColor(s.danger ? '#fca5a5' : UI.textMuted);

    const g = this.gfx;
    g.clear();
    const barX = x0 + 40;
    const barW = this.w - 80;
    const barY = this.y + 86;
    hudWell(g, barX, barY, barW, 10);
    if (s.zone) {
      g.fillStyle(UI.green, 0.85);
      g.fillRect(barX + s.zone.from * barW, barY - 3, (s.zone.to - s.zone.from) * barW, 16);
    }
    if (s.needle) {
      g.fillStyle(s.danger ? UI.red : 0xffffff, 1);
      g.fillRect(barX + s.meter * barW - 2, barY - 7, 4, 24);
    } else {
      g.fillStyle(s.danger ? UI.red : s.color, 1);
      g.fillRect(barX, barY, barW * Phaser.Math.Clamp(s.meter, 0, 1), 10);
    }
    if (s.line !== undefined) {
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(barX + barW * s.line, barY - 4, barX + barW * s.line, barY + 14);
    }
  }
}
