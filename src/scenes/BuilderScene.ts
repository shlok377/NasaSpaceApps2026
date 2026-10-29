import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { currentMission, rocketCost } from '../game/missions';
import { loadProgress, saveProgress, withGrant } from '../game/progress';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { PartType, PortDirection, RocketNode } from '../core/types';
import { ParticleManager } from '../particles';
import { preloadGameAssets, getPartTextureKey, GAME_ASSETS } from '../core/assets';
import { PX, drawPixelPanel, drawSparkle, pixelBody, pixelTitle } from '../ui/pixel';
import { BACKDROP_SCALE, createBackdropTexture } from '../ui/backdrop';

interface PaletteBay {
  type: PartType;
  label: string;
  container: Phaser.GameObjects.Container;
  bgGfx: Phaser.GameObjects.Graphics;
  hotkeyNum: string;
}

const SIDE_X = 20;
const SIDE_W = 240;
const RIGHT_X = 1280 - SIDE_X - SIDE_W;
const PANEL_TOP = 60;
const PANEL_BOTTOM = 676;
const SLOT_W = 216;
const SLOT_H = 56;
/** TWR at the gauge's far right; TWR 1 (liftoff) points straight up. */
const TWR_GAUGE_MAX = 2;

export class BuilderScene extends Phaser.Scene {
  public static readonly GRID_COLS = 15;
  public static readonly GRID_ROWS = 13;
  public static readonly CELL_SIZE = 48;
  /** Overall opacity of the glass panes over the build bay. */
  private static readonly GLASS_OPACITY = 0.4;

  public readonly hudHeight = 300;
  public readonly hudY = PANEL_TOP;

  private rocketTree!: RocketTree;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private glassGraphics!: Phaser.GameObjects.Graphics;
  private blocksContainer!: Phaser.GameObjects.Container;
  private socketsContainer!: Phaser.GameObjects.Container;
  private ghostContainer!: Phaser.GameObjects.Container;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private ghostSprite!: Phaser.GameObjects.Image;
  private ghostText!: Phaser.GameObjects.Text;
  private hudContainer!: Phaser.GameObjects.Container;

  private blockDisplayMap: Map<string, Phaser.GameObjects.Container> = new Map();

  public gridOriginX = 0;
  public gridOriginY = 0;

  private selectedPartType: PartType | null = null;
  public paletteBays: PaletteBay[] = [];
  public particleManager!: ParticleManager;
  private hoveredBay: PartType | null = null;

  // HUD objects
  private statusChipBg!: Phaser.GameObjects.Graphics;
  private hudStatusText!: Phaser.GameObjects.Text;
  private statValues: Record<'mass' | 'thrust' | 'fuel' | 'twr', Phaser.GameObjects.Text> = {} as never;
  private gaugeNeedle!: Phaser.GameObjects.Image;
  private warningText!: Phaser.GameObjects.Text;
  private launchButton!: Phaser.GameObjects.Container;
  private launchButtonBg!: Phaser.GameObjects.Graphics;
  private launchButtonText!: Phaser.GameObjects.Text;
  private launchSubText!: Phaser.GameObjects.Text;
  private launchPulse?: Phaser.Tweens.Tween;
  private launchReady = false;
  private launchBlockedReason = '';
  private bankText!: Phaser.GameObjects.Text;
  private costText!: Phaser.GameObjects.Text;
  private missionText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private money = 0;

  constructor() {
    super('BuilderScene');
  }

  preload(): void {
    preloadGameAssets(this);
  }

  create(): void {
    // 1. Layout (1280 x 720): side columns for HUD and parts, build bay in the middle.
    const totalGridWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    this.gridOriginX = Math.round((this.scale.width - totalGridWidth) / 2);
    this.gridOriginY = 52;

    // 2. Core RocketTree model (immovable Cockpit at column 7, row 8) & ParticleManager
    this.rocketTree = new RocketTree(7, 8);
    this.particleManager = new ParticleManager(this);

    // 3. Rendering layers in order
    this.sceneryGraphics = this.add.graphics();
    this.drawScenery();
    this.gridGraphics = this.add.graphics();
    this.glassGraphics = this.add.graphics().setAlpha(BuilderScene.GLASS_OPACITY);
    this.blocksContainer = this.add.container(0, 0);
    this.socketsContainer = this.add.container(0, 0);
    this.ghostContainer = this.add.container(0, 0);
    this.hudContainer = this.add.container(0, 0);

    this.createGhostPreview();
    this.drawGrid();
    this.createTitle();
    this.createHud();
    this.createPartsPanel();
    this.refreshEconomy();
    this.renderRocket();
    this.setupInputHandlers();

    // 4. Initial sync and global debug handle
    this.syncExportableState('[RocketBuilder] Initialized rocket:');
    (window as unknown as { __ROCKET_TREE__: RocketTree }).__ROCKET_TREE__ = this.rocketTree;
    (window as unknown as { __BUILDER_SCENE__: BuilderScene }).__BUILDER_SCENE__ = this;
    (window as unknown as { __PARTICLE_MANAGER__: ParticleManager }).__PARTICLE_MANAGER__ = this.particleManager;

    // 5. Keep input bounds strictly synchronized with window layout/scroll
    this.scale.updateBounds();
    window.addEventListener('resize', () => {
      this.scale.refresh();
      this.scale.updateBounds();
    });
    window.addEventListener('scroll', () => {
      this.scale.updateBounds();
    });
  }

  // ---------------------------------------------------------------------------
  // Scenery: dusk sky, twinkling stars, the Moon, mountains and the launch-site ground
  // ---------------------------------------------------------------------------

  private drawScenery(): void {
    const g = this.sceneryGraphics;
    const w = this.scale.width;
    const rnd = new Phaser.Math.RandomDataGenerator(['rocket-lab']);

    g.clear();
    createBackdropTexture(this, 'builder_backdrop');
    this.add.image(0, 0, 'builder_backdrop').setOrigin(0).setScale(BACKDROP_SCALE).setDepth(-1);

    // Stars fade out toward the warm horizon.
    const dotColors = [0xffffff, 0xfff1d0, 0xffd6c2, 0xd8d0ff];
    for (let i = 0; i < 140; i++) {
      const y = Math.round(Math.pow(rnd.frac(), 1.8) * 420 / 2) * 2;
      g.fillStyle(rnd.pick(dotColors), rnd.realInRange(0.3, 1) * (1 - y / 520));
      g.fillRect(Math.round(rnd.between(0, w) / 2) * 2, y, rnd.frac() < 0.85 ? 2 : 3, 2);
    }

    // The destination looms over the launch site.
    this.add.image(905, 175, GAME_ASSETS.UI_MOON.key).setScale(6);

    // Twinkling plus-shaped sparkles.
    const sparkleColors = [0xfff1d0, 0xffd23f, 0xff8a5c, 0xffffff];
    for (let i = 0; i < 18; i++) {
      const s = this.add.graphics();
      drawSparkle(s, rnd.pick(sparkleColors), 3, rnd.frac() < 0.4);
      s.setPosition(rnd.between(20, w - 20), rnd.between(20, 380));
      this.tweens.add({
        targets: s,
        alpha: { from: 1, to: 0.15 },
        duration: rnd.between(700, 1800),
        delay: rnd.between(0, 1500),
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
        easeParams: [4]
      });
    }

  }

  private drawGrid(): void {
    const g = this.gridGraphics;
    const size = BuilderScene.CELL_SIZE;
    const width = BuilderScene.GRID_COLS * size;
    const height = BuilderScene.GRID_ROWS * size;
    const x0 = this.gridOriginX;
    const y0 = this.gridOriginY;

    g.clear();
    // See-through bay so the planet shows behind the build area, with a hard pixel frame.
    g.fillStyle(0x0b0910, 0.22);
    g.fillRect(x0, y0, width, height);
    this.glassGraphics.clear();
    this.drawGlassPanes(this.glassGraphics, x0, y0);
    g.fillStyle(0x01020a, 1);
    g.fillRect(x0 - 9, y0 - 6, 3, height + 12);
    g.fillRect(x0 + width + 6, y0 - 6, 3, height + 12);
    g.fillRect(x0 - 6, y0 - 9, width + 12, 3);
    g.fillRect(x0 - 6, y0 + height + 6, width + 12, 3);
    g.fillStyle(PX.borderDim, 1);
    g.fillRect(x0 - 6, y0 - 3, 6, height + 6);
    g.fillRect(x0 + width, y0 - 3, 6, height + 6);
    g.fillRect(x0 - 3, y0 - 6, width + 6, 6);
    g.fillRect(x0 - 3, y0 + height, width + 6, 6);
    g.fillStyle(PX.glow, 0.35);
    g.fillRect(x0, y0 - 6, width, 3);

  }

  /** Every grid cell is a Minecraft-style glass pane: pale tint, light pixel rim and a diagonal glint. */
  private drawGlassPanes(g: Phaser.GameObjects.Graphics, x0: number, y0: number): void {
    const size = BuilderScene.CELL_SIZE;
    const u = 3; // one glass "texel"
    for (let col = 0; col < BuilderScene.GRID_COLS; col++) {
      for (let row = 0; row < BuilderScene.GRID_ROWS; row++) {
        const x = x0 + col * size;
        const y = y0 + row * size;
        g.fillStyle(0xbfe6f2, 0.12);
        g.fillRect(x, y, size, size);
        // Rim: bright top/left edge, softer bottom/right edge.
        g.fillStyle(0xe6f8ff, 0.8);
        g.fillRect(x, y, size, u);
        g.fillRect(x, y, u, size);
        g.fillStyle(0x9fcfe0, 0.6);
        g.fillRect(x, y + size - u, size, u);
        g.fillRect(x + size - u, y, u, size);
        // Corner studs where the panes meet.
        g.fillStyle(0xffffff, 1);
        g.fillRect(x, y, u, u);
        // Diagonal glint (a few texels), shifted per cell so the glass doesn't look tiled.
        const shift = ((col * 7 + row * 3) % 4) * u;
        g.fillStyle(0xffffff, 0.8);
        for (let i = 0; i < 4; i++) g.fillRect(x + 9 + shift + i * u, y + 24 - i * u, u, u);
        if ((col + row) % 3 === 0) {
          g.fillStyle(0xffffff, 0.25);
          for (let i = 0; i < 2; i++) g.fillRect(x + 27 + i * u, y + 33 - i * u, u, u);
        }
      }
    }
  }

  private createTitle(): void {
    const title = pixelTitle(this, this.scale.width / 2, 12, 'ROCKET LAB', 26, PX.text.cream).setOrigin(0.5, 0);
    const left = pixelBody(this, title.x - title.width / 2 - 16, 15, '★ BUILD', 24, PX.text.red).setOrigin(1, 0);
    const right = pixelBody(this, title.x + title.width / 2 + 16, 15, 'FLY ★', 24, PX.text.red).setOrigin(0, 0);
    this.tweens.add({ targets: [left, right], alpha: { from: 1, to: 0.4 }, duration: 600, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
    this.hudContainer.add([title, left, right]);
  }

  // ---------------------------------------------------------------------------
  // Left column: telemetry, launch button, controls
  // ---------------------------------------------------------------------------

  private createHud(): void {
    const x = SIDE_X;
    const y = PANEL_TOP;
    const w = SIDE_W;

    const panel = this.add.graphics();
    drawPixelPanel(panel, x, y, w, this.hudHeight);
    const title = pixelTitle(this, x + 16, y + 16, 'TELEMETRY', 12);

    this.statusChipBg = this.add.graphics();
    this.hudStatusText = pixelTitle(this, x + 36, y + 46, '', 10, PX.text.red);
    this.hudContainer.add([panel, title, this.statusChipBg, this.hudStatusText]);

    const rows: Array<[keyof BuilderScene['statValues'], string]> = [
      ['mass', 'MASS'],
      ['thrust', 'THRUST'],
      ['fuel', 'FUEL']
    ];
    rows.forEach(([key, label], i) => {
      const ry = y + 76 + i * 28;
      const l = pixelBody(this, x + 16, ry, label, 24, PX.text.muted);
      const v = pixelBody(this, x + w - 16, ry, '', 24, PX.text.white).setOrigin(1, 0);
      this.statValues[key] = v;
      this.hudContainer.add([l, v]);
    });

    // Lift gauge: red = too heavy to leave the pad, green = plenty of push.
    const gaugeX = x + 84;
    const gaugeBottom = y + 238;
    const gauge = this.add.image(gaugeX, gaugeBottom, GAME_ASSETS.UI_FUEL_GAUGE.key).setScale(3).setOrigin(0.5, 1);
    this.gaugeNeedle = this.add.image(gaugeX, gaugeBottom - 9, GAME_ASSETS.UI_FUEL_NEEDLE.key).setScale(3).setOrigin(0.5, 0.85);
    const liftLabel = pixelBody(this, x + w - 16, y + 172, 'LIFT', 22, PX.text.muted).setOrigin(1, 0);
    const twrValue = pixelBody(this, x + w - 16, y + 194, '', 34, PX.text.white).setOrigin(1, 0);
    this.statValues.twr = twrValue;
    this.warningText = pixelBody(this, x + w / 2, y + 252, '', 20, PX.text.red).setOrigin(0.5, 0);
    this.hudContainer.add([gauge, this.gaugeNeedle, liftLabel, twrValue, this.warningText]);

    this.createLaunchButton(x, y + this.hudHeight + 14, w, 84);
    this.createControlsPanel(x, y + this.hudHeight + 112, w, PANEL_BOTTOM - (y + this.hudHeight + 112));
  }

  private drawStatusChip(ready: boolean): void {
    const g = this.statusChipBg;
    const x = SIDE_X + 14;
    const y = PANEL_TOP + 38;
    g.clear();
    drawPixelPanel(g, x, y, SIDE_W - 28, 26, {
      fill: ready ? 0x0b3320 : 0x330b14,
      border: ready ? PX.green : PX.red,
      highlight: ready ? PX.green : PX.red,
      u: 2
    });
    g.fillStyle(ready ? PX.green : PX.red, 1);
    g.fillRect(x + 10, y + 9, 8, 8);
  }

  private setGauge(twr: number): void {
    const angle = -90 + Math.min(twr / TWR_GAUGE_MAX, 1) * 180;
    this.tweens.add({ targets: this.gaugeNeedle, angle, duration: 350, ease: 'Back.easeOut' });
  }

  private createLaunchButton(x: number, y: number, w: number, h: number): void {
    this.launchButton = this.add.container(x + w / 2, y + h / 2);
    this.launchButtonBg = this.add.graphics();
    this.launchButtonText = pixelTitle(this, 0, -12, '', 18).setOrigin(0.5);
    this.launchSubText = pixelBody(this, 0, 18, '', 20, PX.text.muted).setOrigin(0.5);
    this.launchButton.add([this.launchButtonBg, this.launchButtonText, this.launchSubText]);
    this.launchButton.setSize(w, h);
    this.launchButton.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);

    this.launchButton.on('pointerover', () => {
      if (this.game.canvas) this.game.canvas.style.cursor = this.launchReady ? 'pointer' : 'not-allowed';
    });
    this.launchButton.on('pointerout', (pointer: Phaser.Input.Pointer) => this.updateCursorStyle(pointer));
    this.launchButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.launchFlight();
    });

    this.hudContainer.add(this.launchButton);
    this.drawLaunchButton();
  }

  private drawLaunchButton(): void {
    const g = this.launchButtonBg;
    const w = SIDE_W;
    const h = 84;
    g.clear();
    if (this.launchReady) {
      drawPixelPanel(g, -w / 2, -h / 2, w, h, { fill: 0xd8322f, fillAlpha: 1, border: 0xff8a5c, highlight: 0xffd0b0, u: 4 });
      g.fillStyle(0x8a1414, 1);
      g.fillRect(-w / 2 + 8, h / 2 - 12, w - 16, 4);
      this.launchButtonText.setText('LAUNCH!').setColor(PX.text.white);
      this.launchSubText.setText('▶ PRESS ENTER ◀').setColor('#ffe0c8');
      if (!this.launchPulse) {
        this.launchPulse = this.tweens.add({ targets: this.launchButton, scale: { from: 1, to: 1.04 }, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    } else {
      drawPixelPanel(g, -w / 2, -h / 2, w, h, { fill: PX.panelDeep, border: PX.borderDim, highlight: PX.muted, u: 4 });
      this.launchButtonText.setText('LAUNCH').setColor('#4b4458');
      this.launchSubText.setText(this.launchBlockedReason).setColor(PX.text.muted);
      this.launchPulse?.stop();
      this.launchPulse = undefined;
      this.launchButton.setScale(1);
    }
  }

  private createControlsPanel(x: number, y: number, w: number, h: number): void {
    const panel = this.add.graphics();
    drawPixelPanel(panel, x, y, w, h);
    const title = pixelTitle(this, x + 16, y + 16, 'CONTROLS', 12);
    this.hudContainer.add([panel, title]);

    const rows: Array<[string, string]> = [
      ['1-5', 'PICK PART'],
      ['CLICK', 'PLACE'],
      ['R-CLICK', 'REMOVE'],
      ['ESC', 'CANCEL'],
      ['ENTER', 'LAUNCH']
    ];
    const keys = this.add.graphics();
    this.hudContainer.add(keys);
    const rowGap = Math.min(30, (h - 52) / rows.length);
    rows.forEach(([key, action], i) => {
      const ry = y + 44 + i * rowGap;
      const keyText = pixelBody(this, x + 24, ry + 1, key, 20, PX.text.accent);
      const kw = keyText.width + 14;
      keys.fillStyle(0x01020a, 1);
      keys.fillRect(x + 16, ry + 1, kw + 2, 24);
      keys.fillStyle(0x2a2534, 1);
      keys.fillRect(x + 16, ry - 1, kw, 22);
      keys.fillStyle(PX.glow, 0.5);
      keys.fillRect(x + 16, ry - 1, kw, 2);
      const actionText = pixelBody(this, x + w - 16, ry + 1, action, 20, PX.text.white).setOrigin(1, 0);
      this.hudContainer.add([keyText, actionText]);
    });
  }

  // ---------------------------------------------------------------------------
  // Right column: mission, bank, parts inventory
  // ---------------------------------------------------------------------------

  private createPartsPanel(): void {
    const x = RIGHT_X;
    const w = SIDE_W;

    // Mission card
    const missionY = PANEL_TOP;
    const missionH = 150;
    const missionPanel = this.add.graphics();
    drawPixelPanel(missionPanel, x, missionY, w, missionH, { border: 0xc98a00, highlight: PX.gold });
    const missionTitle = pixelTitle(this, x + 16, missionY + 16, 'MISSION', 12, PX.text.gold);
    this.missionText = pixelBody(this, x + 16, missionY + 40, '', 24, PX.text.white).setWordWrapWidth(w - 32).setLineSpacing(-4);
    this.rewardText = pixelBody(this, x + 16, missionY + missionH - 34, '', 22, PX.text.gold);
    this.hudContainer.add([missionPanel, missionTitle, this.missionText, this.rewardText]);

    // Bank card with a pixel coin
    const bankY = missionY + missionH + 12;
    const bankH = 76;
    const bankPanel = this.add.graphics();
    drawPixelPanel(bankPanel, x, bankY, w, bankH);
    const coin = this.add.image(x + 30, bankY + 38, GAME_ASSETS.UI_COIN.key).setDisplaySize(32, 32);
    const bankLabel = pixelBody(this, x + 54, bankY + 10, 'BANK', 22, PX.text.muted);
    this.bankText = pixelBody(this, x + w - 16, bankY + 10, '', 22, PX.text.gold).setOrigin(1, 0);
    const costLabel = pixelBody(this, x + 54, bankY + 40, 'ROCKET', 22, PX.text.muted);
    this.costText = pixelBody(this, x + w - 16, bankY + 40, '', 22, PX.text.white).setOrigin(1, 0);
    this.hudContainer.add([bankPanel, coin, bankLabel, this.bankText, costLabel, this.costText]);

    // Parts inventory
    const partsY = bankY + bankH + 12;
    const partsPanel = this.add.graphics();
    drawPixelPanel(partsPanel, x, partsY, w, PANEL_BOTTOM - partsY);
    const partsTitle = pixelTitle(this, x + 16, partsY + 14, 'PARTS', 12);
    this.hudContainer.add([partsPanel, partsTitle]);

    const bayConfigs: Array<{ type: PartType; label: string; hotkey: string; stat: string }> = [
      { type: 'STRUCTURAL', label: 'BLOCK', hotkey: '1', stat: `${PART_DEFINITIONS.STRUCTURAL.mass} kg` },
      { type: 'NOSE_CONE', label: 'NOSE CONE', hotkey: '2', stat: 'less drag' },
      { type: 'ENGINE', label: 'ENGINE', hotkey: '3', stat: `${PART_DEFINITIONS.ENGINE.thrust} thrust` },
      { type: 'FUEL_TANK', label: 'FUEL TANK', hotkey: '4', stat: `${PART_DEFINITIONS.FUEL_TANK.fuel} L` },
      { type: 'FIN', label: 'FIN', hotkey: '5', stat: 'stability' }
    ];

    this.paletteBays = [];
    bayConfigs.forEach((cfg, idx) => {
      const cx = x + w / 2;
      const cy = partsY + 40 + idx * (SLOT_H + 6) + SLOT_H / 2;
      const bay = this.add.container(cx, cy);
      const bgGfx = this.add.graphics();
      const icon = this.add.image(-SLOT_W / 2 + 64, 0, getPartTextureKey(cfg.type, 'LEFT')).setDisplaySize(48, 48);
      const key = pixelBody(this, -SLOT_W / 2 + 19, 0, cfg.hotkey, 22, PX.text.accent).setOrigin(0.5);
      const name = pixelTitle(this, -SLOT_W / 2 + 98, -16, cfg.label, 10, PX.text.white);
      const price = pixelBody(this, -SLOT_W / 2 + 98, 0, `$${PART_DEFINITIONS[cfg.type].cost}`, 22, PX.text.gold);
      const stat = pixelBody(this, SLOT_W / 2 - 10, 0, cfg.stat, 18, PX.text.muted).setOrigin(1, 0);
      bay.add([bgGfx, icon, key, name, price, stat]);
      bay.setSize(SLOT_W, SLOT_H);
      bay.setInteractive(new Phaser.Geom.Rectangle(0, 0, SLOT_W, SLOT_H), Phaser.Geom.Rectangle.Contains);

      bay.on('pointerover', () => {
        if (this.game.canvas) this.game.canvas.style.cursor = 'pointer';
        this.hoveredBay = cfg.type;
        this.updatePaletteSelectionUI();
      });
      bay.on('pointerout', (pointer: Phaser.Input.Pointer) => {
        this.hoveredBay = null;
        this.updateCursorStyle(pointer);
        this.updatePaletteSelectionUI();
      });
      bay.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 0) this.selectPaletteItem(cfg.type);
      });

      this.hudContainer.add(bay);
      this.paletteBays.push({ type: cfg.type, label: cfg.label, container: bay, bgGfx, hotkeyNum: cfg.hotkey });
    });
    this.updatePaletteSelectionUI();
  }

  private drawBayBg(gfx: Phaser.GameObjects.Graphics, isSelected: boolean, isHovered: boolean): void {
    gfx.clear();
    drawPixelPanel(gfx, -SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, {
      fill: isSelected ? 0x3a2614 : isHovered ? 0x221d2b : PX.panelDeep,
      fillAlpha: 1,
      border: isSelected ? PX.accent : isHovered ? PX.border : PX.borderDim,
      highlight: isSelected ? 0xffe0b0 : PX.glow,
      u: 2
    });
    // Hotkey cap
    gfx.fillStyle(0x01020a, 1);
    gfx.fillRect(-SLOT_W / 2 + 8, -12, 24, 26);
    gfx.fillStyle(isSelected ? 0x8a4e12 : 0x2a2534, 1);
    gfx.fillRect(-SLOT_W / 2 + 7, -13, 24, 24);
  }

  /** Reload money/missions (they change after every flight) and top up broke players. */
  private refreshEconomy(): void {
    const { progress, grant } = withGrant(loadProgress());
    if (grant > 0) saveProgress(progress);
    this.money = progress.money;
    const mission = currentMission(progress.completedMissions);
    this.missionText.setText(mission ? mission.goal : 'All missions complete — chase the high score!');
    const reward = mission ? `REWARD +$${mission.reward}` : '';
    this.rewardText.setText(grant > 0 ? `GRANT +$${grant}!  ${reward}` : reward);
  }

  /** Hand the assembled rocket to the flight simulator; the builder sleeps so the design is kept. */
  public launchFlight(): void {
    const telemetry = this.rocketTree.getTelemetry();
    if (!this.launchReady) {
      this.cameras.main.shake(120, 0.004);
      return;
    }
    this.deselectPart();
    this.scene.launch('FlightScene', { tree: telemetry.tree });
    this.scene.sleep();
  }

  private updateHud(telemetry: ReturnType<RocketTree['getTelemetry']>): void {
    this.hudStatusText.setText(telemetry.valid ? 'FLIGHT READY' : 'INCOMPLETE');
    this.hudStatusText.setColor(telemetry.valid ? PX.text.green : PX.text.red);
    this.drawStatusChip(telemetry.valid);

    // TWR with the tanks full — what the rocket actually has to lift off the pad.
    const wetMass = telemetry.totalMass + telemetry.totalFuel;
    const wetTwr = wetMass > 0 ? telemetry.totalThrust / wetMass : 0;
    this.statValues.mass.setText(`${wetMass} kg`);
    this.statValues.thrust.setText(`${telemetry.totalThrust}`);
    this.statValues.fuel.setText(`${telemetry.totalFuel} L`);
    this.statValues.twr.setText(wetTwr.toFixed(2)).setColor(wetTwr >= 1 ? PX.text.green : telemetry.totalThrust > 0 ? PX.text.red : PX.text.white);
    this.setGauge(wetTwr);
    this.warningText.setText(wetTwr < 1 && telemetry.totalThrust > 0 ? 'TOO HEAVY TO LIFT OFF!' : '');

    const cost = rocketCost(this.rocketTree.getAllNodes().map(n => n.type));
    const affordable = cost <= this.money;
    this.bankText.setText(`$${this.money.toLocaleString()}`);
    this.costText.setText(`$${cost}`).setColor(affordable ? PX.text.white : PX.text.red);

    this.launchReady = telemetry.valid && affordable;
    this.launchBlockedReason = !telemetry.valid ? 'NEED CMD + FUEL + ENGINE' : `COSTS $${cost} · YOU HAVE $${this.money}`;
    if (this.launchButtonBg) this.drawLaunchButton();
  }

  private createGhostPreview(): void {
    this.ghostContainer.setVisible(false);
    this.ghostGfx = this.add.graphics();
    this.ghostSprite = this.add.image(0, 0, GAME_ASSETS.PART_COCKPIT.key).setDisplaySize(BuilderScene.CELL_SIZE, BuilderScene.CELL_SIZE);
    this.ghostText = pixelTitle(this, 0, BuilderScene.CELL_SIZE / 2 + 10, '', 8, PX.text.red).setOrigin(0.5);
    this.ghostContainer.add([this.ghostGfx, this.ghostSprite, this.ghostText]);
  }

  public selectPaletteItem(type: PartType): void {
    if (this.selectedPartType === type) {
      this.deselectPart();
      return;
    }

    this.selectedPartType = type;
    this.ghostContainer.setVisible(true);
    if (this.game.canvas) this.game.canvas.style.cursor = 'crosshair';
    this.updatePaletteSelectionUI();
  }

  public deselectPart(): void {
    this.selectedPartType = null;
    this.ghostContainer.setVisible(false);
    if (this.game.canvas) this.game.canvas.style.cursor = 'default';
    this.updatePaletteSelectionUI();
  }

  private updatePaletteSelectionUI(): void {
    const baseX = RIGHT_X + SIDE_W / 2;
    for (const bay of this.paletteBays) {
      const isSelected = bay.type === this.selectedPartType;
      this.drawBayBg(bay.bgGfx, isSelected, bay.type === this.hoveredBay);
      this.tweens.add({
        targets: bay.container,
        x: isSelected ? baseX - 8 : bay.type === this.hoveredBay ? baseX - 3 : baseX,
        duration: 120,
        ease: 'Power2'
      });
    }
  }

  private setupInputHandlers(): void {
    this.input.mouse?.disableContextMenu();

    // Hotkeys 1 - 5 for instant selection
    this.input.keyboard?.on('keydown-ONE', () => this.selectPaletteItem('STRUCTURAL'));
    this.input.keyboard?.on('keydown-TWO', () => this.selectPaletteItem('NOSE_CONE'));
    this.input.keyboard?.on('keydown-THREE', () => this.selectPaletteItem('ENGINE'));
    this.input.keyboard?.on('keydown-FOUR', () => this.selectPaletteItem('FUEL_TANK'));
    this.input.keyboard?.on('keydown-FIVE', () => this.selectPaletteItem('FIN'));

    this.input.keyboard?.on('keydown-ESC', () => {
      this.deselectPart();
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.launchFlight());

    // Coming back from a flight: the design is untouched, just reset the cursor.
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      if (this.game.canvas) this.game.canvas.style.cursor = 'default';
      this.refreshEconomy();
      this.syncExportableState();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.updateGhostPreview(pointer);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        this.handleRightClick(pointer);
      } else if (pointer.button === 0) {
        this.handleLeftClick(pointer);
      }
    });
  }

  /** The side columns hold the HUD and parts; clicks there never touch the build bay. */
  private isOverSidePanels(pointer: Phaser.Input.Pointer): boolean {
    return pointer.worldX < SIDE_X + SIDE_W + 8 || pointer.worldX > RIGHT_X - 8;
  }

  private updateCursorStyle(pointer: Phaser.Input.Pointer): void {
    if (!this.game.canvas) return;

    if (this.selectedPartType && !this.isOverSidePanels(pointer)) {
      this.game.canvas.style.cursor = 'crosshair';
      return;
    }

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (inside && this.rocketTree.getNodeAt(col, row)) {
      this.game.canvas.style.cursor = 'pointer';
      return;
    }

    const isOverBay = this.paletteBays.some(
      bay => Math.abs(pointer.worldX - bay.container.x) <= SLOT_W / 2 && Math.abs(pointer.worldY - bay.container.y) <= SLOT_H / 2
    );
    this.game.canvas.style.cursor = isOverBay ? 'pointer' : 'default';
  }

  private getGridCellAtPointer(pointer: Phaser.Input.Pointer): { col: number; row: number; inside: boolean } {
    const totalWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const totalHeight = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    const col = Math.floor((pointer.worldX - this.gridOriginX) / BuilderScene.CELL_SIZE);
    const row = Math.floor((pointer.worldY - this.gridOriginY) / BuilderScene.CELL_SIZE);
    const inside =
      col >= 0 &&
      col < BuilderScene.GRID_COLS &&
      row >= 0 &&
      row < BuilderScene.GRID_ROWS &&
      pointer.worldX >= this.gridOriginX &&
      pointer.worldX < this.gridOriginX + totalWidth &&
      pointer.worldY >= this.gridOriginY &&
      pointer.worldY < this.gridOriginY + totalHeight;

    return { col, row, inside };
  }

  public getPortPixelPosition(gridX: number, gridY: number, direction: PortDirection): { x: number; y: number } {
    const size = BuilderScene.CELL_SIZE;
    const px = this.gridOriginX + gridX * size;
    const py = this.gridOriginY + gridY * size;

    switch (direction) {
      case 'NORTH': return { x: px + size / 2, y: py };
      case 'SOUTH': return { x: px + size / 2, y: py + size };
      case 'WEST': return { x: px, y: py + size / 2 };
      case 'EAST': return { x: px + size, y: py + size / 2 };
    }
  }

  /** Pixel corner brackets around a cell, like a targeting reticle. */
  private drawBrackets(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    const h = BuilderScene.CELL_SIZE / 2 + 2;
    const len = 12;
    const t = 4;
    g.fillStyle(color, alpha);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx = sx * h;
        const cy = sy * h;
        g.fillRect(sx < 0 ? cx : cx - len, sy < 0 ? cy : cy - t, len, t);
        g.fillRect(sx < 0 ? cx : cx - t, sy < 0 ? cy : cy - len, t, len);
      }
    }
  }

  private updateGhostPreview(pointer: Phaser.Input.Pointer): void {
    this.updateCursorStyle(pointer);

    if (!this.selectedPartType || this.isOverSidePanels(pointer)) {
      this.ghostContainer.setVisible(false);
      return;
    }

    this.ghostContainer.setVisible(true);
    const size = BuilderScene.CELL_SIZE;
    const type = this.selectedPartType;
    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    this.ghostGfx.clear();
    this.ghostText.setText('');
    this.ghostSprite.setVisible(false);
    const showGhost = (finOrientation: 'LEFT' | 'RIGHT', alpha: number) =>
      this.ghostSprite.setTexture(getPartTextureKey(type, finOrientation)).setDisplaySize(size, size).setAlpha(alpha).setVisible(true);

    if (inside) {
      this.ghostContainer.setPosition(this.gridOriginX + col * size + size / 2, this.gridOriginY + row * size + size / 2);
      const validation = this.rocketTree.validateAttachment(col, row, type);

      if (validation.valid) {
        this.ghostGfx.fillStyle(PX.green, 0.18);
        this.ghostGfx.fillRect(-size / 2, -size / 2, size, size);
        showGhost(validation.finOrientation ?? 'LEFT', 0.8);
        this.drawBrackets(this.ghostGfx, PX.green, 1);
        return;
      }

      // Direct O(1) check if occupied or adjacent to any existing block
      const isOccupied = this.rocketTree.getNodeAt(col, row) !== undefined;
      const hasAdjacentNeighbor =
        this.rocketTree.getNodeAt(col, row - 1) !== undefined ||
        this.rocketTree.getNodeAt(col, row + 1) !== undefined ||
        this.rocketTree.getNodeAt(col - 1, row) !== undefined ||
        this.rocketTree.getNodeAt(col + 1, row) !== undefined;

      if (isOccupied || hasAdjacentNeighbor) {
        this.ghostGfx.fillStyle(PX.red, 0.25);
        this.ghostGfx.fillRect(-size / 2, -size / 2, size, size);
        this.drawBrackets(this.ghostGfx, PX.red, 1);
        this.ghostText.setText(isOccupied ? '' : 'NOPE');
      } else {
        // Empty cell not next to any open socket: a faint guide.
        showGhost('LEFT', 0.25);
        this.drawBrackets(this.ghostGfx, PX.muted, 0.6);
      }
      return;
    }

    // Floating under the cursor outside the grid
    this.ghostContainer.setPosition(pointer.worldX, pointer.worldY);
    showGhost('LEFT', 0.6);
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (this.isOverSidePanels(pointer)) return; // Handled by the panels' own buttons
    if (!this.selectedPartType) return;

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) {
      this.deselectPart();
      return;
    }

    const attachResult = this.rocketTree.attachPart(col, row, this.selectedPartType);
    if (attachResult.success && attachResult.node) {
      this.renderRocket();
      this.updateGhostPreview(pointer);
      this.syncExportableState('[RocketBuilder] Part attached:');

      // Docking tactile bounce + snap burst
      const blockContainer = this.blockDisplayMap.get(attachResult.node.id);
      if (blockContainer) {
        blockContainer.setScale(1.18);
        this.tweens.add({ targets: blockContainer, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
        this.particleManager.triggerEffect('SOCKET_SNAP', blockContainer.x, blockContainer.y);
      }
    } else {
      this.particleManager.triggerEffect('REJECTION_ERROR', pointer.worldX, pointer.worldY);
    }
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.isOverSidePanels(pointer)) return;

    if (this.selectedPartType) {
      this.deselectPart();
      return;
    }

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) return;

    const targetNode = this.rocketTree.getNodeAt(col, row);
    if (!targetNode) return;

    const removeResult = this.rocketTree.removeNode(targetNode.id);
    if (removeResult.success) {
      const size = BuilderScene.CELL_SIZE;
      this.particleManager.triggerEffect('PART_DISASSEMBLE', this.gridOriginX + col * size + size / 2, this.gridOriginY + row * size + size / 2);
      this.renderRocket();
      this.syncExportableState('[RocketBuilder] Part removed:');
    } else {
      console.warn(`[RocketBuilder] ${removeResult.reason}`);
      this.flashAndShakeBlock(targetNode);
    }
  }

  private flashAndShakeBlock(node: RocketNode): void {
    const size = BuilderScene.CELL_SIZE;
    const cx = this.gridOriginX + node.gridX * size + size / 2;
    const cy = this.gridOriginY + node.gridY * size + size / 2;

    this.particleManager.triggerEffect('REJECTION_ERROR', cx, cy);

    const flash = this.add.graphics();
    flash.setPosition(cx, cy);
    flash.fillStyle(PX.red, 0.5);
    flash.fillRect(-size / 2, -size / 2, size, size);
    this.drawBrackets(flash, PX.red, 1);

    const blockDisplay = this.blockDisplayMap.get(node.id);
    const origX = cx;

    const targetsToShake: Array<Phaser.GameObjects.GameObject | { x: number }> = [flash];
    if (blockDisplay) {
      targetsToShake.push(blockDisplay);
    }

    this.tweens.add({
      targets: targetsToShake,
      x: { from: origX - 4, to: origX + 4 },
      duration: 40,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        if (blockDisplay) {
          blockDisplay.x = origX;
        }
        flash.destroy();
      }
    });
  }

  public renderRocket(): void {
    this.tweens.killTweensOf(this.socketsContainer.list);
    this.socketsContainer.removeAll(true);

    const nodes = this.rocketTree.getAllNodes();
    const activeNodeIds = new Set(nodes.map(n => n.id));

    // Remove only deleted block containers
    for (const [id, container] of this.blockDisplayMap.entries()) {
      if (!activeNodeIds.has(id)) {
        this.tweens.killTweensOf(container);
        container.destroy();
        this.blockDisplayMap.delete(id);
      }
    }

    // Add containers only for newly added nodes
    for (const node of nodes) {
      if (!this.blockDisplayMap.has(node.id)) {
        this.renderBlock(node);
      }
    }

    this.renderAvailableSockets();
  }

  private renderBlock(node: RocketNode): void {
    const size = BuilderScene.CELL_SIZE;
    const cx = this.gridOriginX + node.gridX * size + size / 2;
    const cy = this.gridOriginY + node.gridY * size + size / 2;

    const blockContainer = this.add.container(cx, cy);
    const sprite = this.add.image(0, 0, getPartTextureKey(node.type, node.finOrientation)).setDisplaySize(size, size);
    blockContainer.add(sprite);
    this.blocksContainer.add(blockContainer);
    this.blockDisplayMap.set(node.id, blockContainer);
  }

  private renderAvailableSockets(): void {
    const ports = this.rocketTree.getAvailablePorts();

    for (const port of ports) {
      const pos = this.getPortPixelPosition(port.gridX, port.gridY, port.direction);

      // Pixel diamond socket
      const socketGfx = this.add.graphics();
      socketGfx.setPosition(pos.x, pos.y);
      socketGfx.fillStyle(0x01020a, 1);
      socketGfx.fillRect(-4, -8, 8, 16);
      socketGfx.fillRect(-8, -4, 16, 8);
      socketGfx.fillStyle(PX.accent, 1);
      socketGfx.fillRect(-2, -6, 4, 12);
      socketGfx.fillRect(-6, -2, 12, 4);
      socketGfx.fillStyle(0xffffff, 1);
      socketGfx.fillRect(-2, -2, 4, 4);

      this.socketsContainer.add(socketGfx);
    }
  }

  private syncExportableState(logPrefix?: string): void {
    const telemetry = this.rocketTree.getTelemetry();
    (window as unknown as { __ROCKET_STATE__: unknown }).__ROCKET_STATE__ = telemetry;
    (window as unknown as { getRocketState: () => unknown }).getRocketState = () => this.rocketTree.getTelemetry();

    this.updateHud(telemetry);

    if (logPrefix) {
      console.log(logPrefix, telemetry);
    }
  }

  public getRocketTree(): RocketTree {
    return this.rocketTree;
  }
}
