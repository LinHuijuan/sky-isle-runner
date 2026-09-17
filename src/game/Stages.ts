import type { CourseConfig } from '../world/Course';

export type GameMode = 'stages' | 'endless' | 'timetrial' | 'coop';

export type { CourseConfig };

export type StageExclusive =
  | 'none'
  | 'bouncy-garden'
  | 'crumble-flood'
  | 'wind-corridor'
  | 'minefield'
  | 'boss-gate';

export type StageTheme = {
  id: number;
  code: string;
  name: string;
  subtitle: string;
  /** Base difficulty 0–1 */
  difficulty: number;
  segments: number;
  /** Sky/fog accents */
  skyTop: string;
  skyMid: string;
  fog: string;
  grass: string;
  rock: string;
  crystalTint: 'cyan' | 'gold' | 'mixed';
  /** Hazard flavor weights */
  spinnerRate: number;
  mineRate: number;
  laserRate: number;
  windRate: number;
  droneRate: number;
  /** Island mix bias */
  narrowBias: number;
  crumbleBias: number;
  movingBias: number;
  bouncyBias: number;
  /** Speed baseline */
  speedBonus: number;
  lives: number;
  exclusive: StageExclusive;
  /** Key crystals needed to open boss gate (0 = no boss gate) */
  bossKeys: number;
  /** Time trial target seconds if used */
  timeLimit?: number;
};

export const STAGES: StageTheme[] = [
  {
    id: 1,
    code: '1-1',
    name: '晨曦草原',
    subtitle: '学会奔跑与跳跃',
    difficulty: 0.15,
    segments: 24,
    skyTop: '#2a4070',
    skyMid: '#7a9ec8',
    fog: '#9ab0d0',
    grass: '#5aaf88',
    rock: '#6b5d52',
    crystalTint: 'cyan',
    spinnerRate: 0.05,
    mineRate: 0.02,
    laserRate: 0,
    windRate: 0,
    droneRate: 0,
    narrowBias: 0.05,
    crumbleBias: 0.05,
    movingBias: 0.05,
    bouncyBias: 0.1,
    speedBonus: 0,
    lives: 3,
    exclusive: 'bouncy-garden',
    bossKeys: 0,
  },
  {
    id: 2,
    code: '1-2',
    name: '暮色回廊',
    subtitle: '横移岛与崩塌开始出现',
    difficulty: 0.35,
    segments: 28,
    skyTop: '#3a2860',
    skyMid: '#a07090',
    fog: '#b090a8',
    grass: '#4f9e7c',
    rock: '#6a5060',
    crystalTint: 'mixed',
    spinnerRate: 0.12,
    mineRate: 0.08,
    laserRate: 0.05,
    windRate: 0.05,
    droneRate: 0,
    narrowBias: 0.15,
    crumbleBias: 0.18,
    movingBias: 0.15,
    bouncyBias: 0.08,
    speedBonus: 0.6,
    lives: 3,
    exclusive: 'crumble-flood',
    bossKeys: 0,
  },
  {
    id: 3,
    code: '2-1',
    name: '风暴之眼',
    subtitle: '风区与激光封锁路径',
    difficulty: 0.55,
    segments: 32,
    skyTop: '#1a2848',
    skyMid: '#6070a0',
    fog: '#7080a8',
    grass: '#3d8f70',
    rock: '#4a5868',
    crystalTint: 'mixed',
    spinnerRate: 0.2,
    mineRate: 0.12,
    laserRate: 0.15,
    windRate: 0.18,
    droneRate: 0.08,
    narrowBias: 0.22,
    crumbleBias: 0.22,
    movingBias: 0.2,
    bouncyBias: 0.06,
    speedBonus: 1.2,
    lives: 3,
    exclusive: 'wind-corridor',
    bossKeys: 2,
  },
  {
    id: 4,
    code: '2-2',
    name: '星陨裂隙',
    subtitle: '窄桥、地雷与追踪无人机',
    difficulty: 0.75,
    segments: 34,
    skyTop: '#101830',
    skyMid: '#4a3868',
    fog: '#584870',
    grass: '#2e7a58',
    rock: '#3a3048',
    crystalTint: 'gold',
    spinnerRate: 0.25,
    mineRate: 0.2,
    laserRate: 0.18,
    windRate: 0.15,
    droneRate: 0.18,
    narrowBias: 0.3,
    crumbleBias: 0.25,
    movingBias: 0.25,
    bouncyBias: 0.05,
    speedBonus: 1.8,
    lives: 3,
    exclusive: 'minefield',
    bossKeys: 3,
  },
  {
    id: 5,
    code: '3-1',
    name: '深渊王座',
    subtitle: '终极关卡，一命通关挑战',
    difficulty: 0.95,
    segments: 36,
    skyTop: '#0a1020',
    skyMid: '#302848',
    fog: '#403858',
    grass: '#1f5c42',
    rock: '#2a2438',
    crystalTint: 'gold',
    spinnerRate: 0.32,
    mineRate: 0.25,
    laserRate: 0.25,
    windRate: 0.22,
    droneRate: 0.25,
    narrowBias: 0.35,
    crumbleBias: 0.28,
    movingBias: 0.28,
    bouncyBias: 0.04,
    speedBonus: 2.5,
    lives: 1,
    exclusive: 'boss-gate',
    bossKeys: 4,
  },
];

export function stageToConfig(stage: StageTheme, seed: number): CourseConfig {
  return {
    seed,
    baseDifficulty: stage.difficulty,
    segments: stage.segments,
    narrowBias: stage.narrowBias,
    crumbleBias: stage.crumbleBias,
    movingBias: stage.movingBias,
    bouncyBias: stage.bouncyBias,
    spinnerRate: stage.spinnerRate,
    mineRate: stage.mineRate,
    laserRate: stage.laserRate,
    windRate: stage.windRate,
    droneRate: stage.droneRate,
    endless: false,
    exclusive: stage.exclusive,
    bossKeys: stage.bossKeys,
  };
}

export function endlessConfig(seed: number, wave = 0): CourseConfig {
  const t = Math.min(1, wave / 8);
  return {
    seed,
    baseDifficulty: 0.25 + t * 0.65,
    segments: 28 + wave * 2,
    narrowBias: 0.08 + t * 0.28,
    crumbleBias: 0.08 + t * 0.25,
    movingBias: 0.08 + t * 0.25,
    bouncyBias: 0.1,
    spinnerRate: 0.08 + t * 0.28,
    mineRate: 0.05 + t * 0.22,
    laserRate: 0.04 + t * 0.22,
    windRate: 0.05 + t * 0.2,
    droneRate: 0.02 + t * 0.22,
    endless: true,
    exclusive: 'none',
    bossKeys: 0,
  };
}

export function timeTrialConfig(seed: number): CourseConfig {
  return {
    seed,
    baseDifficulty: 0.45,
    segments: 30,
    narrowBias: 0.18,
    crumbleBias: 0.15,
    movingBias: 0.18,
    bouncyBias: 0.08,
    spinnerRate: 0.16,
    mineRate: 0.1,
    laserRate: 0.12,
    windRate: 0.12,
    droneRate: 0.1,
    endless: false,
    exclusive: 'none',
    bossKeys: 0,
  };
}

export const TIME_TRIAL_LIMIT = 75;
