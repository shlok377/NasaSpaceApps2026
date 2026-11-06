import Phaser from 'phaser';
import { SHEET_COLUMNS, SPRITE_SHEETS } from '../core/spriteSheets';
import { AssetKind } from '../game/moonNetwork';
import { headerTab, hudFrame } from './CornerHud';
import { PX } from './pixel';
import { TEXT_STYLE, UI } from './theme';

export interface PanelAsset {
  id: string;
  kind: AssetKind;
  daysLeft: number;
  maxDays: number;
}

const RIGHT = 1260;
const ICON_W = 56;
const ICON_H = 48;
const ICON_Y = 632;
const PANEL_W = 236;
const MAX_ROWS = 6;
const ROW_H = 26;

const KINDS: Array<{ kind: AssetKind; title: string; sheet: 'satellite' | 'rover'; clip: string; color: number; text: string }> = [
  { kind: 'SATELLITE', title: 'SATELLITES', sheet: 'satellite', clip: 'working', color: 0x7dd3fc, text: '#7dd3fc' },
  { kind: 'ROVER', title: 'ROVERS', sheet: 'rover', clip: 'drive', color: 0x4ade80, text: '#4ade80' }
];

/**
 * Bottom right: one icon for the deployed satellites and one for the rovers. Click an icon to open its panel (one at a time):
 * every asset with the days of battery it has left, and what the whole group can scout (places and coverage).
 */
export class NetworkPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly counts: Phaser.GameObjects.Text[] = [];
  private open: AssetKind | null = null;
  private assets: PanelAsset[] = [];
  private sites = 0;
  private coverage = 0;
  private shown = true;
  private signature = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.gfx]).setDepth(24);
    KINDS.forEach((k, i) => {
      const x = this.iconX(i);
      const sheet = SPRITE_SHEETS[k.sheet];
      const have = scene.textures?.exists?.(sheet.key);
      const frame = sheet.meta.animations[k.clip].row * SHEET_COLUMNS;
      const icon = have ? scene.add.image(x + ICON_W / 2, ICON_Y + 20, sheet.key, frame).setDisplaySize(40, 40) : scene.add.image(0, 0, '__MISSING').setVisible(false);
      const count = scene.add.text(x + ICON_W - 5, ICON_Y + ICON_H - 4, '', TEXT_STYLE(13, k.text)).setOrigin(1, 1);
      const hit = scene.add.rectangle(x + ICON_W / 2, ICON_Y + ICON_H / 2, ICON_W, ICON_H, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.toggle(k.kind));
      this.icons.push(icon);
      this.counts.push(count);
      this.container.add([icon, count, hit]);
    });
  }

  private iconX(i: number): number {
    return RIGHT - ICON_W * 2 - 6 + i * (ICON_W + 6);
  }

  private toggle(kind: AssetKind): void {
    this.open = this.open === kind ? null : kind;
    this.signature = '';
    this.draw();
  }

  /** `coverage` is 0..1 of the Moon's surface the group's spots cover. */
  public update(assets: PanelAsset[], sites: number, coverage: number, visible: boolean): void {
    this.shown = visible && assets.length > 0;
    this.container.setVisible(this.shown);
    this.assets = assets;
    this.sites = sites;
    this.coverage = coverage;
    this.draw();
  }

  private draw(): void {
    if (!this.shown) return;
    const sig = JSON.stringify([this.open, this.assets.map(a => [a.id, a.daysLeft]), this.sites, Math.round(this.coverage * 1000)]);
    if (sig === this.signature) return;
    this.signature = sig;
    const g = this.gfx;
    g.clear();
    this.dynamic.splice(0).forEach(o => o.destroy());

    KINDS.forEach((k, i) => {
      const n = this.assets.filter(a => a.kind === k.kind).length;
      const x = this.iconX(i);
      hudFrame(g, x, ICON_Y, ICON_W, ICON_H, this.open === k.kind ? k.color : PX.border, this.open === k.kind ? 0.92 : 0.75);
      this.counts[i].setText(n > 0 ? `×${n}` : '').setColor(k.text);
      this.icons[i].setAlpha(n > 0 ? 1 : 0.35);
    });

    const k = KINDS.find(kind => kind.kind === this.open);
    if (!k) return;
    const mine = this.assets.filter(a => a.kind === k.kind);
    const rows = Math.min(MAX_ROWS, mine.length);
    const h = 40 + Math.max(1, rows) * ROW_H + (mine.length > MAX_ROWS ? 16 : 0) + 58;
    const x = RIGHT - PANEL_W;
    const y = ICON_Y - 14 - h;
    hudFrame(g, x, y, PANEL_W, h, k.color, 0.9);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.container.add(o);
      this.dynamic.push(o);
      return o;
    };
    add(headerTab(this.scene, g, x + 10, y, k.title));
    if (mine.length === 0) add(this.scene.add.text(x + 14, y + 30, 'None deployed', TEXT_STYLE(14, UI.textMuted)));
    mine.slice(0, MAX_ROWS).forEach((a, i) => {
      const ry = y + 28 + i * ROW_H;
      const low = a.daysLeft <= Math.max(1, Math.round(a.maxDays * 0.2));
      add(this.scene.add.text(x + 14, ry, a.id, TEXT_STYLE(14, UI.text)));
      g.fillStyle(0x07060b, 1);
      g.fillRect(x + 84, ry + 4, 78, 10);
      g.fillStyle(low ? UI.red : k.color, 1);
      g.fillRect(x + 86, ry + 6, Math.round(74 * Math.max(0, Math.min(1, a.daysLeft / a.maxDays))), 6);
      add(this.scene.add.text(x + PANEL_W - 14, ry, a.daysLeft <= 0 ? 'last flight' : `${a.daysLeft} d`, TEXT_STYLE(14, low ? '#f87171' : UI.text)).setOrigin(1, 0));
    });
    if (mine.length > MAX_ROWS) add(this.scene.add.text(x + 14, y + 30 + MAX_ROWS * ROW_H, `+${mine.length - MAX_ROWS} more`, TEXT_STYLE(12, UI.textMuted)));
    const fy = y + h - 52;
    g.fillStyle(0x000000, 0.35);
    g.fillRect(x + 10, fy - 4, PANEL_W - 20, 2);
    add(this.scene.add.text(x + 14, fy + 2, `Scout spots  ${this.sites}`, TEXT_STYLE(14, UI.text)));
    add(this.scene.add.text(x + 14, fy + 22, `Coverage  ${Math.round(this.coverage * 100)}%`, TEXT_STYLE(14, UI.text)));
  }
}
