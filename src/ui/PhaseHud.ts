import Phaser from 'phaser';
import { CONFIG } from '../config';
import { ActiveProblem, PHASE_INFO, PHASES, PhaseId, PROBLEM_INFO } from '../game/phases';
import { OrbitElements } from '../physics/orbit';
import { formatDistance, TEXT_STYLE, UI } from './theme';

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
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(this.x - 10, this.y - 8, 3 * this.w + 2 * this.gap + 20, 86, 16);
    this.gfx = scene.add.graphics();
    this.names = PHASES.map((p, i) =>
      scene.add.text(this.x + i * (this.w + this.gap) + this.w / 2, this.y + 15, `${PHASE_INFO[p].number}  ${PHASE_INFO[p].title.replace('LUNAR ', '').replace('HUMAN ', '')}`, TEXT_STYLE(12)).setOrigin(0.5)
    );
    this.goal = scene.add.text(this.x, this.y + 40, '', TEXT_STYLE(12, UI.textMuted)).setWordWrapWidth(3 * this.w + 2 * this.gap);
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
      const isNow = PHASES.indexOf(current) === i && done < 3;
      if (i > 0) {
        g.lineStyle(3, i <= done ? UI.green : UI.dim, 1);
        g.lineBetween(x - this.gap, this.y + 15, x, this.y + 15);
      }
      if (isDone) {
        g.fillStyle(UI.green, 0.9);
        g.fillRoundedRect(x, this.y, this.w, 30, 15);
      } else if (isNow) {
        g.fillStyle(UI.sky, 0.25 + 0.15 * Math.sin(time / 260));
        g.fillRoundedRect(x, this.y, this.w, 30, 15);
        g.lineStyle(2, UI.sky, 1);
        g.strokeRoundedRect(x, this.y, this.w, 30, 15);
      } else {
        g.lineStyle(2, UI.dim, 1);
        g.strokeRoundedRect(x, this.y, this.w, 30, 15);
      }
      this.names[i].setColor(isDone ? '#052e16' : isNow ? '#ffffff' : UI.textMuted).setStroke(isDone ? '#4ade80' : '#000000', isDone ? 0 : 3);
    });
    this.goal.setText(goal);
  }
}

/**
 * Orbit gauge, top centre: an arc showing the orbit's low and high points
 * against the safe band. Green when both are inside it.
 */
export class OrbitGauge {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly lowText: Phaser.GameObjects.Text;
  private readonly highText: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cx = 640;
  private readonly y = 18;
  private readonly w = 420;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics();
    bg.fillStyle(UI.backdrop, UI.backdropAlpha);
    bg.fillRoundedRect(this.cx - this.w / 2 - 20, this.y - 8, this.w + 40, 84, 16);
    this.gfx = scene.add.graphics();
    this.lowText = scene.add.text(this.cx - this.w / 2, this.y + 2, '', TEXT_STYLE(13, '#7dd3fc'));
    this.highText = scene.add.text(this.cx + this.w / 2, this.y + 2, '', TEXT_STYLE(13, '#fbbf24')).setOrigin(1, 0);
    this.status = scene.add.text(this.cx, this.y + 52, '', TEXT_STYLE(13)).setOrigin(0.5, 0);
    const title = scene.add.text(this.cx, this.y + 2, 'ORBIT', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    this.container = scene.add.container(0, 0, [bg, this.gfx, title, this.lowText, this.highText, this.status]).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** `hold` is 0..1 progress of holding a stable orbit (phase 1), or null. */
  public update(o: OrbitElements | null, hold: number | null, time: number): void {
    const g = this.gfx;
    g.clear();
    const { minPeriapsis, maxApoapsis } = CONFIG.phases.orbit;
    const top = 1500;
    const x0 = this.cx - this.w / 2;
    const toX = (alt: number) => x0 + (Phaser.Math.Clamp(alt, 0, top) / top) * this.w;
    const barY = this.y + 30;

    // Track: surface on the left, edge of the Moon's pull on the right, safe band in green.
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(x0, barY, this.w, 12, 6);
    g.fillStyle(UI.green, 0.35);
    g.fillRect(toX(minPeriapsis), barY, toX(maxApoapsis) - toX(minPeriapsis), 12);

    if (!o) {
      this.lowText.setText('');
      this.highText.setText('');
      this.status.setText('');
      return;
    }
    const lowOk = o.periapsisAltitude >= minPeriapsis;
    const highOk = !o.escaping && o.apoapsisAltitude <= maxApoapsis;
    const lo = o.periapsisAltitude;
    const hi = o.escaping ? Infinity : o.apoapsisAltitude;
    // Span of the orbit's heights.
    g.fillStyle(lowOk && highOk ? UI.green : UI.amber, 0.9);
    g.fillRect(toX(Math.max(0, lo)), barY + 3, Math.max(3, toX(hi) - toX(Math.max(0, lo))), 6);
    g.fillStyle(lo < 0 ? UI.red : 0x7dd3fc, 1);
    g.fillCircle(toX(Math.max(0, lo)), barY + 6, 6);
    g.fillStyle(highOk ? 0xfbbf24 : UI.red, 1);
    g.fillCircle(toX(hi), barY + 6, 6);

    this.lowText.setText(lo < 0 ? 'LOW: hits the Moon!' : `LOW ${formatDistance(lo)}${lowOk ? '' : `  (need ${minPeriapsis}+)`}`).setColor(lo < 0 ? '#f87171' : lowOk ? '#7dd3fc' : '#fbbf24');
    this.highText.setText(o.escaping ? 'HIGH: escaping!' : `HIGH ${formatDistance(hi)}${highOk ? '' : `  (max ${maxApoapsis.toLocaleString()})`}`).setColor(highOk ? '#fbbf24' : '#f87171');

    if (hold !== null && lowOk && highOk) {
      g.fillStyle(UI.green, 1);
      g.fillRoundedRect(this.cx - 80, this.y + 70, 160 * hold, 4, 2);
      this.status.setText('STABLE ORBIT… hold it').setColor(UI.greenText);
    } else if (lowOk && highOk) {
      this.status.setText('Stable orbit').setColor(UI.greenText);
    } else if (lo < 0) {
      this.status.setText('Burn sideways to swing round the Moon').setColor('#f87171').setAlpha(0.7 + 0.3 * Math.sin(time / 150));
    } else if (!highOk) {
      this.status.setText('Too fast: point backwards and burn near the low point').setColor('#fbbf24').setAlpha(1);
    } else {
      this.status.setText('Low point too low: burn along your motion').setColor('#fbbf24').setAlpha(1);
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
    this.bg.fillStyle(0x1a0b0b, 0.85);
    this.bg.fillRoundedRect(x0, this.y, this.w, this.h, 14);
    this.bg.lineStyle(2, UI.red, flash);
    this.bg.strokeRoundedRect(x0, this.y, this.w, this.h, 14);

    const info = PROBLEM_INFO[p.id];
    this.title.setText(`⚠ ${info.title}${p.timeLeft !== null ? `   ${Math.ceil(p.timeLeft)}s` : ''}`);
    this.howTo.setText(info.howTo);

    const g = this.gfx;
    g.clear();
    const barX = x0 + 40;
    const barW = this.w - 80;
    const barY = this.y + 74;
    g.fillStyle(0x374151, 1);
    g.fillRoundedRect(barX, barY, barW, 10, 5);

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
        g.fillRoundedRect(barX, barY, barW * spin, 10, 5);
        g.lineStyle(2, 0xffffff, 0.9);
        g.lineBetween(barX + barW * (1 / 1.5), barY - 4, barX + barW * (1 / 1.5), barY + 14);
        this.detail.setText(`spin ${p.data.direction > 0 ? '⟲ — hold D' : '⟳ — hold A'}   ·   keep it left of the line`);
        break;
      }
      case 'DEBRIS': {
        g.fillStyle(p.progress >= 1 ? UI.green : UI.amber, 1);
        g.fillRoundedRect(barX, barY, barW * p.progress, 10, 5);
        this.detail.setText(p.progress >= 1 ? 'Clear of the ring!' : 'distance from the debris ring');
        break;
      }
      case 'ORBIT_DECAY': {
        const pe = extra.periapsis ?? 0;
        const safe = CONFIG.phases.rover.problems.ORBIT_DECAY.safePeriapsis;
        g.fillStyle(UI.sky, 1);
        g.fillRoundedRect(barX, barY, barW * p.progress, 10, 5);
        this.detail.setText(`low point ${pe < 0 ? 'HITS THE MOON' : formatDistance(pe)}  (keep above ${safe} m)`).setColor(pe >= safe ? UI.greenText : '#f87171');
        return;
      }
      case 'FLAMEOUT': {
        g.fillStyle(UI.amber, 1);
        g.fillRoundedRect(barX, barY, barW * p.progress, 10, 5);
        this.detail.setText('HOLD E');
        break;
      }
      case 'RADAR_FAILURE': {
        g.fillStyle(UI.sky, 1);
        g.fillRoundedRect(barX, barY, barW * p.progress, 10, 5);
        this.detail.setText('rebooting…');
        break;
      }
      default:
        this.detail.setText('');
    }
    this.detail.setColor(UI.textMuted);
  }
}
