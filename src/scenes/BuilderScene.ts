import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { PartType, RocketNode } from '../core/types';

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

    // Center grid with left margin for palette
    this.gridOriginX = Math.floor((this.scale.width - totalGridWidth) / 2 + 75);
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

    // Initial telemetry output
    const telemetry = this.rocketTree.getTelemetry();
    console.log('[RocketBuilder] Initialized rocket:', telemetry);

    // Global debug handle
    (window as unknown as { __ROCKET_TREE__: RocketTree }).__ROCKET_TREE__ = this.rocketTree;
    (window as unknown as { __BUILDER_SCENE__: BuilderScene }).__BUILDER_SCENE__ = this;
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

    // Launchpad baseline
    const groundY = this.gridOriginY + height;
    this.gridGraphics.lineStyle(3, 0x475569, 1);
    this.gridGraphics.lineBetween(this.gridOriginX - 20, groundY, this.gridOriginX + width + 20, groundY);
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

    // Palette Header
    this.add.text(startX, this.gridOriginY - 15, 'PARTS TRAY', {
      fontSize: '12px',
      color: '#94a3b8',
      fontStyle: 'bold'
    });

    for (const type of paletteTypes) {
      const def = PART_DEFINITIONS[type];
      const container = this.add.container(startX, currentY);
      const bg = this.add.graphics();

      // Draw normal state
      this.drawPaletteButtonBg(bg, false, btnWidth, btnHeight);

      // Icon preview square
      const icon = this.add.graphics();
      icon.fillStyle(def.color, 1);
      icon.fillRect(8, 10, 24, 24);
      icon.lineStyle(1, 0xffffff, 0.5);
      icon.strokeRect(8, 10, 24, 24);

      // Label text
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
      gfx.lineStyle(2, 0x38bdf8, 1); // Cyan highlight
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
      // Toggle off / deselect
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
    // Prevent default context menu so right-clicks work cleanly for removal / deselect
    this.input.mouse?.disableContextMenu();

    // Keyboard ESC deselect
    this.input.keyboard?.on('keydown-ESC', () => {
      this.deselectPart();
    });

    // Pointer move for ghost positioning and snapping feedback
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.updateGhostPreview(pointer);
    });

    // Global pointer down for placement, cancellation, or deletion
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        // Right-click: deselect if part selected, or delete block under cursor
        this.handleRightClick(pointer);
      } else if (pointer.button === 0) {
        // Left-click: place part if valid snapped
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
        // Green highlight: snapped to valid open socket
        this.ghostGraphics.fillStyle(def.color, 0.45);
        this.ghostGraphics.fillRect(px + 2, py + 2, size - 4, size - 4);
        this.ghostGraphics.lineStyle(2, 0x22c55e, 1); // Green border
        this.ghostGraphics.strokeRect(px + 2, py + 2, size - 4, size - 4);

        // Visual indicator of the joint connection
        if (validation.parentNode && validation.parentPort) {
          const parentPx = this.gridOriginX + validation.parentNode.gridX * size;
          const parentPy = this.gridOriginY + validation.parentNode.gridY * size;
          let cx = parentPx + size / 2;
          let cy = parentPy + size / 2;
          switch (validation.parentPort) {
            case 'NORTH': cy = parentPy; break;
            case 'SOUTH': cy = parentPy + size; break;
            case 'WEST': cx = parentPx; break;
            case 'EAST': cx = parentPx + size; break;
          }
          this.ghostGraphics.fillStyle(0x22c55e, 1);
          this.ghostGraphics.fillCircle(cx, cy, 7);
          this.ghostGraphics.lineStyle(2, 0xffffff, 1);
          this.ghostGraphics.strokeCircle(cx, cy, 7);
        }
      } else {
        // Red highlight: occupied or invalid orientation
        this.ghostGraphics.fillStyle(0xef4444, 0.25);
        this.ghostGraphics.fillRect(px + 2, py + 2, size - 4, size - 4);
        this.ghostGraphics.lineStyle(2, 0xef4444, 0.9);
        this.ghostGraphics.strokeRect(px + 2, py + 2, size - 4, size - 4);
      }
    } else {
      // Floating under mouse cursor outside grid
      const floatX = pointer.x - size / 2;
      const floatY = pointer.y - size / 2;
      this.ghostGraphics.fillStyle(def.color, 0.5);
      this.ghostGraphics.fillRect(floatX, floatY, size, size);
      this.ghostGraphics.lineStyle(1, 0x94a3b8, 0.8);
      this.ghostGraphics.strokeRect(floatX, floatY, size, size);
    }
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedPartType) return;

    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) {
      // Clicking outside grid deselects active part
      this.deselectPart();
      return;
    }

    const attachResult = this.rocketTree.attachPart(col, row, this.selectedPartType);
    if (attachResult.success) {
      this.renderRocket();
      this.updateGhostPreview(pointer);

      const telemetry = this.rocketTree.getTelemetry();
      console.log('[RocketBuilder] Part attached:', attachResult.node?.type, telemetry);
    }
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.selectedPartType) {
      // Cancel / deselect active palette item
      this.deselectPart();
      return;
    }

    // Try deleting block under cursor
    const { col, row, inside } = this.getGridCellAtPointer(pointer);
    if (!inside) return;

    const targetNode = this.rocketTree.getNodeAt(col, row);
    if (!targetNode) return;

    const removeResult = this.rocketTree.removeNode(targetNode.id);
    if (removeResult.success) {
      this.renderRocket();
      const telemetry = this.rocketTree.getTelemetry();
      console.log('[RocketBuilder] Part removed:', targetNode.type, telemetry);
    } else {
      // Disallowed removal: flash red and shake
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

    // Shake animation using tweens
    this.tweens.add({
      targets: flash,
      x: { from: -4, to: 4 },
      duration: 40,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        flash.destroy();
      }
    });
  }

  public renderRocket(): void {
    this.blocksContainer.removeAll(true);
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

    this.blocksContainer.add([blockGfx, label]);
  }

  private renderAvailableSockets(): void {
    const ports = this.rocketTree.getAvailablePorts();
    const size = BuilderScene.CELL_SIZE;
    const radius = 6;

    for (const port of ports) {
      const px = this.gridOriginX + port.gridX * size;
      const py = this.gridOriginY + port.gridY * size;

      let cx = px + size / 2;
      let cy = py + size / 2;

      switch (port.direction) {
        case 'NORTH': cy = py; break;
        case 'SOUTH': cy = py + size; break;
        case 'WEST': cx = px; break;
        case 'EAST': cx = px + size; break;
      }

      // Draw half-in / half-out connection socket circle
      this.socketsGraphics.fillStyle(0x0284c7, 0.9);
      this.socketsGraphics.fillCircle(cx, cy, radius);
      this.socketsGraphics.lineStyle(2, 0x38bdf8, 1);
      this.socketsGraphics.strokeCircle(cx, cy, radius);
    }
  }

  public getRocketTree(): RocketTree {
    return this.rocketTree;
  }
}
