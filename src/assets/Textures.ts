import * as THREE from 'three';

type GameTexSet = {
  grass: THREE.Texture;
  rock: THREE.Texture;
  crystal: THREE.Texture;
  cloth: THREE.Texture;
  armor: THREE.Texture;
  sky: THREE.Texture;
  suit: THREE.Texture;
  cape: THREE.Texture;
  helmet: THREE.Texture;
};

let sharedTex: GameTexSet | null = null;

function makeGameTextures(): GameTexSet {
  const loader = new THREE.TextureLoader();
  const mk = (path: string, repeat = 2): THREE.Texture => {
    const t = loader.load(path);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const grass = mk('/textures/grass-albedo.webp', 2.5);
  const rock = mk('/textures/rock-albedo.webp', 1.5);
  const crystal = mk('/textures/crystal-facet.webp', 1);
  const cloth = mk('/textures/cloth-albedo.webp', 1);
  const armor = mk('/textures/armor-albedo.webp', 1);
  const sky = mk('/textures/sky-panorama.webp', 1);
  const suit = mk('/textures/suit-albedo.webp', 2);
  const cape = mk('/textures/cape-albedo.webp', 1.5);
  const helmet = mk('/textures/helmet-albedo.webp', 1.2);
  sky.wrapS = THREE.RepeatWrapping;
  sky.wrapT = THREE.ClampToEdgeWrapping;
  grass.name = 'grass-albedo';
  rock.name = 'rock-albedo';
  crystal.name = 'crystal-facet';
  cloth.name = 'cloth-albedo';
  armor.name = 'armor-albedo';
  sky.name = 'sky-panorama';
  suit.name = 'suit-albedo';
  cape.name = 'cape-albedo';
  helmet.name = 'helmet-albedo';
  return { grass, rock, crystal, cloth, armor, sky, suit, cape, helmet };
}

/** Shared texture set — loaded once for the whole game. */
export function loadGameTextures(): GameTexSet {
  if (!sharedTex) sharedTex = makeGameTextures();
  return sharedTex;
}

/** Call once on game dispose — safe if never loaded. */
export function disposeGameTextures(): void {
  if (!sharedTex) return;
  sharedTex.grass.dispose();
  sharedTex.rock.dispose();
  sharedTex.crystal.dispose();
  sharedTex.cloth.dispose();
  sharedTex.armor.dispose();
  sharedTex.sky.dispose();
  sharedTex.suit.dispose();
  sharedTex.cape.dispose();
  sharedTex.helmet.dispose();
  sharedTex = null;
}

/** Soft noise + speckle canvas textures (fallback / secondary). */
export function createNoiseTexture(
  base: string,
  speck: string,
  size = 256,
  density = 0.18,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 28; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 12 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, speck + '55');
    g.addColorStop(1, speck + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * density;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createGrassAlbedoTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#4a9e68');
  bg.addColorStop(0.5, '#3f8f5c');
  bg.addColorStop(1, '#55a870');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = Math.random() > 0.5 ? '90,180,100' : '40,100,60';
    g.addColorStop(0, `rgba(${c},0.25)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const h = 6 + Math.random() * 18;
    const lean = (Math.random() - 0.5) * 10;
    const light = 80 + Math.random() * 80;
    ctx.strokeStyle = `rgba(${light * 0.4},${light + 40},${light * 0.5},${0.25 + Math.random() * 0.35})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - h * 0.5, x + lean, y - h);
    ctx.stroke();
  }

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n * 0.7);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createGrassDetailTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 18; i += 1) {
    const x = size * 0.2 + Math.random() * size * 0.6;
    const y = size;
    const h = size * (0.35 + Math.random() * 0.45);
    const lean = (Math.random() - 0.5) * size * 0.25;
    ctx.strokeStyle = `rgba(${120 + Math.random() * 60}, ${200 + Math.random() * 40}, ${140 + Math.random() * 40}, 0.85)`;
    ctx.lineWidth = 1.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - h * 0.55, x + lean, y - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkyEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = y / (size - 1);
      const r = Math.floor(30 + t * 200);
      const g = Math.floor(50 + t * 120);
      const b = Math.floor(110 + t * 40);
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}
