import Phaser from 'phaser';
import { drawPixelPanel } from './pixel';
import { glassPanel, resizeGlass, TEXT_STYLE, TITLE_STYLE, UI } from './theme';
import { TIME_LOOKS, TIMES_OF_DAY, TimeOfDay, timeOfDayReward, timeOfDayWind } from '../game/timeOfDay';

/** Card rect (screen px): the left side of the pad, well clear of the rocket at screen centre. */
export const PREFLIGHT_CARD = { x: 16, y: 120, w: 300, h: 532 } as const;

export interface PreflightInfo {
  /** Mission title and goal, or null when every mission is done. */
  mission: { title: string; goal: string; reward: number } | null;
  verdict: string;
  verdictColor: string;
  cost: number;
  bank: number;
  onPickTime: (time: TimeOfDay) => void;
  onLaunch: () => void;
}

const { x: X, y: Y, w: W } = PREFLIGHT_CARD;
const PAD = 14;
const INNER = W - 2 * PAD;
const CELL_GAP = 6;
const CELL_W = (INNER - CELL_GAP) / 2;
const CELL_H = 54;
const GRID_Y = Y + 168;
const BTN_Y = Y + 446;
const BTN_H = 58;

interface TimeCell {
  time: TimeOfDay;
  glass: Phaser.GameObjects.Image;
  swatch: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  hover: boolean;
}

/**
 * Smoked-glass pre-flight card on the pad, top to bottom: MISSION (title, goal,
 * reward scaled by the launch time), LAUNCH TIME (2×2 grid with wind and pay),
 * the rocket's verdict, cost vs bank, and the big LAUNCH! button.
 * It slides out to the left at liftoff via `setSlide`.
 */
export class PreflightCard {
  private readonly container: Phaser.GameObjects.Container;
  private readonly reward: Phaser.GameObjects.Text;
  private readonly cells: TimeCell[];
  private readonly button: Phaser.GameObjects.Graphics;
  private readonly buttonLabel: Phaser.GameObjects.Text;
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  private readonly missionReward: number | null;
  private time: TimeOfDay = 'DAWN';
  private buttonHover = false;
  private interactive = true;

  constructor(scene: Phaser.Scene, info: PreflightInfo) {
    const panel = glassPanel(scene, X, Y, W, PREFLIGHT_CARD.h, { tint: 0.4 });
    const dividers = scene.add.graphics();
    dividers.fillStyle(0xffffff, 0.08);
    for (const dy of [132, 300, 382]) dividers.fillRect(X + PAD, Y + dy, INNER, 2);
    const items: Phaser.GameObjects.GameObject[] = [panel, dividers];
    const left = X + PAD;

    // MISSION
    this.missionReward = info.mission?.reward ?? null;
    items.push(scene.add.text(left, Y + 14, 'MISSION', TITLE_STYLE(8, UI.textMuted)));
    items.push(
      scene.add
        .text(left, Y + 34, info.mission?.title ?? 'All missions done', TITLE_STYLE(10, UI.goldText))
        .setWordWrapWidth(INNER)
        .setMaxLines(2)
        .setLineSpacing(4)
    );
    items.push(
      scene.add
        .text(left, Y + 62, info.mission?.goal ?? 'Fly for the high score!', TEXT_STYLE(13))
        .setWordWrapWidth(INNER)
        .setMaxLines(2)
        .setLineSpacing(-4)
    );
    this.reward = scene.add.text(left, Y + 102, '', TEXT_STYLE(14, UI.goldText));
    items.push(this.reward);

    // LAUNCH TIME
    items.push(scene.add.text(left, Y + 146, 'LAUNCH TIME', TITLE_STYLE(8, UI.textMuted)));
    items.push(scene.add.text(X + W - PAD, Y + 142, '← →', TEXT_STYLE(12, UI.textMuted)).setOrigin(1, 0));
    this.cells = TIMES_OF_DAY.map((time, i) => {
      const cx = left + (i % 2) * (CELL_W + CELL_GAP);
      const cy = GRID_Y + Math.floor(i / 2) * (CELL_H + CELL_GAP);
      const glass = glassPanel(scene, cx, cy, CELL_W, CELL_H);
      const swatch = scene.add.graphics();
      const label = scene.add.text(cx + 24, cy + 10, TIME_LOOKS[time].label, TITLE_STYLE(9, '#ffffff'));
      const sub = scene.add.text(cx + 10, cy + 28, `wind ×${timeOfDayWind(time)}  $×${timeOfDayReward(time)}`, TEXT_STYLE(11, UI.textMuted));
      const zone = scene.add.zone(cx + CELL_W / 2, cy + CELL_H / 2, CELL_W, CELL_H).setInteractive({ useHandCursor: true });
      const cell: TimeCell = { time, glass, swatch, x: cx, y: cy, hover: false };
      zone.on('pointerover', () => ((cell.hover = true), this.drawCells()));
      zone.on('pointerout', () => ((cell.hover = false), this.drawCells()));
      zone.on('pointerdown', () => info.onPickTime(time));
      this.zones.push(zone);
      items.push(glass, swatch, label, sub, zone);
      return cell;
    });

    // Verdict
    items.push(scene.add.text(left, Y + 312, 'ROCKET', TITLE_STYLE(8, UI.textMuted)));
    items.push(scene.add.text(left, Y + 328, info.verdict, TEXT_STYLE(13, info.verdictColor)).setWordWrapWidth(INNER).setMaxLines(3).setLineSpacing(-4));

    // Cost vs bank
    const affordable = info.bank >= info.cost;
    items.push(scene.add.text(left, Y + 394, `COST $${info.cost}`, TEXT_STYLE(15, affordable ? UI.text : UI.redText)));
    items.push(scene.add.text(X + W - PAD, Y + 394, `BANK $${info.bank}`, TEXT_STYLE(15, UI.goldText)).setOrigin(1, 0));
    items.push(
      scene.add
        .text(left, Y + 420, affordable ? `$${info.bank - info.cost} left after launch` : 'Not enough: build a cheaper one (ESC)', TEXT_STYLE(11, affordable ? UI.textMuted : UI.redText))
    );

    // LAUNCH!
    this.button = scene.add.graphics();
    this.buttonLabel = scene.add.text(X + W / 2, BTN_Y + BTN_H / 2 - 2, 'LAUNCH!', TITLE_STYLE(18, '#ffffff')).setOrigin(0.5);
    const caption = scene.add.text(X + W / 2, BTN_Y + BTN_H + 8, 'or press SPACE', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    const btnZone = scene.add.zone(X + W / 2, BTN_Y + BTN_H / 2, INNER, BTN_H).setInteractive({ useHandCursor: true });
    btnZone.on('pointerover', () => (this.buttonHover = true));
    btnZone.on('pointerout', () => (this.buttonHover = false));
    btnZone.on('pointerdown', info.onLaunch);
    this.zones.push(btnZone);
    items.push(this.button, this.buttonLabel, caption, btnZone);

    this.container = scene.add.container(0, 0, items).setDepth(15);
    this.drawCells();
  }

  /** The launch time changed: re-highlight the grid and rescale the reward. */
  public setTime(time: TimeOfDay): void {
    this.time = time;
    this.reward.setText(this.missionReward === null ? '' : `Reward +$${Math.round(this.missionReward * timeOfDayReward(time))}`);
    this.drawCells();
  }

  /** Slide the card left by `dx` px (0 = in place); it stops taking clicks once it starts leaving. */
  public setSlide(dx: number): void {
    this.container.x = dx;
    this.container.setVisible(dx > -(X + W));
    const interactive = dx === 0;
    if (interactive === this.interactive) return;
    this.interactive = interactive;
    for (const z of this.zones) {
      if (interactive) z.setInteractive({ useHandCursor: true });
      else z.disableInteractive();
    }
    if (!interactive) this.buttonHover = false;
  }

  public update(now: number): void {
    if (!this.container.visible) return;
    const g = this.button;
    g.clear();
    const left = X + PAD;
    // A soft pixel halo that breathes, then the button; it sinks 3 px under the pointer.
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const grow = Math.round(pulse * 2) * 2;
    g.fillStyle(UI.red, 0.1 + 0.12 * pulse);
    g.fillRect(left - 4 - grow, BTN_Y - 2 - grow, INNER + 8 + grow * 2, BTN_H + 4 + grow * 2);
    const sink = this.buttonHover ? 3 : 0;
    drawPixelPanel(g, left, BTN_Y + sink, INNER, BTN_H, {
      fill: this.buttonHover ? 0xf04a3a : 0xd8322f,
      fillAlpha: 1,
      border: 0xff8a5c,
      highlight: 0xffd0b0,
      u: 4
    });
    if (!this.buttonHover) {
      g.fillStyle(0x8a1414, 1);
      g.fillRect(left + 8, BTN_Y + BTN_H - 12, INNER - 16, 4);
    }
    this.buttonLabel.setY(BTN_Y + BTN_H / 2 - 2 + sink);
  }

  private drawCells(): void {
    for (const c of this.cells) {
      const on = c.time === this.time;
      const accent = TIME_LOOKS[c.time].accent;
      resizeGlass(c.glass, c.x, c.y, CELL_W, CELL_H, on ? { tint: 0.5, accent } : { tint: c.hover ? 0.15 : 0.35 });
      c.swatch.clear();
      c.swatch.fillStyle(accent, on ? 1 : 0.5);
      c.swatch.fillRect(c.x + 10, c.y + 11, 8, 8);
    }
  }
}
