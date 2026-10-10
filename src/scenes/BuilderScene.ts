import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { PartType, PortDirection, RocketNode } from '../core/types';

interface PaletteButton {
  type: PartType;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
}

export class BuilderScene extends Phaser.Scene {
  public static readonly GRID_COLS = 15;
  public static readonly GRID_ROWS = 20;
  public static readonly CELL_SIZE = 48;

  private rocketTree!: RocketTree;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private blocksContainer!: Phaser.GameObjects.Container;
  private socketsGraphics!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;
  private blockDisplayMap: Map<string, Phaser.GameObjects.Container> = new Map();

  private gridOriginX = 0;
  private gridOriginY = 0;

  private selectedPartType: PartType | null = null;
  private paletteButtons: PaletteButton[] = [];

  constructor() {
    super('BuilderScene');
  }

  create(): void {
    const totalGridWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const totalGridHeight = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    // Perfectly centered grid
    this.gridOriginX = Math.floor((this.scale.width - totalGridWidth) / 2);
    this.gridOriginY = Math.floor((this.scale.height - totalGridHeight) / 2);

    this.rocketTree = new RocketTree(7, 5);

    // Create rendering layers
    this.gridGraphics = this.add.graphics();
    this.blocksContainer = this.add.container(0, 0);
    this.socketsGraphics = this.add.graphics();
    this.ghostGraphics = this.add.graphics();

    this.drawGrid();
    this.createPalette();
    this.renderRocket();
    this.setupInputHandlers();

    // Initial telemetry output and exportable state
    this.syncExportableState('[RocketBuilder] Initialized rocket:');

    // Debug handle
    (window as unknown as { __ROCKET_TREE__: RocketTree }).__ROCKET_TREE__ = this.rocketTree;
    (window as unknown as { __BUILDER_SCENE__: BuilderScene }).__BUILDER_SCENE__ = this;
  }

  private syncExportableState(logPrefix?: string): void {
    const telemetry = this.rocketTree.getTelemetry();
    (window as unknown as { __ROCKET_STATE__: unknown }).__ROCKET_STATE__ = telemetry;
    (window as unknown as { getRocketState: () => unknown }).getRocketState = () => this.rocketTree.getTelemetry();

    if (logPrefix) {
      console.log(logPrefix, telemetry);
    }
  }

  private drawGrid(): void {
    this.gridGraphics.clear();

    const width = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const height = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    // Background of grid workspace
    this.gridGraphics.fillStyle(0x161a23, 1);
    this.gridGraphics.fillRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid border
    this.gridGraphics.lineStyle(2, 0x334155, 1);
    this.gridGraphics.strokeRect(this.gridOriginX, this.gridOriginY, width, height);

    // Grid cell lines
    this.gridGraphics.lineStyle(1, 0x1f2937, 0.8);
    for (let c = 1; c < BuilderScene.GRID_COLS; c++) {
      const x = this.gridOriginX + c * BuilderScene.CELL_SIZE;
      this.gridGraphics.lineBetween(x, this.gridOriginY, x, this.gridOriginY + height);
    }
    for (let r = 1; r < BuilderScene.GRID_ROWS; r++) {
      const y = this.gridOriginY + r * BuilderScene.CELL_SIZE;
      this.gridGraphics.lineBetween(this.gridOriginX, y, this.gridOriginX + width, y);
    }
  }

  private createPalette(): void {
    const paletteTypes: PartType[] = [
      'FUEL_TANK',
      'ENGINE',
      'NOSE_CONE',
      'FIN',
      'STRUCTURAL'
    ];

    const startX = 24;
    let currentY = this.gridOriginY + 20;
    const btnWidth = 120;
    const btnHeight = 44;

    this.add.text(startX, this.gridOriginY - 15, 'PARTS TRAY', {
      fontSize: '12px',
      color: '#94a3b8',
      fontStyle: 'bold'
    });

    for (const type of paletteTypes) {
      const def = PART_DEFINITIONS[type];
      const container = this.add.container(startX, currentY);
      const bg = this.add.graphics();

      this.drawPaletteButtonBg(bg, false, btnWidth, btnHeight);

      const icon = this.add.graphics();
      icon.fillStyle(def.color, 1);
      icon.fillRect(8, 10, 24, 24);
      icon.lineStyle(1, 0xffffff, 0.5);
      icon.strokeRect(8, 10, 24, 24);

      const label = this.add.text(38, 14, def.label, {
        fontSize: '11px',
        color: '#f8fafc',
        fontStyle: 'bold'
      });

      container.add([bg, icon, label]);
      container.setSize(btnWidth, btnHeight);
      container.setInteractive(new Phaser.Geom.Rectangle(0, 0, btnWidth, btnHeight), Phaser.Geom.Rectangle.Contains);

      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 0) {
          this.selectPaletteItem(type);
        }
      });

      this.paletteButtons.push({ type, container, bg });
      currentY += btnHeight + 12;
    }
  }

  private drawPaletteButtonBg(
    gfx: Phaser.GameObjects.Graphics,
    isSelected: boolean,
    w: number,
    h: number
  ): void {
    gfx.clear();
    if (isSelected) {
      gfx.fillStyle(0x1e293b, 1);
      gfx.fillRect(0, 0, w, h);
      gfx.lineStyle(2, 0x38bdf8, 1);
      gfx.strokeRect(0, 0, w, h);
    } else {
      gfx.fillStyle(0x0f172a, 0.9);
      gfx.fillRect(0, 0, w, h);
      gfx.lineStyle(1, 0x334155, 1);
      gfx.strokeRect(0, 0, w, h);
    }
  }

  public selectPaletteItem(type: PartType): void {
    if (this.selectedPartType === type) {
      this.deselectPart();
      return;
    }

    this.selectedPartType = type;
    this.updatePaletteSelectionUI();
  }

  public deselectPart(): void {
    this.selectedPartType = null;
    this.ghostGraphics.clear();
    this.updatePaletteSelectionUI();
  }

  private updatePaletteSelectionUI(): void {
    for (const btn of this.paletteButtons) {
      const isSelected = btn.type === this.selectedPartType;
      this.drawPaletteButtonBg(btn.bg, isSelected, 120, 44);
    }
  }

  private setupInputHandlers(): void {
    this.input.mouse?.disableContextMenu();

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
      pointer.y >= this.gridOriginY;

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
    this.ghostGraphics.clear();
    if (!this.selectedPartType) return;

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    const size = BuilderScene.CELL_SIZE;
    const def = PART_DEFINITIONS[this.selectedPartType];

    if (inside) {
      const px = this.gridOriginX + col * size;
      const py = this.gridOriginY + row * size;

      const validation = this.rocketTree.validateAttachment(col, row, this.selectedPartType);

      if (validation.valid) {
        // Snapped to valid open socket: green indicator
        this.ghostGraphics.fillStyle(def.color, 0.45);
        this.ghostGraphics.fillRect(px + 2, py + 2, size - 4, size - 4);
        this.ghostGraphics.lineStyle(2, 0x22c55e, 1);
        this.ghostGraphics.strokeRect(px + 2, py + 2, size - 4, size - 4);
        return;
      }

      // Check if adjacent to an open socket or occupied block
      const hasAdjacentSocket = this.rocketTree.getAvailablePorts().some(
        p => p.targetGridX === col && p.targetGridY === row
      );
      const isOccupied = this.rocketTree.getNodeAt(col, row) !== undefined;

      if (hasAdjacentSocket || isOccupied) {
        // In socket proximity or hovering occupied block: red snap warning
        this.ghostGraphics.fillStyle(0xef4444, 0.25);
        this.ghostGraphics.fillRect(px + 2, py + 2, size - 4, size - 4);
        this.ghostGraphics.lineStyle(2, 0xef4444, 0.9);
        this.ghostGraphics.strokeRect(px + 2, py + 2, size - 4, size - 4);
        return;
      }
    }

    // Floating smoothly under cursor
    const floatX = pointer.x - size / 2;
    const floatY = pointer.y - size / 2;
    this.ghostGraphics.fillStyle(def.color, 0.5);
    this.ghostGraphics.fillRect(floatX, floatY, size, size);
    this.ghostGraphics.lineStyle(1, 0x94a3b8, 0.8);
    this.ghostGraphics.strokeRect(floatX, floatY, size, size);
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedPartType) return;

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) {
      this.deselectPart();
      return;
    }

    const attachResult = this.rocketTree.attachPart(col, row, this.selectedPartType);
    if (attachResult.success) {
      this.renderRocket();
      this.updateGhostPreview(pointer);
      this.syncExportableState('[RocketBuilder] Part attached:');
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
    const px = this.gridOriginX + node.gridX * BuilderScene.CELL_SIZE;
    const py = this.gridOriginY + node.gridY * BuilderScene.CELL_SIZE;
    const size = BuilderScene.CELL_SIZE;

    const flash = this.add.graphics();
    flash.fillStyle(0xef4444, 0.6);
    flash.fillRect(px + 2, py + 2, size - 4, size - 4);
    flash.lineStyle(3, 0xff0000, 1);
    flash.strokeRect(px + 2, py + 2, size - 4, size - 4);

    const blockDisplay = this.blockDisplayMap.get(node.id);

    // Shake both the block and the flash overlay
    const targetsToShake: object[] = [flash];
    if (blockDisplay) {
      targetsToShake.push(blockDisplay);
    }

    this.tweens.add({
      targets: targetsToShake,
      x: { from: -4, to: 4 },
      duration: 35,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        if (blockDisplay) {
          blockDisplay.x = 0;
        }
        flash.destroy();
      }
    });
  }

  public renderRocket(): void {
    this.blocksContainer.removeAll(true);
    this.blockDisplayMap.clear();
    this.socketsGraphics.clear();

    const nodes = this.rocketTree.getAllNodes();
    for (const node of nodes) {
      this.renderBlock(node);
    }

    this.renderAvailableSockets();
  }

  private renderBlock(node: RocketNode): void {
    const def = PART_DEFINITIONS[node.type];
    const px = this.gridOriginX + node.gridX * BuilderScene.CELL_SIZE;
    const py = this.gridOriginY + node.gridY * BuilderScene.CELL_SIZE;
    const size = BuilderScene.CELL_SIZE;

    const blockContainer = this.add.container(0, 0);

    const blockGfx = this.add.graphics();
    blockGfx.fillStyle(def.color, 1);
    blockGfx.fillRect(px + 2, py + 2, size - 4, size - 4);
    blockGfx.lineStyle(2, 0xffffff, 0.6);
    blockGfx.strokeRect(px + 2, py + 2, size - 4, size - 4);

    let displayLabel = def.label.substring(0, 3).toUpperCase();
    if (node.type === 'COCKPIT') displayLabel = 'CMD';
    else if (node.type === 'FIN') displayLabel = node.finOrientation === 'LEFT' ? 'L-FIN' : 'R-FIN';

    const label = this.add.text(px + size / 2, py + size / 2, displayLabel, {
      fontSize: node.type === 'FIN' ? '9px' : '11px',
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

      this.socketsGraphics.fillStyle(0x0284c7, 0.9);
      this.socketsGraphics.fillCircle(pos.x, pos.y, radius);
      this.socketsGraphics.lineStyle(2, 0x38bdf8, 1);
      this.socketsGraphics.strokeCircle(pos.x, pos.y, radius);
    }
  }

  public getRocketTree(): RocketTree {
    return this.rocketTree;
  }
}
