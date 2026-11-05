import Phaser from 'phaser';
import { playSfx } from '../core/sound';
import { nextEnabled, PauseAction, PauseContext, PauseItem } from '../game/pauseRules';
import { hudFrame } from '../ui/CornerHud';
import { PX, drawPixelPanel, pixelBody, pixelTitle } from '../ui/pixel';

export interface PauseStatusRow {
  label: string;
  value: string;
  color?: string;
}

export interface PauseSceneData {
  context: PauseContext;
  /** The scene frozen underneath this one. */
  target: 'FlightScene' | 'BuilderScene';
  title: string;
  subtitle: string;
  items: PauseItem[];
  statusTitle: string;
  status: PauseStatusRow[];
}

/** What the flight scene offers the pause menu. */
export interface PauseHost {
  restartPhaseFromPause(): void;
  launchAgainFromPause(): void;
  leaveToBuilderFromPause(): void;
  resumedFromPause(): void;
}

const PANEL_X = 250;
const PANEL_W = 780;
const BTN_X = 290;
const BTN_W = 340;
const BTN_H = 52;
const BTN_STEP = 64;
const CARD_X = 660;
const CARD_W = 340;
/** Body opacity of every panel here: the same 55% see-through as the flight HUD's HEIGHT tube (ui/CornerHud.ts). */
const PANEL_ALPHA = 0.55;
/** How much the frozen game is darkened behind the menu. Light, so the see-through panels show the flight. */
const DIM_ALPHA = 0.35;
/** Seconds per number of the resume countdown. */
const COUNT_STEP = 0.7;
const QUIT_SECONDS = 0.6;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

interface Button {
  item: PauseItem;
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  reason: Phaser.GameObjects.Text;
  armed: boolean;
  disarm?: Phaser.Time.TimerEvent;
  y: number;
}

type PauseState = 'menu' | 'count' | 'go' | 'quit';

/**
 * Pause menu, drawn over a frozen flight or lab. The scene underneath is paused (no updates, tweens or
 * timers) and its sounds are paused too, so everything carries on from the same spot on resume.
 * In flight, CONTINUE resumes with a short 3-2-1; the lab resumes at once.
 */
export class PauseScene extends Phaser.Scene {
  private data0!: PauseSceneData;
  private buttons: Button[] = [];
  private selected = 0;
  private state: PauseState = 'menu';
  private dim!: Phaser.GameObjects.Rectangle;
  private panel!: Phaser.GameObjects.Container;
  private countText!: Phaser.GameObjects.Text;
  private clock = 0;
  private stateTime = 0;
  private lastHover = 0;
  /** Panel size follows the number of items; the panel is centred on the screen. */
  private panelY = 0;
  private panelH = 0;
  private btnY = 0;
  private dissolveCtx?: CanvasRenderingContext2D;
  private dissolveData?: ImageData;
  private dissolveTex?: Phaser.Textures.CanvasTexture;

  constructor() {
    super('PauseScene');
  }

  init(data: PauseSceneData): void {
    this.data0 = data;
    const body = Math.max(data.items.length * BTN_STEP - (BTN_STEP - BTN_H), 240);
    this.panelH = 110 + body + 100;
    this.panelY = Math.round((720 - this.panelH) / 2);
    this.btnY = this.panelY + 110;
    this.buttons = [];
    this.selected = 0;
    this.state = 'menu';
    this.clock = 0;
    this.stateTime = 0;
  }

  create(): void {
    // Freeze the sound of the scene underneath. Sounds started from here (menu clicks) still play.
    this.sound.pauseAll();

    this.dim = this.add.rectangle(0, 0, 1280, 720, 0x07060b, DIM_ALPHA).setOrigin(0).setDepth(0).setInteractive();
    this.panel = this.add.container(0, 0).setDepth(2);

    const frame = this.add.graphics();
    hudFrame(frame, PANEL_X, this.panelY, PANEL_W, this.panelH, PX.border, PANEL_ALPHA);
    this.panel.add(frame);
    this.panel.add(pixelTitle(this, 640, this.panelY + 24, this.data0.title, 26, PX.text.cream).setOrigin(0.5, 0));
    this.panel.add(pixelBody(this, 640, this.panelY + 70, this.data0.subtitle, 24, PX.text.muted).setOrigin(0.5, 0));

    this.data0.items.forEach((item, i) => {
      const b = this.makeButton(item, i);
      this.buttons.push(b);
      this.panel.add(b.container);
    });
    this.selected = Math.max(0, this.data0.items.findIndex(i => i.enabled));
    this.buttons.forEach((_, i) => this.draw(i));

    this.createStatusCard();
    this.panel.add(pixelBody(this, 640, this.panelY + this.panelH - 52, 'ESC OR P: RESUME     W / S + ENTER: SELECT', 22, PX.text.muted).setOrigin(0.5, 0));

    this.countText = pixelTitle(this, 640, 290, '', 120, PX.text.cream).setOrigin(0.5).setDepth(5).setVisible(false);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private createStatusCard(): void {
    const top = this.btnY;
    const height = this.data0.items.length * BTN_STEP - (BTN_STEP - BTN_H);
    const g = this.add.graphics();
    hudFrame(g, CARD_X, top, CARD_W, Math.max(height, 240), PX.border, PANEL_ALPHA);
    this.panel.add(g);
    this.panel.add(pixelTitle(this, CARD_X + 20, top + 18, this.data0.statusTitle, 12, PX.text.accent));
    this.data0.status.forEach((row, i) => {
      const y = top + 56 + i * 38;
      this.panel.add(pixelBody(this, CARD_X + 20, y, row.label, 24, PX.text.muted));
      this.panel.add(pixelBody(this, CARD_X + CARD_W - 20, y, row.value, 26, row.color ?? PX.text.white).setOrigin(1, 0));
    });
  }

  private makeButton(item: PauseItem, index: number): Button {
    const y = this.btnY + index * BTN_STEP;
    const container = this.add.container(BTN_X, y);
    const graphics = this.add.graphics();
    const label = pixelTitle(this, 20, 19, item.label, 14, PX.text.white);
    const reason = pixelBody(this, BTN_W - 16, 14, item.reason ?? '', 22, PX.text.muted).setOrigin(1, 0);
    container.add([graphics, label, reason]);

    // A real hit rectangle (a container's own hit area is centred on the container, not on its drawing).
    const hit = this.add.rectangle(BTN_W / 2, BTN_H / 2, BTN_W, BTN_H, 0x000000, 0.001).setInteractive({ useHandCursor: item.enabled });
    container.add(hit);
    const button: Button = { item, container, graphics, label, reason, armed: false, y };
    let down = false;
    hit.on('pointerover', () => {
      if (this.state === 'menu' && item.enabled) this.select(index, true);
    });
    hit.on('pointerout', () => {
      down = false;
      container.y = y;
    });
    // Click sound and a 2 px press on pointer down; the action runs on release over the button.
    hit.on('pointerdown', () => {
      if (this.state !== 'menu') return;
      if (!item.enabled) {
        playSfx(this, 'CLICK_FAIL');
        return;
      }
      down = true;
      container.y = y + 2;
      playSfx(this, 'UI_CLICK');
    });
    hit.on('pointerup', () => {
      container.y = y;
      if (!down || this.state !== 'menu') return;
      down = false;
      this.activate(index, false);
    });
    return button;
  }

  private draw(i: number): void {
    const b = this.buttons[i];
    const selected = i === this.selected && this.state === 'menu';
    const main = b.item.action === 'CONTINUE';
    const enabled = b.item.enabled;
    b.graphics.clear();
    drawPixelPanel(b.graphics, 0, 0, BTN_W, BTN_H, {
      fillAlpha: PANEL_ALPHA,
      fill: b.armed ? 0x3a1212 : main && !selected ? 0x2a1610 : enabled ? PX.panel : PX.panelDeep,
      border: !enabled ? PX.borderDim : b.armed ? PX.red : selected ? PX.accent : main ? 0x8a5a2a : PX.border
    });
    b.label.setText(b.armed && b.item.confirm ? b.item.confirm : b.item.label);
    b.label.setColor(!enabled ? PX.text.muted : b.armed ? PX.text.red : selected ? PX.text.gold : main ? PX.text.accent : PX.text.white);
    b.reason.setVisible(!b.armed);
  }

  private select(i: number, hover: boolean): void {
    if (i === this.selected) return;
    const prev = this.selected;
    this.selected = i;
    this.draw(prev);
    this.draw(i);
    // Sweeping the pointer over several buttons must not stack hover sounds.
    if (this.time.now - this.lastHover > 90) {
      this.lastHover = this.time.now;
      playSfx(this, 'UI_HOVER');
    }
    void hover;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    // Holding the key that opened the menu must not close it again.
    if (e.repeat) return;
    if (this.state === 'quit' || this.state === 'go') return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.state === 'count') this.cancelCountdown();
      else this.activateAction('CONTINUE');
      return;
    }
    if (this.state !== 'menu') return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      this.select(nextEnabled(this.data0.items, this.selected, -1), false);
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      this.select(nextEnabled(this.data0.items, this.selected, 1), false);
    } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      playSfx(this, 'UI_CLICK');
      this.activate(this.selected, true);
    }
  }

  private activateAction(action: PauseAction): void {
    const i = this.data0.items.findIndex(it => it.action === action);
    if (i >= 0) this.activate(i, false);
  }

  /** Runs an item. Items with a confirm text only arm on the first activation. */
  private activate(i: number, _fromKey: boolean): void {
    const b = this.buttons[i];
    if (!b || !b.item.enabled) {
      playSfx(this, 'CLICK_FAIL');
      return;
    }
    if (b.item.confirm && !b.armed) {
      this.buttons.forEach((o, j) => {
        if (o.armed) {
          o.armed = false;
          o.disarm?.remove(false);
          this.draw(j);
        }
      });
      b.armed = true;
      this.draw(i);
      b.disarm = this.time.delayedCall(3000, () => {
        b.armed = false;
        this.draw(i);
      });
      return;
    }
    this.perform(b.item.action);
  }

  private host(): PauseHost {
    return this.scene.get(this.data0.target) as unknown as PauseHost;
  }

  private perform(action: PauseAction): void {
    switch (action) {
      case 'CONTINUE':
        this.beginResume();
        break;
      case 'RESTART_PHASE':
        // Rewind to the start of the phase (free), then the same 3-2-1 as a normal resume.
        this.host().restartPhaseFromPause();
        this.beginResume();
        break;
      case 'LAUNCH_AGAIN':
        this.sound.resumeAll();
        this.host().launchAgainFromPause();
        this.scene.stop();
        break;
      case 'BUILDER':
        this.sound.resumeAll();
        this.host().leaveToBuilderFromPause();
        this.scene.stop();
        break;
      case 'QUIT':
        this.startQuit();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Resume
  // ---------------------------------------------------------------------------

  private beginResume(): void {
    if (this.data0.context === 'LAB') {
      this.finishResume();
      this.scene.stop();
      return;
    }
    this.state = 'count';
    this.stateTime = 0;
    this.panel.setVisible(false);
    this.dim.setAlpha(0.3);
    this.countText.setVisible(true).setAlpha(1);
  }

  private cancelCountdown(): void {
    this.state = 'menu';
    this.panel.setVisible(true);
    this.dim.setAlpha(DIM_ALPHA);
    this.countText.setVisible(false);
    this.buttons.forEach((_, i) => this.draw(i));
  }

  /** Wake the scene underneath: sounds first, then the frozen update loop. */
  private finishResume(): void {
    this.sound.resumeAll();
    this.scene.resume(this.data0.target);
    this.host().resumedFromPause?.();
  }

  // ---------------------------------------------------------------------------
  // Quit: a dithered dissolve to dark, then the main menu
  // ---------------------------------------------------------------------------

  private startQuit(): void {
    this.state = 'quit';
    this.stateTime = 0;
    if (this.textures.exists('pause_dissolve')) this.textures.remove('pause_dissolve');
    const tex = this.textures.createCanvas('pause_dissolve', 320, 180);
    if (!tex) {
      this.finishQuit();
      return;
    }
    this.dissolveTex = tex;
    this.dissolveCtx = tex.getContext();
    const data = this.dissolveCtx.createImageData(320, 180);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = 7;
      data.data[i + 1] = 6;
      data.data[i + 2] = 11;
      data.data[i + 3] = 0;
    }
    this.dissolveData = data;
    this.add.image(0, 0, 'pause_dissolve').setOrigin(0).setScale(4).setDepth(100);
  }

  private finishQuit(): void {
    this.sound.resumeAll();
    this.sound.stopAll();
    this.scene.stop('FlightScene');
    this.scene.stop('BuilderScene');
    this.scene.start('MenuScene', { fromPause: true });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    this.stateTime += dt;

    if (this.state === 'count') {
      const n = 3 - Math.floor(this.stateTime / COUNT_STEP);
      if (n <= 0) {
        this.state = 'go';
        this.stateTime = 0;
        this.countText.setText('GO!');
        this.finishResume();
      } else if (this.countText.text !== String(n)) {
        this.countText.setText(String(n));
        playSfx(this, 'UI_HOVER');
      }
    } else if (this.state === 'go') {
      this.countText.setAlpha(Math.max(0, 1 - this.stateTime / 0.4));
      this.dim.setAlpha(0.3 * Math.max(0, 1 - this.stateTime / 0.4));
      if (this.stateTime > 0.4) this.scene.stop();
    } else if (this.state === 'quit' && this.dissolveCtx && this.dissolveData && this.dissolveTex) {
      const level = Math.min(1, this.stateTime / QUIT_SECONDS);
      const px = this.dissolveData.data;
      for (let y = 0; y < 180; y++) {
        for (let x = 0; x < 320; x++) {
          px[(y * 320 + x) * 4 + 3] = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < level ? 255 : 0;
        }
      }
      this.dissolveCtx.putImageData(this.dissolveData, 0, 0);
      this.dissolveTex.refresh();
      if (level >= 1) this.finishQuit();
    }
  }
}
