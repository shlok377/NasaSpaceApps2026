import Phaser from 'phaser';
import { FlightTelemetry } from '../../physics/FlightSim';
import { TEXT_STYLE } from '../../ui/theme';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
  fireball: boolean;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  age: number;
  life: number;
  maxRadius: number;
  color: number;
}

const POPUP_LIFE = 1.6;

/** Screen-space juice: explosions, shockwave rings, speed streaks, re-entry glow, score popups. */
export class Effects {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private readonly popupPool: Array<{ text: Phaser.GameObjects.Text; age: number; active: boolean }> = [];
  private readonly streaks = Array.from({ length: 36 }, () => ({ x: Math.random() * 1280, y: Math.random() * 720, len: 30 + Math.random() * 70 }));

  constructor(scene: Phaser.Scene, maxPopups = 16) {
    this.gfx = scene.add.graphics();
    for (let i = 0; i < maxPopups; i++) {
      const text = scene.add.text(0, 0, '', TEXT_STYLE(18, '#ffffff'))
        .setOrigin(0.5)
        .setDepth(50)
        .setVisible(false);
      this.popupPool.push({ text, age: 0, active: false });
    }
  }

  public explode(x: number, y: number): void {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 10 + Math.random() * 50;
      this.sparks.push({ x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.7 + Math.random() * 0.8, color: Phaser.Utils.Array.GetRandom([0xffe066, 0xff7b1c, 0xef4444]), fireball: true, size: 14 + Math.random() * 18 });
    }
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 320;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, age: 0, life: 0.6 + Math.random() * 1.4, color: Phaser.Utils.Array.GetRandom([0xffe066, 0xff7b1c, 0xef4444, 0xffffff, 0x64748b]), fireball: false, size: 3 + Math.random() * 5 });
    }
  }

  /** A little burst of coloured confetti (pickups). */
  public burst(x: number, y: number, color: number): void {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 140;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.4 + Math.random() * 0.3, color, fireball: false, size: 3 + Math.random() * 3 });
    }
  }

  public ring(x: number, y: number, color: number, maxRadius: number, life: number): void {
    this.rings.push({ x, y, age: 0, life, maxRadius, color });
  }

  public popup(x: number, y: number, label: string, color: string, size = 18): void {
    let target = this.popupPool.find(p => !p.active);
    if (!target) {
      let oldestAge = -1;
      let oldestIdx = 0;
      for (let i = 0; i < this.popupPool.length; i++) {
        if (this.popupPool[i].age > oldestAge) {
          oldestAge = this.popupPool[i].age;
          oldestIdx = i;
        }
      }
      target = this.popupPool[oldestIdx];
    }

    let activeCount = 0;
    for (let i = 0; i < this.popupPool.length; i++) {
      if (this.popupPool[i].active) activeCount++;
    }
    const offset = activeCount * 24;

    target.active = true;
    target.age = 0;
    target.text.setText(label);
    target.text.setColor(color);
    target.text.setFontSize(`${size}px`);
    target.text.setPosition(x, y - offset);
    target.text.setAlpha(1);
    target.text.setVisible(true);
  }

  public update(realDt: number, t: FlightTelemetry, cruising: boolean): void {
    if (t.speed > 1 || cruising) {
      const dirX = t.speed > 1 ? t.horizontalSpeed / t.speed : 0;
      const dirY = t.speed > 1 ? -t.verticalSpeed / t.speed : -1;
      const px = (cruising ? 900 : Math.min(t.speed * 2, 2400)) * realDt;
      for (const st of this.streaks) {
        st.x -= dirX * px;
        st.y -= dirY * px;
        if (st.x < -100) st.x += 1480;
        if (st.x > 1380) st.x -= 1480;
        if (st.y < -100) st.y += 920;
        if (st.y > 820) st.y -= 920;
      }
    }

    let writeSparks = 0;
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i];
      if (!sp.fireball) sp.vy += 220 * realDt;
      sp.x += sp.vx * realDt;
      sp.y += sp.vy * realDt;
      sp.age += realDt;
      if (sp.age < sp.life) {
        if (writeSparks !== i) this.sparks[writeSparks] = sp;
        writeSparks++;
      }
    }
    this.sparks.length = writeSparks;

    let writeRings = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.age += realDt;
      if (r.age < r.life) {
        if (writeRings !== i) this.rings[writeRings] = r;
        writeRings++;
      }
    }
    this.rings.length = writeRings;

    for (let i = 0; i < this.popupPool.length; i++) {
      const p = this.popupPool[i];
      if (!p.active) continue;
      p.age += realDt;
      p.text.y -= 45 * realDt;
      p.text.setAlpha(Math.min(1, 2 * (1 - p.age / POPUP_LIFE)));
      if (p.age >= POPUP_LIFE) {
        p.active = false;
        p.text.setVisible(false);
      }
    }
  }

  public draw(t: FlightTelemetry, rocket: { x: number; y: number }, alive: boolean, cruising: boolean): void {
    const g = this.gfx;
    g.clear();
    const airiness = Math.sqrt(t.airDensity / 1.225);
    const dirX = t.speed > 1 ? t.horizontalSpeed / t.speed : 0;
    const dirY = t.speed > 1 ? -t.verticalSpeed / t.speed : -1;

    // Speed streaks: wind rushing past in the air, starlight streaming in a cruise.
    const streakAlpha = cruising ? 0.22 : Phaser.Math.Clamp(airiness * ((t.speed - 120) / 500), 0, 0.45);
    if (streakAlpha > 0.01 && alive) {
      g.lineStyle(2, 0xffffff, streakAlpha);
      for (const st of this.streaks) g.lineBetween(st.x, st.y, st.x + dirX * st.len, st.y + dirY * st.len);
    }

    // Re-entry glow ahead of a fast, falling rocket.
    const heat = t.verticalSpeed < 0 ? (t.airDensity * t.speed ** 3) / 3e7 : 0;
    if (heat > 0.05 && alive) {
      const glow = Math.min(1, heat);
      for (const [offset, radius, color, alpha] of [
        [28, 46, 0xef4444, 0.35],
        [20, 32, 0xff7b1c, 0.5],
        [12, 20, 0xffe066, 0.6]
      ] as const) {
        g.fillStyle(color, alpha * glow);
        g.fillCircle(rocket.x + dirX * offset, rocket.y + dirY * offset, radius * (0.8 + 0.4 * glow));
      }
    }

    for (const r of this.rings) {
      const k = r.age / r.life;
      g.lineStyle(4 * (1 - k) + 1, r.color, 1 - k);
      g.strokeCircle(r.x, r.y, 20 + r.maxRadius * k);
    }
    for (const sp of this.sparks) {
      const k = sp.age / sp.life;
      if (sp.fireball) {
        g.fillStyle(sp.color, 0.8 * (1 - k));
        g.fillCircle(sp.x, sp.y, sp.size * (1 + 2.5 * k));
      } else {
        const size = sp.size * (1 - k);
        g.fillStyle(sp.color, 1 - k);
        g.fillRect(sp.x - size / 2, sp.y - size / 2, size, size);
      }
    }
  }
}
