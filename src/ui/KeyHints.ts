import Phaser from 'phaser';
import { glassPanel, TEXT_STYLE, TITLE_STYLE, UI } from './theme';
import { RIGHT_EDGE } from './PhaseHud';

/** One hint line: the keys (as glass key caps) and what they do. No keys = a plain note. */
export interface HintRow {
  keys: string[];
  label: string;
}

const ROW_H = 34;
const CAP_H = 28;
/** How long a new set of hints stays fully visible before fading (s). */
const HOLD = 4;
const FADE = 0.6;

/**
 * Key-cap hints at the bottom right of the right column. They are shown
 * when the situation changes (new hints), then fade away after a few seconds.
 */
export class KeyHints {
  private readonly container: Phaser.GameObjects.Container;
  private signature = '';
  private timer = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly bottom: number) {
    this.container = scene.add.container(0, 0).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** Call every frame with the hints for right now; they are rebuilt and re-shown only when they change. */
  public update(rows: HintRow[], dt: number): void {
    const signature = rows.map(r => `${r.keys.join('+')}:${r.label}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.rebuild(rows);
      this.timer = rows.length > 0 ? HOLD + FADE : 0;
    }
    this.timer = Math.max(0, this.timer - dt);
    this.container.setAlpha(Phaser.Math.Clamp(this.timer / FADE, 0, 1));
  }

  private rebuild(rows: HintRow[]): void {
    this.container.removeAll(true);
    rows.forEach((row, i) => {
      const cy = this.bottom - (rows.length - 1 - i) * ROW_H - ROW_H / 2;
      let x = RIGHT_EDGE;
      for (let k = row.keys.length - 1; k >= 0; k--) {
        const cap = row.keys[k];
        const label = this.scene.add.text(0, cy, cap, TITLE_STYLE(9, '#ffffff')).setOrigin(0.5);
        const w = Math.max(CAP_H, Math.ceil(label.width) + 14);
        const chip = glassPanel(this.scene, x - w, cy - CAP_H / 2, w, CAP_H, { tint: 0.45 });
        label.setX(x - w / 2);
        this.container.add([chip, label]);
        x -= w + 4;
      }
      const text = this.scene.add.text(x - (row.keys.length > 0 ? 6 : 0), cy, row.label, TEXT_STYLE(12, row.keys.length > 0 ? UI.text : UI.textMuted)).setOrigin(1, 0.5);
      this.container.add(text);
    });
  }
}
