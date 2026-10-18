import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { currentMission, rocketCost } from '../game/missions';
import { loadProgress, saveProgress, withGrant } from '../game/progress';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { PartType, PortDirection, RocketNode } from '../core/types';
import { ParticleManager } from '../particles';
import { preloadGameAssets, getPartTextureKey, GAME_ASSETS } from '../core/assets';
import { UI } from '../ui/theme';

interface PaletteBay {
  type: PartType;
  label: string;
  container: Phaser.GameObjects.Container;
  bgGfx: Phaser.GameObjects.Graphics;
  hotkeyNum: string;
}

export class BuilderScene extends Phaser.Scene {
  public static readonly GRID_COLS = 15;
  public static readonly GRID_ROWS = 13;
  public static readonly CELL_SIZE = 54;

  public readonly hudHeight = 96;
  public readonly hudY = 14;
  public readonly trayHeight = 128;
  public readonly trayY = 592;

  private rocketTree!: RocketTree;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
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

  // HUD text objects
  private hudStatusText!: Phaser.GameObjects.Text;
  private hudStatsText!: Phaser.GameObjects.Text;
  private launchButtonBg!: Phaser.GameObjects.Graphics;
  private launchButtonText!: Phaser.GameObjects.Text;
  private launchReady = false;
  private launchBlockedReason = '';
  private economyText!: Phaser.GameObjects.Text;
  private missionText!: Phaser.GameObjects.Text;
  private money = 0;

  constructor() {
    super('BuilderScene');
  }

  preload(): void {
    preloadGameAssets(this);
  }

  create(): void {
    // 1. Layout coordinates (1280 x 720 widescreen)
    const totalGridWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const totalGridHeight = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    // Centered horizontally: (1280 - 810) / 2 = 235
    this.gridOriginX = Math.round((this.scale.width - totalGridWidth) / 2);
    // Centered vertically: (720 - 702) / 2 = 9 (fills screen with UI floating on top)
    this.gridOriginY = Math.round((this.scale.height - totalGridHeight) / 2);

    // 2. Initialize core RocketTree model & ParticleManager
    this.rocketTree = new RocketTree(7, 8);
    this.particleManager = new ParticleManager(this);

    // 3. Rendering layers in order
    this.sceneryGraphics = this.add.graphics();
    this.gridGraphics = this.add.graphics();
    this.blocksContainer = this.add.container(0, 0);
    this.socketsContainer = this.add.container(0, 0);
    this.ghostContainer = this.add.container(0, 0);
    this.hudContainer = this.add.container(0, 0);

    this.createGhostPreview();
    this.drawScenery();
    this.drawGrid();
    this.createBottomPartsTray();
    this.createHud();
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

  private drawScenery(): void {
    this.sceneryGraphics.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    // Plain solid dark background
    this.sceneryGraphics.fillStyle(0x0f172a, 1);
    this.sceneryGraphics.fillRect(0, 0, w, h);
  }

  private drawGrid(): void {
    this.gridGraphics.clear();

    const width = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const height = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    // Grid workspace backing
    this.gridGraphics.fillStyle(0x111c30, 1);
    this.gridGraphics.fillRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid outer border - crisp high-contrast border
    this.gridGraphics.lineStyle(2.5, 0x47638f, 1);
    this.gridGraphics.strokeRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid lines - high-contrast visible lines
    for (let c = 1; c < BuilderScene.GRID_COLS; c++) {
      const x = this.gridOriginX + c * BuilderScene.CELL_SIZE;
      // Center column line highlight (Col 7 / 8 boundary is the rocket centerline)
      if (c === 7 || c === 8) {
        this.gridGraphics.lineStyle(1.5, 0x3d5a80, 1);
      } else {
        this.gridGraphics.lineStyle(1, 0x273b56, 0.95);
      }
      this.gridGraphics.lineBetween(x, this.gridOriginY, x, this.gridOriginY + height);
    }
    for (let r = 1; r < BuilderScene.GRID_ROWS; r++) {
      const y = this.gridOriginY + r * BuilderScene.CELL_SIZE;
      if (r === 8) {
        this.gridGraphics.lineStyle(1.5, 0x3d5a80, 1);
      } else {
        this.gridGraphics.lineStyle(1, 0x273b56, 0.95);
      }
      this.gridGraphics.lineBetween(this.gridOriginX, y, this.gridOriginX + width, y);
    }
  }

  private createBottomPartsTray(): void {
    const w = this.scale.width;
    const h = this.trayHeight;
    const trayY = this.trayY;

    // 1. Plain dark tray backing (semi-opaque so UI clearly sits on top of overlapping grid)
    const trayBg = this.add.graphics();
    trayBg.fillStyle(0x0a101d, 0.96);
    trayBg.fillRect(0, trayY, w, h);
    trayBg.lineStyle(2, 0x334d6e, 1);
    trayBg.lineBetween(0, trayY, w, trayY);

    // 2. Vertical "PARTS" label on the left
    const partsLabelContainer = this.add.container(48, trayY + h / 2);
    const chars = ['P', 'A', 'R', 'T', 'S'];
    chars.forEach((char, idx) => {
      const t = this.add.text(0, (idx - 2) * 20, char, {
        fontSize: '15px',
        color: '#94a3b8',
        fontStyle: 'bold',
        fontFamily: UI.font
      }).setOrigin(0.5);
      partsLabelContainer.add(t);
    });

    // 3. The 5 Bays: BLOCK | CONE | THRUST | FUEL | FINS
    const bayConfigs: Array<{ type: PartType; label: string; hotkey: string }> = [
      { type: 'STRUCTURAL', label: 'BLOCK', hotkey: '1' },
      { type: 'NOSE_CONE', label: 'CONE', hotkey: '2' },
      { type: 'ENGINE', label: 'THRUST', hotkey: '3' },
      { type: 'FUEL_TANK', label: 'FUEL', hotkey: '4' },
      { type: 'FIN', label: 'FINS', hotkey: '5' }
    ];

    const bayWidth = 108;
    const bayHeight = 98;
    const baySpacing = 16;
    const totalBaysWidth = bayConfigs.length * bayWidth + (bayConfigs.length - 1) * baySpacing;
    const startX = Math.round((w - totalBaysWidth) / 2) + Math.round(bayWidth / 2);
    const bayY = trayY + Math.round(h / 2);

    this.paletteBays = [];

    bayConfigs.forEach((cfg, idx) => {
      const bx = startX + idx * (bayWidth + baySpacing);
      const bayContainer = this.add.container(bx, bayY);

      // Bay background graphics
      const bgGfx = this.add.graphics();
      this.drawBayBg(bgGfx, false, bayWidth, bayHeight);

      // Pixel art icon preview (42x42)
      const texKey = getPartTextureKey(cfg.type, 'LEFT');
      const iconSprite = this.add.image(0, -10, texKey).setDisplaySize(42, 42);

      // Label below (clearly readable 13px bold)
      const labelText = this.add.text(0, 24, cfg.label, {
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        fontFamily: UI.font
      }).setOrigin(0.5);

      // Hotkey badge in corner
      const hotkeyText = this.add.text(-40, -36, cfg.hotkey, {
        fontSize: '13px',
        color: '#94a3b8',
        fontStyle: 'bold',
        fontFamily: UI.font
      }).setOrigin(0.5);

      bayContainer.add([bgGfx, iconSprite, labelText, hotkeyText]);
      bayContainer.setSize(bayWidth, bayHeight);
      bayContainer.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, bayWidth, bayHeight),
        Phaser.Geom.Rectangle.Contains
      );

      // Hover and click animations
      bayContainer.on('pointerover', () => {
        if (this.game.canvas) this.game.canvas.style.cursor = 'pointer';
        if (this.selectedPartType !== cfg.type) {
          this.tweens.add({
            targets: bayContainer,
            y: bayY - 4,
            duration: 120,
            ease: 'Power2'
          });
        }
      });

      bayContainer.on('pointerout', (pointer: Phaser.Input.Pointer) => {
        this.updateCursorStyle(pointer);
        if (this.selectedPartType !== cfg.type) {
          this.tweens.add({
            targets: bayContainer,
            y: bayY,
            duration: 120,
            ease: 'Power2'
          });
        }
      });

      bayContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 0) {
          this.selectPaletteItem(cfg.type);
        }
      });

      this.paletteBays.push({
        type: cfg.type,
        label: cfg.label,
        container: bayContainer,
        bgGfx,
        hotkeyNum: cfg.hotkey
      });
    });
  }

  private drawBayBg(gfx: Phaser.GameObjects.Graphics, isSelected: boolean, w: number, h: number): void {
    gfx.clear();
    if (isSelected) {
      gfx.fillStyle(0x1e293b, 1);
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      gfx.lineStyle(2.5, 0x38bdf8, 1); // Glowing cyan border
      gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    } else {
      gfx.fillStyle(0x141f33, 0.9);
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      gfx.lineStyle(2, 0x334d6e, 1);
      gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    }
  }

  private createHud(): void {
    const padX = 24;
    const padY = this.hudY;

    // Terminal Panel in Top Left (enlarged with crystal clear typography)
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x111c30, 0.95);
    panelBg.fillRoundedRect(padX, padY, 360, this.hudHeight, 8);
    panelBg.lineStyle(2, 0x334d6e, 1);
    panelBg.strokeRoundedRect(padX, padY, 360, this.hudHeight, 8);

    const titleText = this.add.text(padX + 16, padY + 10, 'MISSION TELEMETRY', {
      fontSize: '13px',
      color: '#38bdf8',
      fontStyle: 'bold',
      fontFamily: UI.font
    });

    this.hudStatusText = this.add.text(padX + 16, padY + 31, 'STATUS: [ INCOMPLETE ]', {
      fontSize: '15px',
      color: '#f59e0b',
      fontStyle: 'bold',
      fontFamily: UI.font
    });

    this.hudStatsText = this.add.text(padX + 16, padY + 54, 'MASS: 100 kg    THRUST: 0 kN\nFUEL: 0 L      TWR: 0.00', {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: UI.font,
      lineSpacing: 4
    });

    this.hudContainer.add([panelBg, titleText, this.hudStatusText, this.hudStatsText]);
    this.createLaunchButton(padX, padY + this.hudHeight + 10);

    // Top Right Controls Helper Badge
    const helperBg = this.add.graphics();
    const helperW = 540;
    const helperH = 42;
    const helperX = this.scale.width - helperW - 24;
    helperBg.fillStyle(0x111c30, 0.95);
    helperBg.fillRoundedRect(helperX, padY, helperW, helperH, 8);
    helperBg.lineStyle(2, 0x334d6e, 1);
    helperBg.strokeRoundedRect(helperX, padY, helperW, helperH, 8);

    const helperText = this.add.text(helperX + 16, padY + 12, '1-5: Select  •  L-Click: Place  •  R-Click: Remove  •  Esc: Cancel', {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: UI.font
    });
    this.hudContainer.add([helperBg, helperText]);

    // Mission + money badge under the controls helper.
    const econY = padY + helperH + 8;
    const econBg = this.add.graphics();
    econBg.fillStyle(0x111c30, 0.95);
    econBg.fillRoundedRect(helperX, econY, helperW, 58, 8);
    econBg.lineStyle(2, 0x334d6e, 1);
    econBg.strokeRoundedRect(helperX, econY, helperW, 58, 8);
    this.missionText = this.add.text(helperX + 16, econY + 9, '', { fontSize: '13px', color: '#facc15', fontStyle: 'bold', fontFamily: UI.font });
    this.economyText = this.add.text(helperX + 16, econY + 31, '', { fontSize: '13px', color: '#ffffff', fontStyle: 'bold', fontFamily: UI.font });
    this.hudContainer.add([econBg, this.missionText, this.economyText]);
  }

  /** Reload money/missions (they change after every flight) and top up broke players. */
  private refreshEconomy(): void {
    const { progress, grant } = withGrant(loadProgress());
    if (grant > 0) saveProgress(progress);
    this.money = progress.money;
    const mission = currentMission(progress.completedMissions);
    this.missionText.setText(mission ? `MISSION: ${mission.goal}  (+$${mission.reward})` : 'All missions complete — chase the high score!');
    if (grant > 0) this.missionText.setText(`Space agency grant: +$${grant}  ·  ${this.missionText.text}`);
  }

  private createLaunchButton(x: number, y: number): void {
    const w = 360;
    const h = 44;
    this.launchButtonBg = this.add.graphics();
    this.launchButtonText = this.add.text(x + w / 2, y + h / 2, '', {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: UI.font
    }).setOrigin(0.5);

    const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive();
    zone.on('pointerover', () => {
      if (this.game.canvas) this.game.canvas.style.cursor = this.launchReady ? 'pointer' : 'not-allowed';
    });
    zone.on('pointerout', (pointer: Phaser.Input.Pointer) => this.updateCursorStyle(pointer));
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.launchFlight();
    });

    this.hudContainer.add([this.launchButtonBg, this.launchButtonText, zone]);
    this.drawLaunchButton(x, y, w, h);
  }

  private drawLaunchButton(x = 24, y = this.hudY + this.hudHeight + 10, w = 360, h = 44): void {
    const g = this.launchButtonBg;
    g.clear();
    g.fillStyle(this.launchReady ? 0x14532d : 0x1e293b, 0.95);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, this.launchReady ? 0x22c55e : 0x334d6e, 1);
    g.strokeRoundedRect(x, y, w, h, 8);
    this.launchButtonText.setText(this.launchReady ? 'LAUNCH  ▶  (ENTER)' : this.launchBlockedReason);
    this.launchButtonText.setColor(this.launchReady ? '#ffffff' : '#64748b');
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
    if (telemetry.valid) {
      this.hudStatusText.setText('STATUS: [ FLIGHT READY ]');
      this.hudStatusText.setColor('#22c55e');
    } else {
      this.hudStatusText.setText('STATUS: [ INCOMPLETE ]');
      this.hudStatusText.setColor('#f59e0b');
    }

    // TWR with the tanks full — what the rocket actually has to lift off the pad.
    const wetMass = telemetry.totalMass + telemetry.totalFuel;
    const wetTwr = wetMass > 0 ? telemetry.totalThrust / wetMass : 0;
    this.hudStatsText.setText(
      `MASS: ${wetMass} kg (fuelled)    THRUST: ${telemetry.totalThrust}\nFUEL: ${telemetry.totalFuel} L      TWR: ${wetTwr.toFixed(2)}${wetTwr < 1 && telemetry.totalThrust > 0 ? ' (too heavy!)' : ''}`
    );

    const cost = rocketCost(this.rocketTree.getAllNodes().map(n => n.type));
    if (this.economyText) {
      this.economyText.setText(`BANK: $${this.money}      ROCKET COST: $${cost}${cost > this.money ? '   — too expensive!' : ''}`);
      this.economyText.setColor(cost > this.money ? '#f87171' : '#ffffff');
    }
    const affordable = cost <= this.money;
    this.launchReady = telemetry.valid && affordable;
    this.launchBlockedReason = !telemetry.valid ? 'LAUNCH — needs CMD + FUEL + THRUST' : `LAUNCH — costs $${cost}, you have $${this.money}`;
    if (this.launchButtonBg) this.drawLaunchButton();
  }

  private createGhostPreview(): void {
    this.ghostContainer.setVisible(false);
    this.ghostGfx = this.add.graphics();
    this.ghostSprite = this.add.image(0, 0, GAME_ASSETS.PART_COCKPIT.key).setDisplaySize(BuilderScene.CELL_SIZE - 4, BuilderScene.CELL_SIZE - 4);
    this.ghostText = this.add.text(0, 0, '', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: UI.font,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

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
    const h = this.trayHeight;
    const trayY = this.trayY;
    const bayY = trayY + Math.round(h / 2);

    for (const bay of this.paletteBays) {
      const isSelected = bay.type === this.selectedPartType;
      this.drawBayBg(bay.bgGfx, isSelected, 108, 98);

      this.tweens.add({
        targets: bay.container,
        y: isSelected ? bayY - 6 : bayY,
        duration: 150,
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

  private updateCursorStyle(pointer: Phaser.Input.Pointer): void {
    if (!this.game.canvas) return;

    if (this.selectedPartType) {
      this.game.canvas.style.cursor = 'crosshair';
      return;
    }

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (inside && this.rocketTree.getNodeAt(col, row)) {
      this.game.canvas.style.cursor = 'pointer';
      return;
    }

    // Check if pointer is hovering over any bay in the console tray
    const isOverBay = this.paletteBays.some(bay => {
      const bx = bay.container.x;
      const by = bay.container.y;
      return (
        Math.abs(pointer.worldX - bx) <= 54 &&
        Math.abs(pointer.worldY - by) <= 49
      );
    });

    if (isOverBay) {
      this.game.canvas.style.cursor = 'pointer';
      return;
    }

    this.game.canvas.style.cursor = 'default';
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

  private updateGhostPreview(pointer: Phaser.Input.Pointer): void {
    this.updateCursorStyle(pointer);

    if (!this.selectedPartType) {
      this.ghostContainer.setVisible(false);
      return;
    }

    // Hide ghost when cursor is over the bottom parts picker tray
    if (pointer.worldY >= this.trayY) {
      this.ghostContainer.setVisible(false);
      return;
    }

    this.ghostContainer.setVisible(true);
    const size = BuilderScene.CELL_SIZE;
    const def = PART_DEFINITIONS[this.selectedPartType];

    const { col, row, inside } = this.getGridCellAtPointer(pointer);

    if (inside) {
      const snapX = this.gridOriginX + col * size + size / 2;
      const snapY = this.gridOriginY + row * size + size / 2;
      this.ghostContainer.setPosition(snapX, snapY);

      const validation = this.rocketTree.validateAttachment(col, row, this.selectedPartType);

      if (validation.valid) {
        let displayLabel = def.label;
        if (this.selectedPartType === 'FIN') {
          displayLabel = validation.finOrientation === 'LEFT' ? 'L-FIN' : 'R-FIN';
        }

        const texKey = getPartTextureKey(this.selectedPartType, validation.finOrientation ?? 'LEFT');
        this.ghostSprite.setTexture(texKey);
        this.ghostSprite.setVisible(true);
        this.ghostSprite.setAlpha(0.85);
        this.ghostSprite.clearTint();

        this.ghostGfx.clear();
        this.ghostGfx.lineStyle(2.5, 0x22c55e, 1);
        this.ghostGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

        this.ghostText.setText(displayLabel);
        this.ghostText.setColor('#ffffff');
        return;
      }

      // Direct O(1) check if occupied or adjacent to any existing block
      const isOccupied = this.rocketTree.getNodeAt(col, row) !== undefined;
      const hasAdjacentNeighbor =
        this.rocketTree.getNodeAt(col, row - 1) !== undefined ||
        this.rocketTree.getNodeAt(col, row + 1) !== undefined ||
        this.rocketTree.getNodeAt(col - 1, row) !== undefined ||
        this.rocketTree.getNodeAt(col + 1, row) !== undefined;

      this.ghostGfx.clear();
      if (isOccupied || hasAdjacentNeighbor) {
        const texKey = getPartTextureKey(this.selectedPartType, 'LEFT');
        this.ghostSprite.setTexture(texKey);
        this.ghostSprite.setVisible(true);
        this.ghostSprite.setAlpha(0.4);
        this.ghostSprite.setTint(0xef4444);

        this.ghostGfx.fillStyle(0xef4444, 0.25);
        this.ghostGfx.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
        this.ghostGfx.lineStyle(2.5, 0xef4444, 0.9);
        this.ghostGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

        this.ghostText.setText(isOccupied ? '' : 'INVALID');
        this.ghostText.setColor('#fca5a5');
      } else {
        // Empty cell not adjacent to any open socket - soft translucent guide
        const texKey = getPartTextureKey(this.selectedPartType, 'LEFT');
        this.ghostSprite.setTexture(texKey);
        this.ghostSprite.setVisible(true);
        this.ghostSprite.setAlpha(0.2);
        this.ghostSprite.clearTint();

        this.ghostGfx.fillStyle(0x334155, 0.2);
        this.ghostGfx.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
        this.ghostGfx.lineStyle(1.5, 0x64748b, 0.6);
        this.ghostGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

        this.ghostText.setText(def.label);
        this.ghostText.setColor('#94a3b8');
      }
      return;
    }

    // Floating smoothly under cursor when outside grid
    this.ghostContainer.setPosition(pointer.worldX, pointer.worldY);
    const texKey = getPartTextureKey(this.selectedPartType, 'LEFT');
    this.ghostSprite.setTexture(texKey);
    this.ghostSprite.setVisible(true);
    this.ghostSprite.setAlpha(0.7);
    this.ghostSprite.clearTint();

    this.ghostGfx.clear();
    this.ghostGfx.lineStyle(2, 0x94a3b8, 0.85);
    this.ghostGfx.strokeRect(-size / 2, -size / 2, size, size);

    this.ghostText.setText(def.label);
    this.ghostText.setColor('#ffffff');
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (pointer.worldY >= this.trayY) {
      // Handled by bayContainer pointerdown
      return;
    }

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

      // VFX: Trigger snap burst particles
      const snapX = this.gridOriginX + attachResult.node.gridX * BuilderScene.CELL_SIZE + BuilderScene.CELL_SIZE / 2;
      const snapY = this.gridOriginY + attachResult.node.gridY * BuilderScene.CELL_SIZE + BuilderScene.CELL_SIZE / 2;
      this.particleManager.triggerEffect('SOCKET_SNAP', snapX, snapY);

      // Docking tactile bounce
      const blockContainer = this.blockDisplayMap.get(attachResult.node.id);
      if (blockContainer) {
        blockContainer.setScale(1.12);
        this.tweens.add({
          targets: blockContainer,
          scaleX: 1,
          scaleY: 1,
          duration: 180,
          ease: 'Back.easeOut'
        });
      }
    } else {
      // VFX: Rejection error burst when attempting invalid placement
      this.particleManager.triggerEffect('REJECTION_ERROR', pointer.worldX, pointer.worldY);
    }
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (pointer.worldY >= this.trayY) return;

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
      // VFX: Disassemble puff particles
      const size = BuilderScene.CELL_SIZE;
      const rx = this.gridOriginX + col * size + size / 2;
      const ry = this.gridOriginY + row * size + size / 2;
      this.particleManager.triggerEffect('PART_DISASSEMBLE', rx, ry);

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

    // VFX: Rejection error burst on forbidden deletion
    this.particleManager.triggerEffect('REJECTION_ERROR', cx, cy);

    const flash = this.add.graphics();
    flash.setPosition(cx, cy);
    flash.fillStyle(0xef4444, 0.65);
    flash.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
    flash.lineStyle(3, 0xff0000, 1);
    flash.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

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
    const def = PART_DEFINITIONS[node.type];
    const size = BuilderScene.CELL_SIZE;
    const cx = this.gridOriginX + node.gridX * size + size / 2;
    const cy = this.gridOriginY + node.gridY * size + size / 2;

    const blockContainer = this.add.container(cx, cy);

    // Pixel art sprite representing the part
    const texKey = getPartTextureKey(node.type, node.finOrientation);
    const sprite = this.add.image(0, 0, texKey).setDisplaySize(size - 2, size - 2);

    // Subtle framing border
    const blockGfx = this.add.graphics();
    blockGfx.lineStyle(1.5, 0xffffff, 0.35);
    blockGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

    let displayLabel = def.label;
    if (node.type === 'COCKPIT') displayLabel = 'CMD';
    else if (node.type === 'FIN') displayLabel = node.finOrientation === 'LEFT' ? 'L-FIN' : 'R-FIN';

    const label = this.add.text(size / 2 - 4, size / 2 - 4, displayLabel, {
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: UI.font,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(1, 1);

    blockContainer.add([sprite, blockGfx, label]);
    this.blocksContainer.add(blockContainer);
    this.blockDisplayMap.set(node.id, blockContainer);
  }

  private renderAvailableSockets(): void {
    const ports = this.rocketTree.getAvailablePorts();
    const radius = 7;

    for (const port of ports) {
      const pos = this.getPortPixelPosition(port.gridX, port.gridY, port.direction);

      const socketGfx = this.add.graphics();
      socketGfx.fillStyle(0x0284c7, 0.95);
      socketGfx.fillCircle(pos.x, pos.y, radius);
      socketGfx.lineStyle(2, 0x38bdf8, 1);
      socketGfx.strokeCircle(pos.x, pos.y, radius);

      // Subtle breathing pulse
      this.tweens.add({
        targets: socketGfx,
        alpha: { from: 0.65, to: 1.0 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

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
