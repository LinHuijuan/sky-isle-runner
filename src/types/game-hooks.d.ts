export {};

type TestHooks = {
  seed: (value: number) => void;
  setState: (name: string) => { state: string };
  setPausedForScreenshot: (paused: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  hideDebugUi: (hidden: boolean) => void;
};

type Diagnostics = {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  lives?: number;
  distance?: number;
  mode?: string;
  complete: boolean;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
    grounded?: boolean;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs?: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
};

declare global {
  interface Window {
    __THREE_GAME_TEST_HOOKS__?: TestHooks;
    __THREE_GAME_DIAGNOSTICS__?: Diagnostics;
  }
}
