import * as THREE from 'three';
import { PlayerInput, type PlayerIndex } from '../core/PlayerInput';
import {
  DEFAULT_RUNNER_TUNING,
  Runner,
  type RunnerTuning,
} from '../entities/Runner';
import type { SkinId } from '../entities/Skins';
import type { IslandDef } from '../world/Course';

export const PLAYER_COLORS = ['#5ee0c8', '#f0b35a'] as const;

export class PlayerSlot {
  readonly runner = new Runner();
  readonly input: PlayerInput;
  readonly index: PlayerIndex;
  readonly label: string;
  score = 0;
  lives = 3;
  combo = 0;
  comboTimer = 0;
  powerTimers = { magnet: 0, shield: 0, boost: 0 };
  dashCooldown = 0;
  dashTime = 0;
  hazardCooldown = 0;
  boostPadCooldown = 0;
  /** Throttles the "boss gate still locked" push-back + message. */
  gateBlockCooldown = 0;
  pendingDash = false;
  footstepAccumulator = 0;
  trailAccumulator = 0;
  checkpointZ = 0;
  lastLandedIsland: IslandDef | null = null;
  invuln = 0;
  finished = false;
  skinId: SkinId = 'jade';
  readonly tuning: RunnerTuning = { ...DEFAULT_RUNNER_TUNING };

  constructor(index: PlayerIndex, scene: THREE.Scene) {
    this.index = index;
    this.label = index === 0 ? 'P1' : 'P2';
    this.input = new PlayerInput(index);
    this.input.attach();
    scene.add(this.runner.group);
  }

  setSkin(id: SkinId): void {
    this.skinId = id;
    this.runner.setSkin(id);
  }

  reset(start: THREE.Vector3, maxLives: number, lateralOffset = 0): void {
    this.score = 0;
    this.lives = maxLives;
    this.combo = 0;
    this.comboTimer = 0;
    this.powerTimers = { magnet: 0, shield: 0, boost: 0 };
    this.dashCooldown = 0;
    this.dashTime = 0;
    this.hazardCooldown = 0;
    this.boostPadCooldown = 0;
    this.gateBlockCooldown = 0;
    this.pendingDash = false;
    this.checkpointZ = 0;
    this.invuln = 0;
    this.finished = false;
    this.trailAccumulator = 0;
    this.footstepAccumulator = 0;
    this.lastLandedIsland = null;
    this.tuning.autoSpeed = DEFAULT_RUNNER_TUNING.autoSpeed;
    this.tuning.maxAutoSpeed = DEFAULT_RUNNER_TUNING.maxAutoSpeed;
    this.tuning.speedRamp = DEFAULT_RUNNER_TUNING.speedRamp;
    this.input.reset();
    this.runner.reset(new THREE.Vector3(start.x + lateralOffset, start.y, start.z));
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.runner.group);
    this.runner.dispose();
    this.input.dispose();
  }
}
