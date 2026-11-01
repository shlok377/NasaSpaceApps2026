import Phaser from 'phaser';
import { glassPanel, TEXT_STYLE, TITLE_STYLE, UI } from './theme';
import { GAME_ASSETS } from '../core/assets';
import { FUEL_KINDS } from '../core/partDefinitions';
import { twrToNeedleAngle, isLowThrustAlert, TWR_MIN_ANGLE } from '../physics/twr';
import { FlightHudModel, HudTank, TiltWarning } from '../game/flightHud';
import { TIME_LOOKS } from '../game/timeOfDay';

export interface LeftColumnReadings {
  mass: number;
  wetMass: number;
  twr: number;
  throttleActive: boolean;
  /** Scene time (ms), for blinks and wobbles. */
  time: number;
  /** Frame time (s). */
  dt: number;
}

/** Column rect (screen px): anchored bottom-left, clear of the bottom-centre card. */
export const LEFT_COLUMN = { x: 16, y: 296, w: 176, h: 412 } as const;

const CX = LEFT_COLUMN.x + LEFT_COLUMN.w / 2;
const T = LEFT_COLUMN.y;
/** Attitude ball: centre, radius and pixel size. */
const BALL_Y = T + 74;
const BALL_R = 44;
const CELL = 4;
/** Fuel row. */
const TANK_TOP = T + 172;
const TANK_H = 42;
const TANK_MAX_W = 18;
const TANK_GAP = 6;
const ROW_W = LEFT_COLUMN.w - 24;
const MASS_SEGMENTS = 8;

const INK = 0x07060b;
const EMPTY_TANK = 0x6b6478;
const RIM_COLOR: Record<TiltWarning, number> = { NORMAL: 0xb3aac4, AMBER: UI.amber, RED: UI.red };
const RIM_TEXT: Record<TiltWarning, string> = { NORMAL: UI.text, AMBER: UI.amberText, RED: UI.redText };
/** Ground half of the ball, near the horizon first; tinted by the time of day's land tint. */
const GROUND = [0x6f9a3e, 0x5c8634, 0x4b722b, 0x3d5f24];

interface TankSlot {
  tank: HudTank;
  x: number;
  badge: Phaser.GameObjects.Text;
}

interface Puff {
  x: number;
  y: number;
  w: number;
  color: number;
  age: number;
}

/** Multiplies two 0xRRGGBB colours channel by channel. */
function tint(color: number, by: number): number {
  const ch = (s: number) => Math.round((((color >> s) & 255) * ((by >> s) & 255)) / 255) << s;
  return ch(16) | ch(8) | ch(0);
}

/**
 * Bottom-left smoked-glass instrument column, top to bottom:
 * 1. Attitude ball: pixel horizon in the launch time's sky, fixed yellow rocket, tilt in degrees,
 *    wind arrow along its top edge and a rim that turns amber/red as the rocket tilts.
 * 2. Fuel: one mini tank per tank in its fuel colour (grey when empty, puff when dropped, ×n groups), total %.
 * 3. TWR dial with spring needle dynamics and low-thrust alert.
 * 4. Mass: kg readout and 8 weight icons.
 */
export class LeftColumn {
  private readonly ball: Phaser.GameObjects.Graphics;
  private readonly tanksGfx: Phaser.GameObjects.Graphics;
  private readonly tiltText: Phaser.GameObjects.Text;
  private readonly fuelText: Phaser.GameObjects.Text;
  private readonly needleSprite: Phaser.GameObjects.Image;
  private readonly twrValueText: Phaser.GameObjects.Text;
  private readonly massText: Phaser.GameObjects.Text;
  private readonly massSprites: Phaser.GameObjects.Image[] = [];
  private readonly container: Phaser.GameObjects.Container;
  private readonly slots = new Map<string, TankSlot>();
  private puffs: Puff[] = [];
  private ballKey = '';
  private needleAngle: number = TWR_MIN_ANGLE;

  constructor(private readonly scene: Phaser.Scene) {
    const { x, y, w, h } = LEFT_COLUMN;
    const panel = glassPanel(scene, x, y, w, h);
    const dividers = scene.add.graphics();
    dividers.fillStyle(0xffffff, 0.08);
    for (const dy of [150, 252, 340]) dividers.fillRect(x + 12, y + dy, w - 24, 2);

    this.ball = scene.add.graphics();
    this.tiltText = scene.add.text(CX, BALL_Y + BALL_R + 6, '0°', TEXT_STYLE(13)).setOrigin(0.5, 0);

    const fuelLabel = scene.add.text(CX, T + 158, 'FUEL', TITLE_STYLE(8, UI.textMuted)).setOrigin(0.5, 0);
    this.tanksGfx = scene.add.graphics();
    this.fuelText = scene.add.text(CX, TANK_TOP + TANK_H + 6, '', TEXT_STYLE(13)).setOrigin(0.5, 0);

    const twrLabel = scene.add.text(CX, T + 260, 'LIFT', TITLE_STYLE(8, UI.textMuted)).setOrigin(0.5, 0);
    const gauge = scene.add.image(CX, T + 296, GAME_ASSETS.UI_FUEL_GAUGE.key).setDisplaySize(81, 45);
    this.needleSprite = scene.add
      .image(CX, T + 318, GAME_ASSETS.UI_FUEL_NEEDLE.key)
      .setDisplaySize(9, 26)
      .setOrigin(0.5, 0.82);
    this.needleSprite.setAngle(-70 + (this.needleAngle / 100) * 140);
    this.twrValueText = scene.add.text(CX + 44, T + 300, '0.0×', TEXT_STYLE(12, UI.textMuted)).setOrigin(0, 0.5);

    const massLabel = scene.add.text(CX, T + 348, 'MASS', TITLE_STYLE(8, UI.textMuted)).setOrigin(0.5, 0);
    this.massText = scene.add.text(CX, T + 358, '', TEXT_STYLE(14)).setOrigin(0.5, 0);
    const iconsX = CX - (MASS_SEGMENTS * 11 - 1) / 2;
    for (let i = 0; i < MASS_SEGMENTS; i++) {
      this.massSprites.push(
        scene.add
          .image(iconsX + i * 11, T + 388, GAME_ASSETS.UI_MASS.key)
          .setOrigin(0, 0)
          .setDisplaySize(10, 15)
      );
    }

    this.container = scene.add
      .container(0, 0, [
        panel,
        dividers,
        this.ball,
        this.tiltText,
        fuelLabel,
        this.tanksGfx,
        this.fuelText,
        twrLabel,
        gauge,
        this.needleSprite,
        this.twrValueText,
        massLabel,
        this.massText,
        ...this.massSprites
      ])
      .setDepth(20);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public getNeedleAngle(): number {
    return this.needleAngle;
  }

  public update(model: FlightHudModel, r: LeftColumnReadings): void {
    this.drawBall(model, r.time);
    this.drawTanks(model, r.time, r.dt);
    this.updateTwr(r);
    this.updateMass(r.mass, r.wetMass);
  }

  // --- Attitude ball -------------------------------------------------------

  private drawBall(model: FlightHudModel, time: number): void {
    const warn = model.tiltWarning;
    const tilt = Math.round(model.tiltDegrees);
    const blinkOff = warn === 'RED' && Math.floor(time / 250) % 2 === 1;
    const windStep = Math.round(model.wind.strength * 8) * model.wind.direction;
    const key = `${tilt}|${warn}|${blinkOff}|${windStep}|${model.timeOfDay}`;
    if (key === this.ballKey) return;
    this.ballKey = key;

    const g = this.ball;
    g.clear();
    const look = TIME_LOOKS[model.timeOfDay];
    const sky = look.sky;
    const ground = GROUND.map(c => tint(c, look.landTint));
    // The rocket stays upright in the ball, so the world turns the other way.
    const a = (tilt * Math.PI) / 180;
    const upX = Math.sin(a);
    const upY = -Math.cos(a);
    const r2 = BALL_R * BALL_R;
    for (let py = -BALL_R; py < BALL_R; py += CELL) {
      for (let px = -BALL_R; px < BALL_R; px += CELL) {
        const dx = px + CELL / 2;
        const dy = py + CELL / 2;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const above = dx * upX + dy * upY; // height over the horizon, px
        let color: number;
        if (Math.abs(above) < CELL / 2) color = 0xf4eee6;
        else if (above > 0) color = sky[Math.min(sky.length - 1, Math.floor((1 - above / BALL_R) * sky.length))];
        else color = ground[Math.min(ground.length - 1, Math.floor((-above / BALL_R) * ground.length))];
        if (d2 > (BALL_R - CELL) * (BALL_R - CELL)) color = blinkOff ? INK : RIM_COLOR[warn];
        g.fillStyle(color, 1);
        g.fillRect(CX + px, BALL_Y + py, CELL, CELL);
      }
    }
    this.drawRocketMarker(g);
    this.drawWindArrow(g, model);

    this.tiltText.setText(`${Math.abs(tilt)}°${tilt > 0 ? ' L' : tilt < 0 ? ' R' : ''}`).setColor(RIM_TEXT[warn]);
  }

  /** Fixed yellow pixel rocket in the middle of the ball. */
  private drawRocketMarker(g: Phaser.GameObjects.Graphics): void {
    const x = CX;
    const y = BALL_Y;
    g.fillStyle(INK, 1);
    g.fillRect(x - 5, y - 12, 10, 22);
    g.fillRect(x - 9, y + 2, 18, 10);
    g.fillRect(x - 3, y - 16, 6, 6);
    g.fillStyle(UI.gold, 1);
    g.fillRect(x - 3, y - 10, 6, 18);
    g.fillRect(x - 1, y - 14, 2, 4);
    g.fillRect(x - 7, y + 4, 4, 6);
    g.fillRect(x + 3, y + 4, 4, 6);
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(x - 3, y - 8, 2, 8);
  }

  /** Wind arrow riding the top edge of the ball: length by strength, pointing the way it blows. */
  private drawWindArrow(g: Phaser.GameObjects.Graphics, model: FlightHudModel): void {
    const y = BALL_Y - BALL_R - 10;
    const { direction, strength } = model.wind;
    if (direction === 0) {
      g.fillStyle(UI.sky, 0.8);
      g.fillRect(CX - 2, y - 2, 4, 4);
      return;
    }
    const len = Math.round(10 + strength * 44);
    const tip = CX + (direction * len) / 2;
    const tail = CX - (direction * len) / 2;
    g.fillStyle(INK, 1);
    g.fillRect(Math.min(tip, tail) - 1, y - 3, len + 2, 6);
    g.fillStyle(UI.sky, 1);
    g.fillRect(Math.min(tip, tail), y - 1, len, 2);
    // Pixel head: three stacked steps back from the tip.
    for (let i = 0; i < 3; i++) {
      const hx = tip - direction * (i * 2 + 2);
      g.fillRect(hx - 1, y - 1 - i * 2, 2, 2 + i * 4);
    }
  }

  // --- Fuel mini tanks -----------------------------------------------------

  private drawTanks(model: FlightHudModel, time: number, dt: number): void {
    const row = model.tanks.filter(t => t.attached);
    const live = new Set(row.map(t => t.id));

    // Tanks that dropped away (or vanished): pop them out of the row with a puff.
    for (const [id, slot] of this.slots) {
      if (live.has(id)) continue;
      this.puffs.push({ x: slot.x, y: TANK_TOP, w: this.tankWidth(this.slots.size), color: FUEL_KINDS[slot.tank.fuelKind].color, age: 0 });
      slot.badge.destroy();
      this.slots.delete(id);
    }

    const n = row.length;
    const tw = this.tankWidth(n);
    const rowW = n * tw + Math.max(0, n - 1) * TANK_GAP;
    const x0 = CX - rowW / 2;
    const ease = Math.min(1, Math.max(dt, 0.001) * 10);

    const g = this.tanksGfx;
    g.clear();
    row.forEach((tank, i) => {
      const target = x0 + i * (tw + TANK_GAP);
      let slot = this.slots.get(tank.id);
      if (!slot) {
        const badge = this.scene.add.text(0, 0, '', TEXT_STYLE(9)).setOrigin(0.5, 1);
        this.container.add(badge);
        slot = { tank, x: target, badge };
        this.slots.set(tank.id, slot);
      }
      slot.tank = tank;
      slot.x += (target - slot.x) * ease;
      this.drawTank(g, slot.x, TANK_TOP, tw, tank, time);
      slot.badge
        .setText(tank.count > 1 ? `×${tank.count}` : '')
        .setPosition(slot.x + tw / 2, TANK_TOP + TANK_H + 1);
    });

    // Puffs: the dropped tank falls and fades while a ring of smoke blocks spreads.
    this.puffs = this.puffs.filter(p => (p.age += Math.max(dt, 0.001)) < 0.6);
    for (const p of this.puffs) {
      const k = p.age / 0.6;
      const cx = p.x + p.w / 2;
      const cy = p.y + TANK_H / 2;
      g.fillStyle(p.color, 0.8 * (1 - k * 2));
      if (k < 0.5) g.fillRect(p.x, p.y + k * 30, p.w, TANK_H * (1 - k));
      g.fillStyle(0xf4eee6, 0.85 * (1 - k));
      const spread = 6 + k * 18;
      const size = Math.round(6 - k * 4);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        g.fillRect(Math.round(cx + Math.cos(ang) * spread - size / 2), Math.round(cy + Math.sin(ang) * spread - size / 2), size, size);
      }
    }

    const pct = model.totalFuelPercent;
    const low = pct < 15;
    this.fuelText
      .setText(`${pct}%`)
      .setColor(low ? UI.redText : pct < 35 ? UI.amberText : UI.text)
      .setAlpha(low && pct > 0 && Math.floor(time / 300) % 2 === 0 ? 0.5 : 1);
    // ×n badges sit under the tanks, so push the total down a line when grouped.
    this.fuelText.setY(TANK_TOP + TANK_H + (model.grouped ? 14 : 6));
  }

  private tankWidth(n: number): number {
    if (n <= 0) return TANK_MAX_W;
    return Math.max(6, Math.min(TANK_MAX_W, Math.floor((ROW_W - (n - 1) * TANK_GAP) / n)));
  }

  private drawTank(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, tank: HudTank, time: number): void {
    x = Math.round(x);
    const empty = tank.fraction <= 0.005;
    const color = empty ? EMPTY_TANK : FUEL_KINDS[tank.fuelKind].color;
    // Outline with stepped corners, then a dark well.
    g.fillStyle(INK, 1);
    g.fillRect(x + 2, y - 2, w - 4, TANK_H + 4);
    g.fillRect(x, y, w, TANK_H);
    g.fillStyle(empty ? EMPTY_TANK : 0x8a8398, 1);
    g.fillRect(x + 2, y, w - 4, TANK_H);
    g.fillRect(x, y + 2, w, TANK_H - 4);
    g.fillStyle(INK, 1);
    g.fillRect(x + 2, y + 2, w - 4, TANK_H - 4);
    // Cap.
    g.fillStyle(empty ? EMPTY_TANK : 0x8a8398, 1);
    g.fillRect(x + Math.round(w / 2) - 3, y - 4, 6, 2);
    if (empty) return;
    const inner = TANK_H - 4;
    const level = Math.round(inner * tank.fraction);
    const wobble = tank.fraction < 0.99 ? Math.round(Math.sin(time / 260 + x * 0.3)) : 0;
    const top = Math.max(y + 2, y + 2 + inner - level + wobble);
    g.fillStyle(color, 1);
    g.fillRect(x + 2, top, w - 4, y + TANK_H - 2 - top);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(x + 2, top, w - 4, 2);
    g.fillStyle(0xffffff, 0.18);
    g.fillRect(x + 4, y + 4, 2, TANK_H - 10);
  }

  // --- TWR dial ------------------------------------------------------------

  private updateTwr({ twr, throttleActive, time, dt }: LeftColumnReadings): void {
    const targetAngle = twrToNeedleAngle(twr, throttleActive);
    const safeDt = Math.min(Math.max(dt, 0.001), 0.1);
    // Spring-damped needle: eases towards the target angle.
    this.needleAngle += (targetAngle - this.needleAngle) * Math.min(1, safeDt * 10);
    this.needleSprite.setAngle(-70 + (this.needleAngle / 100) * 140);

    if (throttleActive && twr > 0) {
      if (isLowThrustAlert(twr, throttleActive)) {
        this.twrValueText.setColor(UI.redText).setAlpha(0.75 + Math.sin(time / 200) * 0.25).setText(`${twr.toFixed(1)}×\nLOW`);
      } else {
        this.twrValueText.setColor(UI.text).setAlpha(1).setText(`${twr.toFixed(1)}×`);
      }
    } else {
      this.twrValueText.setColor(UI.textMuted).setAlpha(1).setText('0.0×');
    }
  }

  // --- Mass ----------------------------------------------------------------

  private updateMass(mass: number, wetMass: number): void {
    const share = wetMass > 0 ? Phaser.Math.Clamp(mass / wetMass, 0, 1) : 0;
    const activeCount = Math.round(share * MASS_SEGMENTS);
    for (let i = 0; i < MASS_SEGMENTS; i++) {
      const key = i < activeCount ? GAME_ASSETS.UI_MASS.key : GAME_ASSETS.UI_MASS_EMPTY.key;
      if (this.massSprites[i].texture.key !== key) this.massSprites[i].setTexture(key);
    }
    this.massText.setText(`${Math.round(mass).toLocaleString()} kg`);
  }
}
