import Phaser from 'phaser';
import { CONFIG } from '../config';
import { ActiveProblem, PHASE_INFO, PHASES, phaseSlot, PhaseId, PROBLEM_INFO } from '../game/phases';
import { OrbitElements } from '../physics/orbit';
import { headerTab, hudFrame } from './CornerHud';
import { drawPixelPanel, PX } from './pixel';
import { formatDistance, hudPanel, hudWell, TEXT_STYLE, UI } from './theme';

/** Stepped-corner pill used for the phase tabs. */
function pixelPill(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number, fillAlpha: number, border: number | null): void {
  if (border !== null) {
    g.fillStyle(border, 1);
    g.fillRect(x + 3, y, w - 6, h);
    g.fillRect(x, y + 3, w, h - 6);
  }
  g.fillStyle(fill, fillAlpha);
  g.fillRect(x + 3, y + 2, w - 6, h - 4);
  g.fillRect(x + 2, y + 3, w - 4, h - 6);
}

/**
 * Three linked capsules, top left: the mission's phases. Done ones are
 * filled, the current one glows, later ones wait in outline.
 */
export class PhaseStrip {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly names: Phaser.GameObjects.Text[];
  private readonly goal: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly x = 20;
  private readonly y = 18;
  private readonly w = 92;
  private readonly gap = 9;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics();
    hudPanel(bg, this.x - 10, this.y - 6, 3 * this.w + 2 * this.gap + 20, 92);
    this.gfx = scene.add.graphics();
    this.names = PHASES.map((p, i) =>
      scene.add.text(this.x + i * (this.w + this.gap) + this.w / 2, this.y + 15, `${PHASE_INFO[p].number}  ${PHASE_INFO[p].title.replace('LUNAR ', '').replace('HUMAN ', '')}`, TEXT_STYLE(12)).setOrigin(0.5)
    );
    this.goal = scene.add.text(this.x, this.y + 36, '', TEXT_STYLE(12, UI.textMuted)).setWordWrapWidth(3 * this.w + 2 * this.gap).setLineSpacing(-4);
    this.container = scene.add.container(0, 0, [bg, this.gfx, ...this.names, this.goal]).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  public update(current: PhaseId, done: number, goal: string, time: number): void {
    const g = this.gfx;
    g.clear();
    PHASES.forEach((_, i) => {
      const x = this.x + i * (this.w + this.gap);
      const isDone = i < done;
      const isNow = phaseSlot(current) === i && done < 3;
      if (i > 0) {
        g.fillStyle(i <= done ? UI.green : UI.dim, 1);
        g.fillRect(x - this.gap, this.y + 13, this.gap, 4);
      }
      if (isDone) pixelPill(g, x, this.y, this.w, 30, UI.green, 1, 0x1f8a4f);
      else if (isNow) pixelPill(g, x, this.y, this.w, 30, 0x1d3550, 0.75 + 0.25 * Math.sin(time / 260), UI.sky);
      else pixelPill(g, x, this.y, this.w, 30, 0x0f0d15, 1, UI.dim);
      this.names[i].setColor(isDone ? '#07291a' : isNow ? '#ffffff' : UI.textMuted).setStroke('#07060b', isDone ? 0 : 4);
    });
    this.goal.setText(goal);
  }
}

/**
 * Orbit gauge, right edge (where the HEIGHT tube sits on the climb; the two never show together): a vertical tube from the
 * Moon's surface (bottom) up to the edge of its pull, with the orbit's low and high points against the safe band.
 * Green when both are inside it.
 */
export class OrbitGauge {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly lowText: Phaser.GameObjects.Text;
  private readonly highText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  // Same footprint as the HEIGHT panel (right 1260, top 120, bottom 600, 100 wide).
  private readonly w = 100;
  private readonly fx = 1260 - 100;
  private readonly top = 120;
  private readonly h = 480;
  private readonly tubeX = 1260 - 50;
  private readonly tubeTop = 120 + 84;
  private readonly tubeBottom = 120 + 480 - 84;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics();
    hudFrame(bg, this.fx, this.top, this.w, this.h, PX.border, 0.55);
    const tab = headerTab(scene, bg, this.fx + 10, this.top, 'ORBIT');
    // Dark glass tube, like the HEIGHT one.
    bg.fillStyle(0x07060b, 1);
    bg.fillRect(this.tubeX - 8, this.tubeTop - 2, 16, this.tubeBottom - this.tubeTop + 4);
    bg.fillStyle(0x1f1b27, 1);
    bg.fillRect(this.tubeX - 6, this.tubeTop, 12, this.tubeBottom - this.tubeTop);
    this.gfx = scene.add.graphics();
    this.lowText = scene.add.text(this.tubeX, this.tubeTop - 8, '', TEXT_STYLE(12, '#7dd3fc')).setOrigin(0.5, 1).setAlign('center').setLineSpacing(-4);
    this.highText = scene.add.text(this.tubeX, this.tubeBottom + 8, '', TEXT_STYLE(12, '#fbbf24')).setOrigin(0.5, 0).setAlign('center').setLineSpacing(-4);
    this.container = scene.add.container(0, 0, [bg, tab, this.gfx, this.lowText, this.highText]).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** `hold` is 0..1 progress of holding a stable orbit (phase 1), or null. */
  public update(o: OrbitElements | null, hold: number | null, _time: number): void {
    const g = this.gfx;
    g.clear();
    const { minPeriapsis, maxApoapsis } = CONFIG.phases.orbit;
    const top = 1500;
    const x = this.tubeX;
    const toY = (alt: number) => this.tubeBottom - (Phaser.Math.Clamp(alt, 0, top) / top) * (this.tubeBottom - this.tubeTop);

    // Safe band in green.
    g.fillStyle(UI.green, 0.35);
    g.fillRect(x - 6, toY(maxApoapsis), 12, toY(minPeriapsis) - toY(maxApoapsis));

    if (!o) {
      this.lowText.setText('');
      this.highText.setText('');
      return;
    }
    const lowOk = o.periapsisAltitude >= minPeriapsis;
    const highOk = !o.escaping && o.apoapsisAltitude <= maxApoapsis;
    const lo = o.periapsisAltitude;
    const hi = o.escaping ? Infinity : o.apoapsisAltitude;
    const yLo = toY(Math.max(0, lo));
    const yHi = toY(hi);
    // Span of the orbit's heights.
    g.fillStyle(lowOk && highOk ? UI.green : UI.amber, 0.9);
    g.fillRect(x - 3, yHi, 6, Math.max(3, yLo - yHi));
    g.fillStyle(lo < 0 ? UI.red : 0x7dd3fc, 1);
    g.fillRect(x - 10, yLo - 2, 20, 5);
    g.fillStyle(highOk ? 0xfbbf24 : UI.red, 1);
    g.fillRect(x - 10, yHi - 2, 20, 5);

    this.lowText
      .setText(lo < 0 ? 'LOW\ncrash!' : `LOW ${formatDistance(lo)}\nneed ${minPeriapsis}+`)
      .setColor(lo < 0 ? '#f87171' : lowOk ? '#7dd3fc' : '#fbbf24');
    this.highText
      .setText(o.escaping ? 'HIGH\nescapes!' : `HIGH ${formatDistance(hi)}\nmax ${maxApoapsis.toLocaleString()}`)
      .setColor(highOk ? '#fbbf24' : '#f87171');

    if (hold !== null && lowOk && highOk) {
      g.fillStyle(UI.green, 1);
      const len = (this.tubeBottom - this.tubeTop) * hold;
      g.fillRect(this.fx + this.w - 16, this.tubeBottom - len, 4, len);
    }
  }
}

/** The card that pops up when something goes wrong, with what to do about it. */
export class ProblemCard {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly howTo: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cx = 640;
  private readonly y = 112;
  private readonly w = 460;
  private readonly h = 112;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.gfx = scene.add.graphics();
    this.title = scene.add.text(this.cx, this.y + 10, '', TEXT_STYLE(18, '#fca5a5')).setOrigin(0.5, 0);
    this.howTo = scene.add.text(this.cx, this.y + 36, '', TEXT_STYLE(13)).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(this.w - 30);
    this.detail = scene.add.text(this.cx, this.y + this.h - 12, '', TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.bg, this.gfx, this.title, this.howTo, this.detail]).setDepth(20).setVisible(false);
  }

  public update(p: ActiveProblem | null, extra: { periapsis: number | null }, time: number): void {
    this.container.setVisible(p !== null);
    if (!p) return;
    const x0 = this.cx - this.w / 2;
    const flash = 0.6 + 0.4 * Math.sin(time / 120);
    this.bg.clear();
    drawPixelPanel(this.bg, x0, this.y, this.w, this.h, { fill: 0x1f0a10, fillAlpha: 0.94, border: flash > 0.8 ? UI.red : 0x8a2a32, highlight: UI.red, u: 3 });

    const info = PROBLEM_INFO[p.id];
    this.title.setText(`⚠ ${info.title}${p.timeLeft !== null ? `   ${Math.ceil(p.timeLeft)}s` : ''}`);
    this.howTo.setText(info.howTo);

    const g = this.gfx;
    g.clear();
    const barX = x0 + 40;
    const barW = this.w - 80;
    const barY = this.y + 74;
    hudWell(g, barX, barY, barW, 10);

    switch (p.id) {
      case 'FUEL_LEAK': {
        const green = CONFIG.phases.rover.problems.FUEL_LEAK.greenZone;
        g.fillStyle(UI.green, 0.9);
        g.fillRect(barX + (p.data.greenAt - green / 2) * barW, barY - 3, green * barW, 16);
        g.fillStyle(0xffffff, 1);
        g.fillRect(barX + p.data.needle * barW - 2, barY - 7, 4, 24);
        const need = CONFIG.phases.rover.problems.FUEL_LEAK.repairsNeeded;
        this.detail.setText(`patches ${'●'.repeat(p.data.patched)}${'○'.repeat(Math.max(0, need - p.data.patched))}   ·   F to patch`);
        break;
      }
      case 'STUCK_THRUSTER': {
        const spin = Phaser.Math.Clamp(p.data.spin ?? 0, 0, 1.5) / 1.5;
        g.fillStyle(spin > 0.66 ? UI.red : spin > 0.4 ? UI.amber : UI.green, 1);
        g.fillRect(barX, barY, barW * spin, 10);
        g.lineStyle(2, 0xffffff, 0.9);
        g.lineBetween(barX + barW * (1 / 1.5), barY - 4, barX + barW * (1 / 1.5), barY + 14);
        this.detail.setText(`spin ${p.data.direction > 0 ? '⟲ — hold D' : '⟳ — hold A'}   ·   keep it left of the line`);
        break;
      }
      case 'DEBRIS': {
        g.fillStyle(p.progress >= 1 ? UI.green : UI.amber, 1);
        g.fillRect(barX, barY, barW * p.progress, 10);
        this.detail.setText(p.progress >= 1 ? 'Clear of the ring!' : 'distance from the debris ring');
        break;
      }
      case 'ORBIT_DECAY': {
        const pe = extra.periapsis ?? 0;
        const safe = CONFIG.phases.rover.problems.ORBIT_DECAY.safePeriapsis;
        g.fillStyle(UI.sky, 1);
        g.fillRect(barX, barY, barW * p.progress, 10);
        this.detail.setText(`low point ${pe < 0 ? 'HITS THE MOON' : formatDistance(pe)}  (keep above ${safe} m)`).setColor(pe >= safe ? UI.greenText : '#f87171');
        return;
      }
      case 'FLAMEOUT': {
        g.fillStyle(UI.amber, 1);
        g.fillRect(barX, barY, barW * p.progress, 10);
        this.detail.setText('HOLD E');
        break;
      }
      case 'RADAR_FAILURE': {
        g.fillStyle(UI.sky, 1);
        g.fillRect(barX, barY, barW * p.progress, 10);
        this.detail.setText('rebooting…');
        break;
      }
      default:
        this.detail.setText('');
    }
    this.detail.setColor(UI.textMuted);
  }
}
