import * as THREE from 'three';

export type PowerUpKind = 'magnet' | 'shield' | 'boost';

type PowerAssets = {
  coreGeo: THREE.BufferGeometry;
  ringGeo: THREE.BufferGeometry;
  iconGeo: THREE.BufferGeometry;
  coreMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
  iconMat: THREE.MeshBasicMaterial;
  haloMat: THREE.SpriteMaterial;
  haloTex: THREE.Texture;
  iconRotationX: number;
  iconRotationZ: number;
};

const KIND_STYLE: Record<PowerUpKind, { c: string; e: string }> = {
  magnet: { c: '#ff7a9a', e: '#5a1028' },
  shield: { c: '#7ab8ff', e: '#103060' },
  boost: { c: '#f0b35a', e: '#5a3008' },
};

/**
 * Shared per-kind assets. Previously each power-up built its own geometry,
 * materials and a canvas halo texture, and never disposed the icon material.
 */
const kindCache = new Map<PowerUpKind, PowerAssets>();

function makeHaloTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `${color}cc`);
    grad.addColorStop(0.5, `${color}33`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getKindAssets(kind: PowerUpKind): PowerAssets {
  const cached = kindCache.get(kind);
  if (cached) return cached;

  const cfg = KIND_STYLE[kind];
  const haloTex = makeHaloTexture(cfg.c);
  let iconGeo: THREE.BufferGeometry;
  let iconRotationX = 0;
  let iconRotationZ = 0;
  if (kind === 'magnet') {
    iconGeo = new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI);
    iconRotationZ = Math.PI;
  } else if (kind === 'shield') {
    iconGeo = new THREE.RingGeometry(0.14, 0.2, 6);
  } else {
    iconGeo = new THREE.ConeGeometry(0.1, 0.28, 4);
    iconRotationX = Math.PI;
  }

  const assets: PowerAssets = {
    coreGeo: new THREE.IcosahedronGeometry(0.28, 0),
    ringGeo: new THREE.TorusGeometry(0.42, 0.025, 6, 24),
    iconGeo,
    coreMat: new THREE.MeshStandardMaterial({
      color: cfg.c,
      emissive: cfg.e,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.3,
    }),
    ringMat: new THREE.MeshBasicMaterial({
      color: cfg.c,
      transparent: true,
      opacity: 0.7,
    }),
    iconMat: new THREE.MeshBasicMaterial({
      color: '#fff',
      side: kind === 'shield' ? THREE.DoubleSide : THREE.FrontSide,
    }),
    haloMat: new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    haloTex,
    iconRotationX,
    iconRotationZ,
  };
  kindCache.set(kind, assets);
  return assets;
}

/** Release all shared power-up assets — call from Game.dispose(). */
export function disposeSharedPowerUpAssets(): void {
  for (const a of kindCache.values()) {
    a.coreGeo.dispose();
    a.ringGeo.dispose();
    a.iconGeo.dispose();
    a.coreMat.dispose();
    a.ringMat.dispose();
    a.iconMat.dispose();
    a.haloMat.dispose();
    a.haloTex.dispose();
  }
  kindCache.clear();
}

export class PowerUp {
  readonly group = new THREE.Group();
  active = true;
  private readonly core: THREE.Mesh;
  private readonly baseY: number;
  private readonly kind: PowerUpKind;

  constructor(
    readonly index: number,
    position: THREE.Vector3,
    kind: PowerUpKind,
  ) {
    const assets = getKindAssets(kind);
    this.kind = kind;
    this.baseY = position.y;
    this.group.name = `powerup-${kind}-${index}`;
    this.group.position.copy(position);

    this.core = new THREE.Mesh(assets.coreGeo, assets.coreMat);
    this.core.castShadow = true;
    this.core.name = 'pickupCore';
    this.group.add(this.core);

    const icon = new THREE.Mesh(assets.iconGeo, assets.iconMat);
    icon.position.y = kind === 'magnet' ? 0.02 : 0;
    icon.rotation.x = assets.iconRotationX;
    icon.rotation.z = assets.iconRotationZ;
    this.group.add(icon);

    const ring = new THREE.Mesh(assets.ringGeo, assets.ringMat);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    const halo = new THREE.Sprite(assets.haloMat);
    halo.scale.setScalar(1.5);
    this.group.add(halo);
  }

  get powerKind(): PowerUpKind {
    return this.kind;
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.group.rotation.y += delta * 2;
    this.core.rotation.x = elapsed * 1.4;
    this.group.position.y = this.baseY + Math.sin(elapsed * 2.6 + this.index) * 0.12;
  }

  collect(): void {
    this.active = false;
    this.group.visible = false;
  }

  stabilizeVisuals(): void {
    this.group.rotation.set(0, this.index, 0);
    this.group.position.y = this.baseY;
  }

  /** Geometry/materials are shared per kind — nothing instance-owned to free. */
  dispose(): void {
    this.group.clear();
  }
}
