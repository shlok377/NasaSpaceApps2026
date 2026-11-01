import Phaser from 'phaser';
import { DEFAULT_WINDOW, LAUNCH_WINDOWS, LaunchWindowId, WINDOW_ORDER, launchPrice } from '../game/launchWindows';
import { PX, drawPixelPanel, pixelBody, pixelTitle } from './pixel';
import { PREVIEW_SCALE, createWindowPreview } from './windowArt';

const CARD_W = 290;
const CARD_H = 392;
const GAP = 26;
const PANEL_W = CARD_W * 3 + GAP * 2 + 64;
const PANEL_H = CARD_H + 150;
const DEPTH = 1000;

/** Remembered for this visit only: the picker opens on the window you flew last. */
let lastPick: LaunchWindowId = DEFAULT_WINDOW;

interface Card {
  id: LaunchWindowId;
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  affordable: boolean;
}

/**
 * "Choose launch window" pop-up shown after pressing LAUNCH in the Rocket Lab:
 * three cards (Day, Sunset, Night) with a scene preview, effect chips and the total price.
 * Keys 1-3 or left/right choose, ENTER confirms, ESC goes back; the mouse works too.
 */
export class LaunchWindowPicker {
  private root: Phaser.GameObjects.Container | null = null;
  private cards: Card[] = [];
  private selected: LaunchWindowId = lastPick;
  private onConfirm: ((id: LaunchWindowId) => void) | null = null;
  private openedAt = 0;
  private readonly keyHandler = (event: KeyboardEvent) => this.handleKey(event);

  constructor(private readonly scene: Phaser.Scene) {}

  public get isOpen(): boolean {
    return this.root !== null;
  }

  public open(rocketCost: number, money: number, onConfirm: (id: LaunchWindowId) => void): void {
    if (this.root) return;
    const scene = this.scene;
    this.onConfirm = onConfirm;
    this.openedAt = scene.time.now;
    const cx = 640;
    const cy = 360;
    const x0 = cx - PANEL_W / 2;
    const y0 = cy - PANEL_H / 2;

    // Dim the lab and swallow clicks so nothing behind the pop-up reacts.
    const shade = scene.add.rectangle(0, 0, 1280, 720, 0x05040a, 0.72).setOrigin(0).setInteractive();
    shade.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (pointer.button === 0 && !this.inside(pointer, x0, y0)) this.close();
    });
    const panel = scene.add.graphics();
    drawPixelPanel(panel, x0, y0, PANEL_W, PANEL_H, { fill: PX.panelDeep, fillAlpha: 0.98, border: PX.border, u: 4 });
    const title = pixelTitle(scene, cx, y0 + 30, 'CHOOSE LAUNCH WINDOW', 20).setOrigin(0.5, 0);
    const sub = pixelBody(scene, cx, y0 + 62, `Rocket $${rocketCost}  ·  Bank $${money.toLocaleString()}`, 22, PX.text.muted).setOrigin(0.5, 0);
    const hint = pixelBody(scene, cx, y0 + PANEL_H - 36, '1-3 / ← →  CHOOSE   ·   ENTER  LAUNCH   ·   ESC  BACK', 20, PX.text.muted).setOrigin(0.5, 0);
    this.root = scene.add.container(0, 0, [shade, panel, title, sub, hint]).setDepth(DEPTH);

    this.cards = WINDOW_ORDER.map((id, i) => this.makeCard(id, x0 + 32 + i * (CARD_W + GAP), y0 + 100, rocketCost, money));
    for (const c of this.cards) this.root.add(c.container);
    if (!this.cards.find(c => c.id === this.selected)?.affordable) {
      this.selected = this.cards.find(c => c.affordable)?.id ?? this.selected;
    }
    this.refresh();

    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    scene.input.keyboard?.on('keydown', this.keyHandler);
  }

  public close(): void {
    if (!this.root) return;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.root.destroy();
    this.root = null;
    this.cards = [];
    this.onConfirm = null;
  }

  private inside(pointer: Phaser.Input.Pointer, x0: number, y0: number): boolean {
    return pointer.x >= x0 && pointer.x <= x0 + PANEL_W && pointer.y >= y0 && pointer.y <= y0 + PANEL_H;
  }

  private makeCard(id: LaunchWindowId, x: number, y: number, rocketCost: number, money: number): Card {
    const scene = this.scene;
    const w = LAUNCH_WINDOWS[id];
    const price = launchPrice(rocketCost, id);
    const affordable = money >= price;
    const container = scene.add.container(x, y);
    const frame = scene.add.graphics();
    const previewW = CARD_W - 36;
    const preview = scene.add.image(18, 18, createWindowPreview(scene, id)).setOrigin(0).setScale(PREVIEW_SCALE * (previewW / (80 * PREVIEW_SCALE)));
    const name = pixelTitle(scene, CARD_W / 2, 18 + preview.displayHeight + 14, w.name.toUpperCase(), 16, PX.text.cream).setOrigin(0.5, 0);
    const blurb = pixelBody(scene, CARD_W / 2, name.y + 30, w.blurb, 20, PX.text.muted).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(CARD_W - 30);
    const items: Phaser.GameObjects.GameObject[] = [frame, preview, name, blurb];

    // Effect chips, two per row.
    const chipW = (CARD_W - 36 - 8) / 2;
    w.chips.forEach((chip, i) => {
      const cxp = 18 + (i % 2) * (chipW + 8);
      const cyp = blurb.y + 46 + Math.floor(i / 2) * 28;
      const g = scene.add.graphics();
      const color = chip.good ? PX.green : PX.red;
      g.fillStyle(chip.good ? 0x0b3320 : 0x330b14, 1);
      g.fillRect(cxp, cyp, chipW, 24);
      g.fillStyle(color, 1);
      g.fillRect(cxp, cyp, chipW, 2);
      g.fillRect(cxp, cyp + 22, chipW, 2);
      g.fillRect(cxp, cyp, 2, 24);
      g.fillRect(cxp + chipW - 2, cyp, 2, 24);
      const t = pixelTitle(scene, cxp + chipW / 2, cyp + 7, chip.text, 8, chip.good ? PX.text.green : PX.text.red).setOrigin(0.5, 0);
      items.push(g, t);
    });

    const terms = [w.fee > 0 ? `Fee $${w.fee}` : 'No fee', w.earningsBonus > 0 ? `Earnings +${Math.round(w.earningsBonus * 100)}%` : 'Base earnings'].join('  ·  ');
    items.push(pixelBody(scene, CARD_W / 2, CARD_H - 68, terms, 20, PX.text.cream).setOrigin(0.5, 0));
    const priceText = affordable ? `TOTAL $${price}` : `NEED $${price}`;
    items.push(pixelTitle(scene, CARD_W / 2, CARD_H - 36, priceText, 12, affordable ? PX.text.gold : PX.text.red).setOrigin(0.5, 0));
    const key = pixelTitle(scene, 14, 12, `${WINDOW_ORDER.indexOf(id) + 1}`, 10, PX.text.white);
    items.push(key);
    container.add(items);

    if (!affordable) {
      const veil = scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x05040a, 0.6).setOrigin(0);
      container.add(veil);
    }

    container.setSize(CARD_W, CARD_H);
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
    container.on('pointerover', () => {
      if (affordable) this.select(id);
      if (scene.game.canvas) scene.game.canvas.style.cursor = affordable ? 'pointer' : 'not-allowed';
    });
    container.on('pointerout', () => {
      if (scene.game.canvas) scene.game.canvas.style.cursor = 'default';
    });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (pointer.button !== 0) return;
      if (affordable) this.confirm(id);
      else scene.cameras.main.shake(120, 0.004);
    });
    return { id, container, frame, affordable };
  }

  private select(id: LaunchWindowId): void {
    if (this.selected === id) return;
    this.selected = id;
    this.refresh();
  }

  private refresh(): void {
    for (const c of this.cards) {
      const on = c.id === this.selected;
      c.frame.clear();
      drawPixelPanel(c.frame, 0, 0, CARD_W, CARD_H, {
        fill: on ? 0x2a1a12 : PX.panel,
        fillAlpha: 1,
        border: on ? PX.accent : PX.borderDim,
        highlight: on ? 0xffe0b0 : PX.glow,
        u: 3
      });
      this.scene.tweens.add({ targets: c.container, y: (on ? -8 : 0) + this.cardTop(), duration: 120, ease: 'Power2' });
    }
  }

  private cardTop(): number {
    return 360 - PANEL_H / 2 + 100;
  }

  private move(step: number): void {
    const affordable = WINDOW_ORDER.filter(id => this.cards.find(c => c.id === id)?.affordable);
    if (affordable.length === 0) return;
    const i = affordable.indexOf(this.selected);
    this.select(affordable[(i + step + affordable.length) % affordable.length]);
  }

  /**
   * Deferred a tick: Phaser emits the generic keydown before the scene's own
   * keydown-ENTER/ESC handlers, which must still see the picker as open.
   */
  private confirm(id: LaunchWindowId): void {
    const done = this.onConfirm;
    lastPick = id;
    this.scene.time.delayedCall(0, () => {
      this.close();
      done?.(id);
    });
  }

  private handleKey(event: KeyboardEvent): void {
    // Ignore the very ENTER press that opened the picker.
    if (this.scene.time.now - this.openedAt < 120) return;
    switch (event.code) {
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Numpad1':
      case 'Numpad2':
      case 'Numpad3': {
        const id = WINDOW_ORDER[Number(event.code.slice(-1)) - 1];
        if (this.cards.find(c => c.id === id)?.affordable) this.select(id);
        break;
      }
      case 'ArrowLeft':
      case 'KeyA':
        this.move(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.move(1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (this.cards.find(c => c.id === this.selected)?.affordable) this.confirm(this.selected);
        break;
      case 'Escape':
        this.scene.time.delayedCall(0, () => this.close());
        break;
    }
  }
}
