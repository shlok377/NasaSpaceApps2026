import Phaser from 'phaser';
import { formatDistance, TEXT_STYLE, UI } from './theme';

export interface Milestone {
  label: string;
  /** Fraction of the Earth→Moon trip (0..1). */
  at: number;
}

export interface JourneyState {
  /** 0 at the pad, 1 on the Moon. */
  fraction: number;
  travelled: number; // m
  total: number; // m
  outbound: boolean;
  onCourse: boolean;
  passed: readonly boolean[];
}

/**
 * The trip to the Moon as an arc across the top of the screen: the part
 * already flown glows, milestone flags turn gold as they're passed, and the
 * Moon lights up once the trajectory is on course.
 */
export class JourneyArc {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly distanceText: Phaser.GameObjects.Text;
  private readonly courseText: Phaser.GameObjects.Text;
  private readonly flagTexts: Phaser.GameObjects.Text[];
  private readonly start: Phaser.Math.Vector2;
  private readonly end: Phaser.Math.Vector2;
  private readonly control: Phaser.Math.Vector2;
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, cx: number, private readonly milestones: Milestone[]) {
    this.start = new Phaser.Math.Vector2(cx - 270, 66);
    this.end = new Phaser.Math.Vector2(cx + 270, 66);
    this.control = new Phaser.Math.Vector2(cx, 4);

    const backdrop = scene.add.graphics();
    backdrop.fillStyle(UI.backdrop, UI.backdropAlpha);
    backdrop.fillRoundedRect(cx - 320, 6, 640, 98, 18);

    this.gfx = scene.add.graphics();
    const earth = scene.add.text(this.start.x, this.start.y + 18, 'Earth', TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 0);
    const moon = scene.add.text(this.end.x, this.end.y + 18, 'Moon', TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 0);
    this.flagTexts = milestones.map(m => {
      const p = this.point(m.at);
      return scene.add.text(p.x, p.y + 12, m.label, TEXT_STYLE(10, UI.textMuted)).setOrigin(0.5, 0);
    });
    this.distanceText = scene.add.text(cx, 80, '', TEXT_STYLE(13)).setOrigin(0.5, 0);
    this.courseText = scene.add.text(this.end.x - 4, this.end.y - 34, 'ON COURSE', TEXT_STYLE(11, UI.greenText)).setOrigin(0.5, 1);

    this.container = scene.add.container(0, 0, [backdrop, this.gfx, earth, moon, ...this.flagTexts, this.distanceText, this.courseText]);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  private point(t: number): Phaser.Math.Vector2 {
    const u = 1 - t;
    return new Phaser.Math.Vector2(
      u * u * this.start.x + 2 * u * t * this.control.x + t * t * this.end.x,
      u * u * this.start.y + 2 * u * t * this.control.y + t * t * this.end.y
    );
  }

  public update(state: JourneyState, time: number): void {
    const g = this.gfx;
    g.clear();
    const f = Phaser.Math.Clamp(state.fraction, 0, 1);

    // Route: dotted ahead, solid behind.
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a = this.point(t0);
      const b = this.point(t1);
      if (t1 <= f) {
        g.lineStyle(4, UI.sky, 1);
        g.lineBetween(a.x, a.y, b.x, b.y);
      } else if (i % 2 === 0) {
        g.lineStyle(2, UI.dim, 1);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // Earth and Moon.
    g.fillStyle(UI.blue, 1);
    g.fillCircle(this.start.x, this.start.y, 13);
    g.fillStyle(UI.green, 1);
    g.fillCircle(this.start.x - 4, this.start.y - 3, 5);
    g.fillCircle(this.start.x + 5, this.start.y + 4, 3);
    if (state.onCourse) {
      g.fillStyle(UI.green, 0.25 + 0.15 * Math.sin(time / 200));
      g.fillCircle(this.end.x, this.end.y, 18);
    }
    g.fillStyle(UI.moon, 1);
    g.fillCircle(this.end.x, this.end.y, 10);
    this.courseText.setVisible(state.onCourse);

    // Milestone flags.
    this.milestones.forEach((m, i) => {
      const p = this.point(m.at);
      const done = state.passed[i];
      g.lineStyle(2, done ? UI.gold : UI.dim, 1);
      g.lineBetween(p.x, p.y, p.x, p.y - 16);
      g.fillStyle(done ? UI.gold : UI.dim, 1);
      g.fillTriangle(p.x, p.y - 16, p.x + 10, p.y - 12, p.x, p.y - 8);
      this.flagTexts[i].setColor(done ? UI.goldText : UI.textMuted);
    });

    // The rocket, riding the arc and pointing along it.
    const here = this.point(f);
    const ahead = this.point(Math.min(1, f + 0.01));
    const behind = this.point(Math.max(0, f - 0.01));
    let angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
    if (!state.outbound) angle += Math.PI;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const shape = [
      [13, 0],
      [5, -5],
      [-8, -5],
      [-12, -9],
      [-12, 9],
      [-8, 5],
      [5, 5]
    ].map(([x, y]) => new Phaser.Math.Vector2(here.x + x * c - y * s, here.y + x * s + y * c));
    g.fillStyle(0xffffff, 1);
    g.fillPoints(shape, true);
    g.lineStyle(2, UI.blue, 1);
    g.strokePoints(shape, true, true);

    this.distanceText.setText(`${formatDistance(state.travelled)} / ${formatDistance(state.total)}`);
  }
}
