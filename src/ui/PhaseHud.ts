import Phaser from 'phaser';
import { CONFIG } from '../config';
import { ActiveProblem, PHASE_INFO, PHASES, PhaseId, PROBLEM_INFO } from '../game/phases';
import { OrbitElements } from '../physics/orbit';
import { formatDistance, glassPanel, GlassOptions, hudWell, resizeGlass, TEXT_STYLE, TITLE_STYLE, UI } from './theme';

/** Right edge of the right-hand HUD column. */
export const RIGHT_EDGE = 1262;

/**
 * Top-right of the right column: three phase pips with the current phase's
 * name, the short goal under them (plain outlined text, no panel) and a
 * `+$` pop under the goal whenever money comes in.
 */
export class PhasePips {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly goal: Phaser.GameObjects.Text;
  private readonly money: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private readonly y = 16;
  private static readonly PIP = 14;
  private static readonly GAP = 6;
  private popAmount = 0;
  private popTimer = 0;

  constructor(scene: Phaser.Scene) {
    const pipsW = 3 * PhasePips.PIP + 2 * PhasePips.GAP;
    this.gfx = scene.add.graphics();
    this.title = scene.add.text(RIGHT_EDGE - pipsW - 10, this.y + PhasePips.PIP / 2, '', TITLE_STYLE(9)).setOrigin(1, 0.5);
    this.goal = scene.add.text(RIGHT_EDGE, this.y + 24, '', TEXT_STYLE(13)).setOrigin(1, 0).setAlign('right').setWordWrapWidth(320).setLineSpacing(-4);
    this.money = scene.add.text(RIGHT_EDGE, 0, '', TEXT_STYLE(18, UI.goldText)).setOrigin(1, 0).setAlpha(0);
    this.container = scene.add.container(0, 0, [this.gfx, this.title, this.goal, this.money]).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** Horizontal offset (px) for the liftoff slide-in; 0 = in place. */
  public setSlide(dx: number): void {
    this.container.x = dx;
  }

  /** Money just came in: pop `+$n` under the goal (amounts close together add up). */
  public earn(amount: number): void {
    if (amount <= 0) return;
    this.popAmount = this.popTimer > 0 ? this.popAmount + amount : amount;
    this.popTimer = 1.6;
  }

  /** Bottom of the goal block, so the warp readout can sit under it. */
  public get bottom(): number {
    return this.goal.y + this.goal.height + 30;
  }

  public update(current: PhaseId, done: number, goal: string, time: number, dt: number): void {
    const g = this.gfx;
    g.clear();
    const p = PhasePips.PIP;
    const x0 = RIGHT_EDGE - 3 * p - 2 * PhasePips.GAP;
    const now = PHASES.indexOf(current);
    PHASES.forEach((_, i) => {
      const x = x0 + i * (p + PhasePips.GAP);
      const isDone = i < done;
      const isNow = i === now && done < 3;
      g.fillStyle(0x07060b, 1);
      g.fillRect(x - 2, this.y - 2, p + 4, p + 4);
      if (isDone) {
        g.fillStyle(UI.green, 1);
        g.fillRect(x, this.y, p, p);
      } else if (isNow) {
        g.fillStyle(UI.sky, 0.6 + 0.4 * Math.sin(time / 220));
        g.fillRect(x, this.y, p, p);
      } else {
        g.fillStyle(UI.dim, 1);
        g.fillRect(x, this.y, p, p);
        g.fillStyle(0x0f0d15, 1);
        g.fillRect(x + 3, this.y + 3, p - 6, p - 6);
      }
    });
    const info = PHASE_INFO[current];
    this.title.setText(done >= 3 ? 'MISSION COMPLETE' : `${info.number} · ${info.title}`).setColor(done >= 3 ? UI.greenText : UI.text);
    if (this.goal.text !== goal) this.goal.setText(goal);

    // Money pop: rises a little and fades.
    if (this.popTimer > 0) {
      this.popTimer = Math.max(0, this.popTimer - dt);
      const k = 1 - this.popTimer / 1.6;
      this.money
        .setText(`+$${this.popAmount.toLocaleString()}`)
        .setY(this.goal.y + this.goal.height + 4 - 6 * k)
        .setAlpha(Phaser.Math.Clamp(this.popTimer / 0.5, 0, 1));
    } else {
      this.money.setAlpha(0);
    }
  }
}

/** Width of the bottom-centre card. */
const CARD_W = 460;
const CARD_PAD = 10;

/**
 * Orbit band (a section of the bottom-centre card): the orbit's low and
 * high points against the safe band. Green when both are inside it.
 */
class OrbitBand {
  public readonly container: Phaser.GameObjects.Container;
  public static readonly H = 78;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly lowText: Phaser.GameObjects.Text;
  private readonly highText: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly w = CARD_W - 40;

  constructor(scene: Phaser.Scene) {
    const cx = CARD_W / 2;
    this.gfx = scene.add.graphics();
    this.lowText = scene.add.text(20, 0, '', TEXT_STYLE(13, '#7dd3fc'));
    this.highText = scene.add.text(CARD_W - 20, 0, '', TEXT_STYLE(13, '#fbbf24')).setOrigin(1, 0);
    this.status = scene.add.text(cx, 48, '', TEXT_STYLE(13)).setOrigin(0.5, 0);
    const title = scene.add.text(cx, 0, 'ORBIT', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    this.container = scene.add.container(0, 0, [this.gfx, title, this.lowText, this.highText, this.status]);
  }

  /** `hold` is 0..1 progress of holding a stable orbit (phase 1), or null. */
  public update(o: OrbitElements | null, hold: number | null, time: number): void {
    const g = this.gfx;
    g.clear();
    const { minPeriapsis, maxApoapsis } = CONFIG.phases.orbit;
    const top = 1500;
    const x0 = 20;
    const cx = CARD_W / 2;
    const toX = (alt: number) => x0 + (Phaser.Math.Clamp(alt, 0, top) / top) * this.w;
    const barY = 28;

    // Track: surface on the left, edge of the Moon's pull on the right, safe band in green.
    hudWell(g, x0, barY, this.w, 12);
    g.fillStyle(UI.green, 0.35);
    g.fillRect(toX(minPeriapsis), barY + 2, toX(maxApoapsis) - toX(minPeriapsis), 8);

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
    g.fillStyle(lowOk && highOk ? UI.green : UI.amber, 0.9);
    g.fillRect(toX(Math.max(0, lo)), barY + 3, Math.max(3, toX(hi) - toX(Math.max(0, lo))), 6);
    g.fillStyle(lo < 0 ? UI.red : 0x7dd3fc, 1);
    g.fillRect(toX(Math.max(0, lo)) - 5, barY, 10, 12);
    g.fillStyle(highOk ? 0xfbbf24 : UI.red, 1);
    g.fillRect(toX(hi) - 5, barY, 10, 12);

    this.lowText.setText(lo < 0 ? 'LOW: hits the Moon!' : `LOW ${formatDistance(lo)}${lowOk ? '' : `  (need ${minPeriapsis}+)`}`).setColor(lo < 0 ? '#f87171' : lowOk ? '#7dd3fc' : '#fbbf24');
    this.highText.setText(o.escaping ? 'HIGH: escaping!' : `HIGH ${formatDistance(hi)}${highOk ? '' : `  (max ${maxApoapsis.toLocaleString()})`}`).setColor(highOk ? '#fbbf24' : '#f87171');

    if (hold !== null && lowOk && highOk) {
      g.fillStyle(UI.green, 1);
      g.fillRect(cx - 80, 70, 160 * hold, 4);
      this.status.setText('STABLE ORBIT… hold it').setColor(UI.greenText).setAlpha(1);
    } else if (lowOk && highOk) {
      this.status.setText('Stable orbit').setColor(UI.greenText).setAlpha(1);
    } else if (lo < 0) {
      this.status.setText('Burn sideways to swing round the Moon').setColor('#f87171').setAlpha(0.7 + 0.3 * Math.sin(time / 150));
    } else if (!highOk) {
      this.status.setText('Too fast: point backwards and burn near the low point').setColor('#fbbf24').setAlpha(1);
    } else {
      this.status.setText('Low point too low: burn along your motion').setColor('#fbbf24').setAlpha(1);
    }
  }
}

/** Problem section of the bottom-centre card: what went wrong, what to do, and a progress bar. */
class ProblemSection {
  public readonly container: Phaser.GameObjects.Container;
  public static readonly H = 104;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly howTo: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const cx = CARD_W / 2;
    this.gfx = scene.add.graphics();
    this.title = scene.add.text(cx, 0, '', TEXT_STYLE(18, '#fca5a5')).setOrigin(0.5, 0);
    this.howTo = scene.add.text(cx, 26, '', TEXT_STYLE(13)).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(CARD_W - 30);
    this.detail = scene.add.text(cx, ProblemSection.H, '', TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.gfx, this.title, this.howTo, this.detail]);
  }

  public update(p: ActiveProblem, orbit: OrbitElements | null): void {
    const info = PROBLEM_INFO[p.id];
    this.title.setText(`⚠ ${info.title}${p.timeLeft !== null ? `   ${Math.ceil(p.timeLeft)}s` : ''}`);
    this.howTo.setText(info.howTo);

    const g = this.gfx;
    g.clear();
    const barX = 40;
    const barW = CARD_W - 80;
    const barY = 66;
    hudWell(g, barX, barY, barW, 10);
    this.detail.setColor(UI.textMuted);

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
        const pe = orbit?.periapsisAltitude ?? 0;
        const safe = CONFIG.phases.rover.problems.ORBIT_DECAY.safePeriapsis;
        g.fillStyle(UI.sky, 1);
        g.fillRect(barX, barY, barW * p.progress, 10);
        this.detail.setText(`low point ${pe < 0 ? 'HITS THE MOON' : formatDistance(pe)}  (keep above ${safe} m)`).setColor(pe >= safe ? UI.greenText : '#f87171');
        break;
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
  }
}

/**
 * The one card slot at the bottom centre, shown only while relevant: it
 * hosts the problem card and the orbit LOW/HIGH band (stacked when both
 * are up) on a single sheet of smoked glass.
 */
export class BottomCard {
  private readonly glass: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly problem: ProblemSection;
  private readonly orbit: OrbitBand;
  private readonly container: Phaser.GameObjects.Container;
  private readonly x = 640 - CARD_W / 2;
  private readonly bottom = 708;
  private shape = '';

  constructor(scene: Phaser.Scene) {
    this.glass = glassPanel(scene, this.x, this.bottom - 100, CARD_W, 100);
    this.flash = scene.add.graphics();
    this.problem = new ProblemSection(scene);
    this.orbit = new OrbitBand(scene);
    this.container = scene.add.container(0, 0, [this.glass, this.flash, this.problem.container, this.orbit.container]).setDepth(20).setVisible(false);
  }

  /**
   * `problem` null hides the problem section; the orbit band shows when `orbit.showBand`
   * (`hold` is the phase 1 hold progress, 0..1, or null). The card hides itself when neither is shown.
   */
  public update(problem: ActiveProblem | null, orbit: { elements: OrbitElements | null; showBand: boolean; hold: number | null }, time: number): void {
    const showOrbit = orbit.showBand;
    const showProblem = problem !== null;
    this.container.setVisible(showOrbit || showProblem);
    this.problem.container.setVisible(showProblem);
    this.orbit.container.setVisible(showOrbit);
    if (!showOrbit && !showProblem) return;

    const h = CARD_PAD * 2 + (showProblem ? ProblemSection.H : 0) + (showOrbit ? OrbitBand.H : 0) + (showOrbit && showProblem ? 8 : 0);
    const top = this.bottom - h;
    const opts: GlassOptions = showProblem ? { accent: UI.red, tint: 0.4 } : {};
    const shape = `${h}|${showProblem}`;
    if (shape !== this.shape) {
      this.shape = shape;
      resizeGlass(this.glass, this.x, top, CARD_W, h, opts);
    }

    let y = top + CARD_PAD;
    if (showProblem) {
      this.problem.container.setPosition(this.x, y);
      this.problem.update(problem, orbit.elements);
      y += ProblemSection.H + 8;
    }
    if (showOrbit) {
      this.orbit.container.setPosition(this.x, y);
      this.orbit.update(orbit.elements, orbit.hold, time);
    }

    // A pulsing red frame while something is wrong.
    this.flash.clear();
    if (showProblem) {
      this.flash.lineStyle(3, UI.red, 0.35 + 0.35 * Math.sin(time / 120));
      this.flash.strokeRect(this.x + 1.5, top + 1.5, CARD_W - 3, h - 3);
    }
  }
}
