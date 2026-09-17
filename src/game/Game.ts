import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Crystal } from '../entities/Crystal';
import { Hazard } from '../entities/Hazard';
import { PowerUp } from '../entities/PowerUp';
import { DEFAULT_RUNNER_TUNING, Runner, type RunnerTuning } from '../entities/Runner';
import type { SkinId } from '../entities/Skins';
import { PlayerSlot } from './PlayerSlot';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Hud } from '../systems/Hud';
import { ParticleBursts } from '../systems/Particles';
import { createPostPipeline, type PostPipeline } from '../systems/PostFX';
import { ScorePopups } from '../systems/ScorePopups';
import { computeStars, loadSave, resetSave, writeSave, type SaveData } from '../systems/Save';
import {
  STAGES,
  TIME_TRIAL_LIMIT,
  endlessConfig,
  stageToConfig,
  timeTrialConfig,
  type GameMode,
  type StageTheme,
} from './Stages';
import {
  buildCourse,
  islandCenterX,
  findIslandAt,
  type CourseConfig,
  type CourseData,
  type HazardSpawn,
  type IslandDef,
} from '../world/Course';
import { createEnvironment } from '../world/Environment';
import { disposeSharedIslandTextures } from '../world/Island';
import { disposeGameTextures } from '../assets/Textures';

type UiPanel = 'title' | 'stages' | 'loadout' | 'settings' | 'playing' | 'paused' | 'fail' | 'win';

const MAX_LIVES = 3;
const VOID_KILL_Y = -12;
const COMBO_WINDOW = 2.8;
const CRYSTAL_COLLECT_XZ = 1.45;
const CRYSTAL_COLLECT_Y = 1.7;
const BOUNCE_VELOCITY = 13.5;
const CHECKPOINT_INTERVAL = 45;
const DASH_COOLDOWN = 2.0;
const DASH_DURATION = 0.45;
const DASH_SPEED_BONUS = 8.5;
const POWER_DURATION = 8;
const MAGNET_RADIUS = 6.2;
const BOOST_PAD_BONUS = 4.5;
const RESPAWN_INVULN = 1.6;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 240);
  private readonly input = new InputController(
    document.querySelector('#touch-stick') as HTMLElement,
    document.querySelector('#touch-knob') as HTMLElement,
    document.querySelector('#dash-button') as HTMLElement,
  );
  /** P1 always exists; P2 only in coop */
  private players: PlayerSlot[] = [];
  private coop = false;
  private readonly crystals: Crystal[] = [];
  private readonly powerups: PowerUp[] = [];
  private readonly hazards: Hazard[] = [];
  private readonly hazardDefs: HazardSpawn[] = [];
  private readonly boostPadMeshes: THREE.Mesh[] = [];
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud();
  private readonly cameraRig = new CameraRig(this.camera);
  private readonly particles = new ParticleBursts(480);
  private readonly popups: ScorePopups;
  private post: PostPipeline;
  private environment;
  private winCinematic = 0;
  private save: SaveData = loadSave();
  private powerTimers = { magnet: 0, shield: 0, boost: 0 };
  private dashCooldown = 0;
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly runnerTuning: RunnerTuning = { ...DEFAULT_RUNNER_TUNING };
  private readonly tuning: DebugTuning = {
    exposure: 1.05,
    maxDpr: 2,
  };

  private readonly debugTools: DebugTools;
  private course: CourseData;
  private frame = 0;
  private score = 0;
  private elapsed = 0;
  private distance = 0;
  private lives = MAX_LIVES;
  private combo = 0;
  private comboTimer = 0;
  private infiniteLives = false;
  private keysCollected = 0;
  private keysRequired = 0;
  private bossUnlocked = false;
  private mode: UiPanel = 'title';
  private gameMode: GameMode = 'stages';
  private selectedStage = 1;
  private endlessWave = 0;
  private timeLeft = 0;
  private loadout: Array<'magnet' | 'shield' | 'boost'> = [];
  private maxLives = MAX_LIVES;
  private invuln = 0;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private hitstopRemaining = 0;
  private timeScale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    this.environment = createEnvironment(this.renderer);
    this.scene.environment = this.environment.envMap;
    this.scene.environmentIntensity = 0.45;

    this.post = createPostPipeline(this.renderer, this.scene, this.camera);
    this.popups = new ScorePopups(this.camera);

    this.players = [new PlayerSlot(0, this.scene)];

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
      this.syncPostSize();
    });

    this.course = buildCourse({
      seed: 1,
      baseDifficulty: 0.2,
      segments: 24,
      narrowBias: 0.08,
      crumbleBias: 0.08,
      movingBias: 0.08,
      bouncyBias: 0.1,
      spinnerRate: 0.05,
      mineRate: 0.03,
      laserRate: 0,
      windRate: 0,
      droneRate: 0,
      endless: false,
      exclusive: 'none',
      bossKeys: 0,
    });
    this.createScene();
    this.bindUi();
    this.cameraRig.snapTo(this.p1.runner.group.position);
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.syncPostSize();
    this.installTestHooks();
    this.audio.setMuted(this.save.muted);
    this.reducedMotion = this.save.reducedMotion;
    this.applyQuality();
    this.hud.setSettingsLabels(this.save.quality, this.save.reducedMotion);
    this.setMode('title');
    this.publishDiagnostics();
  }

  private get p1(): PlayerSlot {
    return this.players[0];
  }

  /** Primary runner (P1). */
  private get runner(): Runner {
    return this.p1.runner;
  }

  private ensureCoopPlayer(): void {
    if (this.players.length >= 2) return;
    this.players.push(new PlayerSlot(1, this.scene));
    this.players[1].setSkin((this.save.skin2 as SkinId) || 'pyro');
    const el = document.querySelector('#skin2-block');
    if (el) (el as HTMLElement).hidden = false;
  }

  private trimCoopPlayer(): void {
    if (this.players.length < 2) return;
    const p2 = this.players.pop();
    p2?.dispose(this.scene);
    const el = document.querySelector('#skin2-block');
    if (el) (el as HTMLElement).hidden = true;
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    for (const c of this.crystals) c.dispose();
    this.crystals.length = 0;
    for (const p of this.powerups) p.dispose();
    this.powerups.length = 0;
    for (const h of this.hazards) h.dispose();
    this.hazards.length = 0;
    this.hazardDefs.length = 0;
    for (const m of this.boostPadMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.boostPadMeshes.length = 0;
    for (const p of this.players) p.dispose(this.scene);
    this.players.length = 0;
    this.particles.dispose();
    this.popups.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.course.dispose();
    disposeSharedIslandTextures();
    disposeGameTextures();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private createScene(): void {
    this.scene.fog = new THREE.FogExp2('#6a7898', 0.0075);
    this.scene.add(this.environment.group);
    this.scene.add(this.course.group);
    this.scene.add(this.particles.points);
    this.spawnCrystals();
    this.spawnPowerupsHazardsPads();
    const start = this.course.islands[0];
    this.p1.reset(
      new THREE.Vector3(start.position.x, start.topY, start.position.z - 1),
      MAX_LIVES,
      0,
    );
    this.p1.input.setP1ArrowsEnabled(true);
    this.hud.setTarget(this.crystals.length);
    this.hud.setMuteLabel(this.save.muted);
    this.hud.setTitleBest(this.save.bestDistance, this.save.bestStars);
  }

  private spawnPowerupsHazardsPads(): void {
    for (const p of this.powerups) {
      this.scene.remove(p.group);
      p.dispose();
    }
    this.powerups.length = 0;
    for (const h of this.hazards) {
      this.scene.remove(h.group);
      h.dispose();
    }
    this.hazards.length = 0;
    this.hazardDefs.length = 0;
    for (const m of this.boostPadMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.boostPadMeshes.length = 0;

    this.course.powerSpawns.forEach((spawn, i) => {
      const pu = new PowerUp(i, spawn.position.clone(), spawn.kind);
      this.powerups.push(pu);
      this.scene.add(pu.group);
    });

    this.hazardDefs.push(...this.course.hazardSpawns);
    for (const def of this.course.hazardSpawns) {
      const h = new Hazard(def);
      this.hazards.push(h);
      this.scene.add(h.group);
    }

    for (const pad of this.course.boostPads) {
      const geo = new THREE.RingGeometry(pad.radius * 0.45, pad.radius, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: '#f0b35a',
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(pad.position);
      mesh.position.y += 0.03;
      mesh.name = `boost-pad-${pad.id}`;
      mesh.userData.pad = pad;
      this.boostPadMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  private spawnCrystals(): void {
    for (const c of this.crystals) {
      this.scene.remove(c.group);
      c.dispose();
    }
    this.crystals.length = 0;

    let index = 0;
    const keySet = new Set(this.course.keyCrystalIds);
    for (const island of this.course.islands) {
      if (!island.hasCrystal && !keySet.has(island.id)) continue;
      const ox = Math.sin(island.id * 1.7) * island.radius * 0.55;
      const oz = Math.cos(island.id * 2.1) * island.radius * 0.55;
      const by = island.topY + 1.05;
      const cx = islandCenterX(island, 0);
      const pos = new THREE.Vector3(cx + ox, by, island.position.z + oz);
      const isKey = keySet.has(island.id);
      const tone = isKey
        ? ('key' as const)
        : island.radius > 3 || island.kind === 'moving'
          ? ('gold' as const)
          : ('cyan' as const);
      const crystal = new Crystal(index, pos, tone);
      crystal.group.userData.islandId = island.id;
      crystal.group.userData.baseOffsetX = ox;
      crystal.group.userData.baseOffsetZ = oz;
      crystal.group.userData.baseY = by;
      crystal.group.userData.isKey = isKey;
      this.crystals.push(crystal);
      this.scene.add(crystal.group);
      index += 1;
    }
  }

  private bindUi(): void {
    const on = (selector: string, handler: () => void) => {
      const el = document.querySelector(selector);
      if (el)
        el.addEventListener('click', (e) => {
          (e.currentTarget as HTMLElement).blur();
          handler();
        });
    };

    on('#btn-mode-stages', () => {
      this.coop = false;
      this.trimCoopPlayer();
      this.gameMode = 'stages';
      this.openStageSelect();
    });
    on('#btn-mode-endless', () => {
      this.coop = false;
      this.trimCoopPlayer();
      this.gameMode = 'endless';
      this.openLoadout();
    });
    on('#btn-mode-timetrial', () => {
      this.gameMode = 'timetrial';
      this.openLoadout();
    });
    on('#btn-mode-coop', () => {
      this.gameMode = 'coop';
      this.coop = true;
      this.ensureCoopPlayer();
      this.openLoadout();
    });
    on('#btn-back-title', () => this.setMode('title'));
    on('#btn-back-mode', () => {
      if (this.gameMode === 'stages') this.openStageSelect();
      else this.setMode('title');
    });
    on('#btn-infinite', () => {
      this.save.infiniteLives = !this.save.infiniteLives;
      writeSave(this.save);
      this.syncInfiniteBtn();
    });
    this.syncInfiniteBtn();
    on('#btn-start-run', () => this.startRun());
    on('#btn-retry', () => this.startRun());
    on('#btn-replay', () => this.startRun());
    on('#btn-restart-pause', () => this.startRun());
    on('#btn-next-stage', () => {
      this.selectedStage = Math.min(STAGES.length, this.selectedStage + 1);
      this.openLoadout();
    });
    on('#btn-quit-title', () => this.setMode('title'));
    on('#btn-fail-title', () => this.setMode('title'));
    on('#btn-win-title', () => this.setMode('title'));
    on('#btn-resume', () => this.resume());
    on('#btn-pause', () => {
      if (this.mode === 'playing') this.pause();
      else if (this.mode === 'paused') this.resume();
    });

    const toggleMute = () => {
      this.save.muted = !this.save.muted;
      writeSave(this.save);
      this.hud.setMuteLabel(this.save.muted);
      this.audio.setMuted(this.save.muted);
    };
    on('#btn-mute', toggleMute);
    on('#btn-mute-pause', toggleMute);
    on('#btn-mute-settings', toggleMute);
    on('#btn-settings', () => {
      this.hud.setSettingsLabels(this.save.quality, this.save.reducedMotion);
      this.setMode('settings');
    });
    on('#btn-back-settings', () => this.setMode('title'));
    on('#btn-quality', () => {
      this.save.quality = this.save.quality === 'high' ? 'medium' : 'high';
      writeSave(this.save);
      this.applyQuality();
      this.hud.setSettingsLabels(this.save.quality, this.save.reducedMotion);
    });
    on('#btn-motion', () => {
      this.save.reducedMotion = !this.save.reducedMotion;
      writeSave(this.save);
      this.reducedMotion = this.save.reducedMotion;
      this.hud.setSettingsLabels(this.save.quality, this.save.reducedMotion);
    });
    on('#btn-reset-save', () => {
      this.save = resetSave();
      this.audio.setMuted(this.save.muted);
      this.hud.setMuteLabel(this.save.muted);
      this.hud.setTitleBest(0, 0);
      this.hud.setSettingsLabels(this.save.quality, this.save.reducedMotion);
    });

    // Loadout cards
    document.querySelectorAll<HTMLElement>('.loadout-card').forEach((card) => {
      card.addEventListener('click', () => {
        const kind = card.dataset.power as 'magnet' | 'shield' | 'boost' | undefined;
        if (!kind) return;
        const idx = this.loadout.indexOf(kind);
        if (idx >= 0) this.loadout.splice(idx, 1);
        else if (this.loadout.length < 2) this.loadout.push(kind);
        else {
          this.loadout.shift();
          this.loadout.push(kind);
        }
        document.querySelectorAll<HTMLElement>('.loadout-card').forEach((c) => {
          const k = c.dataset.power as 'magnet' | 'shield' | 'boost' | undefined;
          c.classList.toggle('selected', !!k && this.loadout.includes(k));
        });
        this.hud.setLoadoutSelected(this.loadout);
      });
    });

    // Skin swatches — P1
    document.querySelectorAll<HTMLElement>('.skin-swatch[data-skin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.skin as SkinId | undefined;
        if (!id) return;
        this.save.skin = id;
        writeSave(this.save);
        this.p1.setSkin(id);
        document.querySelectorAll('.skin-swatch[data-skin]').forEach((b) => {
          b.classList.toggle('selected', b === btn);
        });
      });
      if (btn.dataset.skin === this.save.skin) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
    // Skin swatches — P2
    document.querySelectorAll<HTMLElement>('.skin-swatch[data-skin2]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.skin2 as SkinId | undefined;
        if (!id) return;
        this.save.skin2 = id;
        writeSave(this.save);
        if (this.players.length >= 2) this.players[1].setSkin(id);
        document.querySelectorAll('.skin-swatch[data-skin2]').forEach((b) => {
          b.classList.toggle('selected', b === btn);
        });
      });
      if (btn.dataset.skin2 === this.save.skin2) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
    this.p1.setSkin((this.save.skin as SkinId) || 'jade');

    const boostBtn = document.querySelector<HTMLElement>('#boost-button');
    if (boostBtn) {
      boostBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.p1.pendingDash = true;
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.mode === 'playing') this.pause();
        else if (this.mode === 'paused') this.resume();
      }
      if (
        e.code === 'KeyR' &&
        (this.mode === 'fail' || this.mode === 'win' || this.mode === 'playing')
      ) {
        this.startRun();
      }
    });
  }

  private openStageSelect(): void {
    this.hud.renderStageList(
      STAGES.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        subtitle: s.subtitle,
        locked: s.id > this.save.unlockedStage,
        stars: this.save.stageStars[String(s.id)] ?? 0,
        exclusive: s.exclusive,
        bossKeys: s.bossKeys,
        preview: s.preview,
        difficulty: s.difficulty,
      })),
      (id) => {
        this.selectedStage = id;
        this.openLoadout();
      },
    );
    this.setMode('stages');
  }

  private syncInfiniteBtn(): void {
    const btn = document.querySelector<HTMLElement>('#btn-infinite');
    const state = document.querySelector('#infinite-state');
    const on = this.save.infiniteLives;
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (state) state.textContent = on ? '开' : '关';
    this.infiniteLives = on;
  }

  private openLoadout(): void {
    const hint = document.querySelector('#loadout-hint');
    if (hint) {
      if (this.gameMode === 'stages') {
        const s = this.currentStage();
        hint.textContent = `${s.code} ${s.name} · 可选 0–2 个开局道具`;
      } else if (this.gameMode === 'coop') {
        hint.textContent = '双人合作 · 各选外观后出发';
      } else {
        hint.textContent = '可选 0–2 个开局道具（关卡内仍可拾取）';
      }
    }
    this.setMode('loadout');
  }

  private currentStage(): StageTheme {
    return STAGES.find((s) => s.id === this.selectedStage) ?? STAGES[0];
  }

  private currentConfig(seed: number): CourseConfig {
    if (this.gameMode === 'endless') return endlessConfig(seed, this.endlessWave);
    if (this.gameMode === 'timetrial') return timeTrialConfig(seed);
    return stageToConfig(this.currentStage(), seed);
  }

  private startRun(): void {
    const startBtn = document.querySelector<HTMLButtonElement>('#btn-start-run');
    if (startBtn) {
      startBtn.disabled = true;
      setTimeout(() => {
        startBtn.disabled = false;
      }, 250);
    }
    const seed = this.rngSeedFromTime();
    this.infiniteLives = this.save.infiniteLives;
    if (this.gameMode === 'stages') {
      const stage = this.currentStage();
      this.maxLives = stage.lives;
      this.applyStageTheme(stage);
    } else {
      this.maxLives = MAX_LIVES;
      this.applyStageTheme(STAGES[this.gameMode === 'endless' ? 2 : 1]);
    }
    this.rebuildCourse(this.currentConfig(seed));
    this.score = 0;
    this.elapsed = 0;
    this.distance = 0;
    this.lives = this.infiniteLives ? 99 : this.maxLives;
    this.combo = 0;
    this.comboTimer = 0;
    this.invuln = 0;
    this.hitstopRemaining = 0;
    this.timeScale = 1;
    this.winCinematic = 0;
    this.powerTimers = { magnet: 0, shield: 0, boost: 0 };
    this.dashCooldown = 0;
    this.endlessWave = this.gameMode === 'endless' ? this.endlessWave : 0;
    this.timeLeft = this.gameMode === 'timetrial' ? TIME_TRIAL_LIMIT : 0;
    this.audio.setMuted(this.save.muted);

    const stageSpeed = this.gameMode === 'stages' ? this.currentStage().speedBonus : 1;
    this.runnerTuning.autoSpeed = DEFAULT_RUNNER_TUNING.autoSpeed + stageSpeed * 0.4;
    this.runnerTuning.maxAutoSpeed = DEFAULT_RUNNER_TUNING.maxAutoSpeed + stageSpeed * 0.5;
    this.runnerTuning.speedRamp = DEFAULT_RUNNER_TUNING.speedRamp;
    this.input.reset();
    this.p1.setSkin((this.save.skin as SkinId) || 'jade');
    if (this.coop) this.ensureCoopPlayer();
    else this.trimCoopPlayer();

    const start = this.course.islands[0];
    const startVec = new THREE.Vector3(start.position.x, start.topY, start.position.z - 0.5);
    const n = this.players.length;
    const startLives = this.infiniteLives ? 99 : this.maxLives;
    for (let i = 0; i < n; i += 1) {
      const pl = this.players[i];
      const ox = n === 1 ? 0 : i === 0 ? -0.55 : 0.55;
      pl.reset(startVec, startLives, ox);
      pl.input.setP1ArrowsEnabled(i === 0 && n === 1);
      for (const k of this.loadout) pl.powerTimers[k] = POWER_DURATION;
      pl.tuning.autoSpeed = this.runnerTuning.autoSpeed;
      pl.tuning.maxAutoSpeed = this.runnerTuning.maxAutoSpeed;
      pl.tuning.speedRamp = this.runnerTuning.speedRamp;
    }
    this.powerTimers = { ...this.p1.powerTimers };
    this.cameraRig.snapTo(this.focusPoint());
    this.hud.setTarget(this.crystals.length);
    this.post.setBloom(0.55);
    this.hud.setCoop(this.coop);

    if (this.gameMode === 'timetrial') this.hud.setTimer(this.timeLeft);
    else this.hud.hideTimer();

    const nextBtn = document.querySelector<HTMLElement>('#btn-next-stage');
    if (nextBtn) nextBtn.hidden = true;

    this.setMode('playing');
    void this.audio.unlock();

    // Soft first-run hint (once per save)
    if (!this.save.hintShown) {
      this.save.hintShown = true;
      writeSave(this.save);
      this.hud.showHint('左右移动 · 空格跳跃 · Shift冲刺', 3500);
    } else if (this.gameMode === 'stages') {
      const stage = this.currentStage();
      if (stage.bossKeys > 0) {
        this.hud.showHint(`收集 ${stage.bossKeys} 颗粉色钥匙解锁终点门`, 2800);
      }
    }
  }

  private focusPoint(): THREE.Vector3 {
    if (this.players.length < 2) return this.p1.runner.group.position.clone();
    const a = this.players[0].runner.group.position;
    const b = this.players[1].runner.group.position;
    return new THREE.Vector3(
      (a.x + b.x) * 0.5,
      (a.y + b.y) * 0.5 + 0.3,
      Math.max(a.z, b.z) * 0.65 + ((a.z + b.z) * 0.5) * 0.35,
    );
  }

  private applyStageTheme(stage: StageTheme): void {
    const sky = this.environment.sky;
    const mat = sky.material as THREE.ShaderMaterial;
    mat.uniforms.topColor.value.set(stage.skyTop);
    mat.uniforms.midColor.value.set(stage.skyMid);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(stage.fog);
      this.scene.fog.density = 0.008;
    }
    // Tint island grass caps (green-dominant materials with albedo map)
    this.course.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!m || !m.map) return;
      if (m.color.g > m.color.r && m.color.g > m.color.b) m.color.set(stage.grass);
    });
  }

  private applyQuality(): void {
    const high = this.save.quality === 'high';
    this.tuning.maxDpr = high ? 2 : 1;
    this.environment.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    this.environment.sun.shadow.map?.dispose();
    this.environment.sun.shadow.map = null;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.syncPostSize();
  }

  private rebuildCourse(config: CourseConfig): void {
    this.scene.remove(this.course.group);
    this.course.dispose();
    for (const c of this.crystals) {
      this.scene.remove(c.group);
      c.dispose();
    }
    this.crystals.length = 0;
    for (const p of this.powerups) {
      this.scene.remove(p.group);
      p.dispose();
    }
    this.powerups.length = 0;
    for (const h of this.hazards) {
      this.scene.remove(h.group);
      h.dispose();
    }
    this.hazards.length = 0;
    this.hazardDefs.length = 0;
    for (const m of this.boostPadMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.boostPadMeshes.length = 0;
    this.course = buildCourse(config);
    this.scene.add(this.course.group);
    this.keysRequired = this.course.bossKeysRequired;
    this.keysCollected = 0;
    this.bossUnlocked = this.keysRequired === 0;
    this.spawnCrystals();
    this.spawnPowerupsHazardsPads();
    this.hud.setKeys(this.keysCollected, this.keysRequired);
  }

  private rngSeedFromTime(): number {
    return (Math.floor(performance.now()) ^ 0x9e3779b9) >>> 0;
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.setMode('paused');
  }

  private resume(): void {
    if (this.mode !== 'paused') return;
    this.setMode('playing');
  }

  private setMode(mode: UiPanel): void {
    this.mode = mode;
    if (mode === 'paused') {
      this.hud.showPause(this.score, this.crystals.length, this.distance);
    }
    this.hud.showPanel(mode);
  }

  private finishRun(won: boolean): void {
    const stars = computeStars(
      this.score,
      this.crystals.length,
      this.infiniteLives ? 0 : this.lives,
      this.maxLives,
    );
    this.save.runs += 1;
    if (this.distance > this.save.bestDistance) this.save.bestDistance = this.distance;
    if (this.score > this.save.bestScore) this.save.bestScore = this.score;

    if (this.gameMode === 'stages' && won) {
      const key = String(this.selectedStage);
      const prev = this.save.stageStars[key] ?? 0;
      if (stars > prev) this.save.stageStars[key] = stars;
      if (this.selectedStage >= this.save.unlockedStage && this.selectedStage < STAGES.length) {
        this.save.unlockedStage = this.selectedStage + 1;
      }
    } else if (this.gameMode === 'endless' && this.distance > this.save.endlessBest) {
      this.save.endlessBest = this.distance;
    } else if (this.gameMode === 'timetrial' && won && this.score > this.save.timetrialBest) {
      this.save.timetrialBest = this.score;
    }
    if (won && stars > this.save.bestStars) this.save.bestStars = stars;
    writeSave(this.save);
    this.hud.setTitleBest(this.save.bestDistance, this.save.bestStars);

    const failTitle = document.querySelector('#fail-title');
    if (failTitle) {
      failTitle.textContent =
        this.gameMode === 'timetrial' && this.timeLeft <= 0 ? '时间到' : '挑战失败';
    }
    const nextBtn = document.querySelector<HTMLElement>('#btn-next-stage');
    if (nextBtn) {
      nextBtn.hidden = !(
        won &&
        this.gameMode === 'stages' &&
        this.selectedStage < STAGES.length
      );
    }

    this.hud.update({
      score: this.score,
      target: this.crystals.length,
      distance: this.distance,
      finishZ: this.course.finishZ,
      lives: this.lives,
      maxLives: this.maxLives,
      combo: this.combo,
      bestDistance: this.save.bestDistance,
      dashReady: 1,
      powers: { ...this.powerTimers },
      mode: won ? 'win' : 'fail',
    });
    if (won) {
      this.hud.showWin(
        this.score,
        this.crystals.length,
        this.distance,
        stars,
        this.save.bestDistance,
        this.elapsed,
      );
    } else {
      this.hud.showFail(
        this.score,
        this.crystals.length,
        this.distance,
        stars,
        this.save.bestDistance,
        this.elapsed,
      );
    }
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.syncPostSize();
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    const animDelta = this.reducedMotion ? 0 : delta;

    if (this.mode === 'playing') {
      this.hitstopRemaining = Math.max(0, this.hitstopRemaining - delta);
      this.timeScale = this.hitstopRemaining > 0 ? 0.08 : 1;
      const gDelta = delta * this.timeScale;
      this.elapsed += gDelta;
      this.invuln = Math.max(0, this.invuln - gDelta);
      this.comboTimer = Math.max(0, this.comboTimer - gDelta);
      if (this.comboTimer <= 0) this.combo = 0;

      this.updateIslands(gDelta, this.elapsed);

      const diff = THREE.MathUtils.clamp(this.distance / 160, 0, 1);
      const baseAuto = DEFAULT_RUNNER_TUNING.autoSpeed + diff * 3.2;
      const baseMax = DEFAULT_RUNNER_TUNING.maxAutoSpeed + diff * 3.5;
      const baseRamp = DEFAULT_RUNNER_TUNING.speedRamp + diff * 0.22;

      for (const pl of this.players) {
        if (pl.finished || pl.lives <= 0) {
          pl.runner.update(0, elapsed, 0, false, pl.tuning, pl.runner.group.position.y, false);
          continue;
        }
        pl.tuning.autoSpeed = baseAuto;
        pl.tuning.maxAutoSpeed = baseMax;
        pl.tuning.speedRamp = baseRamp;

        const steer = new THREE.Vector2();
        if (pl.index === 0) {
          // P1: keyboard A/D via PlayerInput + touch stick via InputController
          pl.input.readSteerWithTouch(steer);
          const touch = new THREE.Vector2();
          this.input.readSteer(touch);
          if (Math.abs(touch.x) > Math.abs(steer.x)) steer.x = touch.x;
        } else {
          pl.input.readSteerWithTouch(steer);
        }
        const jump = pl.input.tryConsumeJump();
        const dashReq = pl.input.tryConsumeDash() || pl.pendingDash;
        pl.pendingDash = false;
        const wasGrounded = pl.runner.grounded;
        const surface = this.sampleSurface(
          pl.runner.group.position.x,
          pl.runner.group.position.z,
        );
        const surfaceY = surface ? surface.topY : null;

        pl.runner.update(gDelta, elapsed, steer.x, jump, pl.tuning, surfaceY, true);

        if (jump && wasGrounded) this.audio.jump();
        if (!wasGrounded && pl.runner.grounded) {
          this.audio.land();
          this.cameraRig.addTrauma(0.1);
          const landPos = pl.runner.group.position
            .clone()
            .setY(surfaceY ?? pl.runner.group.position.y);
          this.particles.ring(landPos, new THREE.Color('#e8dcc8'), 16, 2.6);
          if (surface?.kind === 'bouncy') {
            pl.runner.launch(BOUNCE_VELOCITY);
            this.audio.bounce();
            this.cameraRig.addTrauma(0.18);
            this.particles.burst(
              pl.runner.group.position.clone().setY(surface.topY + 0.3),
              new THREE.Color('#66e0c0'),
              22,
              5,
            );
          }
          if (surface?.kind === 'crumble' && !surface.crumbled && surface.crumbleTimer <= 0) {
            surface.crumbleTimer = 0.85;
          }
        }

        if (pl.runner.grounded && !this.reducedMotion) {
          pl.footstepAccumulator += gDelta;
          const stepRate = 0.28 - Math.min(0.1, pl.runner.forwardSpeed.value * 0.005);
          if (pl.footstepAccumulator >= stepRate) {
            pl.footstepAccumulator = 0;
            this.audio.footstep();
          }
        }

        if (pl.runner.grounded && surface?.kind === 'crumble' && !surface.crumbled) {
          if (surface.crumbleTimer <= 0) surface.crumbleTimer = 0.85;
          surface.crumbleTimer -= gDelta;
          if (surface.crumbleTimer <= 0) {
            surface.crumbled = true;
            this.shatterIsland(surface);
            this.audio.crumble();
          }
        }

        pl.powerTimers.magnet = Math.max(0, pl.powerTimers.magnet - gDelta);
        pl.powerTimers.shield = Math.max(0, pl.powerTimers.shield - gDelta);
        pl.powerTimers.boost = Math.max(0, pl.powerTimers.boost - gDelta);
        pl.dashCooldown = Math.max(0, pl.dashCooldown - gDelta);
        pl.dashTime = Math.max(0, pl.dashTime - gDelta);
        pl.hazardCooldown = Math.max(0, pl.hazardCooldown - gDelta);
        pl.boostPadCooldown = Math.max(0, pl.boostPadCooldown - gDelta);
        pl.invuln = Math.max(0, pl.invuln - gDelta);
        pl.comboTimer = Math.max(0, pl.comboTimer - gDelta);
        if (pl.comboTimer <= 0) pl.combo = 0;

        if (dashReq && pl.dashCooldown <= 0) {
          pl.dashCooldown = DASH_COOLDOWN;
          pl.dashTime = DASH_DURATION;
          pl.runner.forwardSpeed.value = Math.min(
            pl.tuning.maxAutoSpeed + 4,
            pl.runner.forwardSpeed.value + DASH_SPEED_BONUS,
          );
          this.cameraRig.addTrauma(0.16);
          this.audio.bounce();
          this.popups.spawn(
            pl.runner.group.position.clone().setY(pl.runner.group.position.y + 1.4),
            `${pl.label} 冲刺！`,
            pl.index === 0 ? '#5ee0c8' : '#f0b35a',
          );
        }
        if (pl.powerTimers.boost > 0 || pl.dashTime > 0) {
          pl.runner.forwardSpeed.value = Math.max(
            pl.runner.forwardSpeed.value,
            pl.tuning.autoSpeed + 3.2,
          );
        }

        if (!this.reducedMotion && pl.runner.forwardSpeed.value > 8) {
          pl.trailAccumulator += gDelta;
          while (pl.trailAccumulator >= 0.03) {
            pl.trailAccumulator -= 0.03;
            this.particles.trail(
              pl.runner.group.position,
              pl.index === 0 ? new THREE.Color('#9af0ff') : new THREE.Color('#ffd090'),
              1,
            );
          }
        }
      }

      this.audio.setWindIntensity(this.p1.runner.forwardSpeed.value);
      this.distance = Math.max(0, ...this.players.map((pl) => pl.runner.group.position.z));
      this.collectCrystals();
      this.updatePickupsAndHazards(gDelta, elapsed);
      this.checkCheckpoint();
      this.checkGoal();
      this.checkVoid();

      if (this.gameMode === 'timetrial') {
        this.timeLeft = Math.max(0, this.timeLeft - gDelta);
        this.hud.setTimer(this.timeLeft);
        if (this.timeLeft <= 0 && this.mode === 'playing') {
          this.setMode('fail');
          this.finishRun(false);
        }
      }

      this.cameraRig.update(delta, this.focusPoint(), 0.14, 0, this.p1.runner.forwardSpeed.value);
      const speedT = THREE.MathUtils.clamp((this.p1.runner.forwardSpeed.value - 7) / 8, 0, 1);
      this.cameraRig.setFov(52 + speedT * 9);
      this.post.setBloom(0.5 + speedT * 0.2);
      this.score = this.players.reduce((s, pl) => s + pl.score, 0);
      this.combo = Math.max(...this.players.map((pl) => pl.combo), 0);
      this.lives = Math.max(...this.players.map((pl) => pl.lives), 0);
      this.powerTimers = { ...this.p1.powerTimers };
      this.dashCooldown = this.p1.dashCooldown;
      this.animateGoalGate(elapsed);
    } else if (this.mode === 'win') {
      this.winCinematic = Math.min(1, this.winCinematic + delta * 0.8);
      this.cameraRig.setFov(52 - this.winCinematic * 6);
      this.post.setBloom(0.55 + this.winCinematic * 0.35);
      this.cameraRig.update(delta, this.runner.group.position, 0.2, 0, 0);
      this.animateGoalGate(elapsed);
      this.runner.update(0, elapsed, 0, false, this.runnerTuning, this.runner.group.position.y, false);
    } else {
      if (this.mode === 'title') {
        const t = elapsed * 0.12;
        const start = this.course.islands[0];
        this.camera.position.set(
          start.position.x + Math.sin(t) * 10,
          start.topY + 6,
          start.position.z - 8 + Math.cos(t) * 3,
        );
        this.camera.lookAt(start.position.x, start.topY + 1, start.position.z + 6);
      }
      this.runner.update(0, elapsed, 0, false, this.runnerTuning, null, false);
      this.animateGoalGate(elapsed);
    }

    for (const crystal of this.crystals) crystal.update(animDelta, elapsed);
    this.environment.update(animDelta, elapsed, this.camera.position);

    const p = this.focusPoint();
    this.environment.sun.position.set(p.x - 22, p.y + 32, p.z - 8);
    this.environment.sun.target.position.copy(p);
    this.environment.rim.position.set(p.x + 10, p.y + 10, p.z + 22);
    this.environment.rim.target.position.copy(p);

    this.particles.update(delta);
    this.popups.update(delta);
    this.hud.update({
      score: this.score,
      target: this.crystals.length,
      distance: this.distance,
      finishZ: this.course.finishZ,
      lives: this.lives,
      maxLives: this.maxLives,
      combo: this.combo,
      bestDistance: Math.max(this.save.bestDistance, this.distance),
      dashReady: this.dashCooldown <= 0 ? 1 : 1 - this.dashCooldown / DASH_COOLDOWN,
      powers: { ...this.powerTimers },
      stageLabel:
        this.gameMode === 'stages'
          ? this.currentStage().code
          : this.gameMode === 'endless'
            ? `波次 ${this.endlessWave + 1}`
            : this.gameMode === 'timetrial'
              ? '计时'
              : this.gameMode === 'coop'
                ? '双人'
                : '',
      mode: this.mode,
    });
    this.publishDiagnostics();
  }

  private updatePickupsAndHazards(_delta: number, elapsed: number): void {
    // Power-ups — any player can collect
    for (const pu of this.powerups) {
      if (!pu.active) continue;
      pu.update(_delta, elapsed);
      for (const pl of this.players) {
        if (pl.finished || pl.lives <= 0) continue;
        if (pl.runner.group.position.distanceTo(pu.group.position) > 1.35) continue;
        pu.collect();
        pl.powerTimers[pu.powerKind] = POWER_DURATION;
        this.audio.pickup(5);
        this.cameraRig.addTrauma(0.1);
        const labels = { magnet: '磁铁', shield: '护盾', boost: '加速' } as const;
        const colors = {
          magnet: '#ff7a9a',
          shield: '#7ab8ff',
          boost: '#f0b35a',
        } as const;
        this.popups.spawn(
          pu.group.position.clone(),
          `${pl.label} ${labels[pu.powerKind]}`,
          colors[pu.powerKind],
        );
        this.particles.burst(
          pu.group.position.clone(),
          new THREE.Color(colors[pu.powerKind]),
          22,
          5,
        );
        break;
      }
    }

    // Boost pads
    for (const mesh of this.boostPadMeshes) {
      const pad = mesh.userData.pad as { position: THREE.Vector3; radius: number };
      if (!pad) continue;
      mesh.rotation.z = elapsed * 1.5;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(elapsed * 4) * 0.2;
      for (const pl of this.players) {
        if (pl.finished || pl.lives <= 0 || pl.boostPadCooldown > 0) continue;
        const p = pl.runner.group.position;
        const dx = p.x - pad.position.x;
        const dz = p.z - pad.position.z;
        if (dx * dx + dz * dz > pad.radius * pad.radius) continue;
        if (Math.abs(p.y - pad.position.y) > 0.6) continue;
        pl.boostPadCooldown = 1.2;
        pl.runner.forwardSpeed.value = Math.min(
          pl.tuning.maxAutoSpeed + 3,
          pl.runner.forwardSpeed.value + BOOST_PAD_BONUS,
        );
        pl.powerTimers.boost = Math.max(pl.powerTimers.boost, 3);
        this.audio.bounce();
        this.popups.spawn(p.clone().setY(p.y + 1.3), `${pl.label} 加速板`, '#f0b35a');
        this.particles.ring(pad.position.clone(), new THREE.Color('#f0b35a'), 18, 3.5);
        this.cameraRig.addTrauma(0.12);
      }
    }

    // Magnet attract per player
    for (const pl of this.players) {
      if (pl.powerTimers.magnet <= 0 || pl.finished || pl.lives <= 0) continue;
      const p = pl.runner.group.position;
      for (const crystal of this.crystals) {
        if (!crystal.active) continue;
        const c = crystal.group.position;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > MAGNET_RADIUS * MAGNET_RADIUS || distSq < 0.01) continue;
        c.x += dx * 0.18;
        c.z += dz * 0.18;
      }
    }

    // Hazards vs each player
    const focus = this.focusPoint();
    for (let i = 0; i < this.hazards.length; i += 1) {
      const h = this.hazards[i];
      const def = this.hazardDefs[i];
      if (!def) continue;
      h.update(elapsed, def, focus);

      for (const pl of this.players) {
        if (pl.finished || pl.lives <= 0) continue;
        if (pl.hazardCooldown > 0 || pl.invuln > 0 || pl.dashTime > 0) continue;
        const p = pl.runner.group.position;

        let hit = false;
        if (def.kind === 'spinner') {
          hit = h.hitsSpinner(p.x, p.z, elapsed, def);
        } else if (def.kind === 'mine') {
          hit = h.hitsMine(p.x, p.z, p.y, def);
        } else if (def.kind === 'laser') {
          hit = h.hitsLaser(p.x, p.z, p.y, elapsed, def);
        } else if (def.kind === 'drone') {
          hit = h.hitsDrone(p.x, p.z, p.y, def);
        } else if (def.kind === 'wind') {
          const force = h.windForce(p.x, p.z, def);
          if (force > 0) {
            pl.runner.group.position.x += force * _delta * (def.phase > Math.PI ? 1 : -1);
          }
          continue;
        }
        if (!hit) continue;

        pl.hazardCooldown = 1.0;
        this.cameraRig.addTrauma(0.4);
        this.hitstopRemaining = 0.07;
        if (pl.powerTimers.shield > 0) {
          pl.powerTimers.shield = 0;
          this.popups.spawn(p.clone().setY(p.y + 1.5), `${pl.label} 护盾抵挡！`, '#7ab8ff');
          this.particles.burst(p.clone(), new THREE.Color('#7ab8ff'), 26, 5);
          this.audio.land();
        } else {
          if (this.infiniteLives) {
            pl.combo = 0;
            pl.comboTimer = 0;
            this.popups.spawn(p.clone().setY(p.y + 1.5), `${pl.label} 受伤！`, '#ff6a6a');
            this.particles.burst(p.clone(), new THREE.Color('#ff6a6a'), 18, 4);
            this.audio.fall();
            pl.runner.forwardSpeed.value *= 0.7;
          } else {
            pl.lives -= 1;
            pl.combo = 0;
            pl.comboTimer = 0;
            this.popups.spawn(p.clone().setY(p.y + 1.5), `${pl.label} 受伤！`, '#ff6a6a');
            this.particles.burst(p.clone(), new THREE.Color('#ff6a6a'), 22, 5);
            this.audio.fall();
            pl.runner.forwardSpeed.value *= 0.55;
            if (pl.lives <= 0) {
              pl.finished = true;
              const alive = this.players.filter((x) => x.lives > 0);
              if (alive.length === 0) {
                this.setMode('fail');
                this.finishRun(false);
                return;
              }
            }
          }
        }
      }
    }
  }

  private sampleSurface(x: number, z: number): IslandDef | null {
    return findIslandAt(this.course.islands, x, z, this.elapsed);
  }

  private updateIslands(_delta: number, elapsed: number): void {
    for (const island of this.course.islands) {
      const mesh = this.course.meshes.get(island.id);
      if (!mesh) continue;

      if (island.kind === 'moving' && !this.reducedMotion) {
        island.visualOffsetX = islandCenterX(island, elapsed) - island.position.x;
        mesh.group.position.x = island.position.x + island.visualOffsetX;
        if (mesh.glowRing) {
          mesh.glowRing.rotation.z = elapsed * 1.2;
          const mat = mesh.glowRing.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.5 + Math.sin(elapsed * 3 + island.movePhase) * 0.2;
        }
        for (const crystal of this.crystals) {
          if (!crystal.active) continue;
          if (crystal.group.userData.islandId !== island.id) continue;
          const ox = crystal.group.userData.baseOffsetX as number;
          const oz = crystal.group.userData.baseOffsetZ as number;
          const by = crystal.group.userData.baseY as number;
          crystal.group.position.set(
            island.position.x + island.visualOffsetX + ox,
            by + Math.sin(elapsed * 2.4 + crystal.index) * 0.14,
            island.position.z + oz,
          );
        }
      }

      if (island.kind === 'crumble' && !island.crumbled && island.crumbleTimer > 0) {
        const shake = island.crumbleTimer / 0.85;
        mesh.group.position.x = island.position.x + Math.sin(elapsed * 40) * 0.04 * shake;
        mesh.group.position.y = -0.08 * (1 - shake);
        if (mesh.crumbleCap) {
          const mat = mesh.crumbleCap.material as THREE.MeshStandardMaterial;
          mat.emissive = new THREE.Color('#aa3311');
          mat.emissiveIntensity = 0.4 + (1 - shake) * 0.9;
        }
      }

      if (island.kind === 'bouncy' && mesh.bounceCap && !this.reducedMotion) {
        const pulse = 1 + Math.sin(elapsed * 3 + island.id) * 0.04;
        mesh.bounceCap.scale.set(pulse, 1 / pulse, pulse);
      }
    }
  }

  private shatterIsland(island: IslandDef): void {
    const mesh = this.course.meshes.get(island.id);
    const cx = islandCenterX(island, this.elapsed);
    const origin = new THREE.Vector3(cx, island.topY, island.position.z);
    this.particles.burst(origin, new THREE.Color('#d4b07a'), 32, 5.5, 1.1);
    this.particles.ring(origin, new THREE.Color('#c49a62'), 16, 4);
    this.cameraRig.addTrauma(0.28);
    this.popups.spawn(origin.clone().setY(origin.y + 1), '崩塌！', '#ffb060');
    if (mesh) mesh.group.visible = false;
  }

  private animateGoalGate(elapsed: number): void {
    const gate = this.course.goalGate;
    const arch = gate.getObjectByName('goal-arch');
    const portal = gate.getObjectByName('goal-portal');
    const halo = gate.getObjectByName('goal-halo');
    const beam = gate.getObjectByName('goal-beam');
    if (arch) arch.rotation.z = Math.sin(elapsed * 1.5) * 0.06;
    if (portal) {
      const mat = (portal as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.32 + Math.sin(elapsed * 2.4) * 0.14;
      portal.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.04);
    }
    if (halo) {
      halo.rotation.z = elapsed * 0.8;
      const mat = (halo as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(elapsed * 3) * 0.18;
    }
    if (beam) {
      const mat = (beam as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.05 + Math.sin(elapsed * 2) * 0.03;
    }
  }

  private checkCheckpoint(): void {
    for (const pl of this.players) {
      if (pl.finished || pl.lives <= 0) continue;
      if (pl.runner.group.position.z < pl.checkpointZ + CHECKPOINT_INTERVAL) continue;
      pl.checkpointZ = pl.runner.group.position.z;
      this.audio.checkpoint();
      const pos = pl.runner.group.position.clone();
      this.popups.spawn(pos.clone().setY(pos.y + 1.6), `${pl.label} 检查点`, '#f0b35a');
      this.particles.ring(pos, new THREE.Color('#f0b35a'), 20, 3.2);
    }
  }

  private flashCollect(gold: boolean): void {
    const el = document.querySelector<HTMLElement>('#collect-flash');
    if (!el) return;
    el.style.background = gold
      ? 'radial-gradient(circle at 50% 55%, rgba(255,210,122,0.4), transparent 55%)'
      : 'radial-gradient(circle at 50% 55%, rgba(140,240,255,0.38), transparent 55%)';
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  private collectCrystals(): void {
    for (const crystal of this.crystals) {
      if (!crystal.active) continue;
      const c = crystal.group.position;
      for (const pl of this.players) {
        if (pl.finished || pl.lives <= 0) continue;
        const p = pl.runner.group.position;
        const bodyY = p.y + 0.85;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const dy = bodyY - c.y;
        if (dx * dx + dz * dz > CRYSTAL_COLLECT_XZ * CRYSTAL_COLLECT_XZ) continue;
        if (Math.abs(dy) > CRYSTAL_COLLECT_Y) continue;

        crystal.collect();
        pl.score += 1;
        pl.combo += 1;
        pl.comboTimer = COMBO_WINDOW;
        this.audio.pickup(pl.combo);
        this.hud.flashPickup();
        this.cameraRig.addTrauma(0.18);
        this.hitstopRemaining = 0.06;
        const isKey = crystal.tone === 'key';
        const gold = crystal.tone === 'gold';
        if (isKey) {
          this.keysCollected += 1;
          this.hud.setKeys(this.keysCollected, this.keysRequired);
          this.popups.spawn(c.clone().setY(c.y + 0.6), `钥匙 ${this.keysCollected}/${this.keysRequired}`, '#ff6a9a');
          if (this.keysCollected >= this.keysRequired) this.unlockBossGate();
        }
        const color = isKey
          ? new THREE.Color('#ff6a9a')
          : gold
            ? new THREE.Color('#ffd27a')
            : new THREE.Color('#6ef0ff');
        this.particles.burst(c.clone(), color, 36, 6.5, 1.1);
        this.particles.burst(c.clone(), new THREE.Color('#ffffff'), 12, 4, 0.6);
        this.particles.ring(c.clone(), color, 24, 4.2);
        this.particles.ring(c.clone(), new THREE.Color('#ffffff'), 12, 2.2);
        if (!isKey) {
          this.popups.spawn(
            c.clone().setY(c.y + 0.4),
            pl.combo >= 2 ? `${pl.label} +1 ×${pl.combo}` : `${pl.label} +1`,
            gold ? '#ffd27a' : '#6ef0ff',
          );
        }
        this.flashCollect(gold || isKey);
        break;
      }
    }
  }

  private unlockBossGate(): void {
    if (this.bossUnlocked) return;
    this.bossUnlocked = true;
    const gate = this.course.goalGate;
    gate.traverse((obj) => {
      if (obj.name.startsWith('boss-bar-') || obj.name === 'boss-lock') {
        obj.visible = false;
      }
      if (obj.name === 'goal-portal') {
        const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.color.set('#8af4ff');
        m.opacity = 0.4;
      }
      if (obj.name === 'goal-arch') {
        const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.color.set('#f0b35a');
        m.emissive.set('#8a5a18');
        m.emissiveIntensity = 1.1;
      }
      if (obj.name === 'goal-beam') {
        const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.color.set('#6ef0ff');
        m.opacity = 0.1;
      }
    });
    this.audio.win();
    this.popups.spawn(
      this.course.goalGate.position.clone().setY(this.course.goalGate.position.y + 2.5),
      'Boss 门已解锁！',
      '#ffd27a',
    );
    this.cameraRig.addTrauma(0.3);
    this.particles.burst(
      this.course.goalGate.position.clone().setY(this.course.goalGate.position.y + 1.5),
      new THREE.Color('#ffd27a'),
      40,
      7,
    );
  }

  private checkGoal(): void {
    const finish = this.course.islands[this.course.islands.length - 1];
    const finishX = finish.position.x;
    const finishZ = finish.position.z + 1.2;
    const finishY = finish.topY;

    // Mark players who reached the gate
    for (const pl of this.players) {
      if (pl.finished || pl.lives <= 0) continue;
      // Boss gate locked — bounce message once near gate
      if (this.keysRequired > 0 && !this.bossUnlocked) {
        const p0 = pl.runner.group.position;
        const dx0 = p0.x - finishX;
        const dz0 = p0.z - finishZ;
        if (dx0 * dx0 + dz0 * dz0 < 4.5 * 4.5 && Math.abs(p0.y - finishY) < 1.5) {
          if (!pl.finished) {
            this.popups.spawn(
              p0.clone().setY(p0.y + 2),
              `还需 ${this.keysRequired - this.keysCollected} 颗钥匙`,
              '#ff6a9a',
            );
            pl.runner.forwardSpeed.value *= 0.3;
            pl.runner.group.position.z -= 1.2;
          }
        }
        continue;
      }
      const p = pl.runner.group.position;
      const dx = p.x - finishX;
      const dz = p.z - finishZ;
      if (dx * dx + dz * dz < 4.5 * 4.5 && Math.abs(p.y - finishY) < 1.2) {
        pl.finished = true;
        this.popups.spawn(
          p.clone().setY(p.y + 1.8),
          `${pl.label} 抵达终点！`,
          pl.index === 0 ? '#6ef0ff' : '#f0b35a',
        );
        this.particles.burst(
          p.clone().setY(p.y + 1),
          pl.index === 0 ? new THREE.Color('#6ef0ff') : new THREE.Color('#f0b35a'),
          40,
          6,
          1.1,
        );
      }
    }

    if (this.gameMode === 'coop') {
      const alive = this.players.filter((pl) => pl.lives > 0);
      if (alive.length === 0) {
        this.setMode('fail');
        this.finishRun(false);
        return;
      }
      if (alive.every((pl) => pl.finished)) {
        this.audio.win();
        this.cameraRig.addTrauma(0.4);
        this.winCinematic = 0;
        this.setMode('win');
        this.finishRun(true);
      }
      return;
    }

    // Single / other modes: P1 reaches finish
    if (this.p1.finished || this.p1.lives <= 0) return;
    const p = this.p1.runner.group.position;
    const dx = p.x - finishX;
    const dz = p.z - finishZ;
    if (this.gameMode === 'endless') {
      if (dx * dx + dz * dz < 4.5 * 4.5 && Math.abs(p.y - finishY) < 1.2) {
        this.endlessWave += 1;
        this.popups.spawn(p.clone().setY(p.y + 2), `第 ${this.endlessWave + 1} 波`, '#f0b35a');
        this.audio.checkpoint();
        this.cameraRig.addTrauma(0.2);
        this.post.setBloom(0.9);
        const keepCombo = this.p1.combo;
        const keepMagnet = this.p1.powerTimers.magnet;
        const keepShield = this.p1.powerTimers.shield;
        const keepBoost = this.p1.powerTimers.boost;
        const seed = this.rngSeedFromTime() + this.endlessWave * 997;
        this.rebuildCourse(endlessConfig(seed, this.endlessWave));
        const start = this.course.islands[0];
        this.p1.reset(
          new THREE.Vector3(start.position.x, start.topY, start.position.z - 0.5),
          this.maxLives,
        );
        this.p1.combo = keepCombo;
        this.p1.powerTimers.magnet = keepMagnet;
        this.p1.powerTimers.shield = keepShield;
        this.p1.powerTimers.boost = keepBoost;
        this.cameraRig.snapTo(this.focusPoint());
        this.hud.setTarget(this.crystals.length);
        this.post.setBloom(0.55);
      }
      return;
    }

    if (dx * dx + dz * dz < 4.5 * 4.5 && Math.abs(p.y - finishY) < 1.2) {
      this.audio.win();
      this.cameraRig.addTrauma(0.4);
      this.winCinematic = 0;
      this.setMode('win');
      this.finishRun(true);
    }
  }

  private checkVoid(): void {
    for (const pl of this.players) {
      if (pl.finished || pl.lives <= 0) continue;
      if (pl.runner.group.position.y < VOID_KILL_Y) this.onFall(pl);
    }
  }

  private onFall(pl: PlayerSlot): void {
    if (this.mode !== 'playing') return;

    if (pl.powerTimers.shield > 0) {
      pl.powerTimers.shield = 0;
      const safe = this.findRespawnIsland(pl.checkpointZ || pl.runner.group.position.z);
      pl.runner.reset(new THREE.Vector3(safe.position.x, safe.topY + 0.05, safe.position.z));
      this.audio.land();
      this.popups.spawn(
        pl.runner.group.position.clone().setY(pl.runner.group.position.y + 1.5),
        `${pl.label} 护盾救命！`,
        '#7ab8ff',
      );
      this.particles.burst(
        pl.runner.group.position.clone(),
        new THREE.Color('#7ab8ff'),
        28,
        5,
      );
      return;
    }

    this.audio.fall();
    this.cameraRig.addTrauma(0.45);

    if (this.infiniteLives) {
      // Unlimited lives: keep combo soft-reset, no life loss
      pl.combo = 0;
      pl.comboTimer = 0;
      const z = Math.max(pl.runner.group.position.z, pl.checkpointZ);
      const safe = this.findRespawnIsland(z);
      const ox = pl.index === 0 ? -0.4 : 0.4;
      pl.runner.reset(
        new THREE.Vector3(safe.position.x + ox, safe.topY + 0.05, safe.position.z),
      );
      pl.runner.forwardSpeed.value = Math.max(
        DEFAULT_RUNNER_TUNING.autoSpeed * 0.75,
        pl.runner.forwardSpeed.value * 0.65,
      );
      pl.invuln = RESPAWN_INVULN;
      this.particles.burst(pl.runner.group.position.clone(), new THREE.Color('#7ab8ff'), 22, 5);
      this.popups.spawn(
        pl.runner.group.position.clone().setY(pl.runner.group.position.y + 1.5),
        `${pl.label} 复活`,
        '#7ab8ff',
      );
      return;
    }

    pl.lives -= 1;
    pl.combo = 0;
    pl.comboTimer = 0;

    if (pl.lives <= 0) {
      pl.finished = true;
      this.popups.spawn(
        pl.runner.group.position.clone().setY(0),
        `${pl.label} 出局`,
        '#ff6a6a',
      );
      const alive = this.players.filter((p) => p.lives > 0);
      if (alive.length === 0) {
        this.setMode('fail');
        this.finishRun(false);
      }
      return;
    }

    const z = Math.max(pl.runner.group.position.z, pl.checkpointZ);
    const safe = this.findRespawnIsland(z);
    const ox = pl.index === 0 ? -0.4 : 0.4;
    pl.runner.reset(
      new THREE.Vector3(safe.position.x + ox, safe.topY + 0.05, safe.position.z),
    );
    pl.runner.forwardSpeed.value = Math.max(
      DEFAULT_RUNNER_TUNING.autoSpeed * 0.7,
      pl.runner.forwardSpeed.value * 0.55,
    );
    pl.invuln = RESPAWN_INVULN;
    this.particles.burst(pl.runner.group.position.clone(), new THREE.Color('#ff9a6a'), 22, 5);
    this.popups.spawn(
      pl.runner.group.position.clone().setY(pl.runner.group.position.y + 1.5),
      `${pl.label} 剩余 ${pl.lives} 命`,
      '#ff9a6a',
    );
  }

  private findRespawnIsland(z: number): IslandDef {
    const behind = this.course.islands
      .filter((i) => i.position.z <= z - 1 && !i.crumbled)
      .sort((a, b) => b.position.z - a.position.z);
    return behind[0] ?? this.course.islands[0];
  }

  private render(): void {
    this.post.render();
  }

  private syncPostSize(): void {
    const canvas = this.renderer.domElement;
    const w = Math.max(1, Math.floor(canvas.clientWidth));
    const h = Math.max(1, Math.floor(canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr);
    this.post.setSize(w, h, dpr);
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rebuildCourse(stageToConfig(STAGES[0], value));
        const start = this.course.islands[0];
        this.runner.reset(
          new THREE.Vector3(start.position.x, start.topY, start.position.z - 0.5),
        );
        this.score = 0;
        this.distance = 0;
        this.lives = MAX_LIVES;
        this.cameraRig.snapTo(this.runner.group.position);
      },
      setState: (name: string) => {
        if (name !== 'active-play' && name !== 'complete' && name !== 'title') {
          throw new Error(`Unknown test state: ${name}`);
        }
        this.gameMode = 'stages';
        this.selectedStage = 1;
        this.rebuildCourse(stageToConfig(STAGES[0], 42));
        if (name === 'title') {
          this.setMode('title');
          this.render();
          this.publishDiagnostics();
          return { state: name };
        }
        this.score = 0;
        this.elapsed = 0;
        this.distance = 0;
        this.lives = MAX_LIVES;
        this.combo = 0;
        this.lives = MAX_LIVES;
        const start = this.course.islands[0];
        this.runner.reset(
          new THREE.Vector3(start.position.x, start.topY, start.position.z - 0.5),
        );
        this.runner.forwardSpeed.value = DEFAULT_RUNNER_TUNING.autoSpeed;
        if (name === 'complete') {
          for (const c of this.crystals) c.collect();
          this.score = this.crystals.length;
          const finish = this.course.islands[this.course.islands.length - 1];
          this.runner.reset(
            new THREE.Vector3(finish.position.x, finish.topY, finish.position.z),
          );
          this.distance = finish.position.z;
          this.winCinematic = 1;
        } else {
          const mid = this.course.islands[Math.floor(this.course.islands.length * 0.35)];
          this.runner.reset(
            new THREE.Vector3(mid.position.x, mid.topY, mid.position.z - 0.3),
          );
          this.runner.forwardSpeed.value = 9;
          this.distance = mid.position.z;
          for (let i = 0; i < Math.min(3, this.crystals.length); i += 1) {
            this.crystals[i].collect();
            this.score += 1;
          }
        }
        this.cameraRig.snapTo(this.runner.group.position);
        this.cameraRig.update(0.016, this.runner.group.position, 0.01, 0, 9);
        this.environment.update(0, 0, this.camera.position);
        this.setMode(name === 'complete' ? 'win' : 'playing');
        this.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        if (enabled) {
          this.runner.stabilizeVisuals();
          for (const c of this.crystals) c.stabilizeVisuals();
        }
        this.render();
        this.publishDiagnostics();
      },
      hideDebugUi: (hidden: boolean) => {
        this.debugTools.setHidden(hidden);
      },
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.score,
      targetScore: this.crystals.length,
      lives: this.lives,
      distance: this.distance,
      mode: this.mode,
      complete: this.mode === 'win',
      player: {
        position: {
          x: this.runner.group.position.x,
          y: this.runner.group.position.y,
          z: this.runner.group.position.z,
        },
        speed: this.runner.forwardSpeed.value,
        grounded: this.runner.grounded,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
    };
  }
}
