import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { PartType, PortDirection, RocketNode } from '../core/types';

interface PaletteBay {
  type: PartType;
  label: string;
  container: Phaser.GameObjects.Container;
  bgGfx: Phaser.GameObjects.Graphics;
  hotkeyNum: string;
}

export class BuilderScene extends Phaser.Scene {
  public static readonly GRID_COLS = 15;
  public static readonly GRID_ROWS = 15;
  public static readonly CELL_SIZE = 56;

  private rocketTree!: RocketTree;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private blocksContainer!: Phaser.GameObjects.Container;
  private socketsContainer!: Phaser.GameObjects.Container;
  private ghostContainer!: Phaser.GameObjects.Container;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private ghostText!: Phaser.GameObjects.Text;
  private hudContainer!: Phaser.GameObjects.Container;

  private blockDisplayMap: Map<string, Phaser.GameObjects.Container> = new Map();

  private gridOriginX = 0;
  private gridOriginY = 0;

  private selectedPartType: PartType | null = null;
  private paletteBays: PaletteBay[] = [];

  // HUD text objects
  private hudStatusText!: Phaser.GameObjects.Text;
  private hudStatsText!: Phaser.GameObjects.Text;

  constructor() {
    super('BuilderScene');
  }

  create(): void {
    // 1. Layout coordinates (Leave 130px at bottom for parts console)
    const totalGridWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const totalGridHeight = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    this.gridOriginX = Math.floor((this.scale.width - totalGridWidth) / 2);
    this.gridOriginY = Math.floor((this.scale.height - totalGridHeight - 130) / 2 + 10);

    // 2. Initialize core RocketTree model
    this.rocketTree = new RocketTree(7, 4);

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
    this.renderRocket();
    this.setupInputHandlers();

    // 4. Initial sync and global debug handle
    this.syncExportableState('[RocketBuilder] Initialized rocket:');
    (window as unknown as { __ROCKET_TREE__: RocketTree }).__ROCKET_TREE__ = this.rocketTree;
    (window as unknown as { __BUILDER_SCENE__: BuilderScene }).__BUILDER_SCENE__ = this;
  }

  private drawScenery(): void {
    this.sceneryGraphics.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    // Plain solid dark background
    this.sceneryGraphics.fillStyle(0x11141a, 1);
    this.sceneryGraphics.fillRect(0, 0, w, h);
  }

  private drawGrid(): void {
    this.gridGraphics.clear();

    const width = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const height = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    // Grid workspace backing
    this.gridGraphics.fillStyle(0x161a23, 1);
    this.gridGraphics.fillRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid outer border
    this.gridGraphics.lineStyle(2, 0x334155, 1);
    this.gridGraphics.strokeRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid lines
    this.gridGraphics.lineStyle(1, 0x1f2937, 0.85);
    for (let c = 1; c < BuilderScene.GRID_COLS; c++) {
      const x = this.gridOriginX + c * BuilderScene.CELL_SIZE;
      this.gridGraphics.lineBetween(x, this.gridOriginY, x, this.gridOriginY + height);
    }
    for (let r = 1; r < BuilderScene.GRID_ROWS; r++) {
      const y = this.gridOriginY + r * BuilderScene.CELL_SIZE;
      this.gridGraphics.lineBetween(this.gridOriginX, y, this.gridOriginX + width, y);
    }
  }

  private createBottomPartsTray(): void {
    const w = this.scale.width;
    const h = 126;
    const trayY = this.scale.height - h;

    // 1. Plain dark tray backing
    const trayBg = this.add.graphics();
    trayBg.fillStyle(0x0f172a, 0.98);
    trayBg.fillRect(0, trayY, w, h);
    trayBg.lineStyle(2, 0x334155, 1);
    trayBg.lineBetween(0, trayY, w, trayY);

    // 2. Vertical "PARTS" label on the left
    const partsLabelContainer = this.add.container(48, trayY + h / 2);
    const chars = ['P', 'A', 'R', 'T', 'S'];
    chars.forEach((char, idx) => {
      const t = this.add.text(0, (idx - 2) * 20, char, {
        fontSize: '16px',
        color: '#94a3b8',
        fontStyle: 'bold'
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

    const bayWidth = 96;
    const bayHeight = 98;
    const baySpacing = 16;
    const totalBaysWidth = bayConfigs.length * bayWidth + (bayConfigs.length - 1) * baySpacing;
    const startX = (w - totalBaysWidth) / 2 + bayWidth / 2 + 25;
    const bayY = trayY + h / 2;

    this.paletteBays = [];

    bayConfigs.forEach((cfg, idx) => {
      const bx = startX + idx * (bayWidth + baySpacing);
      const bayContainer = this.add.container(bx, bayY);
      const def = PART_DEFINITIONS[cfg.type];

      // Bay background graphics
      const bgGfx = this.add.graphics();
      this.drawBayBg(bgGfx, false, bayWidth, bayHeight);

      // Blank square icon preview
      const iconGfx = this.add.graphics();
      iconGfx.fillStyle(def.color, 1);
      iconGfx.fillRect(-16, -26, 32, 32);
      iconGfx.lineStyle(1.5, 0xffffff, 0.7);
      iconGfx.strokeRect(-16, -26, 32, 32);

      // Label below
      const labelText = this.add.text(0, 24, cfg.label, {
        fontSize: '12px',
        color: '#f8fafc',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // Hotkey badge in corner
      const hotkeyText = this.add.text(-36, -34, cfg.hotkey, {
        fontSize: '11px',
        color: '#94a3b8',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      bayContainer.add([bgGfx, iconGfx, labelText, hotkeyText]);
      bayContainer.setSize(bayWidth, bayHeight);
      bayContainer.setInteractive(
        new Phaser.Geom.Rectangle(-bayWidth / 2, -bayHeight / 2, bayWidth, bayHeight),
        Phaser.Geom.Rectangle.Contains
      );

      // Hover and click animations
      bayContainer.on('pointerover', () => {
        if (this.selectedPartType !== cfg.type) {
          this.tweens.add({
            targets: bayContainer,
            y: bayY - 4,
            duration: 120,
            ease: 'Power2'
          });
        }
      });

      bayContainer.on('pointerout', () => {
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
      gfx.lineStyle(2, 0x38bdf8, 1); // Glowing cyan border
      gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    } else {
      gfx.fillStyle(0x1e293b, 0.6);
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      gfx.lineStyle(1.5, 0x334155, 1);
      gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    }
  }

  private createHud(): void {
    const padX = 24;
    const padY = 20;

    // Terminal Panel in Top Left
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x161a23, 0.9);
    panelBg.fillRoundedRect(padX, padY, 280, 96, 8);
    panelBg.lineStyle(2, 0x334155, 1);
    panelBg.strokeRoundedRect(padX, padY, 280, 96, 8);

    const titleText = this.add.text(padX + 14, padY + 10, 'MISSION TELEMETRY', {
      fontSize: '11px',
      color: '#38bdf8',
      fontStyle: 'bold'
    });

    this.hudStatusText = this.add.text(padX + 14, padY + 28, 'STATUS: [ INCOMPLETE ]', {
      fontSize: '12px',
      color: '#f59e0b',
      fontStyle: 'bold'
    });

    this.hudStatsText = this.add.text(padX + 14, padY + 50, 'MASS: 100 kg   THRUST: 0 kN\nFUEL: 0 L     TWR: 0.00', {
      fontSize: '11px',
      color: '#e2e8f0',
      lineSpacing: 4
    });

    this.hudContainer.add([panelBg, titleText, this.hudStatusText, this.hudStatsText]);

    // Top Right Controls Helper Badge
    const helperBg = this.add.graphics();
    const helperW = 340;
    const helperX = this.scale.width - helperW - 24;
    helperBg.fillStyle(0x161a23, 0.9);
    helperBg.fillRoundedRect(helperX, padY, helperW, 36, 6);
    helperBg.lineStyle(1.5, 0x334155, 1);
    helperBg.strokeRoundedRect(helperX, padY, helperW, 36, 6);

    const helperText = this.add.text(helperX + 14, padY + 11, '1-5: Select  •  L-Click: Place  •  R-Click: Remove', {
      fontSize: '11px',
      color: '#94a3b8',
      fontStyle: 'bold'
    });
    this.hudContainer.add([helperBg, helperText]);
  }

  private updateHud(telemetry: ReturnType<RocketTree['getTelemetry']>): void {
    if (telemetry.valid) {
      this.hudStatusText.setText('STATUS: [ FLIGHT READY ]');
      this.hudStatusText.setColor('#22c55e');
    } else {
      this.hudStatusText.setText('STATUS: [ INCOMPLETE ]');
      this.hudStatusText.setColor('#f59e0b');
    }

    this.hudStatsText.setText(
      `MASS: ${telemetry.totalMass} kg   THRUST: ${telemetry.totalThrust} kN\nFUEL: ${telemetry.totalFuel} L    TWR: ${telemetry.twr.toFixed(2)}`
    );
  }

  private createGhostPreview(): void {
    this.ghostContainer.setVisible(false);
    this.ghostGfx = this.add.graphics();
    this.ghostText = this.add.text(0, 0, '', {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.ghostContainer.add([this.ghostGfx, this.ghostText]);
  }

  public selectPaletteItem(type: PartType): void {
    if (this.selectedPartType === type) {
      this.deselectPart();
      return;
    }

    this.selectedPartType = type;
    this.ghostContainer.setVisible(true);
    this.updatePaletteSelectionUI();
  }

  public deselectPart(): void {
    this.selectedPartType = null;
    this.ghostContainer.setVisible(false);
    this.updatePaletteSelectionUI();
  }

  private updatePaletteSelectionUI(): void {
    const h = 126;
    const trayY = this.scale.height - h;
    const bayY = trayY + h / 2;

    for (const bay of this.paletteBays) {
      const isSelected = bay.type === this.selectedPartType;
      this.drawBayBg(bay.bgGfx, isSelected, 96, 98);

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

  private getGridCellAtPointer(pointer: Phaser.Input.Pointer): { col: number; row: number; inside: boolean } {
    const col = Math.floor((pointer.x - this.gridOriginX) / BuilderScene.CELL_SIZE);
    const row = Math.floor((pointer.y - this.gridOriginY) / BuilderScene.CELL_SIZE);
    const inside =
      col >= 0 &&
      col < BuilderScene.GRID_COLS &&
      row >= 0 &&
      row < BuilderScene.GRID_ROWS &&
      pointer.x >= this.gridOriginX &&
      pointer.y >= this.gridOriginY &&
      pointer.y < this.scale.height - 130; // Exclude bottom console tray

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
    if (!this.selectedPartType) {
      this.ghostContainer.setVisible(false);
      return;
    }

    this.ghostContainer.setVisible(true);
    const size = BuilderScene.CELL_SIZE;
    const def = PART_DEFINITIONS[this.selectedPartType];

    const { col, row, inside } = this.getGridCellAtPointer(pointer);

    if (inside) {
      const validation = this.rocketTree.validateAttachment(col, row, this.selectedPartType);

      if (validation.valid) {
        // Snapped blank square with green highlight
        const snapX = this.gridOriginX + col * size + size / 2;
        const snapY = this.gridOriginY + row * size + size / 2;

        let displayLabel = def.label;
        if (this.selectedPartType === 'FIN') {
          displayLabel = validation.finOrientation === 'LEFT' ? 'L-FIN' : 'R-FIN';
        }

        this.ghostContainer.setPosition(snapX, snapY);
        this.ghostGfx.clear();
        this.ghostGfx.fillStyle(def.color, 0.45);
        this.ghostGfx.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
        this.ghostGfx.lineStyle(2, 0x22c55e, 1);
        this.ghostGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

        this.ghostText.setText(displayLabel);
        return;
      }

      // Check if near socket or occupied for red indicator
      const hasAdjacentSocket = this.rocketTree.getAvailablePorts().some(
        p => p.targetGridX === col && p.targetGridY === row
      );
      const isOccupied = this.rocketTree.getNodeAt(col, row) !== undefined;

      if (hasAdjacentSocket || isOccupied) {
        const snapX = this.gridOriginX + col * size + size / 2;
        const snapY = this.gridOriginY + row * size + size / 2;

        this.ghostContainer.setPosition(snapX, snapY);
        this.ghostGfx.clear();
        this.ghostGfx.fillStyle(0xef4444, 0.25);
        this.ghostGfx.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
        this.ghostGfx.lineStyle(2, 0xef4444, 0.9);
        this.ghostGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

        this.ghostText.setText(def.label);
        return;
      }
    }

    // Floating smoothly under cursor
    this.ghostContainer.setPosition(pointer.x, pointer.y);
    this.ghostGfx.clear();
    this.ghostGfx.fillStyle(def.color, 0.5);
    this.ghostGfx.fillRect(-size / 2, -size / 2, size, size);
    this.ghostGfx.lineStyle(1, 0x94a3b8, 0.8);
    this.ghostGfx.strokeRect(-size / 2, -size / 2, size, size);

    this.ghostText.setText(def.label);
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedPartType) return;

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) {
      if (pointer.y < this.scale.height - 130) {
        this.deselectPart();
      }
      return;
    }

    const attachResult = this.rocketTree.attachPart(col, row, this.selectedPartType);
    if (attachResult.success && attachResult.node) {
      this.renderRocket();
      this.updateGhostPreview(pointer);
      this.syncExportableState('[RocketBuilder] Part attached:');

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
    }
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
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
      this.renderRocket();
      this.syncExportableState('[RocketBuilder] Part removed:');
    } else {
      console.warn(`[RocketBuilder] ${removeResult.reason}`);
      this.flashAndShakeBlock(targetNode);
    }
  }

  private flashAndShakeBlock(node: RocketNode): void {
    const size = BuilderScene.CELL_SIZE;
    const px = this.gridOriginX + node.gridX * size;
    const py = this.gridOriginY + node.gridY * size;

    const flash = this.add.graphics();
    flash.fillStyle(0xef4444, 0.65);
    flash.fillRect(px + 2, py + 2, size - 4, size - 4);
    flash.lineStyle(3, 0xff0000, 1);
    flash.strokeRect(px + 2, py + 2, size - 4, size - 4);

    const blockDisplay = this.blockDisplayMap.get(node.id);
    const targetsToShake: object[] = [flash];
    if (blockDisplay) {
      targetsToShake.push(blockDisplay);
    }

    this.tweens.add({
      targets: targetsToShake,
      x: { from: -5, to: 5 },
      duration: 35,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        if (blockDisplay) {
          blockDisplay.x = px + size / 2;
        }
        flash.destroy();
      }
    });
  }

  public renderRocket(): void {
    this.blocksContainer.removeAll(true);
    this.blockDisplayMap.clear();
    this.socketsContainer.removeAll(true);

    const nodes = this.rocketTree.getAllNodes();
    for (const node of nodes) {
      this.renderBlock(node);
    }

    this.renderAvailableSockets();
  }

  private renderBlock(node: RocketNode): void {
    const def = PART_DEFINITIONS[node.type];
    const size = BuilderScene.CELL_SIZE;
    const cx = this.gridOriginX + node.gridX * size + size / 2;
    const cy = this.gridOriginY + node.gridY * size + size / 2;

    const blockContainer = this.add.container(cx, cy);

    // Clean blank colored square
    const blockGfx = this.add.graphics();
    blockGfx.fillStyle(def.color, 1);
    blockGfx.fillRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
    blockGfx.lineStyle(2, 0xffffff, 0.6);
    blockGfx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

    let displayLabel = def.label;
    if (node.type === 'COCKPIT') displayLabel = 'CMD';
    else if (node.type === 'FIN') displayLabel = node.finOrientation === 'LEFT' ? 'L-FIN' : 'R-FIN';

    const label = this.add.text(0, 0, displayLabel, {
      fontSize: node.type === 'FIN' ? '10px' : '11px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    blockContainer.add([blockGfx, label]);
    this.blocksContainer.add(blockContainer);
    this.blockDisplayMap.set(node.id, blockContainer);
  }

  private renderAvailableSockets(): void {
    const ports = this.rocketTree.getAvailablePorts();
    const radius = 6;

    for (const port of ports) {
      const pos = this.getPortPixelPosition(port.gridX, port.gridY, port.direction);

      const socketGfx = this.add.graphics();
      socketGfx.fillStyle(0x0284c7, 0.9);
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
