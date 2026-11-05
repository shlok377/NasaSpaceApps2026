import Phaser from 'phaser';
import { CONFIG } from '../config';
import { HierarchicalRocketNode, PayloadKind } from '../core/types';
import { currentMission, Mission, MissionContext, newlyCompleted, rocketCost } from '../game/missions';
import {
  ActiveProblem,
  Checkpoint,
  isStableOrbit,
  onImpactCourse,
  PHASE_INFO,
  PhaseEvent,
  PhaseId,
  PhaseRunner,
  stepRover,
  phaseNumber,
  stepsDone,
  predictRoverLanding,
  PROBLEM_INFO
} from '../game/phases';
import { DEFAULT_SEPARATION_KEY, normalizeKey } from '../core/separationKeys';
import { flightPauseItems } from '../game/pauseRules';
import type { PauseHost, PauseSceneData } from './PauseScene';
import { cashFromAwards, flightEarnings, FlightEarnings, loadProgress, objectiveBonus, payoutBreakdown, PlayerProgress, saveProgress } from '../game/progress';
import { Award, StuntTracker } from '../game/stunts';
import { TIME_LOOKS, TIMES_OF_DAY, TimeOfDay, timeOfDayReward, timeOfDayWind } from '../game/timeOfDay';
import { moonSoiAltitude } from '../physics/bodies';
import { ENGINE, FINS, G0, LIMITS, ROCK_BELT, WORLD } from '../physics/constants';
import { ControlInput, FlightEvent, FlightSim, FlightTelemetry } from '../physics/FlightSim';
import { evaluateMission, MAX_STARS, MissionResult, OUTCOME_PAYOUT } from '../physics/mission';
import { analyzeVehicle, buildFlightVehicle, FlightVehicle, VehicleReport } from '../physics/vehicle';
import { distortedReading } from '../physics/damage';
import { GoalChip, HeightLadder, hudFrame, InstrumentChip, lowFuelKinds, MoneyChip, TILT_RED } from '../ui/CornerHud';
import { SkyCards } from '../ui/SkyCards';
import { Milestone } from '../ui/JourneyArc';
import { LaunchButton } from '../ui/LaunchButton';
import { drawPixelPanel, pixelBody, pixelTitle, PX } from '../ui/pixel';
import { OrbitGauge, ProblemCard } from '../ui/PhaseHud';
import { formatDistance, TEXT_STYLE, TITLE_STYLE, UI } from '../ui/theme';
import { preloadGameAssets } from '../core/assets';
import { EngineLoop, LoopSfx, playSfx } from '../core/sound';
import { ChallengeCard, ChallengeContext, ChallengeEvent, ChallengeRunner, Combo, createChallenges } from '../modules';
import { Effects } from './flight/Effects';
import { CameraMode, MissionOverlay, WorldRenderer, WORLD_COLORS } from './flight/WorldRenderer';

export interface FlightSceneData {
  tree: HierarchicalRocketNode;
}

const GAME_SPEED = CONFIG.gameSpeed;
const COUNTDOWN_SECONDS = 3;
/** How long a low fuel type keeps the buzzer going. */
const FUEL_BUZZ_MS = 20000;
const THROTTLE_RATE = 0.9; // per second while a throttle key is held
/** How often the "coast" apex prediction is refreshed (ms). */
const APEX_INTERVAL_MS = 200;

type Keys = Record<
  'W' | 'S' | 'SHIFT' | 'CTRL' | 'Z' | 'X' | 'A' | 'D' | 'E' | 'F' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'SPACE' | 'ENTER' | 'ESC' | 'R' | 'B' | 'P',
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
  MILESTONE: UI.goldText,
  STAGE: '#7dd3fc',
  BULLSEYE: UI.goldText,
  MISSION: UI.greenText,
  CHALLENGE: '#7dff66'
};

/** A checkpoint plus the scene-side bits needed to rewind. */
interface SceneCheckpoint extends Checkpoint {
  landedRovers: number[];
  sparesLeft: number;
  solved: number;
  failedProblems: number;
}

function flattenParts(node: HierarchicalRocketNode): HierarchicalRocketNode[] {
  return [node, ...node.children.flatMap(flattenParts)];
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

export class FlightScene extends Phaser.Scene implements PauseHost {
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
  private goalChip!: GoalChip;
  private orbitGauge!: OrbitGauge;
  private problemCard!: ProblemCard;
  private challengeCard!: ChallengeCard;
  /** The five flight challenges (src/modules): max-Q, wind shear, staging fault, radiation, trans-lunar window. */
  private challenges!: ChallengeRunner;
  private ladder!: HeightLadder;
  private instruments!: InstrumentChip;
  /** 0 = ROCKET / HEIGHT panels parked off-screen (on the pad), 1 = in place. */
  private sideSlide = 0;
  private coins!: MoneyChip;
  private launchButton!: LaunchButton;
  private missionText!: Phaser.GameObjects.Text;
  /** Launch time picked on the pad (resets to DAWN every launch). */
  private timeOfDay: TimeOfDay = 'DAWN';
  private skyCards!: SkyCards;
  private hintText!: Phaser.GameObjects.Text;
  /** SEPARATE has been offered (reached space or boosters ran dry); SPACE now cracks the shells. */
  private separatePromptShown = false;
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
  private engineSound: EngineLoop | null = null;
  /** Loops while any warning lasts. */
  private buzzer: LoopSfx | null = null;
  /** When each fuel type went low (scene time, ms): its buzzer gives up after FUEL_BUZZ_MS. */
  private lowFuelSince = new Map<string, number>();
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
  /** Set when the game resumes after a pause: steering is ignored until its keys are released. */
  private steerLocked = false;

  // Mission layer
  private progress!: PlayerProgress;
  /** Progress as it was before the end-of-flight payout (restored on a checkpoint retry). */
  private progressBeforeFinish: PlayerProgress | null = null;
  private checkpoint: SceneCheckpoint | null = null;
  private landedRovers: number[] = [];
  private phasePaid = 0;
  private mission: Mission | null = null;
  private stunts = new StuntTracker();
  private combo = new Combo();
  private passed: boolean[] = [];
  private dropMarker: { x: number; y: number } | null = null;
  private impactMarker: { x: number; y: number } | null = null;
  private markerAt = -Infinity;

  constructor() {
    super('FlightScene');
  }

  init(data: FlightSceneData): void {
    this.sideSlide = 0;
    this.tree = data.tree;
    this.throttle = 1;
    this.countdown = null;
    this.launched = false;
    this.exploded = false;
    this.lowFuelSince = new Map();
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
    this.progress = loadProgress();
    this.progressBeforeFinish = null;
    this.separatePromptShown = false;
    this.checkpoint = null;
    this.landedRovers = [];
    this.phasePaid = 0;
    this.mission = currentMission(this.progress.completedMissions, this.payload);
    this.stunts = new StuntTracker();
    this.combo = new Combo();
    this.passed = MILESTONES.map(() => false);
    this.dropMarker = null;
    this.impactMarker = null;
    this.markerAt = -Infinity;
    this.timeOfDay = 'DAWN';
  }

  preload(): void {
    preloadGameAssets(this);
  }

  create(): void {
    this.vehicle = buildFlightVehicle(this.tree);
    this.report = analyzeVehicle(this.vehicle);
    this.sim = new FlightSim(this.vehicle);
    this.runner = new PhaseRunner('ORBIT', 0, Math.random, this.payload);
    this.runner.drainEvents();
    this.challenges = createChallenges();
    this.cost = rocketCost(flattenParts(this.tree));
    this.exposeForDebug();
    if (this.game.canvas) this.game.canvas.style.cursor = 'default';

    this.world = new WorldRenderer(this);
    this.world.updateCamera(this.sim, this.sim.getTelemetry(), 0, 'ASCENT');
    this.fx = new Effects(this);
    this.createHud();
    this.setupInput();
    this.engineSound = new EngineLoop(this);
    this.buzzer = new LoopSfx(this, 'BUZZER');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllKeys(true);
      this.engineSound?.stop();
      this.buzzer?.stop();
    });
  }

  private exposeForDebug(): void {
    const w = window as unknown as { __FLIGHT_SIM__: FlightSim; __PHASES__: PhaseRunner; __FLIGHT_SCENE__: FlightScene };
    w.__FLIGHT_SIM__ = this.sim;
    w.__FLIGHT_SCENE__ = this;
    w.__PHASES__ = this.runner;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private createHud(): void {
    this.goalChip = new GoalChip(this);
    this.orbitGauge = new OrbitGauge(this);
    this.problemCard = new ProblemCard(this);
    this.challengeCard = new ChallengeCard(this);
    this.ladder = new HeightLadder(
      this,
      SOI_ALTITUDE,
      [
        { label: 'Clouds', height: 1_500 },
        { label: 'Space', height: WORLD.atmosphereTop },
        { label: 'Moon', height: SOI_ALTITUDE }
      ],
      [...this.challenges.bands].sort((a, b) => a.from - b.from)
    );
    this.instruments = new InstrumentChip(this);
    this.coins = new MoneyChip(this);

    const [verdict, color] = this.verdict();
    const affordable = this.progress.money >= this.cost;
    this.launchButton = new LaunchButton(this, 640, 600, verdict, color, affordable ? `Launch cost $${this.cost}  ·  SPACE` : `Costs $${this.cost}, you have $${this.progress.money}`, () =>
      this.startCountdown()
    );
    this.missionText = this.add.text(640, 168, '', TEXT_STYLE(15, UI.goldText)).setOrigin(0.5);
    this.createTimePicker();
    this.hintText = this.add.text(640, 700, '', TEXT_STYLE(13)).setOrigin(0.5, 1).setAlign('center').setWordWrapWidth(600).setDepth(20);
    this.bannerText = this.add.text(640, 236, '', TEXT_STYLE(20, '#ffffff')).setOrigin(0.5, 0).setAlpha(0).setDepth(20);
    this.phaseTitle = this.add.text(640, 300, '', TITLE_STYLE(30, '#ffffff')).setOrigin(0.5).setAlpha(0).setDepth(30);
    this.phaseGoal = this.add.text(640, 344, '', TEXT_STYLE(16, UI.text)).setOrigin(0.5, 0).setAlpha(0).setDepth(30).setAlign('center').setWordWrapWidth(640);
    this.countdownText = this.add.text(640, 320, '', TITLE_STYLE(72, '#ffffff')).setOrigin(0.5).setVisible(false).setDepth(30);
    this.readoutText = this.add.text(0, 0, '', TEXT_STYLE(15)).setOrigin(0, 0.5).setVisible(false).setDepth(10);
    this.comboText = this.add.text(640, 128, '', TEXT_STYLE(18, '#f0abfc')).setOrigin(0.5).setVisible(false);
    this.warpText = this.add.text(1250, 80, '', TEXT_STYLE(14, '#93c5fd')).setOrigin(1, 0.5).setDepth(20);
    this.endButton = this.add.text(1250, 694, '■ End flight', TEXT_STYLE(13, UI.textMuted)).setOrigin(1, 0.5).setInteractive({ useHandCursor: true }).setVisible(false);
    this.endButton.on('pointerdown', () => {
      playSfx(this, 'UI_CLICK');
      if (!this.result && this.launched) this.finishMission();
    });
  }

  // ---------------------------------------------------------------------------
  // Launch time picker (on the pad only)
  // ---------------------------------------------------------------------------

  /** Sky window cards under the mission line: later is windier and pays more. */
  private createTimePicker(): void {
    this.skyCards = new SkyCards(this, 640, 196, time => this.setTimeOfDay(time));
    this.setTimeOfDay(this.timeOfDay);
  }

  private setTimeOfDay(time: TimeOfDay): void {
    if (this.sim.phase !== 'PRELAUNCH' || this.countdown !== null) return;
    this.timeOfDay = time;
    this.sim.windScale = timeOfDayWind(time);
    this.world.setTimeOfDay(time);
    const reward = this.mission ? Math.round(this.mission.reward * timeOfDayReward(time)) : 0;
    this.missionText.setText(this.mission ? `MISSION: ${this.mission.title}: ${this.mission.goal}  (+$${reward})` : 'All missions done: fly for the high score!');
    this.skyCards.setSelected(time);
  }

  private stepTimeOfDay(dir: number): void {
    const i = TIMES_OF_DAY.indexOf(this.timeOfDay);
    this.setTimeOfDay(TIMES_OF_DAY[(i + dir + TIMES_OF_DAY.length) % TIMES_OF_DAY.length]);
  }

  /** What the rocket can do, in plain words, from a quick headless test flight. */
  private verdict(): [string, string] {
    const r = this.report;
    if (r.liftoffTwr < 1) return ['Too heavy to lift off: add engines', '#f87171'];
    const run = dryRun(this.vehicle);
    const warn = !r.finStable ? `  ·  needs ${FINS.minimumForStability} fins` : run.tips ? '  ·  unbalanced, will tip' : run.finsDropped ? '  ·  fins drop off with the boosters' : '';
    const v = CONFIG.launchVerdict;
    // What the payload's own mission needs: the satellite just orbits, the rover orbits and drops, the crew lands too.
    const mission = {
      SATELLITE: { need: v.orbitOnly, goal: 'orbit + eject' },
      ROVER: { need: v.orbitAndRover, goal: 'orbit + rover drop' },
      CREW: { need: v.allPhases, goal: 'orbit + landing' }
    }[this.payload];
    if (run.reachesMoon) {
      if (run.deltaVLeft >= mission.need) return [`Fuel for the whole mission: ${mission.goal}${warn}`, UI.greenText];
      if (run.deltaVLeft >= v.orbitOnly) return [`Reaches the Moon: fuel to orbit it, tight for ${mission.goal}${warn}`, '#a3e635'];
      return [`Barely reaches the Moon: add fuel to orbit it${warn}`, '#fbbf24'];
    }
    if (run.maxAltitude >= WORLD.atmosphereTop) return [`Reaches space (~${formatDistance(run.maxAltitude)}): add fuel for the Moon${warn}`, '#7dd3fc'];
    return [`Reaches ~${formatDistance(run.maxAltitude)}${warn}`, '#fbbf24'];
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private setupInput(): void {
    this.keys = this.input.keyboard!.addKeys('W,S,SHIFT,CTRL,Z,X,A,D,E,F,LEFT,RIGHT,UP,DOWN,SPACE,ENTER,ESC,R,B,P') as Keys;
    this.keys.SPACE.on('down', () => {
      if (this.sim.phase === 'PRELAUNCH') this.startCountdown();
      else if (this.runner.deploySatellite(this.sim) || this.runner.dropRover(this.sim)) {
        const at = this.world.rocketScreen(this.sim);
        this.fx.ring(at.x, at.y, WORLD_COLORS.rover, 50, 0.5);
      }
    });
    const onLeftDown = () => {
      if (this.sim.phase === 'PRELAUNCH') this.stepTimeOfDay(-1);
    };
    const onRightDown = () => {
      if (this.sim.phase === 'PRELAUNCH') this.stepTimeOfDay(1);
    };
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
    // ESC and P pause. Once the result panel is up there is nothing to pause, so ESC still goes to the lab.
    this.keys.ESC.on('down', () => (this.result ? this.returnToBuilder() : this.openPause()));
    this.keys.P.on('down', () => {
      if (!this.result) this.openPause();
    });
    // Each RCS shell has its own key from the lab; it can be pressed any time in flight.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (this.result || !this.launched || e.repeat) return;
      const key = normalizeKey(e.key.length === 1 ? e.key : '');
      if (!key) return;
      // A jammed shell swallows its key until it is freed.
      if (this.challenges.onSeparationKey(key, this.challengeContext(0, 0))) {
        this.cameras.main.shake(120, 0.005);
        return;
      }
      if (!this.sim.separate(key)) return;
      const at = this.world.rocketScreen(this.sim);
      this.fx.ring(at.x, at.y, WORLD_COLORS.rover, 70, 0.5);
    });
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
    this.progress = { ...this.progress, money: this.progress.money - this.cost, flights: this.progress.flights + 1 };
    saveProgress(this.progress);
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownText.setVisible(true);
  }

  private steerKey(): number {
    const k = this.keys;
    const raw = (k.A.isDown || k.LEFT.isDown ? 1 : 0) - (k.D.isDown || k.RIGHT.isDown ? 1 : 0);
    // After a pause, steering stays off until the steering keys have been let go and pressed again.
    if (this.steerLocked) {
      if (raw === 0) this.steerLocked = false;
      return 0;
    }
    return raw;
  }

  private currentInput(_t: FlightTelemetry): ControlInput {
    return { throttle: this.throttle, steer: this.steerKey() };
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    let t = this.sim.getTelemetry();

    if (!this.result) {
      this.readThrottle(dt);
      this.tickCountdown(dt);
      // The rock belt eases time down a little; the phases fast-forward quiet orbits.
      this.timeScale = this.runner.timeScale(this.sim) * this.challenges.timeScale;
      const gameDt = dt * GAME_SPEED * this.timeScale;
      this.sim.advance(gameDt, this.currentInput(t));

      if (this.runner.satellite) stepRover(this.runner.satellite, gameDt);
      if (this.launched) this.runner.update(this.sim, gameDt, { repairPressed: this.repairPressed, relightHeld: this.keys.E.isDown });
      this.repairPressed = false;
      const events = this.sim.drainEvents();
      t = this.sim.getTelemetry();
      if (this.launched) this.challenges.update(this.challengeContext(gameDt, dt, t));
      this.handleChallengeEvents(this.challenges.drainEvents());
      this.handleEvents(events);
      this.handlePhaseEvents(this.runner.drainEvents());
      for (const a of this.stunts.update(this.sim, t, events)) this.celebrate(a);
      if (this.world.camera.mode === 'ASCENT') this.checkMilestones(t);
      this.checkWobble(t);
      this.refreshApex();
      this.refreshMarkers();

      if ((this.sim.isFinished || this.runner.over) && this.finishedAt === null) {
        this.finishedAt = this.time.now;
        if (this.sim.phase === 'CRASHED' || this.runner.failure === 'Landed in the boulder field') {
          this.exploded = true;
          const p = this.world.rocketScreen(this.sim);
          if (this.sim.stats.crashedOn === 'EARTH' && this.world.isOverSea(this.sim.state.x)) {
            // Into the sea: a splash instead of a fireball.
            this.fx.splash(p.x, this.world.toScreen(this.sim.state.x, 0).y);
            this.fx.popup(p.x, p.y - 140, 'SPLASH!', '#bfe6ff', 30);
            playSfx(this, 'SPLASH');
            this.cameras.main.shake(300, 0.006);
          } else {
            this.fx.explode(p.x, p.y);
            playSfx(this, 'EXPLOSION');
            this.cameras.main.shake(500, 0.012);
          }
        }
      }
      if (this.finishedAt !== null && this.time.now - this.finishedAt > 2200) this.finishMission();
    }

    if (this.sim.version !== this.lastVersion) {
      this.lastVersion = this.sim.version;
      this.cameras.main.shake(180, 0.006);
    }

    this.world.updateCamera(this.sim, t, dt, this.chooseCameraMode(t));
    this.world.updateSmoke(dt * GAME_SPEED * this.timeScale, this.sim, t, !this.exploded);
    this.world.render(this.sim, t, this.challenges.rocks, !this.exploded, this.overlay());
    this.fx.update(dt, t, false);
    this.fx.draw(t, this.world.rocketScreen(this.sim), !this.exploded, false);
    this.updateHud(t, dt);
    this.engineSound?.update(!this.result && !this.exploded && t.thrust > 0 ? 0.35 + 0.65 * t.throttle : 0, dt);

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
      satellite: r.satellite,
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
      if (e.kind === 'BOUNCE' || e.kind === 'PART_LOST') {
        this.cameras.main.shake(300, 0.012);
        playSfx(this, 'ROCKET_DAMAGE');
      }
      if (e.kind === 'STAGE') playSfx(this, 'ROCKET_SEPARATION');
      if (e.kind === 'MOON_SOI') {
        this.showBanner('In the Moon’s pull! Burn sideways to swing into orbit', UI.greenText);
        continue;
      }
      if (e.kind === 'LANDED' || e.kind === 'CRASH') continue; // the phase runner reports these
      if (e.kind === 'SEPARATION') {
        playSfx(this, 'ROCKET_SEPARATION');
        const at = this.world.rocketScreen(this.sim);
        this.fx.ring(at.x, at.y, 0x36ff12, 70, 0.6);
        this.cameras.main.shake(250, 0.01);
        this.showBanner(e.message, '#7dff66');
        continue;
      }
      this.showBanner(e.message);
    }
  }

  private challengeContext(dt: number, realDt: number, t: FlightTelemetry = this.sim.getTelemetry()): ChallengeContext {
    return { sim: this.sim, t, dt, realDt, payload: this.payload, timeOfDay: this.timeOfDay };
  }

  /** Banners, alarms and awards for the flight challenges. */
  private handleChallengeEvents(events: ChallengeEvent[]): void {
    for (const e of events) {
      if (e.kind === 'ROCK_HIT') {
        // A boulder's lost part already shakes and sounds through the sim's PART_LOST event.
        this.combo.reset();
        const at = this.world.toScreen(e.x, e.y);
        this.fx.burst(at.x, at.y, WORLD_COLORS.rock);
        if (!e.boulder) {
          playSfx(this, 'ROCKET_DAMAGE');
          this.cameras.main.shake(200, 0.008);
        }
        continue;
      }
      if (e.kind === 'NEAR_MISS') {
        const n = this.combo.nearMiss(this.sim.state.time);
        this.celebrate({ id: 'NEAR_MISS', label: n > 1 ? `NEAR MISS ×${n}` : 'NEAR MISS', points: 100 * n });
        continue;
      }
      if (e.kind === 'START') {
        playSfx(this, 'BUZZER');
        this.cameras.main.flash(160, 120, 60, 20);
        this.showBanner(e.message, '#fbbf24');
        // Challenges without a stretch of their own get pinned where they struck.
        if (!this.challenges.modules.find(m => m.id === e.id)?.band) this.ladder.addFlag(e.height, 0xf87171);
        continue;
      }
      this.showBanner(e.message, e.good ? UI.greenText : '#fca5a5');
      if (e.award) this.celebrate({ id: 'CHALLENGE', label: e.award.label, points: e.award.points });
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
          const reward = Math.round(CONFIG.economy.phaseRewards[e.phase] * timeOfDayReward(this.timeOfDay));
          this.progress = { ...this.progress, money: this.progress.money + reward };
          this.phasePaid += reward;
          saveProgress(this.progress);
          const at = this.world.rocketScreen(this.sim);
          this.fx.popup(at.x, at.y - 80, `PHASE ${phaseNumber(this.runner.chain, e.phase)} COMPLETE  +$${reward}`, UI.greenText, 24);
          this.fx.ring(at.x, at.y, 0x4ade80, 220, 0.9);
          break;
        }
        case 'PROBLEM_START':
          playSfx(this, 'BUZZER');
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
            e.inZone ? 'The rover bounced down in the zone!' : e.sparesLeft > 0 ? 'Missed the zone! One spare rover left: wait for the next pass' : 'The rover missed the zone!',
            e.inZone ? UI.greenText : '#fca5a5'
          );
          break;
        case 'SITE_MOVED':
          playSfx(this, 'BUZZER');
          this.cameras.main.shake(300, 0.008);
          this.showBanner(`⚠ ${PROBLEM_INFO.BOULDERS.title}: ${PROBLEM_INFO.BOULDERS.howTo}`, '#fca5a5');
          break;
        case 'COMPLETE':
          // The rover already got its own banner when it landed; the satellite and the crew get theirs here.
          if (this.payload === 'SATELLITE') this.showBanner('Satellite deployed: mission complete!', UI.greenText);
          else if (this.payload === 'CREW') {
            if (e.onSite) this.celebrate({ id: 'BULLSEYE', label: 'ON THE SITE', points: 1_000 });
            this.showBanner(e.onSite ? 'The crew landed right on the site!' : 'The crew is down safely!', UI.greenText);
          }
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
    this.runner = new PhaseRunner(cp.phase, cp.phasesDone, Math.random, this.payload);
    this.runner.sparesLeft = cp.sparesLeft;
    // Problems that went wrong before the checkpoint still count.
    this.runner.solved = cp.solved;
    this.runner.failedProblems = cp.failedProblems;
    // The challenges start over too: a used belt, dose or jam must not carry into the second try.
    this.challenges = createChallenges();
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
    this.lowFuelSince = new Map();
    this.throttle = 0;
    this.lastVersion = this.sim.version;
    this.bannerQueue = [];
    this.dropMarker = null;
    this.impactMarker = null;
  }

  private showBanner(message: string, color = '#ffffff'): void {
    if (message) this.bannerQueue.push({ text: message, color });
  }

  private showPhaseTitle(phase: PhaseId): void {
    const info = PHASE_INFO[phase];
    this.phaseTitle.setText(`PHASE ${phaseNumber(this.runner.chain, phase)} · ${info.title}`).setAlpha(1);
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

    this.goalChip.setVisible(!onPad && !this.result);
    this.goalChip.update(r.chain, r.phase, stepsDone(r.chain, r.phase, r.complete), this.objective(t));

    const ascent = mode === 'ASCENT';
    // The ROCKET column and HEIGHT tube fly in from their edges once LAUNCH is pressed.
    this.sideSlide += ((onPad ? 0 : 1) - this.sideSlide) * Math.min(1, dt * 5);
    const slideOut = (1 - this.sideSlide) * 320;
    this.instruments.setOffsetX(-slideOut);
    this.ladder.setOffsetX(slideOut);
    const slidIn = this.sideSlide > 0.01;
    this.ladder.setVisible(ascent && !this.result && slidIn);
    const glitch = this.challenges.glitch;
    this.ladder.update(Math.max(0, t.earthAltitude), best, glitch);
    this.orbitGauge.setVisible(mode === 'ORBIT' && !this.result);
    this.orbitGauge.update(t.moonOrbit, r.phase === 'ORBIT' ? r.stableFor / CONFIG.phases.orbit.holdSeconds : null, now);
    this.problemCard.update(flying ? (r.problem as ActiveProblem | null) : null, { periapsis: t.moonOrbit?.periapsisAltitude ?? null }, now);
    const challenge = flying && !r.problem ? this.challenges.status : null;
    this.challengeCard.update(challenge, now);
    this.instruments.setVisible(!this.result && slidIn);
    // One reading per tank still on the rocket, left to right.
    const tanks = this.sim.vehicle.parts
      .filter(p => p.fuelCapacity > 0)
      .sort((a, b) => a.u - b.u)
      .map(p => ({ id: p.id, kind: p.fuelKind ?? 'KEROSENE', capacity: p.fuelCapacity, fraction: (this.sim.tanks.get(p.id) ?? 0) / p.fuelCapacity }));
    this.instruments.update(
      {
        tanks,
        fuel: t.fuelFraction,
        twr: t.twr,
        burning: t.thrust > 0,
        tiltDeg: (t.pitchFromVertical * 180) / Math.PI,
        mass: t.mass,
        wetMass: this.vehicle.wetMass,
        health: this.sim.hull,
        sky: TIME_LOOKS[this.timeOfDay].sky[3],
        glitch
      },
      now
    );
    this.coins.update(this.progress.money + (this.result ? 0 : cashFromAwards(this.stunts.awards)), dt);

    this.launchButton.setVisible(onPad);
    this.skyCards.setVisible(onPad);
    this.launchButton.update(now);
    this.missionText.setVisible(onPad);
    this.endButton.setVisible(flying && this.launched);
    this.warpText.setText(this.timeScale > 1 && flying ? `▶▶ ×${this.timeScale}` : '');

    const comboOn = this.combo.active(this.sim.state.time) && this.combo.count > 1;
    this.comboText.setVisible(comboOn && flying && ascent).setText(`COMBO ×${this.combo.count}`);

    if (flying && this.launched) this.checkSeparatePrompt(t);
    this.hintText.setText(flying && this.launched ? this.hint(t) : '');

    // Speed + height next to the rocket, only when landing matters.
    const landing = flying && (mode === 'DESCENT' || mode === 'TOUCHDOWN' || (ascent && t.verticalSpeed < -5 && t.earthAltitude < 400 && this.launched));
    this.readoutText.setVisible(landing);
    if (landing) {
      const p = this.world.rocketScreen(this.sim);
      if (r.problem?.id === 'RADAR_FAILURE') {
        this.readoutText.setPosition(p.x + 60, p.y).setColor('#f87171').setText('RADAR OUT\n— — —');
      } else {
        // A damaged hull makes the numbers drift (the colours still use the true speed).
        const wobble = Math.sin(this.sim.state.time * 5.3) * Math.cos(this.sim.state.time * 1.7);
        const shownSpeed = distortedReading(t.speed, this.sim.hull, wobble);
        const shownAlt = distortedReading(Math.max(0, t.altitude), this.sim.hull, -wobble);
        const color = t.speed <= LIMITS.crashSpeed ? UI.greenText : t.speed <= LIMITS.bounceSpeed ? '#fbbf24' : '#f87171';
        const verdict = t.speed <= LIMITS.crashSpeed ? 'SAFE' : t.speed <= LIMITS.bounceSpeed ? 'BOUNCY' : 'TOO FAST';
        const tilt = Math.abs(t.pitchFromVertical) > LIMITS.maxLandingTilt && t.altitude < 40 ? '  ·  TILTED!' : '';
        this.readoutText.setPosition(p.x + 60, p.y).setColor(color).setText(`${Math.round(shownSpeed)} m/s  ${verdict}${tilt}\n${formatDistance(shownAlt)} to go`);
      }
    }

    // Buzzer: loops until every warning is gone — the angle corrected (in the air), the landing slowed, or a low fuel type run dry.
    // Each low fuel type buzzes for at most 20 s (or until it runs dry), then the tag alone keeps blinking.
    const lowNow = new Set<string>(lowFuelKinds(tanks, false));
    for (const kind of [...this.lowFuelSince.keys()]) if (!lowNow.has(kind)) this.lowFuelSince.delete(kind);
    for (const kind of lowNow) if (!this.lowFuelSince.has(kind)) this.lowFuelSince.set(kind, now);
    const fuelBuzz = [...this.lowFuelSince.values()].some(since => now - since < FUEL_BUZZ_MS);
    const warning =
      flying &&
      this.launched &&
      ((challenge?.danger && !challenge.needle) ||
        fuelBuzz ||
        // Leaning only matters in the air: past the edge of space it is how you steer to the Moon.
        (t.earthAltitude < WORLD.atmosphereTop && Math.abs(t.pitchFromVertical * 180) / Math.PI > TILT_RED) ||
        (landing && t.speed > LIMITS.bounceSpeed) ||
        (landing && Math.abs(t.pitchFromVertical) > LIMITS.maxLandingTilt && t.altitude < 40));
    this.buzzer?.set(warning);

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
      if (r.dropReady) return r.sparesLeft > 0 ? `Drop the rover in the green zone  ·  spares: ${r.sparesLeft}` : 'Drop the rover in the green zone: one shot';
      return 'Orbiting… stay alert';
    }
    if (r.phase === 'DEPLOY') return isStableOrbit(t) ? 'Press SPACE to eject the satellite' : 'Get the LOW and HIGH points into the green band to eject';
    return onImpactCourse(t) ? 'Land upright, under 10 m/s, on the blue site' : 'Burn backwards to drop out of orbit: aim the white ✕ at the blue site';
  }

  /** Keys of the shells still closed, e.g. "B / G". */
  private get payload(): PayloadKind {
    return this.tree.payload ?? 'CREW';
  }

  private shellKeys(): string {
    return this.sim.closedShellKeys.join(' / ') || DEFAULT_SEPARATION_KEY;
  }

  /** Offer SEPARATE once the rocket is in space or its boosters are dry. */
  private checkSeparatePrompt(t: FlightTelemetry): void {
    if (this.separatePromptShown || !this.sim.canSeparate) return;
    if (t.airDensity > 0 && this.sim.boosterFuel > 1e-9) return;
    this.separatePromptShown = true;
    this.showBanner(`SEPARATE! Press ${this.shellKeys()} to crack the shells and wake the RCS`, '#7dff66');
  }

  /** One plain-language hint for right now. */
  private hint(t: FlightTelemetry): string {
    const r = this.runner;
    const mode = this.world.camera.mode;
    if (this.separatePromptShown && this.sim.canSeparate) return `${this.shellKeys()}: SEPARATE — drop the shells and steer with RCS (A / D)`;
    if (t.airDensity <= 0 && !this.sim.rcsReady) {
      if (this.sim.separated) return 'RCS out of cold gas: no steering in space';
      if (this.sim.vehicle.rcsCount === 0) return 'Boosters can’t steer in space: add RCS + cold gas next time  ·  W / S throttle';
    }
    if (this.sim.onGround) return 'Too heavy to climb: go back (ESC) and add engines';
    if (r.problem?.id === 'FLAMEOUT') return 'ENGINE OUT: HOLD E to relight!';
    if (r.problem) return PROBLEM_INFO[r.problem.id].howTo;
    if (mode === 'ASCENT') {
      if (t.earthAltitude > ROCK_BELT.bottom - 300 && t.earthAltitude < ROCK_BELT.top)
        return `ROCK BELT: A / D slide sideways${this.sim.rcsReady ? ' (RCS boost)' : ''}  ·  W speed through the gaps  ·  near misses build a combo`;
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
    if (r.phase === 'DEPLOY') return isStableOrbit(t) ? 'SPACE: eject the satellite from your stable orbit' : 'Fix your orbit (A / D turn  ·  W burn) until it is stable, then press SPACE';
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
      payload: r.payload,
      bonus: this.stunts.total,
      failure: r.failure ?? (r.complete ? undefined : 'Flight ended early')
    });

    const ctx: MissionContext = {
      stats: st,
      report: this.report,
      cost: this.cost,
      awards: this.stunts.awards,
      phasesDone: r.phasesDone,
      payload: r.payload ?? 'CREW',
      objectiveDone: r.complete,
      problemsSolved: r.solved,
      problemsFailed: r.failedProblems
    };
    this.completedNow = newlyCompleted(ctx, this.progress.completedMissions);
    const missionReward = this.completedNow.reduce((s, m) => s + m.reward, 0);
    const rewardScale = timeOfDayReward(this.timeOfDay);
    this.earnings = flightEarnings(this.result.outcome, this.stunts.awards, missionReward, this.cost, st.landedOn === 'EARTH' && st.reachedSpace, this.phasePaid, rewardScale, objectiveBonus(r.complete, OUTCOME_PAYOUT[this.result.outcome], st.partsLost, this.cost));

    this.progress = {
      ...this.progress,
      money: this.progress.money + this.earnings.total,
      bestHeight: Math.max(this.progress.bestHeight, st.maxAltitude),
      completedMissions: [...this.progress.completedMissions, ...this.completedNow.map(m => m.id)]
    };
    saveProgress(this.progress);
    if (!r.complete) playSfx(this, 'GAME_OVER');
    this.showResultPanel(this.result);
  }

  // ---------------------------------------------------------------------------
  // Pause menu (scenes/PauseScene.ts): this scene is frozen while it is open
  // ---------------------------------------------------------------------------

  private openPause(): void {
    if (this.scene.isPaused() || this.scene.isActive('PauseScene')) return;
    const t = this.sim.getTelemetry();
    const paid = this.countdown !== null || this.launched;
    const phase = this.runner.phase;
    const chain = this.runner.chain;
    const fuel = Math.round(t.fuelFraction * 100);
    const hull = Math.round(this.sim.hull);
    const data: PauseSceneData = {
      context: 'FLIGHT',
      target: 'FlightScene',
      title: 'PAUSED',
      subtitle: this.launched ? `PHASE ${phaseNumber(chain, phase)} · ${PHASE_INFO[phase].title}` : 'ON THE PAD',
      items: flightPauseItems({ launched: this.launched, paid, checkpointPhase: this.checkpoint?.phase ?? null, cost: this.cost }),
      statusTitle: 'FLIGHT',
      status: [
        { label: 'MISSION', value: this.mission ? this.mission.title : 'HIGH SCORE' },
        { label: 'PHASE', value: `${phaseNumber(chain, phase)} OF ${chain.length}` },
        { label: 'HEIGHT', value: `${Math.max(0, Math.round(t.altitude)).toLocaleString('en-US')} M` },
        { label: 'FUEL', value: `${fuel}%`, color: fuel < 15 ? PX.text.red : PX.text.white },
        { label: 'HULL', value: `${hull}%`, color: hull < 40 ? PX.text.red : hull < 70 ? PX.text.gold : PX.text.white },
        { label: 'ROCKET', value: paid ? `$${this.cost} SPENT` : `$${this.cost}`, color: PX.text.gold }
      ]
    };
    this.scene.pause();
    this.scene.launch('PauseScene', data);
  }

  public restartPhaseFromPause(): void {
    this.retryFromCheckpoint();
    this.steerLocked = true;
  }

  public launchAgainFromPause(): void {
    this.scene.restart({ tree: this.tree });
  }

  public leaveToBuilderFromPause(): void {
    this.returnToBuilder();
  }

  public resumedFromPause(): void {
    this.steerLocked = true;
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
    const w = 460;
    const h = 330;
    const x = (1280 - w) / 2;
    const y = (720 - h) / 2 + 10;
    const cx = x + w / 2;
    const accent: Record<MissionResult['outcome'], number> = {
      CREW_LANDED: PX.gold,
      ROVER_DEPLOYED: PX.green,
      SATELLITE_DEPLOYED: PX.green,
      IN_ORBIT: PX.green,
      MOON_SOI: 0xa3e635,
      SPACE: 0x7dd3fc,
      SKY: PX.accent,
      FAILED: PX.red
    };
    const tone = accent[result.outcome];
    const items: Phaser.GameObjects.GameObject[] = [];
    // Clear the big phase title so nothing shows through the see-through card.
    this.titleTimer = 0;
    this.phaseTitle.setAlpha(0);
    this.phaseGoal.setAlpha(0);

    // Same see-through frame as the flight HUD, bordered in the outcome's colour.
    const g = this.add.graphics();
    hudFrame(g, x, y, w, h, tone, 0.55);
    items.push(g);

    // Title ribbon on the top edge.
    const title = pixelTitle(this, cx, y, result.title.toUpperCase(), 14, '#ffffff').setOrigin(0.5).setShadow(2, 2, '#01020a', 0, false, true);
    const rw = Math.ceil(title.width) + 40;
    g.fillStyle(0x07060b, 1);
    g.fillRect(cx - rw / 2 - 2, y - 17, rw + 4, 34);
    g.fillStyle(tone, 1);
    g.fillRect(cx - rw / 2, y - 15, rw, 30);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(cx - rw / 2, y - 15, rw, 3);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(cx - rw / 2, y + 12, rw, 3);
    items.push(title);

    // Pixel stars.
    const STAR = ['...#...', '..###..', '#######', '.#####.', '.##.##.', '#.....#'];
    const cell = 4;
    const starW = STAR[0].length * cell;
    for (let i = 0; i < MAX_STARS; i++) {
      const sx = cx - (MAX_STARS * (starW + 12) - 12) / 2 + i * (starW + 12);
      const lit = i < result.stars;
      STAR.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch !== '#') return;
          g.fillStyle(0x07060b, 1);
          g.fillRect(sx + c * cell + 2, y + 32 + r * cell + 2, cell, cell);
          g.fillStyle(lit ? (r < 2 ? 0xfff1a8 : PX.gold) : PX.borderDim, 1);
          g.fillRect(sx + c * cell, y + 32 + r * cell, cell, cell);
        })
      );
    }

    // Phase track: the nodes on a line, lit as far as you got.
    const chain = this.runner.chain;
    const done = stepsDone(chain, this.runner.phase, this.runner.complete);
    const trackY = y + 92;
    const nodeX = (i: number) => cx - 70 * (chain.length - 1) + i * 140;
    for (let i = 0; i < chain.length - 1; i++) {
      g.fillStyle(0x07060b, 1);
      g.fillRect(nodeX(i), trackY - 3, 140, 6);
      // Lit up to the next node once that phase is done.
      g.fillStyle(i + 1 < done ? PX.green : PX.borderDim, 1);
      g.fillRect(nodeX(i), trackY - 1, 140, 2);
    }
    chain.forEach((p, i) => {
      const state = i < done ? 'DONE' : i === done && this.runner.failure ? 'FAIL' : 'TODO';
      const c = state === 'DONE' ? PX.green : state === 'FAIL' ? PX.red : PX.borderDim;
      const nx = nodeX(i);
      g.fillStyle(0x07060b, 1);
      g.fillRect(nx - 11, trackY - 11, 22, 22);
      g.fillStyle(c, 1);
      g.fillRect(nx - 9, trackY - 9, 18, 18);
      g.fillStyle(0xffffff, state === 'TODO' ? 0 : 0.3);
      g.fillRect(nx - 9, trackY - 9, 18, 3);
      if (state === 'TODO') {
        g.fillStyle(PX.panelDeep, 1);
        g.fillRect(nx - 6, trackY - 6, 12, 12);
      } else items.push(pixelBody(this, nx, trackY, state === 'DONE' ? '✓' : '✗', 20, '#07060b').setOrigin(0.5));
      items.push(pixelTitle(this, nx, trackY + 18, PHASE_INFO[p].title.split(' ').pop()!.toUpperCase(), 7, state === 'TODO' ? PX.text.muted : PX.text.white).setOrigin(0.5, 0));
    });

    // Three numbers: what this flight paid, its score, and the bank.
    const e = this.earnings!;
    const stats: Array<[string, string, string]> = [
      ['EARNED', `+$${e.total + this.phasePaid}`, PX.text.green],
      ['SCORE', result.score.toLocaleString(), PX.text.white],
      ['BANK', `$${this.progress.money}`, PX.text.gold]
    ];
    const tileW = 128;
    stats.forEach(([label, value, color], i) => {
      const tx = cx - (3 * tileW + 16) / 2 + i * (tileW + 8);
      const ty = y + 146;
      g.fillStyle(0x07060b, 0.75);
      g.fillRect(tx, ty, tileW, 54);
      g.fillStyle(0x000000, 0.4);
      g.fillRect(tx, ty, tileW, 2);
      g.fillStyle(tone, 0.6);
      g.fillRect(tx, ty + 52, tileW, 2);
      items.push(pixelTitle(this, tx + tileW / 2, ty + 9, label, 6, PX.text.muted).setOrigin(0.5, 0));
      const v = pixelBody(this, tx + tileW / 2, ty + 20, value, 28, color).setOrigin(0.5, 0);
      if (v.width > tileW - 8) v.setScale((tileW - 8) / v.width);
      items.push(v);
    });

    // One short mission line.
    const won = this.completedNow.length > 0;
    const missionLine = won ? `MISSION DONE  +$${this.completedNow.reduce((n, m) => n + m.reward, 0)}` : this.mission ? 'MISSION NOT DONE' : '';
    if (missionLine) items.push(pixelTitle(this, cx, y + 216, missionLine, 8, won ? PX.text.green : PX.text.muted).setOrigin(0.5, 0));

    // Where the payout came from: the base, then each bonus.
    const pay = payoutBreakdown(this.runner.complete, OUTCOME_PAYOUT[result.outcome], this.sim.stats.partsLost, this.cost, timeOfDayReward(this.timeOfDay));
    const lines = [`BASE $${pay.base}`, pay.clean ? `CLEAN +$${pay.clean}` : '', pay.cheap ? `CHEAP +$${pay.cheap}` : '', pay.time ? `${this.timeOfDay} +$${pay.time}` : ''].filter(Boolean);
    if (pay.base > 0) items.push(pixelBody(this, cx, y + 236, lines.join('   '), 16, PX.text.muted).setOrigin(0.5, 0));

    const retry = this.canRetryPhase ? `RETRY P${phaseNumber(this.runner.chain, this.checkpoint!.phase)}` : 'FLY AGAIN';
    items.push(
      ...this.makeButton(cx - 108, y + h - 52, 'R', retry, true, () => {
        if (this.canRetryPhase) this.retryFromCheckpoint();
        else this.scene.restart({ tree: this.tree });
      })
    );
    items.push(...this.makeButton(cx + 108, y + h - 52, 'B', 'BUILDER', false, () => this.returnToBuilder()));
    if (this.canRetryPhase) items.push(pixelBody(this, cx, y + h - 8, 'Retry is free', 16, PX.text.muted).setOrigin(0.5, 1));
    this.resultPanel = this.add.container(0, 0, items).setAlpha(0).setDepth(100);
    this.tweens.add({ targets: this.resultPanel, alpha: 1, duration: 350 });
  }

  /** Chunky arcade button with a key cap; it sinks under the pointer. Primary is red like LAUNCH!. */
  private makeButton(cx: number, cy: number, key: string, label: string, primary: boolean, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const w = 196;
    const h = 44;
    const bg = this.add.graphics();
    const cap = pixelTitle(this, 0, 0, key, 10, PX.text.white).setOrigin(0.5);
    const text = pixelTitle(this, 0, 0, label, 10, '#ffffff').setOrigin(0, 0.5);
    const draw = (hover: boolean) => {
      const sink = hover ? 3 : 0;
      bg.clear();
      drawPixelPanel(bg, cx - w / 2, cy - h / 2 + sink, w, h, primary
        ? { fill: hover ? 0xf04a3a : 0xd8322f, fillAlpha: 1, border: 0xff8a5c, highlight: 0xffd0b0, u: 3 }
        : { fill: hover ? 0x2a2434 : PX.panelDeep, fillAlpha: 1, border: hover ? PX.glow : PX.border, u: 3 });
      if (!hover) {
        bg.fillStyle(primary ? 0x8a1414 : 0x000000, primary ? 1 : 0.5);
        bg.fillRect(cx - w / 2 + 6, cy + h / 2 - 9, w - 12, 3);
      }
      // Key cap on the left.
      const kx = cx - w / 2 + 12;
      bg.fillStyle(0x01020a, 1);
      bg.fillRect(kx - 2, cy - 14 + sink, 30, 28);
      bg.fillStyle(primary ? 0x8a1414 : PX.borderDim, 1);
      bg.fillRect(kx, cy - 12 + sink, 26, 24);
      bg.fillStyle(0xffffff, 0.25);
      bg.fillRect(kx, cy - 12 + sink, 26, 3);
      cap.setPosition(kx + 13, cy + sink + 1);
      text.setPosition(kx + 40, cy + sink + 1);
    };
    draw(false);
    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      draw(true);
      playSfx(this, 'UI_HOVER');
    });
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => {
      playSfx(this, 'UI_CLICK');
      onClick();
    });
    return [bg, cap, text, zone];
  }
}
