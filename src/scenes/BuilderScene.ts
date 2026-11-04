import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { payloadObjective, rocketCost } from '../game/missions';
import { loadProgress, saveProgress, withGrant } from '../game/progress';
import { FUEL_KINDS, fuelUnlockCost, PART_DEFINITIONS, PAYLOADS, partCost } from '../core/partDefinitions';
import { FuelKind, PartType, PayloadKind, PortDirection, RocketNode } from '../core/types';
import { ParticleManager } from '../particles';
import { preloadGameAssets, getPartTextureKey, GAME_ASSETS } from '../core/assets';
import { PX, drawPixelPanel, drawSparkle, pixelBody, pixelTitle } from '../ui/pixel';
import { normalizeKey } from '../core/separationKeys';
import { playSfx } from '../core/sound';
import { BACKDROP_SCALE, createBackdropTexture } from '../ui/backdrop';

interface PaletteBay {
  type: PartType;
  label: string;
  container: Phaser.GameObjects.Container;
  bgGfx: Phaser.GameObjects.Graphics;
  hotkeyNum: string;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  price: Phaser.GameObjects.Text;
  chips?: Phaser.GameObjects.Graphics;
}

/** Parts with a picker of looks: fuel tanks (fuel type), engines (booster or RCS) and the root slot (payload). */
type VariantPart = 'FUEL_TANK' | 'ENGINE' | 'COCKPIT';
/** The engine slot places either a booster (ENGINE) or an RCS thruster. */
type EngineChoice = 'BOOSTER' | 'RCS';
type PartKind = FuelKind | PayloadKind | EngineChoice;
const VARIANTS: Record<VariantPart, Array<{ kind: PartKind; label: string; color: number; extraCost: number; description: string }>> = {
  COCKPIT: (Object.keys(PAYLOADS) as PayloadKind[]).map(kind => ({
    kind,
    ...PAYLOADS[kind],
    label: kind === 'CREW' ? 'COCKPIT' : PAYLOADS[kind].label
  })),
  FUEL_TANK: (Object.keys(FUEL_KINDS) as FuelKind[]).map(kind => ({ kind, ...FUEL_KINDS[kind] })),
  ENGINE: [
    { kind: 'BOOSTER', label: 'BOOSTER', color: 0xff8a3d, extraCost: 0, description: 'Main burn. Can’t steer in space.' },
    {
      kind: 'RCS',
      label: 'TWIN LEG',
      color: 0x7aa6ff,
      extraCost: PART_DEFINITIONS.RCS.cost - PART_DEFINITIONS.ENGINE.cost,
      description: 'RCS: steers in space on cold gas.'
    }
  ]
};
/** RCS thrusters face their nozzle outward: left, right or up (the art points down at 0). */
const rcsAngle = (type: PartType, side?: 'LEFT' | 'RIGHT') => (type !== 'RCS' ? 0 : side === 'RIGHT' ? -90 : 90);
const isVariantPart = (type: PartType): type is VariantPart => type in VARIANTS;
/** Variant swatches on a slot, in slot-local coordinates (centre of the slot is 0,0). */
const CHIP = 12;
const CHIP_GAP = 4;
const chipX = (i: number) => SLOT_W / 2 - 12 - (2 - i) * (CHIP + CHIP_GAP) - CHIP;
const CHIP_Y = 2;
/** Flyout of full-size variants that opens beside a fuel tank / engine slot on hover. */
const CARD_W = 92;
const CARD_H = 168;
const CARD_GAP = 8;
/** How far the hovered card rises out of the row. */
const CARD_LIFT = 14;
const cardX = (i: number) => i * (CARD_W + CARD_GAP);

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
  private static readonly GLASS_OPACITY = 1;

  public readonly hudHeight = 222;
  public readonly hudY = PANEL_TOP;

  private rocketTree!: RocketTree;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private glassImage!: Phaser.GameObjects.Image;
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
  /** Current look for each variant part; COCKPIT is what sits in the root slot. */
  private partKinds: Record<VariantPart, PartKind> = { COCKPIT: 'CREW', FUEL_TANK: 'KEROSENE', ENGINE: 'BOOSTER' };
  private unlockedFuels: string[] = [];
  private flyout!: Phaser.GameObjects.Container;
  private flyoutFor: VariantPart | null = null;
  private flyoutRect = new Phaser.Geom.Rectangle();
  private flyCards: Array<{ kind: PartKind; card: Phaser.GameObjects.Container; frame: Phaser.GameObjects.Graphics }> = [];
  private flyHoverKind: PartKind | null = null;
  private payloadTag?: Phaser.GameObjects.Container;
  /** Tooltip over the RCS shell under the pointer, where its separation key is bound. */
  private shellTip?: Phaser.GameObjects.Container;
  private shellTipId: string | null = null;
  private shellTipNote = '';
  private shellTipSig = '';
  /** RCS the player has already hovered: their "!" badge is gone for good. */
  private seenShells = new Set<string>();
  /** RCS just placed: the pointer still rests on it, so that hover does not count as having found the tooltip. */
  private freshShells = new Set<string>();
  private shellBadges = new Map<string, Phaser.GameObjects.Container>();

  // HUD objects
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
    this.glassImage = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setAlpha(BuilderScene.GLASS_OPACITY);
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
    this.selectPaletteItem('STRUCTURAL');

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
    this.drawGlass(x0, y0, width, height);
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

  /**
   * One sheet of glass over the whole bay, painted once at 1/3 scale (3 px texels, like the rest of the art):
   * a soft sheen from the top, two wide feathered reflection bands across the diagonal and a faint lit rim.
   */
  private drawGlass(x0: number, y0: number, w: number, h: number): void {
    const u = 3;
    const key = 'builder_glass';
    const tw = Math.round(w / u);
    const th = Math.round(h / u);
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, tw, th);
      const ctx = tex?.getContext();
      if (tex && ctx) {
        // Cool tint, slightly stronger near the top where the glass catches the sky.
        const sheen = ctx.createLinearGradient(0, 0, 0, th);
        sheen.addColorStop(0, 'rgba(214, 238, 255, 0.10)');
        sheen.addColorStop(0.45, 'rgba(214, 238, 255, 0.03)');
        sheen.addColorStop(1, 'rgba(214, 238, 255, 0.02)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, tw, th);

        // Reflection bands run perpendicular to the top-left → bottom-right diagonal.
        const band = (from: number, to: number, peak: number) => {
          const g = ctx.createLinearGradient(0, 0, tw, th);
          const mid = (from + to) / 2;
          g.addColorStop(0, 'rgba(255, 255, 255, 0)');
          g.addColorStop(from, 'rgba(255, 255, 255, 0)');
          g.addColorStop(mid, `rgba(255, 255, 255, ${peak})`);
          g.addColorStop(to, 'rgba(255, 255, 255, 0)');
          g.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, tw, th);
        };
        band(0.14, 0.34, 0.09);
        band(0.36, 0.42, 0.06);
        band(0.7, 0.8, 0.035);

        // Lit rim: top/left catch the light, bottom/right fall into shade.
        ctx.fillStyle = 'rgba(235, 248, 255, 0.28)';
        ctx.fillRect(0, 0, tw, 1);
        ctx.fillRect(0, 0, 1, th);
        ctx.fillStyle = 'rgba(160, 205, 225, 0.12)';
        ctx.fillRect(0, th - 1, tw, 1);
        ctx.fillRect(tw - 1, 0, 1, th);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
    this.glassImage.setTexture(key).setPosition(x0, y0).setDisplaySize(w, h);
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
    this.hudContainer.add([panel, title]);

    const rows: Array<[keyof BuilderScene['statValues'], string]> = [
      ['mass', 'MASS'],
      ['thrust', 'THRUST'],
      ['fuel', 'FUEL']
    ];
    rows.forEach(([key, label], i) => {
      const ry = y + 42 + i * 28;
      const l = pixelBody(this, x + 16, ry, label, 24, PX.text.muted);
      const v = pixelBody(this, x + w - 16, ry, '', 24, PX.text.white).setOrigin(1, 0);
      this.statValues[key] = v;
      this.hudContainer.add([l, v]);
    });

    // Lift gauge: red = too heavy to leave the pad, green = plenty of push.
    const gaugeX = x + 84;
    const gaugeBottom = y + 206;
    const gauge = this.add.image(gaugeX, gaugeBottom, GAME_ASSETS.UI_FUEL_GAUGE.key).setScale(3).setOrigin(0.5, 1);
    this.gaugeNeedle = this.add.image(gaugeX, gaugeBottom - 9, GAME_ASSETS.UI_FUEL_NEEDLE.key).setScale(3).setOrigin(0.5, 0.85);
    // The LIFT label turns into the warning when the rocket can't leave the pad.
    this.warningText = pixelBody(this, x + w - 16, y + 140, 'LIFT', 22, PX.text.muted).setOrigin(1, 0);
    const twrValue = pixelBody(this, x + w - 16, y + 162, '', 34, PX.text.white).setOrigin(1, 0);
    this.statValues.twr = twrValue;
    this.hudContainer.add([gauge, this.gaugeNeedle, this.warningText, twrValue]);

    const launchY = y + this.hudHeight + 12;
    this.createLaunchButton(x, launchY, w, 84);
    const bankY = launchY + 84 + 12;
    this.createBankPanel(x, bankY, w, 72);
    const controlsY = bankY + 72 + 12;
    this.createControlsPanel(x, controlsY, w, PANEL_BOTTOM - controlsY);
  }

  /** Bank card with a pixel coin: what you have and what the rocket costs. */
  private createBankPanel(x: number, y: number, w: number, h: number): void {
    const panel = this.add.graphics();
    drawPixelPanel(panel, x, y, w, h);
    const coin = this.add.image(x + 30, y + h / 2, GAME_ASSETS.UI_COIN.key).setDisplaySize(32, 32);
    const bankLabel = pixelBody(this, x + 54, y + 8, 'BANK', 22, PX.text.muted);
    this.bankText = pixelBody(this, x + w - 16, y + 8, '', 22, PX.text.gold).setOrigin(1, 0);
    const costLabel = pixelBody(this, x + 54, y + 38, 'ROCKET', 22, PX.text.muted);
    this.costText = pixelBody(this, x + w - 16, y + 38, '', 22, PX.text.white).setOrigin(1, 0);
    this.hudContainer.add([panel, coin, bankLabel, this.bankText, costLabel, this.costText]);
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
      playSfx(this, 'UI_HOVER');
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
      ['C', 'COCKPIT'],
      ['CLICK', 'PLACE'],
      ['R-CLICK', 'REMOVE'],
      ['ESC', 'CANCEL'],
      ['ENTER', 'LAUNCH']
    ];
    const keys = this.add.graphics();
    this.hudContainer.add(keys);
    const rowGap = Math.min(30, (h - 48) / rows.length);
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
  // Right column: mission, parts inventory
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

    // Parts inventory
    const partsY = missionY + missionH + 12;
    const partsPanel = this.add.graphics();
    drawPixelPanel(partsPanel, x, partsY, w, PANEL_BOTTOM - partsY);
    const partsTitle = pixelTitle(this, x + 16, partsY + 14, 'PARTS', 12);
    this.hudContainer.add([partsPanel, partsTitle]);

    const bayConfigs: Array<{ type: PartType; label: string; hotkey: string; stat: string }> = [
      { type: 'COCKPIT', label: 'COCKPIT', hotkey: 'C', stat: '' },
      { type: 'STRUCTURAL', label: 'BLOCK', hotkey: '1', stat: `${PART_DEFINITIONS.STRUCTURAL.mass} kg` },
      { type: 'NOSE_CONE', label: 'NOSE CONE', hotkey: '2', stat: 'less drag' },
      { type: 'ENGINE', label: 'BOOSTER', hotkey: '3', stat: `${PART_DEFINITIONS.ENGINE.thrust} thrust` },
      { type: 'FUEL_TANK', label: 'FUEL TANK', hotkey: '4', stat: `${PART_DEFINITIONS.FUEL_TANK.fuel} L` },
      { type: 'FIN', label: 'FIN', hotkey: '5', stat: 'stability' }
    ];
    // Fit every slot in the panel: shrink the row pitch (and the slot itself if it must).
    const pitch = Math.min(SLOT_H + 6, (PANEL_BOTTOM - partsY - 44) / bayConfigs.length);
    const slotScale = Math.min(1, (pitch - 2) / SLOT_H);

    this.paletteBays = [];
    bayConfigs.forEach((cfg, idx) => {
      const cx = x + w / 2;
      const cy = partsY + 36 + idx * pitch + pitch / 2;
      const bay = this.add.container(cx, cy).setScale(1, slotScale);
      const bgGfx = this.add.graphics();
      const icon = this.add.image(-SLOT_W / 2 + 64, 0, this.partTexture(cfg.type, 'LEFT')).setDisplaySize(48, 48);
      const key = pixelBody(this, -SLOT_W / 2 + 19, 0, cfg.hotkey, 22, PX.text.accent).setOrigin(0.5);
      const name = pixelTitle(this, -SLOT_W / 2 + 98, -16, cfg.label, 10, PX.text.white);
      const price = pixelBody(this, -SLOT_W / 2 + 98, 0, `$${PART_DEFINITIONS[cfg.type].cost}`, 22, PX.text.gold);
      bay.add([bgGfx, icon, key, name, price]);
      // Variant parts trade the stat line for a row of colour chips (click one, or press the hotkey again).
      let chips: Phaser.GameObjects.Graphics | undefined;
      if (isVariantPart(cfg.type)) {
        chips = this.add.graphics();
        bay.add(chips);
      } else {
        bay.add(pixelBody(this, SLOT_W / 2 - 10, 0, cfg.stat, 18, PX.text.muted).setOrigin(1, 0));
      }
      bay.setSize(SLOT_W, SLOT_H);
      bay.setInteractive(new Phaser.Geom.Rectangle(0, 0, SLOT_W, SLOT_H), Phaser.Geom.Rectangle.Contains);

      bay.on('pointerover', () => {
        if (this.game.canvas) this.game.canvas.style.cursor = 'pointer';
        playSfx(this, 'UI_HOVER');
        if (isVariantPart(cfg.type)) this.showFlyout(cfg.type);
        this.hoveredBay = cfg.type;
        this.updatePaletteSelectionUI();
      });
      bay.on('pointerout', (pointer: Phaser.Input.Pointer) => {
        this.hoveredBay = null;
        this.updateCursorStyle(pointer);
        this.updatePaletteSelectionUI();
      });
      bay.on('pointerdown', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
        if (pointer.button !== 0) return;
        playSfx(this, 'UI_CLICK');
        const chip = isVariantPart(cfg.type) ? this.chipAt(localX - SLOT_W / 2, localY - SLOT_H / 2) : -1;
        if (chip >= 0 && isVariantPart(cfg.type)) this.setPartKind(cfg.type, VARIANTS[cfg.type][chip].kind);
        else this.selectPaletteItem(cfg.type);
      });

      this.hudContainer.add(bay);
      this.paletteBays.push({ type: cfg.type, label: cfg.label, container: bay, bgGfx, hotkeyNum: cfg.hotkey, icon, name, price, chips });
    });
    this.updatePaletteSelectionUI();
    this.refreshVariantBays();
    this.flyout = this.add.container(0, 0).setDepth(40).setVisible(false);
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
    this.unlockedFuels = progress.unlockedFuels;
    this.showMission(progress.completedMissions, grant);
  }

  /** The mission panel shows the chosen payload's own objective and what finishing it pays. */
  private showMission(_completed: readonly string[], grant = 0): void {
    const { goal, reward } = payloadObjective(this.rocketTree.getRootNode().payload ?? 'CREW');
    this.missionText.setText(goal);
    const pay = `REWARD +$${reward}`;
    this.rewardText.setText(grant > 0 ? `GRANT +$${grant}!  ${pay}` : pay);
  }

  /** Hand the assembled rocket to the flight simulator; the builder sleeps so the design is kept. */
  public launchFlight(): void {
    const telemetry = this.rocketTree.getTelemetry();
    if (!this.launchReady) {
      playSfx(this, 'CLICK_FAIL');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    playSfx(this, 'UI_CLICK');
    this.deselectPart();
    this.scene.launch('FlightScene', { tree: telemetry.tree });
    this.scene.sleep();
  }

  private updateHud(telemetry: ReturnType<RocketTree['getTelemetry']>): void {
    // TWR with the tanks full — what the rocket actually has to lift off the pad.
    // Fuel weighs what its type weighs (hydrogen is light), and pushes what its type pushes.
    const wetMass = Math.round(telemetry.totalMass + telemetry.totalFuelMass);
    const wetTwr = wetMass > 0 ? telemetry.liftoffThrust / wetMass : 0;
    this.statValues.mass.setText(`${wetMass} kg`);
    this.statValues.thrust.setText(`${Math.round(telemetry.liftoffThrust)}`);
    this.statValues.fuel.setText(`${telemetry.totalFuel} L`);
    this.statValues.twr.setText(wetTwr.toFixed(2)).setColor(wetTwr >= 1 ? PX.text.green : telemetry.totalThrust > 0 ? PX.text.red : PX.text.white);
    this.setGauge(wetTwr);
    const tooHeavy = wetTwr < 1 && telemetry.totalThrust > 0;
    this.warningText.setText(tooHeavy ? 'TOO HEAVY' : 'LIFT').setColor(tooHeavy ? PX.text.red : PX.text.muted);

    const cost = rocketCost(this.rocketTree.getAllNodes());
    const affordable = cost <= this.money;
    this.bankText.setText(`$${this.money.toLocaleString()}`);
    this.costText.setText(`$${cost}`).setColor(affordable ? PX.text.white : PX.text.red);

    this.launchReady = telemetry.valid && affordable;
    this.launchBlockedReason = !telemetry.valid ? telemetry.missing : `COSTS $${cost} · YOU HAVE $${this.money}`;
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
    // The root slot is never placed: its slot just swaps the payload.
    if (type === 'COCKPIT') {
      this.cyclePayload();
      return;
    }
    if (this.selectedPartType === type) {
      if (isVariantPart(type)) {
        const list = VARIANTS[type];
        const open = list.filter(v => !this.isLocked(v.kind));
        const next = open[(open.findIndex(v => v.kind === this.partKinds[type]) + 1) % open.length];
        this.setPartKind(type, next.kind);
      } else {
        this.deselectPart();
      }
      return;
    }

    this.selectedPartType = type;
    this.ghostContainer.setVisible(true);
    if (this.game.canvas) this.game.canvas.style.cursor = 'crosshair';
    this.updatePaletteSelectionUI();
  }

  /** Texture for a part in its current look; falls back to the plain sprite if that art isn't loaded. */
  private partTexture(type: PartType, finOrientation?: 'LEFT' | 'RIGHT', kind?: PartKind): string {
    const look = kind ?? (isVariantPart(type) ? this.partKinds[type] : undefined);
    // The picker shows the bare engine; the shell only appears once it is bolted onto the rocket.
    if (type === 'ENGINE' && look === 'RCS') {
      const bare = getPartTextureKey('RCS', finOrientation, undefined, undefined, true);
      return this.textures.exists(bare) ? bare : this.partTexture('RCS', finOrientation);
    }
    const key = getPartTextureKey(type, finOrientation, undefined, look as FuelKind | PayloadKind | undefined);
    return this.textures.exists(key) ? key : getPartTextureKey(type, finOrientation);
  }

  /** What the selected slot actually places: the engine slot can hold an RCS thruster. */
  private placedType(type: PartType): PartType {
    return type === 'ENGINE' && this.partKinds.ENGINE === 'RCS' ? 'RCS' : type;
  }

  /** Fuels that still need their one-time unlock bought (liquid hydrogen). */
  private isLocked(kind: PartKind): boolean {
    return kind in FUEL_KINDS && fuelUnlockCost(kind as FuelKind) > 0 && !this.unlockedFuels.includes(kind);
  }

  /** Buy a locked fuel for good if the bank covers it; returns whether it's now open. */
  private tryUnlock(kind: FuelKind): boolean {
    const cost = fuelUnlockCost(kind);
    if (this.money < cost) {
      this.cameras.main.shake(120, 0.003);
      return false;
    }
    const progress = loadProgress();
    const unlockedFuels = [...progress.unlockedFuels, kind];
    saveProgress({ ...progress, money: progress.money - cost, unlockedFuels });
    this.money = progress.money - cost;
    this.unlockedFuels = unlockedFuels;
    this.updateHud(this.rocketTree.getTelemetry());
    return true;
  }

  /** Price of a part type in a given look ($). */
  private variantPrice(type: VariantPart, kind: PartKind): number {
    if (type === 'COCKPIT') return partCost({ type, payload: kind as PayloadKind });
    if (type === 'ENGINE') return partCost({ type: kind === 'RCS' ? 'RCS' : 'ENGINE' });
    return partCost({ type, fuelKind: kind as FuelKind });
  }

  /** Index of the variant chip under a slot-local point, or -1. */
  private chipAt(x: number, y: number): number {
    for (let i = 0; i < 3; i++) {
      if (x >= chipX(i) - 2 && x <= chipX(i) + CHIP + 2 && y >= CHIP_Y - 2 && y <= CHIP_Y + CHIP + 2) return i;
    }
    return -1;
  }

  /** Pick a fuel / engine type (selects that part) or a payload (swaps the root slot), then refresh the slot. */
  public setPartKind(type: VariantPart, kind: PartKind): void {
    if (this.isLocked(kind) && !this.tryUnlock(kind as FuelKind)) return;
    this.partKinds[type] = kind;
    if (type === 'COCKPIT') this.applyPayload(kind as PayloadKind);
    else if (this.selectedPartType !== type) this.selectPaletteItem(type);
    this.refreshVariantBays();
    if (this.flyoutFor === type) this.showFlyout(type);
    this.updateGhostPreview(this.input.activePointer);
  }

  private refreshVariantBays(): void {
    for (const bay of this.paletteBays) {
      if (!isVariantPart(bay.type) || !bay.chips) continue;
      const list = VARIANTS[bay.type];
      const current = this.partKinds[bay.type];
      bay.icon.setTexture(this.partTexture(bay.type, 'LEFT')).setDisplaySize(48, 48);
      bay.name.setText(list.find(v => v.kind === current)?.label ?? bay.label);
      bay.price.setText(`$${this.variantPrice(bay.type, current)}`);
      const g = bay.chips;
      g.clear();
      list.forEach((v, i) => {
        const x = chipX(i);
        const on = v.kind === current;
        g.fillStyle(0x01020a, 1);
        g.fillRect(x - 2, CHIP_Y - 2, CHIP + 4, CHIP + 4);
        g.fillStyle(on ? 0xffffff : PX.borderDim, 1);
        g.fillRect(x - 1, CHIP_Y - 1, CHIP + 2, CHIP + 2);
        g.fillStyle(v.color, on ? 1 : 0.55);
        g.fillRect(x + 1, CHIP_Y + 1, CHIP - 2, CHIP - 2);
      });
    }
  }

  /** Fan out one card per look beside the slot (Slay the Spire style): art, name, one line and price. */
  private showFlyout(type: VariantPart): void {
    const bay = this.paletteBays.find(b => b.type === type);
    if (!bay) return;
    const keepHover = this.flyoutFor === type ? this.flyHoverKind : null;
    this.flyoutFor = type;
    const n = VARIANTS[type].length;
    const fanW = n * CARD_W + (n - 1) * CARD_GAP;
    const x = RIGHT_X + SIDE_W / 2 - SLOT_W / 2 - 18 - fanW;
    const y = Math.round(Phaser.Math.Clamp(bay.container.y - CARD_H / 2, CARD_LIFT + 8, this.scale.height - CARD_H - 8));
    this.flyoutRect.setTo(x, y - CARD_LIFT, fanW + 18, CARD_H + CARD_LIFT);
    this.flyout.removeAll(true);
    this.flyout.setPosition(x, y).setVisible(true);
    this.flyCards = [];

    VARIANTS[type].forEach((v, i) => {
      const card = this.add.container(cardX(i), 0);
      const frame = this.add.graphics();
      const art = this.add.image(CARD_W / 2, 36, this.partTexture(type, 'LEFT', v.kind)).setDisplaySize(48, 48);
      const name = pixelTitle(this, CARD_W / 2, 74, v.label, 8, Phaser.Display.Color.IntegerToColor(v.color).lighten(15).rgba).setOrigin(0.5, 0);
      const about = pixelBody(this, CARD_W / 2, 88, v.description, 16, '#cfc6dd')
        .setOrigin(0.5, 0)
        .setAlign('center')
        .setWordWrapWidth(CARD_W - 12)
        .setLineSpacing(-5);
      const price = pixelBody(this, CARD_W / 2 + 8, CARD_H - 26, `${this.variantPrice(type, v.kind)}`, 20, PX.text.gold).setOrigin(0.5, 0);
      const coin = this.add.image(price.x - price.width / 2 - 9, CARD_H - 15, GAME_ASSETS.UI_COIN.key).setDisplaySize(12, 12);
      card.add([frame, art, name, about, price, coin]);
      if (this.isLocked(v.kind)) {
        const cost = fuelUnlockCost(v.kind as FuelKind);
        art.setTint(0x444050);
        about.setText(this.money >= cost ? 'CLICK TO UNLOCK' : 'EARN MORE TO UNLOCK').setColor(this.money >= cost ? PX.text.green : PX.text.muted);
        price.setText(`${cost}`).setColor(this.money >= cost ? PX.text.gold : PX.text.red);
        coin.setX(price.x - price.width / 2 - 9);
        const lock = this.add.graphics();
        const lx = CARD_W / 2 - 9;
        lock.fillStyle(0x000000, 1).fillRect(lx - 2, 30, 22, 20);
        lock.fillStyle(PX.gold, 1).fillRect(lx, 32, 18, 16);
        lock.fillStyle(0x000000, 1).fillRect(lx + 7, 37, 4, 6);
        lock.lineStyle(3, PX.gold, 1).strokeRect(lx + 4, 22, 10, 12);
        card.add(lock);
      }
      this.flyout.add(card);
      this.flyCards.push({ kind: v.kind, card, frame });
    });
    this.flyHoverKind = null;
    this.setFlyoutHover(keepHover);
  }

  /** Lift the hovered card and light its border in its colour; the picked one wears a gold tag. */
  private setFlyoutHover(kind: PartKind | null): void {
    if (!this.flyoutFor) return;
    this.flyHoverKind = kind;
    const selected = this.partKinds[this.flyoutFor];
    for (const { kind: k, card, frame } of this.flyCards) {
      const v = VARIANTS[this.flyoutFor].find(e => e.kind === k)!;
      const hovered = k === kind;
      const g = frame;
      g.clear();
      // Drop shadow, hard black outline, then the border and card body.
      g.fillStyle(0x000000, 0.35);
      g.fillRect(4, 6, CARD_W, CARD_H);
      g.fillStyle(0x000000, 1);
      g.fillRect(-2, 0, CARD_W + 4, CARD_H);
      g.fillRect(0, -2, CARD_W, CARD_H + 4);
      g.fillStyle(hovered ? v.color : k === selected ? PX.gold : 0x3a3446, 1);
      g.fillRect(0, 0, CARD_W, CARD_H);
      g.fillStyle(0x1a1622, 1);
      g.fillRect(3, 3, CARD_W - 6, CARD_H - 6);
      // Art well, tinted faintly in the card's colour.
      g.fillStyle(0x0b0a10, 1);
      g.fillRect(8, 8, CARD_W - 16, 56);
      g.fillStyle(v.color, hovered ? 0.16 : 0.07);
      g.fillRect(8, 8, CARD_W - 16, 56);
      // Price band.
      g.fillStyle(0x0f0d15, 1);
      g.fillRect(3, CARD_H - 32, CARD_W - 6, 29);
      if (k === selected) {
        g.fillStyle(PX.gold, 1);
        g.fillRect(CARD_W - 22, -4, 18, 14);
        g.fillStyle(0x3a2614, 1);
        g.fillRect(CARD_W - 18, 3, 3, 3);
        g.fillRect(CARD_W - 15, 5, 3, 3);
        g.fillRect(CARD_W - 12, 2, 3, 3);
        g.fillRect(CARD_W - 9, -1, 3, 3);
      }
      this.tweens.killTweensOf(card);
      this.tweens.add({ targets: card, y: hovered ? -CARD_LIFT : 0, duration: 110, ease: 'Quad.easeOut' });
    }
  }

  private hideFlyout(): void {
    this.flyoutFor = null;
    this.flyout.setVisible(false);
  }

  /** Card under the pointer in the open fan, or null (the hovered card counts at its lifted height). */
  private flyoutKindAt(pointer: Phaser.Input.Pointer): PartKind | null {
    if (!this.flyoutFor) return null;
    const lx = pointer.worldX - this.flyout.x;
    const ly = pointer.worldY - this.flyout.y;
    for (const { kind, card } of this.flyCards) {
      if (lx >= card.x && lx <= card.x + CARD_W && ly >= card.y && ly <= card.y + CARD_H + CARD_LIFT) return kind;
    }
    return null;
  }

  /** Swap what sits in the root slot: crew cockpit → satellite → rover. */
  public cyclePayload(): void {
    const list = VARIANTS.COCKPIT;
    this.setPartKind('COCKPIT', list[(list.findIndex(v => v.kind === this.partKinds.COCKPIT) + 1) % list.length].kind);
  }

  private applyPayload(payload: PayloadKind): void {
    const root = this.rocketTree.getRootNode();
    this.rocketTree.setPayload(payload);
    const block = this.blockDisplayMap.get(root.id);
    const sprite = block?.list[0] as Phaser.GameObjects.Image | undefined;
    sprite?.setTexture(this.partTexture('COCKPIT')).setDisplaySize(BuilderScene.CELL_SIZE, BuilderScene.CELL_SIZE);
    if (block) {
      block.setScale(1.15);
      this.tweens.add({ targets: block, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
      const top = block.y - BuilderScene.CELL_SIZE / 2 - 6;
      const v = VARIANTS.COCKPIT.find(e => e.kind === payload)!;
      const name = pixelTitle(this, block.x, top - 20, `${v.label}  ${v.extraCost > 0 ? `+$${v.extraCost}` : 'FREE'}`, 10, PX.text.cream).setOrigin(0.5, 1);
      const about = pixelBody(this, block.x, top, v.description, 18, PX.text.white).setOrigin(0.5, 1);
      this.payloadTag?.destroy();
      const tag = this.add.container(0, 0, [name, about]).setDepth(50);
      this.payloadTag = tag;
      this.tweens.add({ targets: tag, y: -18, alpha: 0, delay: 1600, duration: 500, onComplete: () => tag.destroy() });
    }
    this.showMission(loadProgress().completedMissions);
    this.syncExportableState();
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
    this.input.keyboard?.on('keydown-C', () => this.cyclePayload());

    this.input.keyboard?.on('keydown-ESC', () => {
      this.deselectPart();
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.launchFlight());
    // Hovering an RCS shell and pressing a key binds that key to separate it in flight.
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!this.shellTipId || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = normalizeKey(e.key.length === 1 ? e.key : '');
      if (!key) return;
      const res = this.rocketTree.setSeparationKey(this.shellTipId, key);
      this.shellTipNote = res.success ? '' : res.reason ?? '';
      playSfx(this, res.success ? 'UI_CLICK' : 'CLICK_FAIL');
      this.shellTipSig = '';
      this.drawShellTip();
    });

    // Coming back from a flight: the design is untouched, just reset the cursor.
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      if (this.game.canvas) this.game.canvas.style.cursor = 'default';
      this.refreshEconomy();
      this.syncExportableState();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.flyoutFor) {
        const bay = this.paletteBays.find(b => b.type === this.flyoutFor);
        const overBay = bay && Math.abs(pointer.worldX - bay.container.x) <= SLOT_W / 2 + 8 && Math.abs(pointer.worldY - bay.container.y) <= SLOT_H / 2;
        if (!overBay && !this.flyoutRect.contains(pointer.worldX, pointer.worldY)) this.hideFlyout();
        else {
          const kind = this.flyoutKindAt(pointer);
          if (kind !== this.flyHoverKind) {
            if (kind) playSfx(this, 'UI_HOVER');
            this.setFlyoutHover(kind);
          }
        }
      }
      this.updateGhostPreview(pointer);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // The flyout sits over the build bay, so it gets the click first.
      if (this.flyoutFor && this.flyoutRect.contains(pointer.worldX, pointer.worldY)) {
        const kind = this.flyoutKindAt(pointer);
        if (kind && pointer.button === 0) {
          playSfx(this, 'UI_CLICK');
          this.setPartKind(this.flyoutFor, kind);
          this.setFlyoutHover(kind);
        }
        return;
      }
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

  /** Show the key tooltip while the pointer is over an RCS shell in the build bay. */
  private updateShellTip(pointer: Phaser.Input.Pointer): void {
    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    const node = inside && !this.isOverSidePanels(pointer) ? this.rocketTree.getNodeAt(col, row) : undefined;
    const id = node?.type === 'RCS' ? node.id : null;
    const sig = id ? `${id}|${this.rocketTree.getSeparationKey(id)}|${this.rocketTree.shellWarning(id)}` : '';
    for (const fresh of this.freshShells) if (fresh !== id) this.freshShells.delete(fresh);
    if (id === this.shellTipId && sig === this.shellTipSig) return;
    if (id !== this.shellTipId) this.shellTipNote = '';
    if (id && !this.freshShells.has(id)) this.markShellSeen(id);
    this.shellTipId = id;
    this.shellTipSig = sig;
    this.drawShellTip();
  }

  private drawShellTip(): void {
    this.shellTip?.destroy();
    this.shellTip = undefined;
    const node = this.shellTipId ? this.rocketTree.getAllNodes().find(n => n.id === this.shellTipId) : undefined;
    if (!node) return;
    const size = BuilderScene.CELL_SIZE;
    // Only a refused key shows a note; an RCS with nothing on it just works (its key does nothing).
    const warning = this.shellTipNote;
    const w = 250;
    const h = warning ? 112 : 86;
    const x = Math.min(this.gridOriginX + node.gridX * size + size / 2 - w / 2, this.scale.width - w - 8);
    const y = this.gridOriginY + node.gridY * size - h - 10;
    const g = this.add.graphics();
    drawPixelPanel(g, 0, 0, w, h);
    const title = pixelTitle(this, 12, 10, 'SEPARATION KEY', 9, PX.text.accent);
    // The bound key in a big framed box, so it reads at a glance.
    g.fillStyle(0x01020a, 1);
    g.fillRect(12, 30, 46, 46);
    g.lineStyle(2, PX.accent, 1);
    g.strokeRect(13, 31, 44, 44);
    const key = pixelTitle(this, 35, 54, this.rocketTree.getSeparationKey(node.id), 26, PX.text.cream).setOrigin(0.5);
    const how = pixelBody(this, 70, 40, 'Press a key\nto rebind', 18, PX.text.muted);
    const items: Phaser.GameObjects.GameObject[] = [g, title, key, how];
    if (warning) items.push(pixelBody(this, 12, 84, warning, 15, '#ff8a8a').setWordWrapWidth(w - 24));
    this.shellTip = this.add.container(Math.max(8, x), Math.max(8, y), items).setDepth(60);
  }

  private updateGhostPreview(pointer: Phaser.Input.Pointer): void {
    this.updateCursorStyle(pointer);
    this.updateShellTip(pointer);

    const overFlyout = this.flyoutFor !== null && this.flyoutRect.contains(pointer.worldX, pointer.worldY);
    if (overFlyout && this.game.canvas) this.game.canvas.style.cursor = 'pointer';
    if (!this.selectedPartType || this.isOverSidePanels(pointer) || overFlyout) {
      this.ghostContainer.setVisible(false);
      return;
    }

    this.ghostContainer.setVisible(true);
    const size = BuilderScene.CELL_SIZE;
    const type = this.placedType(this.selectedPartType);
    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    this.ghostGfx.clear();
    this.ghostText.setText('');
    this.ghostSprite.setVisible(false);
    const showGhost = (finOrientation: 'LEFT' | 'RIGHT', alpha: number) =>
      this.ghostSprite.setTexture(this.partTexture(type, finOrientation)).setDisplaySize(size, size).setAngle(rcsAngle(type, finOrientation)).setAlpha(alpha).setVisible(true);

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
    if (!this.selectedPartType) {
      // Clicking the cockpit with empty hands swaps the payload.
      const { col, row, inside } = this.getGridCellAtPointer(pointer);
      if (inside && this.rocketTree.getNodeAt(col, row)?.id === this.rocketTree.getRootNode().id) this.cyclePayload();
      return;
    }

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) {
      this.deselectPart();
      return;
    }

    const type = this.placedType(this.selectedPartType);
    const attachResult = this.rocketTree.attachPart(col, row, type, type === 'FUEL_TANK' ? (this.partKinds.FUEL_TANK as FuelKind) : undefined);
    if (attachResult.success && attachResult.node) {
      playSfx(this, 'UI_CLICK');
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
      playSfx(this, 'CLICK_FAIL');
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
      playSfx(this, 'UI_BLOCK_DELETE');
      const size = BuilderScene.CELL_SIZE;
      this.particleManager.triggerEffect('PART_DISASSEMBLE', this.gridOriginX + col * size + size / 2, this.gridOriginY + row * size + size / 2);
      this.renderRocket();
      this.shellTipId = null;
      this.shellTipSig = '';
      this.drawShellTip();
      this.syncExportableState('[RocketBuilder] Part removed:');
    } else {
      playSfx(this, 'CLICK_FAIL');
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
        this.shellBadges.delete(id);
        this.freshShells.delete(id);
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
    const sprite = this.add.image(0, 0, this.partTexture(node.type, node.finOrientation, node.fuelKind ?? node.payload))
      .setDisplaySize(size, size)
      .setAngle(rcsAngle(node.type, node.finOrientation));
    blockContainer.add(sprite);
    if (node.type === 'RCS' && !this.seenShells.has(node.id)) {
      const badge = this.shellBadge(size);
      blockContainer.add(badge);
      this.shellBadges.set(node.id, badge);
      this.freshShells.add(node.id);
    }
    this.blocksContainer.add(blockContainer);
    this.blockDisplayMap.set(node.id, blockContainer);
  }

  /** A small "!" on an RCS: hover it to set the key that separates its shell. */
  private shellBadge(size: number): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x01020a, 1);
    g.fillRect(-12, -12, 24, 24);
    g.fillStyle(PX.accent, 1);
    g.fillRect(-10, -10, 20, 20);
    const mark = pixelTitle(this, 0, 1, '!', 16, '#1a1020').setOrigin(0.5);
    const badge = this.add.container(size / 2 - 12, -size / 2 + 12, [g, mark]);
    const pulse = this.tweens.add({ targets: badge, scale: 1.15, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    badge.once(Phaser.GameObjects.Events.DESTROY, () => pulse.remove());
    return badge;
  }

  /** First hover over an RCS: the player has found its key tooltip, so its "!" badge goes away. */
  private markShellSeen(id: string): void {
    if (this.seenShells.has(id)) return;
    this.seenShells.add(id);
    this.shellBadges.get(id)?.destroy();
    this.shellBadges.delete(id);
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
