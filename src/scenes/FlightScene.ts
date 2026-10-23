import Phaser from 'phaser';
import { CONFIG } from '../config';
import { HierarchicalRocketNode, PartType } from '../core/types';
import { currentMission, Mission, MissionContext, newlyCompleted, rocketCost } from '../game/missions';
import {
  ActiveProblem,
  Checkpoint,
  onImpactCourse,
  PHASE_INFO,
  PhaseEvent,
  PhaseId,
  PhaseRunner,
  predictRoverLanding,
  PROBLEM_INFO
} from '../game/phases';
import { cashFromAwards, flightEarnings, FlightEarnings, loadProgress, PlayerProgress, saveProgress } from '../game/progress';
import { checkBelt, Combo, generateBelt, generateLaneWaves, Rock } from '../game/rocks';
import { createEvasiveRunnerState, EvasiveRunnerState, updateEvasiveRunner, RUNNER_CONFIG } from '../game/evasiveRunner';
import { Award, StuntTracker } from '../game/stunts';
import { moonSoiAltitude } from '../physics/bodies';
import { ENGINE, FINS, G0, LIMITS, ROCK_BELT, WORLD } from '../physics/constants';
import { ControlInput, FlightEvent, FlightSim, FlightTelemetry } from '../physics/FlightSim';
import { evaluateMission, MAX_STARS, MissionResult } from '../physics/mission';
import { analyzeVehicle, buildFlightVehicle, FlightVehicle, VehicleReport } from '../physics/vehicle';
import { Altimeter } from '../ui/Altimeter';
import { CoinCounter } from '../ui/CoinCounter';
import { FuelTank } from '../ui/FuelTank';
import { JourneyArc, Milestone } from '../ui/JourneyArc';
import { LaunchButton } from '../ui/LaunchButton';
import { OrbitGauge, PhaseStrip, ProblemCard } from '../ui/PhaseHud';
import { formatDistance, TEXT_STYLE, UI } from '../ui/theme';
import { preloadGameAssets } from '../core/assets';
import { Effects } from './flight/Effects';
import { CameraMode, MissionOverlay, WorldRenderer, WORLD_COLORS } from './flight/WorldRenderer';

export interface FlightSceneData {
  tree: HierarchicalRocketNode;
}

const GAME_SPEED = CONFIG.gameSpeed;
const COUNTDOWN_SECONDS = 3;
const THROTTLE_RATE = 0.9; // per second while a throttle key is held
/** How often the "coast" apex prediction is refreshed (ms). */
const APEX_INTERVAL_MS = 200;

type Keys = Record<
  'W' | 'S' | 'SHIFT' | 'CTRL' | 'Z' | 'X' | 'A' | 'D' | 'E' | 'F' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'SPACE' | 'ENTER' | 'ESC' | 'R' | 'B',
  Phaser.Input.Keyboard.Key
>;

/** Height where the Moon's pull takes over, straight below it: the end of the climb. */
const SOI_ALTITUDE = moonSoiAltitude();
const MILESTONES: Milestone[] = [
  { label: 'Clouds', at: 1_500 / SOI_ALTITUDE },
  { label: 'Space', at: WORLD.atmosphereTop / SOI_ALTITUDE }
];

const AWARD_COLORS: Partial<Record<Award['id'], string>> = {
  NEAR_MISS: '#f0abfc',
  PICKUP_FUEL: UI.greenText,
  SHIELD: '#67e8f9',
  MILESTONE: UI.goldText,
  STAGE: '#7dd3fc',
  BULLSEYE: UI.goldText,
  MISSION: UI.greenText
};

/** A checkpoint plus the scene-side bits needed to rewind. */
interface SceneCheckpoint extends Checkpoint {
  landedRovers: number[];
  sparesLeft: number;
  solved: number;
  failedProblems: number;
}

function flattenTypes(node: HierarchicalRocketNode): PartType[] {
  return [node.type, ...node.children.flatMap(flattenTypes)];
}

/**
 * Quick headless test flight before launch: lean a touch so the path passes
 * beside the Moon, cut the engines once a coast gets there, and see how much
 * push is left when the Moon's pull takes over.
 */
function dryRun(vehicle: FlightVehicle): { maxAltitude: number; reachesMoon: boolean; deltaVLeft: number; tips: boolean; finsDropped: boolean } {
  const sim = new FlightSim(vehicle);
  sim.launch();
  const lean = -0.12;
  let throttle = 1;
  let tips = false;
  let finsDropped = false;
  for (let i = 0; i < 120 * 200 && !sim.isFinished && !sim.stats.reachedMoonSoi; i++) {
    const t = sim.getTelemetry();
    if (Math.abs(t.pitchFromVertical - lean) > 0.7 && t.body === 'EARTH') {
      // Tipping with the whole rocket is a balance problem; after staging, the boosters took the fins.
      if (sim.vehicle.finStable || !vehicle.finStable) tips = true;
      else finsDropped = true;
    }
    if (throttle > 0 && i % 24 === 0 && sim.predictApex(true).reachesMoon) throttle = 0;
    const steer = Phaser.Math.Clamp((lean - t.pitchFromVertical) * 4 - sim.state.omega * 2, -1, 1);
    sim.step(1 / 120, { throttle, steer });
  }
  const mass = sim.vehicle.dryMass + sim.fuel;
  const deltaVLeft = sim.fuel > 0 && sim.vehicle.engineCount > 0 ? ENGINE.isp * G0 * Math.log(mass / sim.vehicle.dryMass) : 0;
  return { maxAltitude: sim.stats.maxAltitude, reachesMoon: sim.stats.reachedMoonSoi, deltaVLeft, tips, finsDropped };
}

export class FlightScene extends Phaser.Scene {
  private tree!: HierarchicalRocketNode;
  private vehicle!: FlightVehicle;
  private report!: VehicleReport;
  private sim!: FlightSim;
  private runner!: PhaseRunner;
  private keys!: Keys;
  private cost = 0;

  private world!: WorldRenderer;
  private fx!: Effects;

  // HUD
  private phaseStrip!: PhaseStrip;
  private orbitGauge!: OrbitGauge;
  private problemCard!: ProblemCard;
  private journey!: JourneyArc;
  private altimeter!: Altimeter;
  private fuelTank!: FuelTank;
  private coins!: CoinCounter;
  private launchButton!: LaunchButton;
  private missionText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private phaseTitle!: Phaser.GameObjects.Text;
  private phaseGoal!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private readoutText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private warpText!: Phaser.GameObjects.Text;
  private endButton!: Phaser.GameObjects.Text;
  private resultPanel: Phaser.GameObjects.Container | null = null;

  // Flight state
  private throttle = 1;
  private countdown: number | null = null;
  private launched = false;
  private exploded = false;
  private finishedAt: number | null = null;
  private result: MissionResult | null = null;
  private earnings: FlightEarnings | null = null;
  private completedNow: Mission[] = [];
  private bannerQueue: Array<{ text: string; color: string }> = [];
  private bannerTimer = 0;
  private wobbleWarnedAt = -Infinity;
  private coastApex: number | null = null;
  private apexAt = -Infinity;
  private lastVersion = 0;
  private repairPressed = false;
  private timeScale = 1;
  private titleTimer = 0;

  // Mission layer
  private progress!: PlayerProgress;
  /** Progress as it was before the end-of-flight payout (restored on a checkpoint retry). */
  private progressBeforeFinish: PlayerProgress | null = null;
  private checkpoint: SceneCheckpoint | null = null;
  private landedRovers: number[] = [];
  private phasePaid = 0;
  private mission: Mission | null = null;
  private stunts = new StuntTracker();
  private rocks: Rock[] = [];
  private combo = new Combo();
  private shield = false;
  private passed: boolean[] = [];
  private dropMarker: { x: number; y: number } | null = null;
  private impactMarker: { x: number; y: number } | null = null;
  private markerAt = -Infinity;
  public runnerState: EvasiveRunnerState = createEvasiveRunnerState();
  private spacePressedThisFrame = false;
  private laneSteerInput = 0;
  private runnerEntryVy = 0;

  constructor() {
    super('FlightScene');
  }

  init(data: FlightSceneData): void {
    this.tree = data.tree;
    this.throttle = 1;
    this.countdown = null;
    this.launched = false;
    this.exploded = false;
    this.finishedAt = null;
    this.result = null;
    this.earnings = null;
    this.completedNow = [];
    this.resultPanel = null;
    this.bannerQueue = [];
    this.bannerTimer = 0;
    this.wobbleWarnedAt = -Infinity;
    this.coastApex = null;
    this.apexAt = -Infinity;
    this.lastVersion = 0;
    this.repairPressed = false;
    this.timeScale = 1;
    this.titleTimer = 0;
    this.runnerState = createEvasiveRunnerState();
    this.spacePressedThisFrame = false;
    this.laneSteerInput = 0;
    this.runnerEntryVy = 0;
    this.progress = loadProgress();
    this.progressBeforeFinish = null;
    this.checkpoint = null;
    this.landedRovers = [];
    this.phasePaid = 0;
    this.mission = currentMission(this.progress.completedMissions);
    this.stunts = new StuntTracker();
    this.rocks = generateBelt(Math.floor(Math.random() * 1e9));
    this.combo = new Combo();
    this.shield = false;
    this.passed = MILESTONES.map(() => false);
    this.dropMarker = null;
    this.impactMarker = null;
    this.markerAt = -Infinity;
  }

  preload(): void {
    preloadGameAssets(this);
  }

  create(): void {
    this.vehicle = buildFlightVehicle(this.tree);
    this.report = analyzeVehicle(this.vehicle);
    this.sim = new FlightSim(this.vehicle);
    this.runner = new PhaseRunner();
    this.runner.drainEvents();
    this.cost = rocketCost(flattenTypes(this.tree));
    this.exposeForDebug();
    if (this.game.canvas) this.game.canvas.style.cursor = 'default';

    this.world = new WorldRenderer(this);
    this.world.updateCamera(this.sim, this.sim.getTelemetry(), 0, 'ASCENT');
    this.fx = new Effects(this);
    this.createHud();
    this.setupInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllKeys(true));
  }

  private exposeForDebug(): void {
    const w = window as unknown as { __FLIGHT_SIM__: FlightSim; __PHASES__: PhaseRunner };
    w.__FLIGHT_SIM__ = this.sim;
    w.__PHASES__ = this.runner;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private createHud(): void {
    this.phaseStrip = new PhaseStrip(this);
    this.journey = new JourneyArc(this, 690, MILESTONES);
    this.orbitGauge = new OrbitGauge(this);
    this.problemCard = new ProblemCard(this);
    this.altimeter = new Altimeter(
      this,
      1230,
      150,
      380,
      SOI_ALTITUDE,
      [
        { label: 'Clouds', height: 1_500 },
        { label: 'SPACE', height: WORLD.atmosphereTop },
        { label: 'MOON', height: SOI_ALTITUDE }
      ],
      { from: ROCK_BELT.bottom, to: ROCK_BELT.top, label: 'rocks' }
    );
    this.fuelTank = new FuelTank(this, 38, 560);
    this.coins = new CoinCounter(this, 1264, 34);

    const [verdict, color] = this.verdict();
    const affordable = this.progress.money >= this.cost;
    this.launchButton = new LaunchButton(this, 640, 600, verdict, color, affordable ? `Launch cost $${this.cost}  ·  SPACE` : `Costs $${this.cost}, you have $${this.progress.money}`, () =>
      this.startCountdown()
    );
    this.missionText = this.add
      .text(640, 168, this.mission ? `MISSION: ${this.mission.title}: ${this.mission.goal}  (+$${this.mission.reward})` : 'All missions done: fly for the high score!', TEXT_STYLE(15, UI.goldText))
      .setOrigin(0.5);
    this.hintText = this.add.text(640, 694, '', TEXT_STYLE(14)).setOrigin(0.5).setDepth(20);
    this.bannerText = this.add.text(640, 236, '', TEXT_STYLE(20, '#ffffff')).setOrigin(0.5, 0).setAlpha(0).setDepth(20);
    this.phaseTitle = this.add.text(640, 300, '', TEXT_STYLE(44, '#ffffff')).setOrigin(0.5).setAlpha(0).setDepth(30);
    this.phaseGoal = this.add.text(640, 344, '', TEXT_STYLE(16, UI.text)).setOrigin(0.5, 0).setAlpha(0).setDepth(30).setAlign('center').setWordWrapWidth(640);
    this.countdownText = this.add.text(640, 320, '', TEXT_STYLE(96, '#ffffff')).setOrigin(0.5).setVisible(false);
    this.readoutText = this.add.text(0, 0, '', TEXT_STYLE(15)).setOrigin(0, 0.5).setVisible(false).setDepth(10);
    this.comboText = this.add.text(640, 128, '', TEXT_STYLE(18, '#f0abfc')).setOrigin(0.5).setVisible(false);
    this.warpText = this.add.text(1250, 80, '', TEXT_STYLE(14, '#93c5fd')).setOrigin(1, 0.5).setDepth(20);
    this.endButton = this.add.text(1250, 694, '■ End flight', TEXT_STYLE(13, UI.textMuted)).setOrigin(1, 0.5).setInteractive({ useHandCursor: true }).setVisible(false);
    this.endButton.on('pointerdown', () => {
      if (!this.result && this.launched) this.finishMission();
    });
  }

  /** What the rocket can do, in plain words, from a quick headless test flight. */
  private verdict(): [string, string] {
    const r = this.report;
    if (r.liftoffTwr < 1) return ['Too heavy to lift off: add engines', '#f87171'];
    const run = dryRun(this.vehicle);
    const warn = !r.finStable ? `  ·  needs ${FINS.minimumForStability} fins` : run.tips ? '  ·  unbalanced, will tip' : run.finsDropped ? '  ·  fins drop off with the boosters' : '';
    const v = CONFIG.launchVerdict;
    if (run.reachesMoon) {
      if (run.deltaVLeft >= v.allPhases) return [`Fuel for all 3 phases${warn}`, UI.greenText];
      if (run.deltaVLeft >= v.orbitAndRover) return [`Reaches the Moon: fuel for orbit + rover, tight for landing${warn}`, '#a3e635'];
      if (run.deltaVLeft >= v.orbitOnly) return [`Reaches the Moon: fuel for orbit only${warn}`, '#fbbf24'];
      return [`Barely reaches the Moon: add fuel to orbit it${warn}`, '#fbbf24'];
    }
    if (run.maxAltitude >= WORLD.atmosphereTop) return [`Reaches space (~${formatDistance(run.maxAltitude)}): add fuel for the Moon${warn}`, '#7dd3fc'];
    return [`Reaches ~${formatDistance(run.maxAltitude)}${warn}`, '#fbbf24'];
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private setupInput(): void {
    this.keys = this.input.keyboard!.addKeys('W,S,SHIFT,CTRL,Z,X,A,D,E,F,LEFT,RIGHT,UP,DOWN,SPACE,ENTER,ESC,R,B') as Keys;
    this.keys.SPACE.on('down', () => {
      if (this.sim.phase === 'PRELAUNCH') this.startCountdown();
      else if (this.runnerState.promptActive) this.spacePressedThisFrame = true;
      else if (this.runner.dropRover(this.sim)) this.fx.ring(this.world.rocketScreen(this.sim).x, this.world.rocketScreen(this.sim).y, WORLD_COLORS.rover, 50, 0.5);
    });
    const onLeftDown = () => { if (this.runnerState.active) this.laneSteerInput = -1; };
    const onRightDown = () => { if (this.runnerState.active) this.laneSteerInput = 1; };
    this.keys.A.on('down', onLeftDown);
    this.keys.LEFT.on('down', onLeftDown);
    this.keys.D.on('down', onRightDown);
    this.keys.RIGHT.on('down', onRightDown);
    this.keys.F.on('down', () => (this.repairPressed = true));
    this.keys.Z.on('down', () => (this.throttle = 1));
    this.keys.X.on('down', () => (this.throttle = 0));
    this.keys.ENTER.on('down', () => {
      if (!this.result && this.launched) this.finishMission();
    });
    this.keys.ESC.on('down', () => this.returnToBuilder());
    this.keys.B.on('down', () => {
      if (this.result) this.returnToBuilder();
    });
    this.keys.R.on('down', () => {
      if (!this.result) return;
      if (this.canRetryPhase) this.retryFromCheckpoint();
      else this.scene.restart({ tree: this.tree });
    });
  }

  private startCountdown(): void {
    if (this.sim.phase !== 'PRELAUNCH' || this.countdown !== null) return;
    if (this.progress.money < this.cost) {
      this.showBanner(`Not enough money: this rocket costs $${this.cost}. Build a cheaper one (ESC).`, '#fca5a5');
      return;
    }
    // Pay for the rocket.
    this.progress = { ...this.progress, money: this.progress.money - this.cost };
    saveProgress(this.progress);
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownText.setVisible(true);
  }

  private steerKey(): number {
    const k = this.keys;
    return (k.A.isDown || k.LEFT.isDown ? 1 : 0) - (k.D.isDown || k.RIGHT.isDown ? 1 : 0);
  }

  private currentInput(_t: FlightTelemetry): ControlInput {
    const steer = this.runnerState.active ? 0 : this.steerKey();
    return { throttle: this.throttle, steer };
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    let t = this.sim.getTelemetry();

    if (!this.result) {
      const ev = updateEvasiveRunner(
        this.runnerState,
        t.earthAltitude,
        dt,
        this.spacePressedThisFrame,
        this.laneSteerInput,
        this.sim.state.x
      );
      this.spacePressedThisFrame = false;
      this.laneSteerInput = 0;

      if (ev.promptTriggered) {
        this.showBanner(`DEBRIS FIELD AHEAD: PRESS [SPACE] TO ENGAGE EVASIVE RUNNER (${Math.ceil(this.runnerState.promptTimer)}s)`, '#38bdf8');
      }
      if (ev.engaged) {
        this.runnerEntryVy = Math.max(this.sim.state.vy, RUNNER_CONFIG.cruiseSpeed ?? 45);
        this.rocks = generateLaneWaves(Math.floor(Math.random() * 1e9));
        const p = this.world.rocketScreen(this.sim);
        this.fx.ring(p.x, p.y, WORLD_COLORS.shield, 180, 0.6);
        this.showBanner('EVASIVE RUNNER ENGAGED // TIME DILATION 35%', '#22d3ee');
      }
      if (ev.cleared) {
        this.showBanner('DEBRIS CLEARED // FULL THRUST RESTORED', '#34d399');
        if (this.runnerEntryVy > this.sim.state.vy) {
          this.sim.state.vy = this.runnerEntryVy;
        }
      }

      this.readThrottle(dt);
      this.tickCountdown(dt);
      this.timeScale = this.runnerState.active ? RUNNER_CONFIG.timeScale : this.runner.timeScale(this.sim);
      const gameDt = dt * GAME_SPEED * this.timeScale;
      this.sim.advance(gameDt, this.currentInput(t));

      if (this.runnerState.active) {
        this.sim.state.x = this.runnerState.currentX;
        this.sim.state.vx = 0;
        this.sim.state.omega = 0;
        this.sim.state.theta = Math.PI / 2 + this.runnerState.tilt;
        // Govern vertical velocity to cruise speed so obstacle descent is humanly readable
        const targetVy = RUNNER_CONFIG.cruiseSpeed ?? 45;
        this.sim.state.vy += (targetVy - this.sim.state.vy) * (1 - Math.exp(-dt * 6));
      }

      if (this.launched) this.runner.update(this.sim, gameDt, { repairPressed: this.repairPressed, relightHeld: this.keys.E.isDown });
      this.repairPressed = false;
      const events = this.sim.drainEvents();
      t = this.sim.getTelemetry();
      this.handleEvents(events);
      this.handlePhaseEvents(this.runner.drainEvents());
      for (const a of this.stunts.update(this.sim, t, events)) this.celebrate(a);
      if (this.world.camera.mode === 'ASCENT') {
        this.checkRocks();
        this.checkMilestones(t);
      }
      this.checkWobble(t);
      this.refreshApex();
      this.refreshMarkers();

      if ((this.sim.isFinished || this.runner.over) && this.finishedAt === null) {
        this.finishedAt = this.time.now;
        if (this.sim.phase === 'CRASHED' || this.runner.failure === 'Landed in the boulder field') {
          this.exploded = true;
          const p = this.world.rocketScreen(this.sim);
          this.fx.explode(p.x, p.y);
          this.cameras.main.shake(500, 0.012);
        }
      }
      if (this.finishedAt !== null && this.time.now - this.finishedAt > 2200) this.finishMission();
    }

    if (this.sim.version !== this.lastVersion) {
      this.lastVersion = this.sim.version;
      this.cameras.main.shake(180, 0.006);
    }

    this.world.updateCamera(this.sim, t, dt, this.chooseCameraMode(t), this.runnerState.active);
    this.world.updateSmoke(dt * GAME_SPEED * this.timeScale, this.sim, t, !this.exploded, this.runnerState);
    this.world.render(this.sim, t, this.rocks, !this.exploded, this.shield, this.overlay(), this.runnerState);
    this.fx.update(dt, t, false);
    this.fx.draw(t, this.world.rocketScreen(this.sim), !this.exploded, false);
    this.updateHud(t, dt);

    if (t.thrust > 0 && t.earthAltitude < 60 && !this.cameras.main.shakeEffect.isRunning) {
      this.cameras.main.shake(120, 0.003 * t.throttle);
    }
  }

  /** Fixed views: the climb at launch scale, the orbit map, then landing close-ups. Changes are cuts. */
  private chooseCameraMode(t: FlightTelemetry): CameraMode {
    if (!t.moonOrbit) return 'ASCENT';
    const cam = CONFIG.camera;
    const current = this.world.camera.mode;
    const st = this.sim.stats;
    const comingDown = onImpactCourse(t) || st.landedOn === 'MOON' || st.crashedOn === 'MOON';
    if (comingDown) {
      const alt = t.moonAltitude;
      if (alt < cam.touchdownViewBelow || (current === 'TOUCHDOWN' && alt < cam.touchdownViewBelow + 15)) return 'TOUCHDOWN';
      if (alt < cam.descentViewBelow || (current === 'DESCENT' && alt < cam.descentViewBelow + 60)) return 'DESCENT';
    }
    return 'ORBIT';
  }

  private overlay(): MissionOverlay {
    const r = this.runner;
    const landing = r.phase === 'LANDING' || (r.complete && r.phasesDone >= 3);
    const problem = r.problem;
    return {
      roverZone: r.phase === 'ROVER' || this.landedRovers.length > 0,
      site: landing ? r.site : null,
      boulders: r.bouldersSeen,
      rover: r.rover,
      landedRovers: this.landedRovers,
      dropMarker: this.dropMarker,
      debrisRing: problem?.id === 'DEBRIS' ? problem.data.ringRadius : null,
      impactMarker: this.impactMarker
    };
  }

  /** Where the rover / the rocket would come down (refreshed a few times a second). */
  private refreshMarkers(): void {
    if (this.time.now - this.markerAt < 100) return;
    this.markerAt = this.time.now;
    const r = this.runner;
    const flying = this.sim.phase === 'FLYING' && !r.over;
    this.dropMarker = flying && r.phase === 'ROVER' && r.dropReady && !r.rover ? predictRoverLanding(this.sim) : null;
    this.impactMarker = flying && r.phase === 'LANDING' && this.world.camera.mode === 'ORBIT' ? this.sim.predictMoonImpact() : null;
  }

  private readThrottle(dt: number): void {
    const k = this.keys;
    if (k.W.isDown || k.SHIFT.isDown || k.UP.isDown) this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt);
    if (k.S.isDown || k.CTRL.isDown || k.DOWN.isDown) this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt);
  }

  private tickCountdown(dt: number): void {
    if (this.countdown === null) return;
    this.countdown -= dt;
    if (this.countdown > 0) {
      this.countdownText.setText(`${Math.ceil(this.countdown)}`);
      return;
    }
    this.countdown = null;
    this.launched = true;
    this.countdownText.setText('GO!');
    this.tweens.add({ targets: this.countdownText, alpha: 0, delay: 500, duration: 400, onComplete: () => this.countdownText.setVisible(false) });
    this.sim.launch();
    this.time.delayedCall(1000, () => this.showPhaseTitle('ORBIT'));
  }

  private refreshApex(): void {
    if (this.sim.phase !== 'FLYING' || this.sim.onGround || this.sim.getTelemetry().body === 'MOON') {
      this.coastApex = null;
      return;
    }
    if (this.time.now - this.apexAt < APEX_INTERVAL_MS) return;
    this.apexAt = this.time.now;
    const p = this.sim.predictApex(true);
    this.coastApex = p.reachesMoon ? SOI_ALTITUDE : p.altitude;
  }

  private handleEvents(events: FlightEvent[]): void {
    for (const e of events) {
      if (e.kind === 'LIFTOFF') this.cameras.main.shake(600, 0.008);
      if (e.kind === 'BOUNCE' || e.kind === 'PART_LOST') this.cameras.main.shake(300, 0.012);
      if (e.kind === 'MOON_SOI') {
        this.showBanner('In the Moon’s pull! Burn sideways to swing into orbit', UI.greenText);
        continue;
      }
      if (e.kind === 'LANDED' || e.kind === 'CRASH') continue; // the phase runner reports these
      this.showBanner(e.message);
    }
  }

  private handlePhaseEvents(events: PhaseEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'PHASE_START':
          this.saveCheckpoint(e.phase);
          this.showPhaseTitle(e.phase);
          break;
        case 'PHASE_DONE': {
          const reward = CONFIG.economy.phaseRewards[e.phase];
          this.progress = { ...this.progress, money: this.progress.money + reward };
          this.phasePaid += reward;
          saveProgress(this.progress);
          const at = this.world.rocketScreen(this.sim);
          this.fx.popup(at.x, at.y - 80, `PHASE ${PHASE_INFO[e.phase].number} COMPLETE  +$${reward}`, UI.greenText, 24);
          this.fx.ring(at.x, at.y, 0x4ade80, 220, 0.9);
          break;
        }
        case 'PROBLEM_START':
          this.cameras.main.shake(350, 0.01);
          this.cameras.main.flash(180, 120, 20, 20);
          break;
        case 'PROBLEM_END':
          this.showBanner(e.problem.message ?? '', e.problem.status === 'SOLVED' ? UI.greenText : '#fca5a5');
          if (e.problem.status === 'SOLVED') this.stunts.record({ id: 'MISSION', label: 'FIXED', points: 300 });
          break;
        case 'DROP_READY':
          this.showBanner('Rover ready! Press SPACE when the yellow ✕ sits in the green zone', UI.goldText);
          break;
        case 'ROVER_RELEASED':
          this.showBanner('Rover away!', UI.goldText);
          break;
        case 'ROVER_LANDED':
          if (e.angle !== null) this.landedRovers.push(e.angle);
          this.showBanner(
            e.inZone ? 'The rover bounced down in the zone!' : e.sparesLeft > 0 ? 'Missed the zone! One spare rover left: wait for the next pass' : 'Missed the zone again…',
            e.inZone ? UI.greenText : '#fca5a5'
          );
          break;
        case 'SITE_MOVED':
          this.cameras.main.shake(300, 0.008);
          this.showBanner(`⚠ ${PROBLEM_INFO.BOULDERS.title}: ${PROBLEM_INFO.BOULDERS.howTo}`, '#fca5a5');
          break;
        case 'COMPLETE':
          if (e.onSite) this.celebrate({ id: 'BULLSEYE', label: 'ON THE SITE', points: 1_000 });
          this.showBanner(e.onSite ? 'The crew landed right on the site!' : 'The crew is down safely!', UI.greenText);
          break;
        case 'FAILED':
          this.showBanner(e.reason, '#fca5a5');
          break;
      }
    }
  }

  private saveCheckpoint(phase: PhaseId): void {
    this.checkpoint = {
      phase,
      phasesDone: this.runner.phasesDone,
      snapshot: this.sim.snapshot(),
      awardCount: this.stunts.awards.length,
      landedRovers: [...this.landedRovers],
      sparesLeft: this.runner.sparesLeft,
      solved: this.runner.solved,
      failedProblems: this.runner.failedProblems
    };
  }

  private get canRetryPhase(): boolean {
    return this.runner.failure !== null && this.checkpoint !== null && this.checkpoint.phase !== 'ORBIT';
  }

  /** Rewind to the start of the phase that failed. */
  private retryFromCheckpoint(): void {
    const cp = this.checkpoint;
    if (!cp) return;
    if (this.progressBeforeFinish) {
      this.progress = this.progressBeforeFinish;
      saveProgress(this.progress);
    }
    this.sim = FlightSim.restore(cp.snapshot);
    this.runner = new PhaseRunner(cp.phase, cp.phasesDone);
    this.runner.sparesLeft = cp.sparesLeft;
    // Problems that went wrong before the checkpoint still count.
    this.runner.solved = cp.solved;
    this.runner.failedProblems = cp.failedProblems;
    this.exposeForDebug();
    this.stunts.awards.length = cp.awardCount;
    this.stunts.total = this.stunts.awards.reduce((s, a) => s + a.points, 0);
    this.landedRovers = [...cp.landedRovers];
    this.result = null;
    this.earnings = null;
    this.completedNow = [];
    this.progressBeforeFinish = null;
    this.resultPanel?.destroy();
    this.resultPanel = null;
    this.finishedAt = null;
    this.exploded = false;
    this.throttle = 0;
    this.lastVersion = this.sim.version;
    this.bannerQueue = [];
    this.dropMarker = null;
    this.impactMarker = null;
    this.runnerState = createEvasiveRunnerState();
    this.spacePressedThisFrame = false;
    this.laneSteerInput = 0;
    this.runnerEntryVy = 0;
  }

  private showBanner(message: string, color = '#ffffff'): void {
    if (message) this.bannerQueue.push({ text: message, color });
  }

  private showPhaseTitle(phase: PhaseId): void {
    const info = PHASE_INFO[phase];
    this.phaseTitle.setText(`PHASE ${info.number} · ${info.title}`).setAlpha(1);
    this.phaseGoal.setText(info.goal).setAlpha(1);
    this.titleTimer = 3.2;
  }

  private checkMilestones(t: FlightTelemetry): void {
    MILESTONES.forEach((m, i) => {
      if (!this.passed[i] && t.earthAltitude >= m.at * SOI_ALTITUDE && this.sim.phase === 'FLYING') {
        this.passed[i] = true;
        this.celebrate({ id: 'MILESTONE', label: m.label.toUpperCase(), points: 150 });
      }
    });
  }

  /** Rocks knock parts off; close shaves build a combo; shields and fuel help. */
  private checkRocks(): void {
    if (this.sim.phase !== 'FLYING' || this.sim.state.y < ROCK_BELT.bottom - 50) return;
    const parts = this.world.partPointsAsDrawn(this.sim);
    const r = checkBelt(this.rocks, parts, this.sim.state.time, this.world.partRadiusMetres(), 1);
    const at = this.world.rocketScreen(this.sim);
    for (const hit of r.hits) {
      this.combo.reset();
      if (this.shield) {
        this.shield = false;
        this.fx.ring(at.x, at.y, WORLD_COLORS.shield, 160, 0.6);
        this.showBanner('Shield absorbed the hit!', '#67e8f9');
        continue;
      }
      this.fx.burst(at.x, at.y, WORLD_COLORS.rock);
      this.sim.hitPart(hit.partId);
    }
    for (const _ of r.nearMisses) {
      const n = this.combo.nearMiss(this.sim.state.time);
      this.celebrate({ id: 'NEAR_MISS', label: n > 1 ? `NEAR MISS ×${n}` : 'NEAR MISS', points: 100 * n });
    }
    for (const p of r.pickups) {
      if (p.kind === 'SHIELD') {
        this.shield = true;
        this.celebrate({ id: 'SHIELD', label: 'SHIELD', points: 50 });
      } else {
        const added = this.sim.refuel(this.vehicle.fuelCapacity * CONFIG.rockBelt.fuelCanRefill);
        this.celebrate({ id: 'PICKUP_FUEL', label: added > 0 ? `+${Math.round(added)} kg FUEL` : 'FUEL (full)', points: 50 });
      }
    }
  }

  private checkWobble(t: FlightTelemetry): void {
    if (this.vehicle.finStable || t.airDensity <= 0 || t.speed < 25 || this.sim.phase !== 'FLYING') return;
    if (Math.abs(t.angleOfAttack) < 0.35 || this.time.now - this.wobbleWarnedAt < 6000) return;
    this.wobbleWarnedAt = this.time.now;
    this.showBanner(`WOBBLE! Under ${FINS.minimumForStability} fins: steer against it`, '#fbbf24');
  }

  private celebrate(award: Award): void {
    if (!['FLIP', 'BUTTER_LANDING', 'BOUNCE', 'STAGE'].includes(award.id)) this.stunts.record(award);
    const at = this.world.rocketScreen(this.sim);
    this.fx.popup(at.x + 100, at.y - 50, award.points > 0 ? `+${award.points}  ${award.label}` : award.label, AWARD_COLORS[award.id] ?? '#f0abfc', 16);
    if (award.id === 'NEAR_MISS') this.fx.ring(at.x, at.y, 0xf0abfc, 70, 0.4);
  }

  // ---------------------------------------------------------------------------
  // HUD update
  // ---------------------------------------------------------------------------

  private updateHud(t: FlightTelemetry, dt: number): void {
    const now = this.time.now;
    const flying = this.sim.phase === 'FLYING' && !this.result && !this.runner.over;
    const mode = this.world.camera.mode;
    const r = this.runner;
    const best = Math.max(this.progress.bestHeight, this.sim.stats.maxAltitude);
    const onPad = this.sim.phase === 'PRELAUNCH' && this.countdown === null;

    this.phaseStrip.setVisible(!onPad);
    this.phaseStrip.update(r.phase, r.phasesDone, this.objective(t), now);

    const ascent = mode === 'ASCENT';
    this.journey.setVisible(ascent && !onPad);
    this.journey.update(
      {
        fraction: Phaser.Math.Clamp(t.earthAltitude / SOI_ALTITUDE, 0, 1),
        travelled: Math.max(0, Math.min(SOI_ALTITUDE, t.earthAltitude)),
        total: SOI_ALTITUDE,
        outbound: t.verticalSpeed >= 0,
        onCourse: this.coastApex !== null && this.coastApex >= SOI_ALTITUDE,
        passed: this.passed
      },
      now
    );
    this.altimeter.setVisible(ascent);
    this.altimeter.update(Math.max(0, t.earthAltitude), best, this.coastApex);
    this.orbitGauge.setVisible(mode === 'ORBIT' && !this.result);
    this.orbitGauge.update(t.moonOrbit, r.phase === 'ORBIT' ? r.stableFor / CONFIG.phases.orbit.holdSeconds : null, now);
    this.problemCard.update(flying ? (r.problem as ActiveProblem | null) : null, { periapsis: t.moonOrbit?.periapsisAltitude ?? null }, now);
    this.fuelTank.update(t.fuelFraction, t.mass, this.vehicle.wetMass, t.twr, t.throttle > 0, now, dt);
    this.coins.update(this.progress.money + (this.result ? 0 : cashFromAwards(this.stunts.awards)), dt);

    this.launchButton.setVisible(onPad);
    this.launchButton.update(now);
    this.missionText.setVisible(onPad);
    this.endButton.setVisible(flying && this.launched);
    this.warpText.setText(this.timeScale > 1 && flying ? `▶▶ ×${this.timeScale}` : '');

    const comboOn = this.combo.active(this.sim.state.time) && this.combo.count > 1;
    this.comboText.setVisible(comboOn && flying && ascent).setText(`COMBO ×${this.combo.count}`);

    this.hintText.setText(flying && this.launched ? this.hint(t) : '');

    // Speed + height next to the rocket, only when landing matters.
    const landing = flying && (mode === 'DESCENT' || mode === 'TOUCHDOWN' || (ascent && t.verticalSpeed < -5 && t.earthAltitude < 400 && this.launched));
    this.readoutText.setVisible(landing);
    if (landing) {
      const p = this.world.rocketScreen(this.sim);
      if (r.problem?.id === 'RADAR_FAILURE') {
        this.readoutText.setPosition(p.x + 60, p.y).setColor('#f87171').setText('RADAR OUT\n— — —');
      } else {
        const color = t.speed <= LIMITS.crashSpeed ? UI.greenText : t.speed <= LIMITS.bounceSpeed ? '#fbbf24' : '#f87171';
        const verdict = t.speed <= LIMITS.crashSpeed ? 'SAFE' : t.speed <= LIMITS.bounceSpeed ? 'BOUNCY' : 'TOO FAST';
        const tilt = Math.abs(t.pitchFromVertical) > LIMITS.maxLandingTilt && t.altitude < 40 ? '  ·  TILTED!' : '';
        this.readoutText.setPosition(p.x + 60, p.y).setColor(color).setText(`${Math.round(t.speed)} m/s  ${verdict}${tilt}\n${formatDistance(Math.max(0, t.altitude))} to go`);
      }
    }

    if (this.titleTimer > 0) {
      this.titleTimer -= dt;
      const a = Phaser.Math.Clamp(this.titleTimer / 0.6, 0, 1);
      this.phaseTitle.setAlpha(a);
      this.phaseGoal.setAlpha(a);
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      this.bannerText.setAlpha(Phaser.Math.Clamp(this.bannerTimer / 0.4, 0, 1));
    } else if (this.bannerQueue.length > 0) {
      const b = this.bannerQueue.shift()!;
      this.bannerText.setText(b.text).setColor(b.color).setAlpha(1);
      this.bannerTimer = 2.8;
    } else {
      this.bannerText.setAlpha(0);
    }
  }

  /** The current goal in a few words, under the phase strip. */
  private objective(t: FlightTelemetry): string {
    const r = this.runner;
    if (r.complete) return 'Mission complete!';
    if (r.phase === 'ORBIT') return t.moonOrbit ? 'Get the LOW and HIGH points into the green band' : 'Fly to the Moon, leaning a little to pass beside it';
    if (r.phase === 'ROVER') {
      if (r.problem) return 'Deal with the problem!';
      if (r.rover && !r.rover.landed) return 'Rover falling…';
      if (r.dropReady) return `Drop the rover in the green zone  ·  spares: ${r.sparesLeft}`;
      return 'Orbiting… stay alert';
    }
    return onImpactCourse(t) ? 'Land upright, under 10 m/s, on the blue site' : 'Burn backwards to drop out of orbit: aim the white ✕ at the blue site';
  }

  /** One plain-language hint for right now. */
  private hint(t: FlightTelemetry): string {
    const r = this.runner;
    const mode = this.world.camera.mode;
    if (this.sim.onGround) return 'Too heavy to climb: go back (ESC) and add engines';
    if (r.problem?.id === 'FLAMEOUT') return 'ENGINE OUT: HOLD E to relight!';
    if (r.problem) return PROBLEM_INFO[r.problem.id].howTo;
    if (mode === 'ASCENT') {
      if (t.earthAltitude > ROCK_BELT.bottom - 300 && t.earthAltitude < ROCK_BELT.top) return 'ROCK BELT: red arrows show rocks coming  ·  A / D dodge  ·  near misses build a combo';
      if (this.coastApex !== null && this.coastApex >= SOI_ALTITUDE && t.thrust > 0) return 'You’ll coast to the Moon now: X cuts the engines to save fuel';
      if (this.coastApex !== null && this.coastApex >= SOI_ALTITUDE) return 'Coasting to the Moon: save fuel for the orbit burn';
      if (t.fuelFraction <= 0) return 'Out of fuel: coasting';
      return 'A / D steer (lean a little so you pass beside the Moon)  ·  W / S throttle  ·  X cut engines';
    }
    if (r.phase === 'ORBIT') return 'A / D turn  ·  W burn  ·  X stop burning  ·  the arrow shows which way you’re moving';
    if (r.phase === 'ROVER') {
      if (r.dropReady && !r.rover) return 'SPACE: drop the rover when the yellow ✕ is in the green zone';
      if (r.rover && !r.rover.landed) return 'Rover falling… watch where it lands';
      return 'Stay in orbit: problems can happen any moment';
    }
    if (onImpactCourse(t)) return 'Point along dashed arrow and burn W to slow down  ·  land upright (< 10 m/s)';
    return 'Turn to face backwards (against the arrow), then burn W to drop out of orbit';
  }

  // ---------------------------------------------------------------------------
  // End of flight
  // ---------------------------------------------------------------------------

  private finishMission(): void {
    if (this.result) return;
    const st = this.sim.stats;
    const r = this.runner;
    this.progressBeforeFinish = { ...this.progress };
    this.result = evaluateMission({
      phase: this.sim.phase,
      stats: st,
      report: this.report,
      fuelFraction: this.vehicle.fuelCapacity > 0 ? this.sim.fuel / this.vehicle.fuelCapacity : 0,
      phasesDone: r.phasesDone,
      bonus: this.stunts.total,
      failure: r.failure ?? (r.complete ? undefined : 'Flight ended early')
    });

    const ctx: MissionContext = {
      stats: st,
      report: this.report,
      cost: this.cost,
      awards: this.stunts.awards,
      phasesDone: r.phasesDone,
      problemsSolved: r.solved,
      problemsFailed: r.failedProblems
    };
    this.completedNow = newlyCompleted(ctx, this.progress.completedMissions);
    const missionReward = this.completedNow.reduce((s, m) => s + m.reward, 0);
    this.earnings = flightEarnings(this.result.outcome, this.stunts.awards, missionReward, this.cost, st.landedOn === 'EARTH' && st.reachedSpace, this.phasePaid);

    this.progress = {
      ...this.progress,
      money: this.progress.money + this.earnings.total,
      bestHeight: Math.max(this.progress.bestHeight, st.maxAltitude),
      completedMissions: [...this.progress.completedMissions, ...this.completedNow.map(m => m.id)]
    };
    saveProgress(this.progress);
    this.showResultPanel(this.result);
  }

  private returnToBuilder(): void {
    if (this.launched && !this.result && this.sim.stats.maxAltitude > this.progress.bestHeight) {
      saveProgress({ ...this.progress, bestHeight: this.sim.stats.maxAltitude });
    }
    this.scene.stop();
    if (this.scene.isSleeping('BuilderScene')) this.scene.wake('BuilderScene');
    else this.scene.start('BuilderScene');
  }

  private showResultPanel(result: MissionResult): void {
    const w = 660;
    const h = 520;
    const x = (1280 - w) / 2;
    const y = (720 - h) / 2;
    const items: Phaser.GameObjects.GameObject[] = [];
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(0, 0, 1280, 720);
    bg.fillStyle(0x0b1020, 0.96);
    bg.fillRoundedRect(x, y, w, h, 18);
    bg.lineStyle(2, 0x334155, 1);
    bg.strokeRoundedRect(x, y, w, h, 18);
    items.push(bg);

    const titleColor: Record<MissionResult['outcome'], string> = {
      CREW_LANDED: UI.goldText,
      ROVER_DEPLOYED: UI.greenText,
      IN_ORBIT: UI.greenText,
      MOON_SOI: '#a3e635',
      SPACE: '#7dd3fc',
      SKY: '#fbbf24',
      FAILED: '#f87171'
    };
    items.push(this.add.text(640, y + 20, result.title, TEXT_STYLE(28, titleColor[result.outcome])).setOrigin(0.5, 0));
    items.push(this.add.text(640, y + 58, '★'.repeat(result.stars) + '☆'.repeat(MAX_STARS - result.stars), TEXT_STYLE(24, UI.goldText)).setOrigin(0.5, 0));

    // The three phases, ticked off.
    const done = this.runner.phasesDone;
    const phaseLine = (['ORBIT', 'ROVER', 'LANDING'] as PhaseId[])
      .map((p, i) => `${i < done ? '✓' : i === done && this.runner.failure ? '✗' : '·'} ${PHASE_INFO[p].title}`)
      .join('     ');
    items.push(this.add.text(640, y + 92, phaseLine, TEXT_STYLE(14, done >= 3 ? UI.greenText : UI.text)).setOrigin(0.5, 0));
    items.push(this.add.text(640, y + 118, result.summary, TEXT_STYLE(14)).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w - 60));

    const e = this.earnings!;
    const cells: Array<[string, string, string]> = [
      ['EARNED', `+$${e.total + this.phasePaid}`, UI.greenText],
      ['SCORE', result.score.toLocaleString(), '#ffffff'],
      ['PROBLEMS FIXED', `${this.runner.solved}`, '#7dd3fc'],
      ['BANK', `$${this.progress.money}`, UI.goldText]
    ];
    cells.forEach(([label, value, color], i) => {
      const cx = x + 85 + i * 163;
      items.push(this.add.text(cx, y + 172, label, TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 0));
      items.push(this.add.text(cx, y + 190, value, TEXT_STYLE(22, color)).setOrigin(0.5, 0));
    });
    const parts = [
      this.phasePaid > 0 ? `phases $${this.phasePaid}` : '',
      e.outcome > 0 ? `flight $${e.outcome}` : '',
      e.mission > 0 ? `missions $${e.mission}` : '',
      e.awards > 0 ? `bonuses $${e.awards}` : '',
      e.recovery > 0 ? `rocket recovered $${e.recovery}` : ''
    ].filter(Boolean);
    items.push(this.add.text(640, y + 226, parts.join('  ·  '), TEXT_STYLE(12, UI.textMuted)).setOrigin(0.5, 0));

    const missionLines = this.completedNow.length > 0 ? this.completedNow.map(m => `✓ ${m.title} (+$${m.reward})`).join('   ') : this.mission ? `✗ ${this.mission.title}: ${this.mission.goal}` : '';
    const missions = this.add.text(640, y + 254, missionLines, TEXT_STYLE(14, this.completedNow.length > 0 ? UI.greenText : '#fca5a5')).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w - 60);
    items.push(missions);

    const tipCount = missions.height > 40 ? 1 : 2;
    const tips = result.insights.slice(0, tipCount).map(s => `•  ${s}`).join('\n');
    items.push(this.add.text(x + 36, missions.y + missions.height + 14, tips, TEXT_STYLE(13)).setWordWrapWidth(w - 72).setLineSpacing(4));

    const retry = this.canRetryPhase ? `R  ·  RETRY PHASE ${PHASE_INFO[this.checkpoint!.phase].number}` : 'R  ·  FLY AGAIN';
    items.push(
      ...this.makeButton(x + w / 2 - 150, y + h - 40, retry, () => {
        if (this.canRetryPhase) this.retryFromCheckpoint();
        else this.scene.restart({ tree: this.tree });
      })
    );
    items.push(...this.makeButton(x + w / 2 + 150, y + h - 40, 'B  ·  BUILDER', () => this.returnToBuilder()));
    if (this.canRetryPhase) items.push(this.add.text(640, y + h - 12, 'Retrying a phase is free: you keep what you’ve earned so far', TEXT_STYLE(11, UI.textMuted)).setOrigin(0.5, 1).setY(y + h - 6));
    this.resultPanel = this.add.container(0, 0, items).setAlpha(0).setDepth(100);
    this.tweens.add({ targets: this.resultPanel, alpha: 1, duration: 350 });
  }

  private makeButton(cx: number, cy: number, label: string, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const w = 260;
    const h = 42;
    const bg = this.add.graphics();
    const draw = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? 0x1e293b : 0x111827, 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 21);
      bg.lineStyle(2, hover ? 0x60a5fa : 0x334155, 1);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 21);
    };
    draw(false);
    const text = this.add.text(cx, cy, label, TEXT_STYLE(15, '#ffffff')).setOrigin(0.5);
    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', onClick);
    return [bg, text, zone];
  }
}
