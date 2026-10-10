import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { PartType, PortDirection, RocketNode } from '../core/types';
import { TextureGenerator } from '../graphics/TextureGenerator';

interface PaletteBay {
  type: PartType;
  label: string;
  iconTexture: string;
  container: Phaser.GameObjects.Container;
  frameImg: Phaser.GameObjects.Image;
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
  private ghostImage!: Phaser.GameObjects.Image;
  private ghostOutline!: Phaser.GameObjects.Graphics;
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
    // 1. Generate retro procedural textures
    TextureGenerator.generateAll(this, BuilderScene.CELL_SIZE);

    // 2. Layout coordinates (Leave 130px at bottom for parts console)
    const totalGridWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const totalGridHeight = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    this.gridOriginX = Math.floor((this.scale.width - totalGridWidth) / 2);
    this.gridOriginY = Math.floor((this.scale.height - totalGridHeight - 130) / 2 + 10);

    // 3. Initialize core RocketTree model
    this.rocketTree = new RocketTree(7, 4);

    // 4. Rendering layers in order
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

    // 5. Initial sync and global debug handle
    this.syncExportableState('[RocketBuilder] Initialized rocket:');
    (window as unknown as { __ROCKET_TREE__: RocketTree }).__ROCKET_TREE__ = this.rocketTree;
    (window as unknown as { __BUILDER_SCENE__: BuilderScene }).__BUILDER_SCENE__ = this;
  }

  private drawScenery(): void {
    this.sceneryGraphics.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    // Sky gradient (Soft sage / mint #8fb8a8 to #a1c5b6)
    this.sceneryGraphics.fillGradientStyle(0x8fb8a8, 0x8fb8a8, 0xa3c7b8, 0xa3c7b8, 1);
    this.sceneryGraphics.fillRect(0, 0, w, h);

    // Distant jagged mountains (#182932)
    this.sceneryGraphics.fillStyle(0x182932, 1);
    this.sceneryGraphics.beginPath();
    this.sceneryGraphics.moveTo(0, h * 0.72);
    this.sceneryGraphics.lineTo(w * 0.12, h * 0.38);
    this.sceneryGraphics.lineTo(w * 0.28, h * 0.65);
    this.sceneryGraphics.lineTo(w * 0.42, h * 0.45);
    this.sceneryGraphics.lineTo(w * 0.60, h * 0.68);
    this.sceneryGraphics.lineTo(w * 0.75, h * 0.35);
    this.sceneryGraphics.lineTo(w * 0.90, h * 0.55);
    this.sceneryGraphics.lineTo(w, h * 0.42);
    this.sceneryGraphics.lineTo(w, h);
    this.sceneryGraphics.lineTo(0, h);
    this.sceneryGraphics.closePath();
    this.sceneryGraphics.fill();

    // Midground mountains (#223a46) with snow caps
    this.sceneryGraphics.fillStyle(0x223a46, 1);
    this.sceneryGraphics.beginPath();
    this.sceneryGraphics.moveTo(0, h * 0.55);
    this.sceneryGraphics.lineTo(w * 0.18, h * 0.26);
    this.sceneryGraphics.lineTo(w * 0.35, h * 0.70);
    this.sceneryGraphics.lineTo(w * 0.65, h * 0.70);
    this.sceneryGraphics.lineTo(w * 0.85, h * 0.24);
    this.sceneryGraphics.lineTo(w, h * 0.45);
    this.sceneryGraphics.lineTo(w, h);
    this.sceneryGraphics.lineTo(0, h);
    this.sceneryGraphics.closePath();
    this.sceneryGraphics.fill();

    // Snow caps on left and right peaks (Cream white #f4efe2)
    // Left mountain snow cap
    this.sceneryGraphics.fillStyle(0xf4efe2, 1);
    this.sceneryGraphics.beginPath();
    this.sceneryGraphics.moveTo(w * 0.18, h * 0.26);
    this.sceneryGraphics.lineTo(w * 0.25, h * 0.42);
    this.sceneryGraphics.lineTo(w * 0.21, h * 0.40);
    this.sceneryGraphics.lineTo(w * 0.18, h * 0.44);
    this.sceneryGraphics.lineTo(w * 0.14, h * 0.38);
    this.sceneryGraphics.lineTo(w * 0.09, h * 0.45);
    this.sceneryGraphics.closePath();
    this.sceneryGraphics.fill();

    // Right mountain snow cap
    this.sceneryGraphics.beginPath();
    this.sceneryGraphics.moveTo(w * 0.85, h * 0.24);
    this.sceneryGraphics.lineTo(w * 0.93, h * 0.42);
    this.sceneryGraphics.lineTo(w * 0.89, h * 0.38);
    this.sceneryGraphics.lineTo(w * 0.85, h * 0.43);
    this.sceneryGraphics.lineTo(w * 0.81, h * 0.39);
    this.sceneryGraphics.lineTo(w * 0.77, h * 0.45);
    this.sceneryGraphics.closePath();
    this.sceneryGraphics.fill();

    // Foreground mountain foothills (#15232a)
    this.sceneryGraphics.fillStyle(0x15232a, 1);
    this.sceneryGraphics.beginPath();
    this.sceneryGraphics.moveTo(0, h * 0.70);
    this.sceneryGraphics.lineTo(w * 0.22, h * 0.82);
    this.sceneryGraphics.lineTo(w * 0.50, h * 0.88);
    this.sceneryGraphics.lineTo(w * 0.78, h * 0.82);
    this.sceneryGraphics.lineTo(w, h * 0.68);
    this.sceneryGraphics.lineTo(w, h);
    this.sceneryGraphics.lineTo(0, h);
    this.sceneryGraphics.closePath();
    this.sceneryGraphics.fill();
  }

  private drawGrid(): void {
    this.gridGraphics.clear();

    const width = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const height = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    // Faint blueprint workspace backing
    this.gridGraphics.fillStyle(0x102129, 0.25);
    this.gridGraphics.fillRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid outer border
    this.gridGraphics.lineStyle(1.5, 0x48717d, 0.4);
    this.gridGraphics.strokeRect(this.gridOriginX, this.gridOriginY, width, height);

    // Subtle dotted / fine grid lines
    this.gridGraphics.lineStyle(1, 0x48717d, 0.15);
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

    // 1. PCB Circuit Background banner
    const bgImage = this.add.image(w / 2, trayY + h / 2, 'tex_tray_bg');
    bgImage.setDisplaySize(w, h);

    // 2. Vertical "PARTS" typography on the left
    const partsLabelContainer = this.add.container(48, trayY + h / 2);
    const chars = ['P', 'A', 'R', 'T', 'S'];
    chars.forEach((char, idx) => {
      const t = this.add.text(0, (idx - 2) * 20, char, {
        fontSize: '18px',
        color: '#943c2c',
        fontStyle: 'bold',
        stroke: '#ecd5b3',
        strokeThickness: 2
      }).setOrigin(0.5);
      partsLabelContainer.add(t);
    });

    // 3. The 5 Arched Bays matching the inspiration screenshot:
    // BLOCK | CONE | THRUST | FUEL | FINS
    const bayConfigs: Array<{ type: PartType; label: string; iconTex: string; hotkey: string }> = [
      { type: 'STRUCTURAL', label: 'BLOCK', iconTex: 'tex_hull', hotkey: '1' },
      { type: 'NOSE_CONE', label: 'CONE', iconTex: 'tex_cone', hotkey: '2' },
      { type: 'ENGINE', label: 'THRUST', iconTex: 'tex_engine', hotkey: '3' },
      { type: 'FUEL_TANK', label: 'FUEL', iconTex: 'tex_fuel', hotkey: '4' },
      { type: 'FIN', label: 'FINS', iconTex: 'tex_fin_left', hotkey: '5' }
    ];

    const bayWidth = 92;
    const baySpacing = 16;
    const totalBaysWidth = bayConfigs.length * bayWidth + (bayConfigs.length - 1) * baySpacing;
    const startX = (w - totalBaysWidth) / 2 + bayWidth / 2 + 30;
    const bayY = trayY + h / 2;

    this.paletteBays = [];

    bayConfigs.forEach((cfg, idx) => {
      const bx = startX + idx * (bayWidth + baySpacing);
      const bayContainer = this.add.container(bx, bayY);

      // Frame image
      const frameImg = this.add.image(0, 0, 'tex_bay_normal').setOrigin(0.5);

      // Part Icon sprite
      const iconImg = this.add.image(0, -12, cfg.iconTex).setOrigin(0.5);
      iconImg.setDisplaySize(44, 44);

      // Label below
      const labelText = this.add.text(0, 32, cfg.label, {
        fontSize: '13px',
        color: '#8b4b1a',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // Small Hotkey tag in corner
      const hotkeyText = this.add.text(-32, -38, cfg.hotkey, {
        fontSize: '10px',
        color: '#b36a28',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      bayContainer.add([frameImg, iconImg, labelText, hotkeyText]);
      bayContainer.setSize(bayWidth, 104);
      bayContainer.setInteractive(new Phaser.Geom.Rectangle(-bayWidth / 2, -52, bayWidth, 104), Phaser.Geom.Rectangle.Contains);

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
        iconTexture: cfg.iconTex,
        container: bayContainer,
        frameImg,
        hotkeyNum: cfg.hotkey
      });
    });
  }

  private createHud(): void {
    const padX = 24;
    const padY = 20;

    // Vintage CRT / Mission Control Panel in Top Left
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x10232a, 0.85);
    panelBg.fillRoundedRect(padX, padY, 280, 96, 8);
    panelBg.lineStyle(2, 0x477884, 0.9);
    panelBg.strokeRoundedRect(padX, padY, 280, 96, 8);

    const titleText = this.add.text(padX + 14, padY + 10, 'MISSION TELEMETRY', {
      fontSize: '11px',
      color: '#8bd9e6',
      fontStyle: 'bold'
    });

    this.hudStatusText = this.add.text(padX + 14, padY + 28, 'STATUS: [ INCOMPLETE ]', {
      fontSize: '12px',
      color: '#f59e0b',
      fontStyle: 'bold'
    });

    this.hudStatsText = this.add.text(padX + 14, padY + 50, 'MASS: 100 kg   THRUST: 0 kN\nFUEL: 0 L     TWR: 0.00', {
      fontSize: '11px',
      color: '#e2f4f7',
      lineSpacing: 4
    });

    this.hudContainer.add([panelBg, titleText, this.hudStatusText, this.hudStatsText]);

    // Top Right Controls Helper Badge
    const helperBg = this.add.graphics();
    const helperW = 340;
    const helperX = this.scale.width - helperW - 24;
    helperBg.fillStyle(0x10232a, 0.85);
    helperBg.fillRoundedRect(helperX, padY, helperW, 36, 6);
    helperBg.lineStyle(1.5, 0x3f6b76, 0.8);
    helperBg.strokeRoundedRect(helperX, padY, helperW, 36, 6);

    const helperText = this.add.text(helperX + 14, padY + 11, '1-5: Select  •  L-Click: Place  •  R-Click: Remove', {
      fontSize: '11px',
      color: '#b8e4ec',
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
    this.ghostImage = this.add.image(0, 0, 'tex_hull').setOrigin(0.5);
    this.ghostImage.setDisplaySize(BuilderScene.CELL_SIZE, BuilderScene.CELL_SIZE);
    this.ghostImage.setAlpha(0.7);

    this.ghostOutline = this.add.graphics();
    this.ghostContainer.add([this.ghostImage, this.ghostOutline]);
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
      bay.frameImg.setTexture(isSelected ? 'tex_bay_active' : 'tex_bay_normal');

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
        // Snapped to socket!
        const snapX = this.gridOriginX + col * size + size / 2;
        const snapY = this.gridOriginY + row * size + size / 2;

        let texKey = def.textureKey;
        if (this.selectedPartType === 'FIN') {
          texKey = validation.finOrientation === 'LEFT' ? 'tex_fin_left' : 'tex_fin_right';
        }

        this.ghostImage.setTexture(texKey);
        this.ghostContainer.setPosition(snapX, snapY);

        this.ghostOutline.clear();
        this.ghostOutline.lineStyle(3, 0x22c55e, 0.95); // Glowing green
        this.ghostOutline.strokeRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, 6);
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
        this.ghostImage.setTexture(def.textureKey);
        this.ghostContainer.setPosition(snapX, snapY);

        this.ghostOutline.clear();
        this.ghostOutline.lineStyle(3, 0xef4444, 0.9); // Red warning
        this.ghostOutline.strokeRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, 6);
        return;
      }
    }

    // Floating smoothly under cursor
    this.ghostImage.setTexture(def.textureKey);
    this.ghostContainer.setPosition(pointer.x, pointer.y);
    this.ghostOutline.clear();
    this.ghostOutline.lineStyle(1.5, 0x8ecad6, 0.6);
    this.ghostOutline.strokeRoundedRect(-size / 2, -size / 2, size, size, 4);
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

      // Docking tactile bounce and spark effect
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
    flash.fillRoundedRect(px + 2, py + 2, size - 4, size - 4, 6);
    flash.lineStyle(3, 0xff0000, 1);
    flash.strokeRoundedRect(px + 2, py + 2, size - 4, size - 4, 6);

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

    let texKey = def.textureKey;
    if (node.type === 'FIN') {
      texKey = node.finOrientation === 'LEFT' ? 'tex_fin_left' : 'tex_fin_right';
    }

    const sprite = this.add.image(0, 0, texKey).setOrigin(0.5);
    sprite.setDisplaySize(size, size);

    blockContainer.add(sprite);
    this.blocksContainer.add(blockContainer);
    this.blockDisplayMap.set(node.id, blockContainer);
  }

  private renderAvailableSockets(): void {
    const ports = this.rocketTree.getAvailablePorts();

    for (const port of ports) {
      const pos = this.getPortPixelPosition(port.gridX, port.gridY, port.direction);

      const socketSprite = this.add.image(pos.x, pos.y, 'tex_docking_port').setOrigin(0.5);
      socketSprite.setDisplaySize(18, 18);

      // Subtle breathing idle pulse on open sockets
      this.tweens.add({
        targets: socketSprite,
        alpha: { from: 0.65, to: 1.0 },
        scale: { from: 0.95, to: 1.15 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      this.socketsContainer.add(socketSprite);
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
