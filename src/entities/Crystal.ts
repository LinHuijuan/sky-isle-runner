import * as THREE from 'three';
import { loadGameTextures } from '../assets/Textures';

export type CrystalTone = 'cyan' | 'gold' | 'key';

type ToneAssets = {
  coreGeo: THREE.BufferGeometry;
  shardGeo: THREE.BufferGeometry;
  ringGeo: THREE.BufferGeometry;
  coreMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;
  ringMat: THREE.MeshBasicMaterial;
  haloMat: THREE.SpriteMaterial;
  haloTex: THREE.Texture;
};

/**
 * Shared per-tone assets. Previously every crystal built its own geometry,
 * materials and a 64x64 canvas halo texture — ~60 crystals x 4 objects per
 * course rebuild. Now built once per tone and reused.
 */
const toneCache = new Map<CrystalTone, ToneAssets>();

const TONE_STYLE: Record<
  CrystalTone,
  { color: string; emissive: string; glow: string; ring: string; emissiveIntensity: number; size: number }
> = {
  key: {
    color: '#ff6a9a',
    emissive: '#801040',
    glow: '#ffb0c8',
    ring: '#ff8aaa',
    emissiveIntensity: 1.6,
    size: 0.28,
  },
  gold: {
    color: '#ffd27a',
    emissive: '#8a5a12',
    glow: '#fff0c2',
    ring: '#f0b35a',
    emissiveIntensity: 1.1,
    size: 0.22,
  },
  cyan: {
    color: '#6ef0ff',
    emissive: '#0d6a78',
    glow: '#d8fbff',
    ring: '#9af4ff',
    emissiveIntensity: 1.35,
    size: 0.22,
  },
};

function makeHaloTexture(tone: CrystalTone): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (tone === 'key') {
      grad.addColorStop(0, 'rgba(255,140,180,0.9)');
      grad.addColorStop(0.45, 'rgba(255,100,140,0.3)');
    } else if (tone === 'gold') {
      grad.addColorStop(0, 'rgba(255,220,140,0.85)');
      grad.addColorStop(0.45, 'rgba(255,200,100,0.28)');
    } else {
      grad.addColorStop(0, 'rgba(150,240,255,0.85)');
      grad.addColorStop(0.45, 'rgba(100,220,255,0.28)');
    }
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getToneAssets(tone: CrystalTone): ToneAssets {
  const cached = toneCache.get(tone);
  if (cached) return cached;

  const style = TONE_STYLE[tone];
  const haloTex = makeHaloTexture(tone);
  const assets: ToneAssets = {
    coreGeo: new THREE.OctahedronGeometry(style.size, 0),
    shardGeo: new THREE.OctahedronGeometry(0.14, 0),
    ringGeo: new THREE.TorusGeometry(0.36, 0.012, 6, 24),
    coreMat: new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.color).lerp(new THREE.Color('#ffffff'), 0.15),
      emissive: style.emissive,
      emissiveIntensity: style.emissiveIntensity,
      roughness: 0.18,
      metalness: 0.25,
      map: loadGameTextures().crystal,
    }),
    glowMat: new THREE.MeshBasicMaterial({
      color: style.glow,
      transparent: true,
      opacity: 0.9,
    }),
    ringMat: new THREE.MeshBasicMaterial({
      color: style.ring,
      transparent: true,
      opacity: 0.45,
    }),
    haloMat: new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    haloTex,
  };
  toneCache.set(tone, assets);
  return assets;
}

/** Release all shared crystal assets — call from Game.dispose(). */
export function disposeSharedCrystalAssets(): void {
  for (const a of toneCache.values()) {
    a.coreGeo.dispose();
    a.shardGeo.dispose();
    a.ringGeo.dispose();
    a.coreMat.dispose();
    a.glowMat.dispose();
    a.ringMat.dispose();
    a.haloMat.dispose();
    a.haloTex.dispose();
  }
  toneCache.clear();
}

export class Crystal {
  readonly group = new THREE.Group();
  readonly radius = 0.72;
  active = true;

  private readonly core: THREE.Mesh;
  private readonly shard: THREE.Mesh;
  private readonly baseY: number;
  private readonly phase: number;

  constructor(
    readonly index: number,
    position: THREE.Vector3,
    readonly tone: CrystalTone = 'cyan',
  ) {
    const assets = getToneAssets(tone);
    this.baseY = position.y;
    this.phase = index * 0.7;
    this.group.name = `crystal-${index}`;
    this.group.position.copy(position);

    this.core = new THREE.Mesh(assets.coreGeo, assets.coreMat);
    this.core.castShadow = true;
    this.core.name = 'pickupCore';
    this.group.add(this.core);

    this.shard = new THREE.Mesh(assets.shardGeo, assets.glowMat);
    this.group.add(this.shard);

    const ring = new THREE.Mesh(assets.ringGeo, assets.ringMat);
    ring.rotation.x = Math.PI / 2.4;
    this.group.add(ring);

    const halo = new THREE.Sprite(assets.haloMat);
    halo.scale.setScalar(0.9);
    this.group.add(halo);
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.group.rotation.y += delta * 1.6;
    this.core.rotation.x = elapsed * 1.1 + this.phase;
    this.shard.rotation.y = -elapsed * 1.8;
    this.shard.scale.setScalar(0.85 + Math.sin(elapsed * 3 + this.phase) * 0.1);
    this.group.position.y = this.baseY + Math.sin(elapsed * 2.4 + this.phase) * 0.14;
  }

  collect(): void {
    this.active = false;
    this.group.visible = false;
  }

  reset(baseY?: number): void {
    this.active = true;
    this.group.visible = true;
    if (baseY !== undefined) this.group.position.y = baseY;
  }

  stabilizeVisuals(): void {
    this.group.rotation.set(0, this.phase, 0);
    this.group.position.y = this.baseY;
    this.core.rotation.set(0, 0, 0);
  }

  /** Geometry/materials are shared per tone — nothing instance-owned to free. */
  dispose(): void {
    this.group.clear();
  }
}
