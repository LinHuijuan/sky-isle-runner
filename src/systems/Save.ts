export type QualityLevel = 'high' | 'medium';

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
  const next = { ...DEFAULTS, stageStars: {} };
  writeSave(next);
  return next;
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
