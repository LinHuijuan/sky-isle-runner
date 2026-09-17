export type QualityLevel = 'high' | 'medium';

export type MidRunPlayerSnap = {
  x: number;
  y: number;
  z: number;
  lives: number;
  score: number;
  combo: number;
  power: { magnet: number; shield: number; boost: number };
  checkpointZ: number;
  finished: boolean;
};

export type MidRunSave = {
  v: 1;
  gameMode: string;
  selectedStage: number;
  endlessWave: number;
  timeLeft: number;
  seed: number;
  elapsed: number;
  distance: number;
  score: number;
  keysCollected: number;
  bossUnlocked: boolean;
  loadout: string[];
  infiniteLives: boolean;
  maxLives: number;
  /** Indices of collected crystals in spawn order */
  collectedCrystals: number[];
  collectedPowerups: number[];
  crumbledIslands: number[];
  players: MidRunPlayerSnap[];
  savedAt: number;
};

export type SaveData = {
  bestDistance: number;
  bestScore: number;
  bestStars: number;
  runs: number;
  muted: boolean;
  unlockedStage: number;
  stageStars: Record<string, number>;
  endlessBest: number;
  timetrialBest: number;
  quality: QualityLevel;
  reducedMotion: boolean;
  skin: string;
  skin2: string;
  hintShown: boolean;
  infiniteLives: boolean;
  /** Slot for mid-run continue; null when none */
  midRun: MidRunSave | null;
};

const KEY = 'sky-isle-runner-save-v2';

const DEFAULTS: SaveData = {
  bestDistance: 0,
  bestScore: 0,
  bestStars: 0,
  runs: 0,
  muted: false,
  unlockedStage: 1,
  stageStars: {},
  endlessBest: 0,
  timetrialBest: 0,
  quality: 'high',
  reducedMotion: false,
  skin: 'jade',
  skin2: 'pyro',
  hintShown: false,
  infiniteLives: false,
  midRun: null,
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const old = localStorage.getItem('sky-isle-runner-save-v1');
      if (old) {
        const parsed = JSON.parse(old) as Partial<SaveData>;
        return { ...DEFAULTS, ...parsed };
      }
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULTS, ...parsed, stageStars: { ...(parsed.stageStars ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function resetSave(): SaveData {
  const next = { ...DEFAULTS, stageStars: {}, midRun: null };
  writeSave(next);
  return next;
}

export function hasMidRun(save: SaveData): boolean {
  return !!save.midRun && save.midRun.players?.length > 0;
}

export function computeStars(
  score: number,
  target: number,
  livesLeft: number,
  maxLives: number,
): number {
  if (target <= 0) return 1;
  const ratio = score / target;
  if (ratio >= 1) return 3;
  if (ratio >= 0.85 && livesLeft >= maxLives) return 3;
  if (ratio >= 0.7 || livesLeft >= maxLives) return 2;
  return 1;
}
