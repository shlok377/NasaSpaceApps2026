import { FlightEvent, FlightSim, FlightTelemetry } from '../physics/FlightSim';

/** Something the player earned points (and sometimes cash) for. */
export interface Award {
  id: 'FLIP' | 'BUTTER_LANDING' | 'BOUNCE' | 'NEAR_MISS' | 'PICKUP_FUEL' | 'SHIELD' | 'MILESTONE' | 'STAGE' | 'BULLSEYE' | 'MISSION';
  label: string;
  points: number;
}

const MAX_FLIPS = 5;

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Watches the flight and hands out points for the fun moments. */
export class StuntTracker {
  public total = 0;
  public readonly awards: Award[] = [];
  private lastTheta: number | null = null;
  private spin = 0;
  private flips = 0;

  public record(award: Award): void {
    this.awards.push(award);
    this.total += award.points;
  }

  public update(sim: FlightSim, t: FlightTelemetry, events: FlightEvent[]): Award[] {
    const out: Award[] = [];
    const give = (a: Award) => {
      out.push(a);
      this.record(a);
    };
    const s = sim.state;
    const airborne = sim.phase === 'FLYING' && !sim.onGround && t.altitude > 20;
    if (this.lastTheta !== null && airborne) {
      this.spin += wrapAngle(s.theta - this.lastTheta);
      if (Math.abs(this.spin) >= Math.PI * 2) {
        this.spin -= Math.sign(this.spin) * Math.PI * 2;
        if (this.flips < MAX_FLIPS) {
          this.flips++;
          give({ id: 'FLIP', label: this.flips > 1 ? `FLIP ×${this.flips}` : 'FLIP', points: 200 });
        }
      }
    } else if (!airborne) {
      this.spin = 0;
    }
    this.lastTheta = s.theta;

    for (const e of events) {
      if (e.kind === 'STAGE') give({ id: 'STAGE', label: 'STAGING', points: 100 });
      if (e.kind === 'BOUNCE') give({ id: 'BOUNCE', label: 'BOING', points: 25 });
      if (e.kind === 'LANDED' && sim.stats.impactSpeed < 3) give({ id: 'BUTTER_LANDING', label: 'BUTTER LANDING', points: 500 });
    }
    return out;
  }
}
