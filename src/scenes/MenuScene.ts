import Phaser from 'phaser';
import { GAME_ASSETS, preloadGameAssets } from '../core/assets';
import { playSfx } from '../core/sound';
import { loadProgress, saveProgress, STARTING_MONEY } from '../game/progress';
import { PX, drawPixelPanel, pixelBody, pixelTitle } from '../ui/pixel';
import { paintLabSky } from '../ui/labSky';

/**
 * Main menu. It paints the exact same dusk sky as the Rocket Lab (ui/labSky.ts) and stands the
 * player's rocket on a launch pad in front of it. PLAY lifts the rocket off the pad; while it climbs
 * the menu cross-fades into the lab, which draws the same backdrop, so nothing jumps.
 */

const W = 1280;
const H = 720;
/** One backdrop pixel is 4 screen pixels (see ui/backdrop.ts). */
const SC = 4;
const GROUND_ROW = 163;
const PAD_TOP = GROUND_ROW - 3;
/** Rocket centre column, in backdrop pixels. */
const ROCKET_X = 192;
/** Part sprites are 48 px with 3 px art pixels; 4/3 makes their art pixels match the backdrop's 4 px. */
const PART = 64;
const ROCKET_H = PART * 5;

interface Puff {
  x: number;
  u: number;
  vx: number;
  vu: number;
  age: number;
  life: number;
  size: number;
  spark: boolean;
}

const STEAM = ['#fff1de', '#e8d8e4', '#bda8c8', '#8a7898'];
const SPARK = ['#fff6d0', '#ffd15a', '#ff8a3c', '#c44a3a'];

type MenuState = 'idle' | 'prep' | 'rise';

export class MenuScene extends Phaser.Scene {
  private siteCtx!: CanvasRenderingContext2D;
  private siteTex!: Phaser.Textures.CanvasTexture;
  private siteImg!: Phaser.GameObjects.Image;
  private rocketCv!: HTMLCanvasElement;
  private clouds: Array<{ sprite: HTMLCanvasElement; u: number; x0: number; speed: number }> = [];
  private puffs: Puff[] = [];
  private ui!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private menuList!: Phaser.GameObjects.Container;
  private subPanel?: Phaser.GameObjects.Container;
  private newGameText?: Phaser.GameObjects.Text;
  private newGameArmed = false;
  private hasSave = false;
  private lastHover = 0;
  private state: MenuState = 'idle';
  private clock = 0;
  private stateTime = 0;
  private armOut = 1;
  private altitude = 0;
  private speed = 0;
  private power = 0;
  private ventTimer = 0;
  private handedOff = false;

  constructor() {
    super('MenuScene');
  }

  preload(): void {
    preloadGameAssets(this);
  }

  /** True when the player came back here from the pause menu (QUIT TO MAIN MENU). */
  private fromPause = false;

  init(data?: { fromPause?: boolean }): void {
    this.fromPause = !!data?.fromPause;
  }

  create(): void {
    // Tests and diagnose scripts can open the lab directly with ?skipMenu (not when quitting to the menu).
    if (!this.fromPause && new URLSearchParams(window.location.search).has('skipMenu')) {
      this.scene.start('BuilderScene');
      return;
    }
    if (this.fromPause) this.cameras.main.fadeIn(450, 7, 6, 11);
    this.state = 'idle';
    this.clock = 0;
    this.stateTime = 0;
    this.armOut = 1;
    this.altitude = 0;
    this.speed = 0;
    this.power = 0;
    this.handedOff = false;
    this.puffs = [];

    const sky = this.add.graphics();
    paintLabSky(this, sky);

    this.buildRocket();
    this.buildClouds();
    if (this.textures.exists('menu_site')) this.textures.remove('menu_site');
    const tex = this.textures.createCanvas('menu_site', W, H);
    if (!tex) return;
    this.siteTex = tex;
    this.siteCtx = tex.getContext();
    this.siteCtx.imageSmoothingEnabled = false;
    this.siteImg = this.add.image(0, 0, 'menu_site').setOrigin(0).setDepth(2);

    this.createUi();
    this.sound.mute = readOptions().mute;
    this.input.keyboard?.on('keyup-ENTER', () => this.startFromKeyboard());
    this.input.keyboard?.on('keyup-SPACE', () => this.startFromKeyboard());
    this.input.keyboard?.on('keyup-ESC', () => this.closePanel());
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  private createUi(): void {
    const progress = loadProgress();
    this.hasSave = progress.flights > 0 || progress.completedMissions.length > 0 || progress.bestHeight > 0 || progress.money !== STARTING_MONEY;

    this.ui = this.add.container(0, 0).setDepth(5);
    this.title = pixelTitle(this, 44, 62, 'ROCKET LAB', 46, PX.text.accent).setDepth(6);
    const tagline = pixelBody(this, 46, 124, 'Design it. Launch it. Reach the Moon.', 28, PX.text.cream);
    this.ui.add([tagline]);

    // The five entries every main menu here has: CONTINUE, NEW GAME, FLIGHT SCHOOL, OPTIONS, EXIT.
    this.menuList = this.add.container(0, 0);
    const items: Array<{ label: string; key?: string; main?: boolean; disabled?: boolean; action: () => void }> = [
      { label: 'CONTINUE', key: this.hasSave ? 'ENTER' : '', main: this.hasSave, disabled: !this.hasSave, action: () => this.play() },
      { label: 'NEW GAME', key: this.hasSave ? '' : 'ENTER', main: !this.hasSave, action: () => this.newGame() },
      { label: 'FLIGHT SCHOOL', action: () => this.showSchool() },
      { label: 'OPTIONS', action: () => this.showOptions() },
      { label: 'EXIT', action: () => this.showExit() }
    ];
    items.forEach((it, i) => {
      const b = this.makeButton(it.label, it.key ?? '', 44, 190 + i * 64, !!it.main, !!it.disabled, it.action);
      if (it.label === 'NEW GAME') this.newGameText = b.text;
      this.menuList.add(b.container);
    });
    this.ui.add(this.menuList);

    const hint = pixelBody(this, W / 2, H - 52, this.hasSave ? 'PRESS ENTER TO CONTINUE' : 'PRESS ENTER TO START', 22, PX.text.muted).setOrigin(0.5, 0);
    this.tweens.add({ targets: hint, alpha: { from: 1, to: 0.25 }, duration: 700, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    this.ui.add([hint]);
  }

  private makeButton(
    label: string,
    key: string,
    x: number,
    y: number,
    main: boolean,
    disabled: boolean,
    onClick: () => void,
    w = 290,
    h = 52
  ): { container: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text } {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const idle = disabled ? PX.text.muted : main ? PX.text.accent : PX.text.white;
    const draw = (hover: boolean) => {
      g.clear();
      drawPixelPanel(g, 0, 0, w, h, {
        fill: main ? 0x3a1a12 : disabled ? PX.panelDeep : PX.panel,
        border: disabled ? PX.borderDim : hover || main ? PX.accent : PX.border
      });
    };
    draw(false);
    const text = pixelTitle(this, 22, 18, label, 15, idle);
    c.add([g, text]);
    if (key) c.add(pixelBody(this, w - 20, 14, key, 22, PX.text.muted).setOrigin(1, 0));
    if (disabled) c.add(pixelBody(this, w - 20, 14, 'NO SAVE', 22, PX.text.muted).setOrigin(1, 0));
    // A real hit rectangle. A container's own hit area is centred on the container, which left the
    // clickable box offset from the drawn button.
    const hit = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: !disabled });
    c.add(hit);
    let down = false;
    hit.on('pointerover', () => {
      if (this.state !== 'idle' || disabled) return;
      draw(true);
      text.setColor(PX.text.gold);
      // Sweeping the pointer over several buttons must not stack hover sounds.
      if (this.time.now - this.lastHover > 90) {
        this.lastHover = this.time.now;
        playSfx(this, 'UI_HOVER');
      }
    });
    hit.on('pointerout', () => {
      down = false;
      c.y = y;
      draw(false);
      text.setColor(idle);
    });
    // The click sound and a 2 px press happen on pointer down so the button answers instantly;
    // the action itself runs on release over the button.
    hit.on('pointerdown', () => {
      if (this.state !== 'idle') return;
      if (disabled) {
        playSfx(this, 'CLICK_FAIL');
        return;
      }
      down = true;
      c.y = y + 2;
      playSfx(this, 'UI_CLICK');
    });
    hit.on('pointerup', () => {
      c.y = y;
      if (!down || this.state !== 'idle') return;
      down = false;
      onClick();
    });
    return { container: c, text };
  }

  private startFromKeyboard(): void {
    if (this.state !== 'idle' || this.subPanel) return;
    playSfx(this, 'UI_CLICK');
    if (this.hasSave) this.play();
    else this.newGame();
  }

  /** NEW GAME wipes the save, so with one present the first click only asks. */
  private newGame(): void {
    if (this.state !== 'idle') return;
    if (this.hasSave && !this.newGameArmed) {
      this.newGameArmed = true;
      this.newGameText?.setText('ERASE SAVE? CLICK AGAIN').setColor(PX.text.red).setFontSize(11);
      this.time.delayedCall(3000, () => {
        this.newGameArmed = false;
        this.newGameText?.setText('NEW GAME').setColor(PX.text.white).setFontSize(15);
      });
      return;
    }
    if (this.hasSave) {
      saveProgress({ money: STARTING_MONEY, bestHeight: 0, completedMissions: [], flights: 0, unlockedFuels: [], assets: [] });
    }
    this.play();
  }

  // ---- sub screens (they replace the button list; ESC or BACK returns) ----

  private openPanel(title: string, w: number, build: (p: Phaser.GameObjects.Container) => number): void {
    this.closePanel();
    this.menuList.setVisible(false);
    const p = this.add.container(44, 190).setDepth(7);
    const g = this.add.graphics();
    p.add(g);
    p.add(pixelTitle(this, 18, 16, title, 13));
    const bodyH = build(p);
    const h = 56 + bodyH + 70;
    drawPixelPanel(g, 0, 0, w, h);
    const back = this.makeButton('BACK', '', 18, h - 60, false, false, () => this.closePanel(), w - 36, 44);
    p.add(back.container);
    this.subPanel = p;
  }

  private closePanel(): void {
    if (!this.subPanel) return;
    this.subPanel.destroy();
    this.subPanel = undefined;
    this.menuList.setVisible(true);
  }

  private showSchool(): void {
    const rows: Array<[string, string]> = [
      ['1-5', 'PICK PART'],
      ['C', 'COCKPIT'],
      ['CLICK', 'PLACE'],
      ['R-CLICK', 'REMOVE'],
      ['ENTER', 'LAUNCH'],
      ['W', 'THROTTLE'],
      ['A / D', 'STEER'],
      ['B', 'SEPARATE SHELLS'],
      ['SPACE', 'DEPLOY PAYLOAD']
    ];
    this.openPanel('FLIGHT SCHOOL', 340, p => {
      p.add(pixelBody(this, 18, 48, 'BUILD, LAUNCH, REACH ORBIT.', 22, PX.text.cream));
      rows.forEach(([k, v], i) => {
        p.add(pixelBody(this, 18, 84 + i * 28, k, 24, PX.text.gold));
        p.add(pixelBody(this, 322, 84 + i * 28, v, 24, PX.text.white).setOrigin(1, 0));
      });
      return 40 + rows.length * 28;
    });
  }

  private showOptions(): void {
    this.openPanel('OPTIONS', 340, p => {
      const options = readOptions();
      const toggle = (row: number, label: string, value: () => string, flip: () => void) => {
        const y = 60 + row * 44;
        p.add(pixelBody(this, 18, y, label, 26, PX.text.white));
        const v = pixelBody(this, 322, y, value(), 26, PX.text.gold).setOrigin(1, 0);
        v.setInteractive({ useHandCursor: true });
        v.on('pointerup', () => {
          playSfx(this, 'UI_CLICK');
          flip();
          v.setText(value());
        });
        p.add(v);
      };
      toggle(0, 'SOUND', () => (this.sound.mute ? 'OFF' : 'ON'), () => {
        this.sound.mute = !this.sound.mute;
        options.mute = this.sound.mute;
        writeOptions(options);
      });
      toggle(1, 'FULLSCREEN', () => (this.scale.isFullscreen ? 'ON' : 'OFF'), () => {
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
      });
      return 90;
    });
  }

  private showExit(): void {
    this.openPanel('EXIT', 340, p => {
      p.add(pixelBody(this, 18, 52, 'THANKS FOR PLAYING!', 28, PX.text.cream));
      p.add(pixelBody(this, 18, 92, 'Your progress is saved.', 24, PX.text.white));
      p.add(pixelBody(this, 18, 120, 'Close this tab to quit.', 24, PX.text.muted));
      return 100;
    });
    window.close(); // only works for tabs the page opened itself; otherwise the note above applies
  }

  // ---------------------------------------------------------------------------
  // Play: the rocket lifts off, then the menu fades into the lab
  // ---------------------------------------------------------------------------

  private play(): void {
    if (this.state !== 'idle') return;
    this.state = 'prep';
    this.stateTime = 0;
    this.closePanel();

    // Menu text slides out; the title travels to where the lab keeps its own title.
    this.tweens.add({ targets: this.ui, alpha: 0, x: -50, duration: 450, ease: 'Sine.easeIn' });
    const scale = 26 / 46;
    this.tweens.add({
      targets: this.title,
      x: W / 2 - (this.title.width * scale) / 2,
      y: 12,
      scaleX: scale,
      scaleY: scale,
      duration: 1500,
      delay: 200,
      ease: 'Sine.easeInOut',
      onUpdate: tween => {
        if (tween.progress > 0.5) this.title.setColor(PX.text.cream);
      }
    });
    this.tweens.add({ targets: this, armOut: 0, duration: 650, ease: 'Sine.easeInOut' });
  }

  private handOffToLab(): void {
    if (this.handedOff) return;
    this.handedOff = true;
    // The lab starts underneath (same sky) and fades in; it stops this scene when it is fully visible.
    this.scene.launch('BuilderScene', { fromMenu: true });
    this.tweens.add({ targets: this.siteImg, alpha: 0, duration: 900, ease: 'Sine.easeIn' });
  }

  update(_time: number, delta: number): void {
    if (!this.siteCtx) return;
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    this.stateTime += dt;

    if (this.state === 'prep') {
      this.power = Phaser.Math.Clamp((this.stateTime - 0.3) / 0.6, 0, 1) * 0.5;
      if (this.stateTime > 0.35 && this.stateTime - dt <= 0.35) playSfx(this, 'ROCKET_ENGINE');
      if (this.stateTime > 0.3) {
        for (let i = 0; i < 2; i++) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          this.emit(ROCKET_X + dir * 4, 1, dir * (22 + Math.random() * 40), 2 + Math.random() * 6, 1.4, 2, false);
        }
      }
      if (this.stateTime >= 0.85) {
        this.state = 'rise';
        this.stateTime = 0;
      }
    } else if (this.state === 'rise') {
      this.power = 1;
      this.speed += 150 * dt;
      this.altitude += this.speed * dt;
      if (this.altitude < 70) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.emit(ROCKET_X + dir * 5, 1 + Math.random() * 3, dir * (30 + Math.random() * 55), 2 + Math.random() * 6, 1.8, 3, false);
      }
      this.emit(ROCKET_X + (Math.random() * 4 - 2), this.altitude - 2, (Math.random() * 20 - 10), -(6 + Math.random() * 22), 2.4, 2 + Math.floor(Math.random() * 2), false);
      this.emit(ROCKET_X + (Math.random() * 4 - 2), this.altitude - 2, Math.random() * 20 - 10, -(40 + Math.random() * 50), 0.5, 1, true);
      if (this.altitude > 95) this.handOffToLab();
    } else {
      this.ventTimer -= dt;
      if (this.ventTimer <= 0) {
        this.ventTimer = 0.3;
        this.emit(ROCKET_X - 9 + Math.random() * 2, 2, -6 - Math.random() * 5, 3 + Math.random() * 4, 2.4, 1, false);
        this.emit(ROCKET_X + 9, 2, 6 + Math.random() * 5, 3 + Math.random() * 4, 2.4, 1, false);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.u += p.vu * dt;
      if (!p.spark) {
        p.vx *= 1 - dt * 0.8;
        p.vu *= 1 - dt * 0.5;
        if (p.vu < 0 && p.u < 2) {
          p.u = 2;
          p.vu = 0;
        }
      }
    }
    this.drawSite();
    this.siteTex.refresh();
  }

  private emit(x: number, u: number, vx: number, vu: number, life: number, size: number, spark: boolean): void {
    if (this.puffs.length < 600) this.puffs.push({ x, u, vx, vu, age: 0, life, size, spark });
  }

  // ---------------------------------------------------------------------------
  // The launch site, drawn pixel by pixel on a canvas laid over the shared sky
  // ---------------------------------------------------------------------------

  private source(key: string): CanvasImageSource {
    return this.textures.get(key).getSourceImage() as CanvasImageSource;
  }

  private buildRocket(): void {
    const c = document.createElement('canvas');
    c.width = PART * 3;
    c.height = ROCKET_H;
    const g = c.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    const stack: Array<[string, number]> = [
      [GAME_ASSETS.PART_NOSE_CONE.key, 0],
      [GAME_ASSETS.PART_SATELLITE.key, PART],
      [GAME_ASSETS.PART_BLOCK.key, PART * 2],
      [GAME_ASSETS.PART_FUEL.key, PART * 3],
      [GAME_ASSETS.PART_ENGINE.key, PART * 4]
    ];
    for (const [key, y] of stack) g.drawImage(this.source(key), PART, y, PART, PART);
    g.drawImage(this.source(GAME_ASSETS.PART_LEFT_WING.key), 0, PART * 3, PART, PART);
    g.drawImage(this.source(GAME_ASSETS.PART_RIGHT_WING.key), PART * 2, PART * 3, PART, PART);
    // Dusk light from the left: warm rim on lit edges, stepped shade on the right, orange tint overall.
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,236,200,.22)';
    g.fillRect(PART, 0, 8, ROCKET_H);
    g.fillRect(0, PART * 3, 8, PART);
    g.fillStyle = 'rgba(30,10,60,.24)';
    g.fillRect(101, 0, 35, ROCKET_H);
    g.fillRect(PART * 2 + 8, PART * 3, 56, PART);
    g.fillStyle = 'rgba(30,10,60,.2)';
    g.fillRect(115, 0, 21, ROCKET_H);
    g.fillRect(PART * 2 + 32, PART * 3, 32, PART);
    g.fillStyle = 'rgba(255,120,60,.10)';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    this.rocketCv = c;
  }

  private buildClouds(): void {
    const palette = ['#3a2a4a', '#8a5a78', '#e8a890'];
    const specs: Array<[number, number, number, number, number]> = [
      [44, 14, 1, 38, 2.0],
      [30, 10, 2, 52, 1.5],
      [62, 17, 3, 24, 2.6],
      [22, 8, 4, 66, 1.2],
      [44, 14, 5, 74, 1.8]
    ];
    this.clouds = specs.map(([w, h, seed, row, speed]) => ({ sprite: this.makeCloud(w, h, seed, palette), u: GROUND_ROW - row, x0: (seed * 83) % 320, speed }));
  }

  private makeCloud(w: number, h: number, seed: number, palette: string[]): HTMLCanvasElement {
    let s = seed >>> 0;
    const rr = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const m: Uint8Array[] = [];
    for (let y = 0; y < h; y++) m.push(new Uint8Array(w));
    const n = Math.max(4, Math.floor(w / 7));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const cx = w * 0.12 + t * w * 0.76;
      const r = (h * 0.35 + rr() * h * 0.4) * (1 - Math.abs(t - 0.5) * 0.9);
      const cy = h - r * 0.7 - 1;
      for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, (y - cy) * 1.15) < r) m[y][x] = 1;
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return c;
    const [lo, mid, hi] = palette;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y][x]) continue;
        const top = y === 0 || !m[y - 1][x];
        const bot = y + 1 >= h || !m[y + 1][x];
        let col = top ? hi : y > h * 0.55 ? ((x + y) & 1 && y < h * 0.72 ? mid : lo) : mid;
        if (bot) col = lo;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  private drawSite(): void {
    const c = this.siteCtx;
    const t = this.clock;
    c.clearRect(0, 0, W, H);
    const P = (col: string, x: number, y: number, w = 1, h = 1) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x * SC), Math.round(y * SC), w * SC, h * SC);
    };
    const glow = (cx: number, cy: number, r: number, col: string) => {
      c.fillStyle = col;
      cx = Math.round(cx);
      cy = Math.round(cy);
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = x * x + y * y;
          if (d > r * r) continue;
          if (d < r * r * 0.3 ? ((x + y + cx + cy) & 1) === 0 : (x & 1) === 0 && (y & 1) === 0) c.fillRect((cx + x) * SC, (cy + y) * SC, SC, SC);
        }
      }
    };

    // clouds drift slowly in front of the Moon, high above the mountains
    for (const cl of this.clouds) {
      const x = ((cl.x0 + t * cl.speed) % (320 + 100)) - 50;
      c.drawImage(cl.sprite, Math.round(x * SC), Math.round((cl.u - cl.sprite.height) * SC), cl.sprite.width * SC, cl.sprite.height * SC);
    }
    // birds
    for (let i = 0; i < 4; i++) {
      const x = ((20 + i * 14 + t * (i === 3 ? 7 : 10)) % 380) - 30;
      const y = Math.round(78 + (i === 3 ? 18 : i * 6) + Math.sin(t * 1.3 + i) * 2);
      const flap = Math.floor(t * 5 + i) % 2;
      const pts = flap ? [[-2, -1], [-1, 0], [0, 1], [1, 0], [2, -1]] : [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]];
      for (const [dx, dy] of pts) P('#1a1220', x + dx, y + dy);
    }

    this.drawComplex(P, glow, t);
    this.drawPad(P, glow);
    this.drawTower(P, glow, t);
    this.drawFlag(c, t);
    this.drawRocket(c, glow, t);

    // steam and exhaust
    for (const p of this.puffs) {
      const k = p.age / p.life;
      const sy = GROUND_ROW - p.u;
      if (p.spark) {
        P(SPARK[Math.min(3, Math.floor(k * 4))], p.x, sy);
        continue;
      }
      const sz = Math.max(1, Math.round(p.size * (1 + k * 1.8)));
      P(STEAM[Math.min(3, Math.floor(k * 4))], p.x - (sz >> 1), sy - (sz >> 1), sz, sz);
    }
  }

  private drawComplex(P: (c: string, x: number, y: number, w?: number, h?: number) => void, glow: (x: number, y: number, r: number, c: string) => void, t: number): void {
    const x = 98;
    const y = GROUND_ROW;
    P('#1a1620', x - 1, y - 23, 34, 23);
    P('#4a4060', x, y - 22, 32, 22);
    P('#6a5a88', x, y - 22, 2, 22);
    P('#2e2640', x + 30, y - 22, 2, 22);
    P('#6a5a88', x, y - 22, 32, 1);
    for (let i = 0; i < 5; i++) {
      const on = (Math.floor(t * 0.4) + i * 3) % 7 !== 0;
      P(on ? '#ffc060' : '#2a2236', x + 4 + i * 5, y - 17, 3, 3);
      if (on) glow(x + 5 + i * 5, y - 16, 3, '#ffa53d');
    }
    P('#1a1620', x + 11, y - 10, 10, 10);
    P('#2a2236', x + 12, y - 9, 8, 9);
    P('#ff7a2a', x + 13, y - 12, 6, 1);
    P('#1a1620', x + 24, y - 27, 1, 5);
    P('#cfcde0', x + 22, y - 28, 5, 1);
    P('#cfcde0', x + 23 + Math.round(Math.sin(t * 0.9) * 2), y - 29, 3, 1);
    if (Math.floor(t * 1.1) % 2 === 0) P('#ff4a4a', x + 24, y - 30);
  }

  private drawPad(P: (c: string, x: number, y: number, w?: number, h?: number) => void, glow: (x: number, y: number, r: number, c: string) => void): void {
    P('#1a1620', 136, PAD_TOP - 1, 114, 5);
    P('#9a90b0', 137, PAD_TOP, 112, 1);
    P('#5a5270', 137, PAD_TOP + 1, 112, 2);
    P('#3e3650', 137, PAD_TOP + 3, 112, 1);
    for (let x = 138; x < 248; x += 6) {
      const on = (Math.floor(this.clock * 3) + Math.floor(x / 6)) % 4 !== 0;
      P(on ? '#40d8f0' : '#1a4a58', x, PAD_TOP + 1, 3, 1);
    }
    for (const lx of [138, 248]) {
      P('#1a1620', lx, GROUND_ROW - 17, 1, 14);
      P('#6a6486', lx, GROUND_ROW - 16, 1, 13);
      P('#fff2c0', lx - 1, GROUND_ROW - 18, 3, 1);
      glow(lx, GROUND_ROW - 17, 11, '#ffc060');
    }
  }

  private drawTower(P: (c: string, x: number, y: number, w?: number, h?: number) => void, glow: (x: number, y: number, r: number, c: string) => void, t: number): void {
    const x0 = 146;
    const H2 = 84;
    for (let k = 0; k < H2; k++) {
      const y = GROUND_ROW - 1 - k;
      P('#1a1620', x0 - 1, y);
      P('#cfcde0', x0, y);
      P('#8a86a8', x0 + 1, y);
      P('#8a86a8', x0 + 8, y);
      P('#4a4666', x0 + 9, y);
      P('#1a1620', x0 + 10, y);
      const kk = k % 12;
      const xi = kk < 6 ? kk : 12 - kk;
      P('#6a6486', x0 + 2 + Math.min(5, xi), y);
      if (k % 24 >= 20) {
        P('#d8302f', x0, y, 2, 1);
        P('#a02020', x0 + 8, y, 2, 1);
      }
    }
    P('#1a1620', x0 - 3, GROUND_ROW - H2 - 2, 16, 4);
    P('#8a86a8', x0 - 2, GROUND_ROW - H2 - 1, 14, 2);
    P('#cfcde0', x0 - 2, GROUND_ROW - H2 - 1, 14, 1);
    P('#1a1620', x0 + 4, GROUND_ROW - H2 - 10, 2, 8);
    if (Math.floor(t * 1.4) % 2 === 0) {
      P('#ff4a4a', x0 + 4, GROUND_ROW - H2 - 11, 2, 2);
      glow(x0 + 5, GROUND_ROW - H2 - 10, 6, '#ff4a4a');
    }
    const rx = ROCKET_X - 8;
    const ax = x0 + 11;
    const len = Math.round((rx - ax) * this.armOut);
    if (len > 0) {
      const ay = GROUND_ROW - 34;
      P('#1a1620', ax, ay - 1, len + 1, 5);
      P('#8a86a8', ax, ay, len, 3);
      P('#cfcde0', ax, ay, len, 1);
      P('#d8302f', ax + len - 2, ay - 1, 2, 5);
      P('#6a6486', ax + 2, ay + 3, 6, 1);
    }
  }

  private drawFlag(c: CanvasRenderingContext2D, t: number): void {
    const img = this.source(GAME_ASSETS.FLAG_BLUE.key);
    const x = 226 * SC;
    const y = (PAD_TOP - 16) * SC;
    for (let sx = 0; sx < 32; sx++) {
      const dy = Math.round(Math.sin(t * 3.2 - sx * 0.4) * (sx / 32) * 1.5) * SC;
      c.drawImage(img, sx, 0, 1, 32, x + sx * 2, y + dy, 2, 64);
    }
  }

  private drawRocket(c: CanvasRenderingContext2D, glow: (x: number, y: number, r: number, c: string) => void, t: number): void {
    const shake = this.state === 'prep' && this.power > 0.1 ? (Math.random() < 0.5 ? -1 : 0) : 0;
    const cx = ROCKET_X * SC + shake;
    const bottom = PAD_TOP * SC - this.altitude * SC;
    if (this.power > 0) {
      const ny = bottom;
      glow(cx / SC, ny / SC + 2, Math.round(8 + this.power * 16), '#ff9a3c');
      const len = Math.round((6 + this.power * 34 + Math.random() * 4) * SC);
      for (let i = 0; i < len; i++) {
        const t2 = i / len;
        const hw = Math.max(0, Math.round(5 * (1 - t2) * (1 - 0.15 * Math.sin(i * 0.3 + t * 40)) * SC));
        if (hw <= 0) continue;
        c.fillStyle = t2 < 0.35 ? '#ff9a3c' : t2 < 0.7 ? '#ff5a3c' : '#b8324a';
        c.fillRect(cx - hw, ny + i, hw * 2, 1);
        const h2 = Math.round(hw * 0.62);
        if (h2 > 0) {
          c.fillStyle = t2 < 0.5 ? '#ffd15a' : '#ff9a3c';
          c.fillRect(cx - h2, ny + i, h2 * 2, 1);
        }
        const h3 = Math.round(hw * 0.3);
        if (h3 > 0 && t2 < 0.5) {
          c.fillStyle = '#fff6d0';
          c.fillRect(cx - h3, ny + i, h3 * 2, 1);
        }
      }
    }
    c.drawImage(this.rocketCv, Math.round(cx - PART * 1.5), Math.round(bottom - ROCKET_H));
  }
}

const OPTIONS_KEY = 'nasa2026.options';

interface MenuOptions {
  mute: boolean;
}

function readOptions(): MenuOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    return { mute: raw ? !!(JSON.parse(raw) as Partial<MenuOptions>).mute : false };
  } catch {
    return { mute: false };
  }
}

function writeOptions(o: MenuOptions): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // blocked storage: the setting just won't persist
  }
}
