import Phaser from 'phaser';
import { GAME_ASSETS } from '../core/assets';
import { FUEL_KINDS } from '../core/partDefinitions';
import { FuelKind } from '../core/types';
import { PHASE_INFO, PhaseId, phaseNumber } from '../game/phases';
import { PX } from './pixel';
import { formatDistance, UI } from './theme';

/**
 * The flight HUD as four crafted corner pieces (goal, money, instruments, height),
 * in the same polished pixel style as the Rocket Lab: bevelled frames with an
 * orange header tab, glossy fuel tubes, a lift dial and a mini horizon.
 */

const SHADOW = '#07060b';
const FRAME_ALPHA = 0.84;

const body = (size: number, color: string = UI.text) => ({
  fontFamily: PX.body,
  fontSize: `${size}px`,
  color,
  shadow: { offsetX: 1, offsetY: 1, color: SHADOW, fill: true, blur: 0 }
});

const title = (size = 7, color: string = UI.textMuted) => ({
  fontFamily: PX.title,
  fontSize: `${size}px`,
  color,
  shadow: { offsetX: 1, offsetY: 1, color: SHADOW, fill: true, blur: 0 }
});

const lighten = (c: number, amount: number) => Phaser.Display.Color.IntegerToColor(c).lighten(amount).color;

/** Bevelled pixel frame: drop shadow, hard outline, border, lit top edge, translucent body. */
export function hudFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, border: number = PX.border, bodyAlpha = FRAME_ALPHA): void {
  g.fillStyle(0x000000, 0.35 * (bodyAlpha / FRAME_ALPHA));
  g.fillRect(x + 4, y + 5, w, h);
  // Hard outline and coloured border as strips, so the body stays see-through.
  const strips = (inset: number, t: number, color: number) => {
    g.fillStyle(color, 1);
    g.fillRect(x - inset, y - inset, w + inset * 2, t);
    g.fillRect(x - inset, y + h + inset - t, w + inset * 2, t);
    g.fillRect(x - inset, y - inset + t, t, h + inset * 2 - t * 2);
    g.fillRect(x + w + inset - t, y - inset + t, t, h + inset * 2 - t * 2);
  };
  strips(2, 2, 0x07060b);
  strips(0, 2, border);
  g.fillStyle(PX.panel, bodyAlpha);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle(lighten(border, 25), 0.55);
  g.fillRect(x + 4, y + 2, w - 8, 2);
  g.fillStyle(0x000000, 0.3);
  g.fillRect(x + 4, y + h - 4, w - 8, 2);
}

/** Orange header tab sitting on a frame's top edge. */
function headerTab(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, x: number, y: number, text: string): Phaser.GameObjects.Text {
  const label = scene.add.text(x + 8, y - 6, text, title(7, PX.text.shadow)).setShadow(0, 0, SHADOW, 0, false, false);
  const w = Math.ceil(label.width) + 16;
  g.fillStyle(0x07060b, 1);
  g.fillRect(x - 2, y - 11, w + 4, 18);
  g.fillStyle(PX.accent, 1);
  g.fillRect(x, y - 9, w, 14);
  g.fillStyle(0xffe0b0, 1);
  g.fillRect(x, y - 9, w, 2);
  g.fillStyle(0xb8661c, 1);
  g.fillRect(x, y + 3, w, 2);
  return label;
}

/** Recessed dark well inside a frame. */
function well(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x07060b, 0.9);
  g.fillRect(x, y, w, h);
  g.fillStyle(0x000000, 0.5);
  g.fillRect(x, y, w, 2);
  g.fillStyle(PX.borderDim, 1);
  g.fillRect(x, y + h - 1, w, 1);
}

// ---------------------------------------------------------------------------
// Top-left: mission phase + goal
// ---------------------------------------------------------------------------

export class GoalChip {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly phase: Phaser.GameObjects.Text;
  private readonly goal: Phaser.GameObjects.Text;
  private readonly tab: Phaser.GameObjects.Text[] = [];
  private readonly container: Phaser.GameObjects.Container;
  private key = '';

  constructor(private readonly scene: Phaser.Scene, private readonly x = 20, private readonly y = 24) {
    this.bg = scene.add.graphics();
    this.phase = scene.add.text(x + 54, y + 13, '', title(7, PX.text.gold));
    this.goal = scene.add.text(x + 14, y + 27, '', body(20)).setWordWrapWidth(330).setLineSpacing(-6);
    this.container = scene.add.container(0, 0, [this.bg, this.phase, this.goal]).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  public update(chain: readonly PhaseId[], current: PhaseId, done: number, goal: string): void {
    const now = chain.indexOf(current);
    const key = `${chain.length}|${now}|${done}|${goal}`;
    if (key === this.key) return;
    this.key = key;
    this.phase.setText(PHASE_INFO[current].title);
    this.goal.setText(goal);
    const w = Math.ceil(Math.max(this.phase.x - this.x + this.phase.width, this.goal.width + 14)) + 16;
    const h = Math.ceil(this.goal.y - this.y + this.goal.height) + 10;
    const g = this.bg;
    g.clear();
    this.tab.forEach(t => t.destroy());
    this.tab.length = 0;
    hudFrame(g, this.x, this.y, w, h, PX.border, 0.55);
    const tab = headerTab(this.scene, g, this.x + 12, this.y, `PHASE ${phaseNumber(chain, current)}/${chain.length}`);
    this.container.add(tab);
    this.tab.push(tab);
    // Phase pips: done = green, now = gold, later = hollow.
    chain.forEach((_, i) => {
      const px = this.x + 14 + i * 12;
      const py = this.y + 13;
      g.fillStyle(0x07060b, 1);
      g.fillRect(px - 1, py - 1, 10, 10);
      g.fillStyle(i < done ? UI.green : i === now ? UI.gold : 0x3a3446, 1);
      g.fillRect(px, py, 8, 8);
      g.fillStyle(0xffffff, i <= now ? 0.45 : 0.1);
      g.fillRect(px, py, 8, 2);
    });
  }
}

// ---------------------------------------------------------------------------
// Top-right: money
// ---------------------------------------------------------------------------

export class MoneyChip {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly coin: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private shown = 0;
  private hop = 0;
  private w = 0;
  private static readonly H = 34;

  constructor(scene: Phaser.Scene, private readonly right = 1260, private readonly y = 22) {
    this.bg = scene.add.graphics();
    this.coin = scene.add.image(0, y + MoneyChip.H / 2, GAME_ASSETS.UI_COIN.key).setDisplaySize(20, 20);
    this.text = scene.add.text(right - 12, y + MoneyChip.H / 2, '$0', body(24, UI.goldText)).setOrigin(1, 0.5);
    this.container = scene.add.container(0, 0, [this.bg, this.coin, this.text]).setDepth(20);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** Screen position of the coin, for "money flies here" effects. */
  public get target(): { x: number; y: number } {
    return { x: this.coin.x, y: this.y + MoneyChip.H / 2 };
  }

  public update(money: number, dt: number): void {
    if (money > this.shown) {
      this.shown = Math.min(money, this.shown + Math.max(1, (money - this.shown) * 8 * dt));
      this.hop = 1;
    } else {
      this.shown = money;
    }
    this.hop = Math.max(0, this.hop - dt * 4);
    this.text.setText(`$${Math.floor(this.shown).toLocaleString()}`);
    const w = Math.ceil(this.text.width) + 52;
    if (w !== this.w) {
      this.w = w;
      this.bg.clear();
      hudFrame(this.bg, this.right - w, this.y, w, MoneyChip.H, 0xc98a00);
      well(this.bg, this.right - w + 6, this.y + 6, 24, MoneyChip.H - 12);
    }
    this.coin.setPosition(this.right - w + 18, this.y + MoneyChip.H / 2 - Math.sin(this.hop * Math.PI) * 5);
  }
}

// ---------------------------------------------------------------------------
// Bottom-left: fuel tubes, lift dial, tilt horizon, mass
// ---------------------------------------------------------------------------

export interface TankReading {
  /** Part id, so a tank keeps its slot and its drop-away can be animated. */
  id: string;
  kind: FuelKind;
  /** Fuel the tank holds when full: tanks share the row by this. */
  capacity: number;
  /** 0..1 */
  fraction: number;
}

export interface Instruments {
  tanks: TankReading[];
  /** Total fuel left, 0..1. */
  fuel: number;
  twr: number;
  burning: boolean;
  /** Tilt from vertical, degrees (+ = leaning left). */
  tiltDeg: number;
  mass: number;
  /** Mass at liftoff (full tanks), for the mass gauge. */
  wetMass: number;
  /** Sky colour for the horizon (follows the launch time). */
  sky: number;
  /** Radiation is frying the electronics: the numbers scramble. */
  glitch?: boolean;
  /** Health of the ship, 0..100 (100 at launch, every lost part costs some). */
  health: number;
}

/** Fuel kinds on board with under 15% left of that kind's own capacity (not of the total); `includeEmpty: false` skips kinds that ran dry. */
export function lowFuelKinds(tanks: TankReading[], includeEmpty = true): FuelKind[] {
  const byKind = new Map<FuelKind, { left: number; cap: number }>();
  for (const t of tanks) {
    const k = byKind.get(t.kind) ?? { left: 0, cap: 0 };
    k.left += t.fraction * t.capacity;
    k.cap += t.capacity;
    byKind.set(t.kind, k);
  }
  return [...byKind].filter(([, k]) => k.cap > 0 && k.left / k.cap < LOW_FUEL && (includeEmpty || k.left > 1e-9)).map(([kind]) => kind);
}
export const LOW_FUEL = 0.15;

/** Fuel capsules: size, spacing, and how many fit before same-fuel tanks are grouped. */
const CAP_W = 18;
const CAP_H = 52;
const CAP_GAP = 6;
const CAP_MAX = 4;
/** The column is drawn at 1× in its own space, then scaled up on screen. */
const COLUMN_SCALE = 1.2;
/** Top of each instrument well inside the column (lift, tilt, mass). */
const WELL_Y = [106, 192, 278];
/** Top of the health bar under the last well. */
const HEALTH_Y = 366;

export const TILT_AMBER = 20;
export const TILT_RED = 35;
/** The lift dial spans TWR 0..DIAL_MAX; below 1 the rocket can't climb. */
const DIAL_MAX = 2;

export class InstrumentChip {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly fuelPct: Phaser.GameObjects.Text;
  private readonly twrText: Phaser.GameObjects.Text;
  private readonly tiltText: Phaser.GameObjects.Text;
  private readonly massText: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private static readonly W = 108;
  private static readonly H = 410;
  private readonly x: number;
  private readonly y: number;
  private needle = 0;
  /** Fuel capsules: where each slot is drawn (eases when the row closes up), what was there last frame, and tanks falling away. */
  private readonly slotX = new Map<string, number>();
  private lastSlots = new Map<string, { x: number; color: number; fill: number; count: number }>();
  private drops: Array<{ x: number; color: number; fill: number; t0: number }> = [];
  private readonly badges: Phaser.GameObjects.Text[] = [];
  private readonly lowTag: Phaser.GameObjects.Text;
  private lastTime = 0;
  private baseX = 0;

  constructor(scene: Phaser.Scene, left = 20, bottom = 700) {
    const { W, H } = InstrumentChip;
    // Everything below is laid out in the column's own 1× space (origin top-left), then the
    // container is placed bottom-left and scaled up, so every part grows together.
    this.x = 0;
    this.y = 0;
    const x = 0;
    const y = 0;
    this.bg = scene.add.graphics();
    const g = this.bg;
    // Same see-through body as the HEIGHT panel (~55%).
    hudFrame(g, x, y, W, H, PX.border, 0.55);
    const tab = headerTab(scene, g, x + 10, y, 'ROCKET');
    g.fillStyle(PX.borderDim, 1);
    g.fillRect(x + 10, y + 98, W - 20, 2);
    // Three instrument wells stacked, each with a bevel and corner screws.
    for (const wy0 of WELL_Y) {
      const wx0 = x + 10;
      well(g, wx0, y + wy0, 88, 80);
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(wx0 + 2, y + wy0 + 2, 84, 1);
      for (const [sx, sy] of [[4, 4], [82, 4], [4, 74], [82, 74]]) {
        g.fillStyle(0x3a3446, 1);
        g.fillRect(wx0 + sx, y + wy0 + sy, 3, 3);
        g.fillStyle(0x8a829c, 1);
        g.fillRect(wx0 + sx, y + wy0 + sy, 1, 1);
      }
    }
    // Health: a slim bar in its own well, label underneath.
    well(g, x + 10, y + HEALTH_Y, 88, 16);
    const texts: Phaser.GameObjects.Text[] = [];
    texts.push(scene.add.text(x + InstrumentChip.W / 2, y + HEALTH_Y + 29, 'HEALTH', title(6)).setOrigin(0.5, 0.5));

    // --- Lift dial (static parts): bezel, face, ticks, numerals ---
    const lx = x + 54;
    const ly = y + WELL_Y[0] + 38;
    const half = (r: number) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 24; i++) pts.push(new Phaser.Math.Vector2(lx + Math.cos(Math.PI + (i / 24) * Math.PI) * r, ly + Math.sin(Math.PI + (i / 24) * Math.PI) * r));
      return pts;
    };
    g.fillStyle(0x4b4458, 1);
    g.fillPoints(half(35), true);
    g.fillStyle(0x07060b, 1);
    g.fillPoints(half(33), true);
    g.fillStyle(0x15121d, 1);
    g.fillPoints(half(31), true);
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI;
      const major = i % 10 === 0 || i === 10;
      const mid = i % 5 === 0;
      const r0 = major ? 13 : mid ? 15 : 17;
      g.lineStyle(major ? 2 : 1, 0xf4eee6, major ? 0.95 : mid ? 0.7 : 0.4);
      g.lineBetween(lx + Math.cos(a) * r0, ly + Math.sin(a) * r0, lx + Math.cos(a) * 19, ly + Math.sin(a) * 19);
    }
    texts.push(
      scene.add.text(lx - 24, ly - 4, '0', title(5, '#9d94ae')).setOrigin(0.5),
      scene.add.text(lx, ly - 27, '1', title(5, '#f4eee6')).setOrigin(0.5),
      scene.add.text(lx + 24, ly - 4, '2', title(5, '#9d94ae')).setOrigin(0.5)
    );
    // LCD for the value.
    g.fillStyle(0x07060b, 1);
    g.fillRect(lx - 24, ly + 6, 48, 18);
    g.fillStyle(0x0d1a12, 1);
    g.fillRect(lx - 22, ly + 8, 44, 14);

    // --- Horizon (static parts): bezel, rivets, bank scale ---
    const hx = x + 54;
    const hy = y + WELL_Y[1] + 32;
    g.fillStyle(0x4b4458, 1);
    g.fillCircle(hx, hy, 29);
    g.fillStyle(0x07060b, 1);
    g.fillCircle(hx, hy, 27);
    for (const deg of [45, 135, 225, 315]) {
      const a = (deg * Math.PI) / 180;
      g.fillStyle(0x8a829c, 1);
      g.fillRect(Math.round(hx + Math.cos(a) * 28) - 1, Math.round(hy + Math.sin(a) * 28) - 1, 2, 2);
    }
    for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = ((deg - 90) * Math.PI) / 180;
      const long = deg % 30 === 0;
      g.lineStyle(long ? 2 : 1, 0xf4eee6, long ? 0.9 : 0.55);
      g.lineBetween(hx + Math.cos(a) * 25, hy + Math.sin(a) * 25, hx + Math.cos(a) * (long ? 30 : 28), hy + Math.sin(a) * (long ? 30 : 28));
    }
    g.fillStyle(0x07060b, 1);
    g.fillRect(hx - 18, hy + 30, 36, 16);
    g.fillStyle(0x1d1408, 1);
    g.fillRect(hx - 16, hy + 32, 32, 12);

    // --- Mass (static parts): shaded weight, gauge frame ---
    const wx = x + 54;
    const wy = y + WELL_Y[2] + 12;
    // A classic trapezoid weight with a ring handle, lit from the left.
    const trap = (inset: number, dy: number) => [
      new Phaser.Math.Vector2(wx - 7 + inset, wy + 4 + dy),
      new Phaser.Math.Vector2(wx + 7 - inset, wy + 4 + dy),
      new Phaser.Math.Vector2(wx + 12 - inset, wy + 20 - dy),
      new Phaser.Math.Vector2(wx - 12 + inset, wy + 20 - dy)
    ];
    g.lineStyle(4, 0x07060b, 1);
    g.strokeCircle(wx, wy, 5);
    g.lineStyle(2, PX.accent, 1);
    g.strokeCircle(wx, wy, 5);
    g.fillStyle(0x07060b, 1);
    g.fillPoints(trap(-2, -2), true);
    g.fillStyle(0xb8661c, 1);
    g.fillPoints(trap(0, 0), true);
    g.fillStyle(PX.accent, 1);
    g.fillPoints([new Phaser.Math.Vector2(wx - 7, wy + 4), new Phaser.Math.Vector2(wx + 3, wy + 4), new Phaser.Math.Vector2(wx + 4, wy + 20), new Phaser.Math.Vector2(wx - 12, wy + 20)], true);
    g.fillStyle(0xffe0b0, 0.9);
    g.fillRect(wx - 6, wy + 5, 8, 1);
    g.fillRect(wx - 8, wy + 7, 1, 8);
    g.fillStyle(0x3a1a12, 1);
    g.fillRect(wx - 3, wy + 12, 6, 2);
    texts.push(scene.add.text(wx, y + WELL_Y[2] + 73, 'KG', title(6)).setOrigin(0.5, 0.5));
    texts.push(scene.add.text(lx, y + WELL_Y[0] + 73, 'LIFT', title(6)).setOrigin(0.5, 0.5));
    texts.push(scene.add.text(x + 10, y + 78, 'FUEL', title(6)).setOrigin(0, 0.5));

    this.fuelPct = scene.add.text(x + W - 10, y + 78, '', body(20)).setOrigin(1, 0.5);
    // A solid red plate with white lettering, so it reads against any sky.
    this.lowTag = scene.add
      .text(x + W / 2, y + 89, 'LOW FUEL', { ...title(7, '#ffffff'), backgroundColor: '#c4261a', padding: { x: 5, y: 3 } })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    for (let i = 0; i < CAP_MAX; i++) this.badges.push(scene.add.text(0, 0, '', title(5, PX.text.cream)).setOrigin(1, 1).setVisible(false));
    this.twrText = scene.add.text(lx, ly + 15, '', body(17, '#7dffa8')).setOrigin(0.5, 0.5);
    this.tiltText = scene.add.text(hx, hy + 38, '', body(16)).setOrigin(0.5, 0.5);
    this.massText = scene.add.text(wx, y + WELL_Y[2] + 44, '', body(20)).setOrigin(0.5, 0.5);
    this.gfx = scene.add.graphics();
    this.container = scene.add
      .container(0, 0, [this.bg, this.gfx, tab, ...texts, this.fuelPct, this.lowTag, ...this.badges, this.twrText, this.tiltText, this.massText])
      .setDepth(20)
      .setScale(COLUMN_SCALE)
      .setPosition(left, bottom - H * COLUMN_SCALE);
    this.baseX = left;
    // Keep text crisp after the scale-up.
    for (const o of this.container.list) if (o instanceof Phaser.GameObjects.Text) o.setResolution(2);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** Slide sideways from its resting place (used to fly in from the left edge). */
  public setOffsetX(dx: number): void {
    this.container.x = this.baseX + dx;
  }

  public update(r: Instruments, time: number): void {
    const dt = Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    const g = this.gfx;
    g.clear();
    this.drawTanks(g, r, time, dt);
    this.drawLift(g, r, dt);
    this.drawHorizon(g, r, time);
    this.drawMass(g, r);
    this.drawHealth(g, r);
    if (r.glitch) for (const t of [this.fuelPct, this.twrText, this.tiltText, this.massText]) t.setText(scramble(t.text));
  }

  /**
   * Fuel: a row of upright capsule tanks, one per tank on the rocket (grouped by fuel type
   * with an ×n badge once there are more than CAP_MAX), each draining from the top in its
   * fuel colour. A tank that drops away falls out of the row and the rest slide together.
   */
  private drawTanks(g: Phaser.GameObjects.Graphics, r: Instruments, time: number, dt: number): void {
    const y0 = this.y + 14;
    const slots: Array<{ key: string; color: number; fill: number; count: number }> = [];
    if (r.tanks.length > CAP_MAX) {
      for (const t of r.tanks) {
        const s = slots.find(e => e.key === t.kind);
        if (s) {
          s.fill = (s.fill * s.count + t.fraction) / (s.count + 1);
          s.count++;
        } else slots.push({ key: t.kind, color: FUEL_KINDS[t.kind].color, fill: t.fraction, count: 1 });
      }
    } else {
      for (const t of r.tanks) slots.push({ key: t.id, color: FUEL_KINDS[t.kind].color, fill: t.fraction, count: 1 });
    }

    // Anything gone since last frame (or a group that got smaller) falls out of the row.
    const now = new Map<string, { x: number; color: number; fill: number; count: number }>();
    // The row is centred, so it re-centres (and eases) as tanks drop away.
    const x0 = this.x + (InstrumentChip.W - (slots.length * CAP_W + (slots.length - 1) * CAP_GAP)) / 2;
    slots.forEach((sl, i) => {
      const target = x0 + i * (CAP_W + CAP_GAP);
      const x = this.slotX.get(sl.key) ?? target;
      const eased = x + (target - x) * Math.min(1, dt * 10);
      this.slotX.set(sl.key, eased);
      now.set(sl.key, { x: eased, color: sl.color, fill: sl.fill, count: sl.count });
    });
    for (const [key, was] of this.lastSlots) {
      const is = now.get(key);
      if (!is || is.count < was.count) this.drops.push({ x: was.x, color: was.color, fill: is ? was.fill : 0, t0: time });
      if (!is) this.slotX.delete(key);
    }
    this.lastSlots = now;

    this.drops = this.drops.filter(d => time - d.t0 < 650);
    for (const d of this.drops) {
      const k = (time - d.t0) / 650;
      this.capsule(g, d.x + k * 6, y0 + k * k * 46, d.color, d.fill, 1 - k);
    }

    this.badges.forEach(b => b.setVisible(false));
    slots.forEach((sl, i) => {
      const x = this.slotX.get(sl.key)!;
      this.capsule(g, x, y0, sl.color, sl.fill, 1);
      if (sl.count > 1 && this.badges[i]) {
        g.fillStyle(0x07060b, 1);
        g.fillRect(x + CAP_W - 14, y0 + CAP_H - 9, 16, 10);
        this.badges[i].setText(`×${sl.count}`).setPosition(x + CAP_W + 1, y0 + CAP_H + 1).setVisible(true);
      }
    });

    const pct = Math.round(r.fuel * 100);
    const low = lowFuelKinds(r.tanks).length > 0;
    const blink = Math.floor(time / 300) % 2 === 0;
    this.fuelPct.setText(`${pct}%`).setColor(low ? (blink ? UI.redText : UI.text) : r.fuel < 0.35 ? UI.amberText : UI.text);
    this.lowTag.setVisible(low && blink);
  }

  /** One upright capsule tank: dark glass, a metal cap, fuel from the bottom up to `fill`, a lit surface and a gloss stripe. */
  private capsule(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, fill: number, alpha: number): void {
    const w = CAP_W;
    const h = CAP_H;
    g.fillStyle(0x8a829c, alpha);
    g.fillRect(x + 5, y - 3, w - 10, 3);
    g.fillStyle(0x07060b, alpha);
    g.fillRect(x + 2, y, w - 4, h);
    g.fillRect(x, y + 3, w, h - 6);
    g.fillStyle(0x1f1b27, alpha);
    g.fillRect(x + 3, y + 2, w - 6, h - 4);
    g.fillRect(x + 2, y + 4, w - 4, h - 8);
    const top = y + 3;
    const bottom = y + h - 3;
    const level = Math.round((bottom - top) * Phaser.Math.Clamp(fill, 0, 1));
    g.fillStyle(color, 0.14 * alpha);
    g.fillRect(x + 3, top, w - 6, bottom - top);
    if (level > 0) {
      g.fillStyle(color, alpha);
      g.fillRect(x + 3, bottom - level, w - 6, level);
      g.fillStyle(lighten(color, 30), alpha);
      g.fillRect(x + 3, bottom - level, w - 6, Math.min(2, level));
      g.fillStyle(0x000000, 0.18 * alpha);
      g.fillRect(x + w - 6, bottom - level, 3, level);
    }
    g.fillStyle(0xffffff, 0.22 * alpha);
    g.fillRect(x + 5, y + 5, 2, h - 10);
  }

  /** Half-dial: an LED arc that lights up to the current lift (red below lift-off, green with plenty of push) and an easing needle. */
  private drawLift(g: Phaser.GameObjects.Graphics, r: Instruments, dt: number): void {
    const cx = this.x + 54;
    const cy = this.y + WELL_Y[0] + 38;
    const twr = r.burning ? r.twr : 0;
    const target = Phaser.Math.Clamp(twr / DIAL_MAX, 0, 1);
    this.needle += (target - this.needle) * Math.min(1, dt * 8);
    const SEGS = 18;
    for (let i = 0; i < SEGS; i++) {
      const f0 = i / SEGS;
      const f1 = (i + 0.78) / SEGS;
      const mid = (f0 + f1) / 2;
      const color = mid < 0.45 ? UI.red : mid < 0.55 ? UI.amber : UI.green;
      const lit = mid <= this.needle + 0.001 && twr > 0;
      const pts = [f0, f1, f1, f0].map((f, k) => {
        const a = Math.PI + f * Math.PI;
        const rr = k < 2 ? 30 : 23;
        return new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      });
      g.fillStyle(color, lit ? 1 : 0.22);
      g.fillPoints(pts, true);
    }
    // Needle: a tapered pointer with a short tail, over a hub cap.
    const a = Math.PI + this.needle * Math.PI;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const tip = { x: cx + ux * 26, y: cy + uy * 26 };
    const tail = { x: cx - ux * 6, y: cy - uy * 6 };
    g.fillStyle(0x07060b, 0.6);
    g.fillTriangle(tip.x + 1, tip.y + 1, cx - uy * 3 + 1, cy + ux * 3 + 1, cx + uy * 3 + 1, cy - ux * 3 + 1);
    g.fillStyle(0xff6b3d, 1);
    g.fillTriangle(tip.x, tip.y, cx - uy * 2.5, cy + ux * 2.5, cx + uy * 2.5, cy - ux * 2.5);
    g.lineStyle(2, 0xff6b3d, 1);
    g.lineBetween(cx, cy, tail.x, tail.y);
    g.fillStyle(0x3a3446, 1);
    g.fillCircle(cx, cy, 5);
    g.fillStyle(0xd8d0e6, 1);
    g.fillCircle(cx, cy, 3);
    g.fillStyle(0xffffff, 1);
    g.fillRect(cx - 2, cy - 2, 1, 1);
    // Glass glare across the upper left.
    g.fillStyle(0xffffff, 0.07);
    g.fillTriangle(cx - 28, cy - 4, cx - 10, cy - 28, cx - 2, cy - 22);
    const weak = r.burning && r.twr < 1;
    this.twrText.setText(`${twr.toFixed(1)}×`).setColor(weak ? '#ff8a8a' : r.burning ? '#7dffa8' : '#4f7a5c');
  }

  /** Mini artificial horizon: banded sky and ground with a pitch ladder tilt with the rocket; the rim and LCD warn. */
  private drawHorizon(g: Phaser.GameObjects.Graphics, r: Instruments, time: number): void {
    const cx = this.x + 54;
    const cy = this.y + WELL_Y[1] + 32;
    const rad = 24;
    const tilt = Math.abs(r.tiltDeg);
    const a = (r.tiltDeg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // Sky, a lighter band near the horizon, then the ground half and its darker stripes.
    g.fillStyle(lighten(r.sky, -12), 1);
    g.fillCircle(cx, cy, rad);
    const segment = (offset: number, color: number) => {
      // The part of the disc below a line parallel to the horizon, `offset` px above it.
      const pts: Phaser.Math.Vector2[] = [];
      const d = Phaser.Math.Clamp(-offset / rad, -1, 1);
      const span = Math.acos(d);
      for (let i = 0; i <= 18; i++) {
        const t = Math.PI / 2 + a - span + (i / 18) * span * 2;
        pts.push(new Phaser.Math.Vector2(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad));
      }
      g.fillStyle(color, 1);
      g.fillPoints(pts, true);
    };
    segment(8, lighten(r.sky, 12));
    segment(0, 0x7a5a3a);
    segment(-8, 0x6b4a2c);
    segment(-16, 0x5a3d24);
    // Horizon line and pitch ladder (every 10°, shorter lines further out).
    const line = (off: number, len: number, alpha: number) => {
      const px = cx - uy * off;
      const py = cy + ux * off;
      g.lineStyle(1, 0xffffff, alpha);
      g.lineBetween(px - ux * len, py - uy * len, px + ux * len, py + uy * len);
    };
    g.lineStyle(2, 0xf4eee6, 0.9);
    g.lineBetween(cx - ux * rad, cy - uy * rad, cx + ux * rad, cy + uy * rad);
    for (const [off, len] of [[-7, 6], [-14, 10], [7, 6], [14, 10]] as const) line(off, len, 0.55);
    // Sky pointer riding the top of the disc.
    const tx = cx + Math.sin(a) * (rad - 3);
    const ty = cy - Math.cos(a) * (rad - 3);
    g.fillStyle(0xf4eee6, 1);
    g.fillTriangle(tx, ty, tx - 3 * ux - 4 * uy * 0, ty + 4, tx + 3, ty + 4);
    // The rocket: fixed in the middle, with a flickering flame while the engines burn.
    g.fillStyle(0x07060b, 1);
    g.fillRect(cx - 4, cy - 13, 8, 23);
    g.fillRect(cx - 7, cy + 2, 14, 7);
    g.fillStyle(0xe2463a, 1);
    g.fillRect(cx - 2, cy - 12, 4, 4);
    g.fillStyle(0xf4eee6, 1);
    g.fillRect(cx - 3, cy - 8, 6, 14);
    g.fillStyle(0x5cc8ff, 1);
    g.fillRect(cx - 1, cy - 5, 2, 2);
    g.fillStyle(PX.accent, 1);
    g.fillRect(cx - 6, cy + 3, 3, 5);
    g.fillRect(cx + 3, cy + 3, 3, 5);
    if (r.burning) {
      const f = 3 + Math.round(Math.abs(Math.sin(time / 50)) * 3);
      g.fillStyle(0xffd23f, 1);
      g.fillRect(cx - 2, cy + 6, 4, f);
      g.fillStyle(0xff6b3d, 1);
      g.fillRect(cx - 1, cy + 6 + f, 2, 2);
    }
    // Glare.
    g.fillStyle(0xffffff, 0.12);
    g.fillTriangle(cx - 20, cy - 10, cx - 8, cy - 21, cx - 4, cy - 17);
    // Rim: accent normally, amber past 20°, pulsing red past 35°.
    const danger = tilt > TILT_RED;
    const rim = danger ? UI.red : tilt > TILT_AMBER ? UI.amber : PX.accent;
    g.lineStyle(3, rim, danger ? 0.6 + 0.4 * Math.sin(time / 90) : 1);
    g.strokeCircle(cx, cy, rad + 1);
    this.tiltText.setText(`${Math.round(tilt)}°`).setColor(danger ? '#ff8a8a' : tilt > TILT_AMBER ? UI.amberText : '#ffcf8a');
  }

  /** Mass in kg, and an 8-segment gauge of how much of the liftoff mass is left. */
  /** Ship health: green, then amber, then red as parts are lost. */
  private drawHealth(g: Phaser.GameObjects.Graphics, r: Instruments): void {
    const health = Phaser.Math.Clamp(r.health, 0, 100);
    const bx = this.x + 12;
    const by = this.y + HEALTH_Y + 2;
    const bw = 84;
    const fill = Math.round((bw * health) / 100);
    g.fillStyle(health > 60 ? UI.green : health > 30 ? UI.gold : 0xf04a3a, 1);
    g.fillRect(bx, by, fill, 12);
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(bx, by, fill, 2);
  }

  private drawMass(g: Phaser.GameObjects.Graphics, r: Instruments): void {
    const wx = this.x + 54;
    const y0 = this.y + WELL_Y[2] + 56;
    const share = r.wetMass > 0 ? Phaser.Math.Clamp(r.mass / r.wetMass, 0, 1) : 1;
    const lit = Math.round(share * 8);
    for (let i = 0; i < 8; i++) {
      const sx = wx - 32 + i * 8;
      g.fillStyle(0x07060b, 1);
      g.fillRect(sx, y0, 7, 8);
      g.fillStyle(i < lit ? PX.accent : 0x3a3446, 1);
      g.fillRect(sx + 1, y0 + 1, 5, 6);
      if (i < lit) {
        g.fillStyle(0xffe0b0, 0.8);
        g.fillRect(sx + 1, y0 + 1, 5, 1);
      }
    }
    this.massText.setText(Math.round(r.mass).toLocaleString());
  }
}

// ---------------------------------------------------------------------------
// Right edge: height tube, Earth to Moon
// ---------------------------------------------------------------------------

export interface LadderMark {
  label: string;
  height: number;
}

/** A stretch of the climb (rock belt, a challenge zone): a coloured dashed stripe beside the tube. */
export interface LadderBand {
  from: number;
  to: number;
  label: string;
  color: number;
}

const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
/** Garbled digits for a readout fried by radiation. */
const scramble = (text: string) => text.replace(/[0-9]/g, () => '0123456789#?'[Math.floor(Math.random() * 12)]);

export class HeightLadder {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly value: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly markTexts: Phaser.GameObjects.Text[] = [];
  private readonly bandTexts: Phaser.GameObjects.Text[] = [];
  private readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly x: number;
  private readonly top: number;
  private readonly bottom: number;

  constructor(
    scene: Phaser.Scene,
    private readonly max: number,
    private readonly marks: LadderMark[],
    private readonly bands: LadderBand[] = [],
    right = 1260,
    top = 120,
    bottom = 600
  ) {
    this.scene = scene;
    const w = 100;
    const fx = right - w;
    this.x = right - 26;
    this.top = top + 40;
    this.bottom = bottom - 32;
    const bg = scene.add.graphics();
    // See-through body (~55%): the sky shows behind the tall height panel.
    hudFrame(bg, fx, top, w, bottom - top, PX.border, 0.55);
    const tab = headerTab(scene, bg, fx + 10, top, 'HEIGHT');
    // The tube: dark glass with a gloss line.
    bg.fillStyle(0x07060b, 1);
    bg.fillRect(this.x - 7, this.top - 2, 14, this.bottom - this.top + 4);
    bg.fillStyle(0x1f1b27, 1);
    bg.fillRect(this.x - 5, this.top, 10, this.bottom - this.top);
    const moon = scene.add.image(this.x, this.top - 16, GAME_ASSETS.UI_MOON.key).setDisplaySize(18, 18);
    const earth = scene.add.image(this.x, this.bottom + 15, GAME_ASSETS.UI_EARTH.key).setDisplaySize(18, 18);
    const items: Phaser.GameObjects.GameObject[] = [bg, tab, moon, earth];
    for (const band of bands) {
      const y0 = this.toY(band.to);
      const y1 = this.toY(band.from);
      for (let y = y0; y < y1; y += 6) {
        bg.fillStyle(band.color, 0.75);
        bg.fillRect(this.x - 12, y, 4, 3);
      }
      const t = scene.add.text(this.x - 16, (y0 + y1) / 2, band.label, body(13, hexColor(band.color))).setOrigin(1, 0.5).setAlpha(0.9);
      this.bandTexts.push(t);
      items.push(t);
    }
    for (const m of marks) {
      const y = Math.round(this.toY(m.height));
      bg.fillStyle(0xffffff, 0.55);
      bg.fillRect(this.x - 12, y, 5, 2);
      const t = scene.add.text(this.x - 16, y, m.label, body(15, UI.textMuted)).setOrigin(1, 0.5);
      this.markTexts.push(t);
      items.push(t);
    }
    this.gfx = scene.add.graphics();
    this.value = scene.add.text(0, 0, '', body(20)).setOrigin(1, 0.5);
    this.bestText = scene.add.text(0, 0, 'BEST', title(6, PX.text.gold)).setOrigin(0, 0.5);
    items.push(this.gfx, this.value, this.bestText);
    this.container = scene.add.container(0, 0, items).setDepth(20);
  }

  private toY(height: number): number {
    const k = Phaser.Math.Clamp(height / this.max, 0, 1);
    return this.bottom - k * (this.bottom - this.top);
  }

  public setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  /** Slide sideways from its resting place (used to fly in from the right edge). */
  public setOffsetX(dx: number): void {
    this.container.x = dx;
  }

  /** Pin a mark at a height (e.g. where a shell jammed): a red notch across the tube and a "!" beside it. */
  public addFlag(height: number, color: number): void {
    const y = Math.round(this.toY(height));
    const notch = this.scene.add.rectangle(this.x, y, 16, 3, color).setOrigin(0.5);
    const mark = this.scene.add.text(this.x + 10, y, '!', body(16, hexColor(color))).setOrigin(0, 0.5);
    this.container.add([notch, mark]);
  }

  public update(height: number, best: number, glitch = false): void {
    const g = this.gfx;
    g.clear();
    const y = Math.round(this.toY(height));
    // Climbed so far: a glossy column of light.
    g.fillStyle(UI.sky, 1);
    g.fillRect(this.x - 5, y, 10, this.bottom - y);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(this.x - 4, y, 2, this.bottom - y);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(this.x - 5, y, 10, 2);
    // Milestones turn gold once reached.
    this.marks.forEach((m, i) => this.markTexts[i].setColor(height >= m.height ? UI.goldText : UI.textMuted));
    // The band the rocket is in lights up and pulses.
    const pulse = 0.75 + 0.25 * Math.sin(this.scene.time.now / 140);
    this.bands.forEach((b, i) => this.bandTexts[i].setAlpha(height >= b.from && height < b.to ? pulse : 0.9));
    if (best > 0) {
      const by = Math.round(this.toY(best));
      g.fillStyle(UI.gold, 1);
      g.fillRect(this.x + 6, by, 6, 2);
      g.fillRect(this.x + 10, by - 6, 2, 8);
      g.fillRect(this.x + 12, by - 6, 6, 4);
      this.bestText.setPosition(this.x + 6, by + 8).setVisible(Math.abs(by - y) > 14);
    } else {
      this.bestText.setVisible(false);
    }
    // Pointer and height.
    g.fillStyle(0x07060b, 1);
    g.fillTriangle(this.x - 15, y - 6, this.x - 15, y + 6, this.x - 7, y);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(this.x - 14, y - 4, this.x - 14, y + 4, this.x - 9, y);
    const text = formatDistance(Math.max(0, height));
    this.value.setPosition(this.x - 18, y).setText(glitch ? scramble(text) : text);
  }
}
