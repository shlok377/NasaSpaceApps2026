import { playSfx } from '../core/sound';
import Phaser from 'phaser';
import { TIME_LOOKS, TIMES_OF_DAY, TimeOfDay, timeOfDayReward } from '../game/timeOfDay';
import { daySkyKey } from '../scenes/flight/LaunchSite';
import { PX } from './pixel';

/**
 * The launch-time picker on the pad: four framed cards, each a tiny painted
 * window onto that time's sky (sun or moon, a cloud, the coast), with wind
 * bars and the reward. The picked card lifts in a gold frame.
 */

const W = 120;
const H = 96;
const GAP = 12;
const SKY_H = 56;
const LIFT = 6;
/** Wind bars lit per time (DAWN calm … NIGHT stormy) and their colour. */
const WIND_BARS: Record<TimeOfDay, { n: number; color: number }> = {
  DAWN: { n: 1, color: 0x5cc8ff },
  NOON: { n: 2, color: 0x5cc8ff },
  DUSK: { n: 3, color: PX.accent },
  NIGHT: { n: 4, color: PX.red }
};

const shadowed = (font: string, size: number, color: string) => ({
  fontFamily: font,
  fontSize: `${size}px`,
  color,
  shadow: { offsetX: 1, offsetY: 1, color: '#07060b', fill: true, blur: 0 }
});

interface Card {
  time: TimeOfDay;
  box: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  tag: Phaser.GameObjects.Graphics;
  hover: boolean;
}

export class SkyCards {
  private readonly container: Phaser.GameObjects.Container;
  private readonly cards: Card[];
  private selected: TimeOfDay = 'DAWN';

  constructor(private readonly scene: Phaser.Scene, cx: number, private readonly y: number, onPick: (time: TimeOfDay) => void) {
    this.container = scene.add.container(0, 0).setDepth(15);
    const x0 = cx - (TIMES_OF_DAY.length * W + (TIMES_OF_DAY.length - 1) * GAP) / 2;
    this.cards = TIMES_OF_DAY.map((time, i) => {
      const box = scene.add.container(x0 + i * (W + GAP), y);
      const frame = scene.add.graphics();
      // The window shows the game's own sky for that time, cropped, so the card always matches.
      const sky = scene.add.image(2, 2, daySkyKey(time)).setOrigin(0, 0).setScale((W - 4) / 320).setCrop(0, 0, 320, Math.round((SKY_H - 2) / ((W - 4) / 320)));
      const art = scene.add.graphics();
      this.paintWindow(art, time);
      const look = TIME_LOOKS[time];
      const name = scene.add.text(10, SKY_H + 9, look.label, shadowed(PX.title, 8, PX.text.cream));
      const pay = scene.add.text(W - 9, SKY_H + 7, `$×${timeOfDayReward(time)}`, shadowed(PX.body, 18, PX.text.gold)).setOrigin(1, 0);
      const zone = scene.add.zone(W / 2, H / 2, W, H).setInteractive({ useHandCursor: true });
      const tag = scene.add.graphics();
      box.add([frame, sky, art, tag, name, pay, zone]);
      this.container.add(box);
      const card: Card = { time, box, frame, tag, hover: false };
      zone.on('pointerover', () => {
        card.hover = true;
        this.redraw();
        playSfx(scene, 'UI_HOVER');
      });
      zone.on('pointerout', () => ((card.hover = false), this.redraw()));
      zone.on('pointerdown', () => {
        playSfx(scene, 'UI_CLICK');
        onPick(time);
      });
      return card;
    });
    this.redraw();
  }

  public setVisible(v: boolean): void {
    if (v === this.container.visible) return;
    this.container.setVisible(v);
    for (const c of this.cards) {
      const zone = c.box.list[c.box.list.length - 1] as Phaser.GameObjects.Zone;
      if (v) zone.setInteractive({ useHandCursor: true });
      else zone.disableInteractive();
    }
  }

  public setSelected(time: TimeOfDay): void {
    this.selected = time;
    this.redraw();
  }

  /** Frames (gold when picked), wind bars, and the lift of the picked / hovered card. */
  private redraw(): void {
    for (const c of this.cards) {
      const on = c.time === this.selected;
      const g = c.frame;
      g.clear();
      g.fillStyle(0x000000, 0.35);
      g.fillRect(4, 6, W, H);
      g.fillStyle(0x07060b, 1);
      g.fillRect(-3, -3, W + 6, H + 6);
      g.fillStyle(on ? PX.gold : c.hover ? 0x8a829c : PX.border, 1);
      g.fillRect(-1, -1, W + 2, H + 2);
      if (on) {
        g.fillStyle(0xfff3c4, 1);
        g.fillRect(1, -1, W - 2, 1);
      }
      // Info strip under the window.
      g.fillStyle(0x16131d, 1);
      g.fillRect(2, SKY_H + 2, W - 4, H - SKY_H - 4);
      g.fillStyle(0x07060b, 1);
      g.fillRect(2, SKY_H, W - 4, 2);
      // Wind: four small bars, more lit (and hotter) the stormier the time.
      const wind = WIND_BARS[c.time];
      for (let b = 0; b < 4; b++) {
        g.fillStyle(b < wind.n ? wind.color : 0x332e3e, 1);
        g.fillRect(10 + b * 9, SKY_H + 25, 7, 5);
      }
      if (on) {
      }
      // Gold check tag in the window's top-right corner, drawn above the sky so nothing clips it.
      const t = c.tag;
      t.clear();
      if (on) {
        t.fillStyle(0x07060b, 1);
        t.fillRect(W - 24, 4, 20, 14);
        t.fillStyle(PX.gold, 1);
        t.fillRect(W - 22, 6, 16, 10);
        t.fillStyle(0x3a2614, 1);
        for (const [dx, dy] of [[-19, 10], [-17, 12], [-15, 10], [-13, 8], [-11, 6]] as const) t.fillRect(W + dx, dy, 2, 2);
      }
      this.scene.tweens.killTweensOf(c.box);
      this.scene.tweens.add({ targets: c.box, y: this.y - (on ? LIFT : c.hover ? LIFT / 2 : 0), duration: 110, ease: 'Quad.easeOut' });
    }
  }

  /** The little painted sky for one time of day (drawn once). */
  private paintWindow(g: Phaser.GameObjects.Graphics, time: TimeOfDay): void {
    const look = TIME_LOOKS[time];
    const x0 = 2;
    const y0 = 2;
    const w = W - 4;
    const h = SKY_H - 2;
    const groundY = y0 + h - 10;
    if (time === 'NIGHT') {
      // Storm front over the sea on the right.
      g.fillStyle(0x222a46, 1);
      // Kept inside the window so it never spills past the card's edge.
      for (const [lx, r] of [[70, 6], [82, 8], [95, 7], [106, 6]]) g.fillCircle(x0 + lx, groundY - 2, r);
    }
    // The coast: grass on the left, the sea on the right, lit by the time's land tint.
    const tint = (c: number) => {
      const a = Phaser.Display.Color.IntegerToColor(c);
      const b = Phaser.Display.Color.IntegerToColor(look.landTint);
      return Phaser.Display.Color.GetColor((a.red * b.red) / 255, (a.green * b.green) / 255, (a.blue * b.blue) / 255);
    };
    g.fillStyle(tint(0x6aaed9), 1);
    g.fillRect(x0 + w * 0.55, groundY, w * 0.45, 10);
    g.fillStyle(tint(0xd6eef8), 1);
    g.fillRect(x0 + w * 0.55, groundY, w * 0.45, 1);
    g.fillStyle(tint(0x6fb04a), 1);
    g.fillRect(x0, groundY, w * 0.55, 10);
    g.fillStyle(tint(0x9fd46a), 1);
    g.fillRect(x0, groundY, w * 0.55, 2);
    if (time === 'DAWN') {
      g.fillStyle(0xfff0f0, 0.35);
      g.fillRect(x0, groundY - 3, w, 2);
      g.fillStyle(0xfff0f0, 0.2);
      g.fillRect(x0 + 10, groundY - 6, w - 30, 2);
    }
    // A tiny rocket on its pad.
    g.fillStyle(0x07060b, 1);
    g.fillRect(x0 + 34, groundY - 12, 6, 12);
    g.fillStyle(tint(0xf4eee6), 1);
    g.fillRect(x0 + 35, groundY - 10, 4, 10);
    g.fillStyle(tint(0xe2463a), 1);
    g.fillRect(x0 + 35, groundY - 12, 4, 3);
  }
}
