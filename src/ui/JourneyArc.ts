import Phaser from 'phaser';
import { formatDistance, hudPanel, TEXT_STYLE, UI } from './theme';
import { GAME_ASSETS } from '../core/assets';

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
  private readonly earthSprite: Phaser.GameObjects.Image;
  private readonly moonSprite: Phaser.GameObjects.Image;
  private readonly distanceText: Phaser.GameObjects.Text;
  private readonly courseText: Phaser.GameObjects.Text;
  private readonly flagTexts: Phaser.GameObjects.Text[];
  private readonly start: Phaser.Math.Vector2;
  private readonly end: Phaser.Math.Vector2;
  private readonly control: Phaser.Math.Vector2;
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, cx: number, private readonly milestones: Milestone[]) {
    this.start = new Phaser.Math.Vector2(cx - 250, 58);
    this.end = new Phaser.Math.Vector2(cx + 250, 58);
    this.control = new Phaser.Math.Vector2(cx, 10);

    const backdrop = scene.add.graphics();
    hudPanel(backdrop, cx - 300, 12, 600, 82);

    this.gfx = scene.add.graphics();
    this.earthSprite = scene.add.image(this.start.x, this.start.y, GAME_ASSETS.UI_EARTH.key).setDisplaySize(26, 26);
    this.moonSprite = scene.add.image(this.end.x, this.end.y, GAME_ASSETS.UI_MOON.key).setDisplaySize(24, 24);

    const earth = scene.add.text(this.start.x, this.start.y + 14, 'EARTH', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    const moon = scene.add.text(this.end.x, this.end.y + 14, 'MOON', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0);
    this.flagTexts = milestones.map(m => {
      const p = this.point(m.at);
      return scene.add.text(p.x, p.y + 8, m.label, TEXT_STYLE(10, UI.textMuted)).setOrigin(0.5, 0);
    });
    this.distanceText = scene.add.text(cx, 66, '', TEXT_STYLE(13)).setOrigin(0.5, 0);
    this.courseText = scene.add.text(this.end.x - 30, this.end.y - 22, 'ON COURSE', TEXT_STYLE(11, UI.greenText)).setOrigin(1, 0.5);

    this.container = scene.add.container(0, 0, [
      backdrop,
      this.gfx,
      this.earthSprite,
      this.moonSprite,
      earth,
      moon,
      ...this.flagTexts,
      this.distanceText,
      this.courseText
    ]);
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
      // Pixel route: solid blocks behind the rocket, dotted ahead.
      if (t1 <= f) {
        g.fillStyle(UI.sky, 1);
        g.fillRect(Math.round(a.x) - 2, Math.round(a.y) - 2, Math.ceil(b.x - a.x) + 2, 4);
      } else if (i % 2 === 0) {
        g.fillStyle(UI.dim, 1);
        g.fillRect(Math.round(a.x) - 2, Math.round(a.y) - 1, 4, 3);
      }
    }

    // Earth and Moon glow/aura when on course
    if (state.onCourse) {
      g.fillStyle(UI.green, 0.25 + 0.15 * Math.sin(time / 200));
      g.fillRect(this.end.x - 18, this.end.y - 14, 36, 28);
      g.fillRect(this.end.x - 14, this.end.y - 18, 28, 36);
    }
    this.courseText.setVisible(state.onCourse);

    // Milestone flags.
    this.milestones.forEach((m, i) => {
      const p = this.point(m.at);
      const done = state.passed[i];
      const fx = Math.round(p.x);
      const fy = Math.round(p.y);
      g.fillStyle(done ? UI.gold : UI.dim, 1);
      g.fillRect(fx - 1, fy - 16, 2, 16);
      g.fillRect(fx + 1, fy - 16, 8, 6);
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
