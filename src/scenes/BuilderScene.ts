import Phaser from 'phaser';
import { RocketTree } from '../core/RocketTree';
import { PART_DEFINITIONS } from '../core/partDefinitions';
import { RocketNode } from '../core/types';

export class BuilderScene extends Phaser.Scene {
  public static readonly GRID_COLS = 15;
  public static readonly GRID_ROWS = 20;
  public static readonly CELL_SIZE = 48;

  private rocketTree!: RocketTree;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private blocksContainer!: Phaser.GameObjects.Container;
  private socketsGraphics!: Phaser.GameObjects.Graphics;

  private gridOriginX = 0;
  private gridOriginY = 0;

  constructor() {
    super('BuilderScene');
  }

  create(): void {
    // Leave margin on the left for the upcoming parts palette (Issue #5)
    const totalGridWidth = BuilderScene.GRID_COLS * BuilderScene.CELL_SIZE;
    const totalGridHeight = BuilderScene.GRID_ROWS * BuilderScene.CELL_SIZE;

    this.gridOriginX = Math.floor((this.scale.width - totalGridWidth) / 2 + 70);
    this.gridOriginY = Math.floor((this.scale.height - totalGridHeight) / 2);

    // Initialize core RocketTree model
    this.rocketTree = new RocketTree(7, 5);

    // Create rendering layers
    this.gridGraphics = this.add.graphics();
    this.blocksContainer = this.add.container(0, 0);
    this.socketsGraphics = this.add.graphics();

    this.drawGrid();
    this.renderRocket();

    // Telemetry output on console
    const telemetry = this.rocketTree.getTelemetry();
    console.log('[RocketBuilder] Initialized rocket:', telemetry);

    // Expose for testing and debugging
    (window as unknown as { __ROCKET_TREE__: RocketTree }).__ROCKET_TREE__ = this.rocketTree;
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

    // Grid lines
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
    // Fill
    blockGfx.fillStyle(def.color, 1);
    blockGfx.fillRect(px + 2, py + 2, size - 4, size - 4);
    // Border
    blockGfx.lineStyle(2, 0xffffff, 0.6);
    blockGfx.strokeRect(px + 2, py + 2, size - 4, size - 4);

    // Label
    const label = this.add.text(px + size / 2, py + size / 2, node.type === 'COCKPIT' ? 'CMD' : def.label.substring(0, 3).toUpperCase(), {
      fontSize: '11px',
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
        case 'NORTH':
          cy = py; // half in, half out on top edge
          break;
        case 'SOUTH':
          cy = py + size; // half in, half out on bottom edge
          break;
        case 'WEST':
          cx = px; // half in, half out on left edge
          break;
        case 'EAST':
          cx = px + size; // half in, half out on right edge
          break;
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
