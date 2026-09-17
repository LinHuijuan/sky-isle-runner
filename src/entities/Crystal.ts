import * as THREE from 'three';
import { loadGameTextures } from '../assets/Textures';

function getCrystalTex(): THREE.Texture {
  return loadGameTextures().crystal;
}

export class Crystal {
  readonly group = new THREE.Group();
  readonly radius = 0.72;
  active = true;

  private readonly coreGeo: THREE.BufferGeometry;
  private readonly glowGeo: THREE.BufferGeometry;
  private readonly ringGeo: THREE.BufferGeometry;
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly baseY: number;
  private phase: number;

  constructor(
    readonly index: number,
    position: THREE.Vector3,
    readonly tone: 'cyan' | 'gold' | 'key' = 'cyan',
  ) {
    this.baseY = position.y;
    this.phase = index * 0.7;
    this.group.name = `crystal-${index}`;
    this.group.position.copy(position);

    const isGold = tone === 'gold';
    const isKey = tone === 'key';
    const color = isKey ? '#ff6a9a' : isGold ? '#ffd27a' : '#6ef0ff';
    const emissive = isKey ? '#801040' : isGold ? '#8a5a12' : '#0d6a78';
    const glowColor = isKey ? '#ffb0c8' : isGold ? '#fff0c2' : '#d8fbff';
    const ringColor = isKey ? '#ff8aaa' : isGold ? '#f0b35a' : '#9af4ff';

    this.coreGeo = new THREE.OctahedronGeometry(isKey ? 0.28 : 0.22, 0);
    this.coreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.15),
      emissive,
      emissiveIntensity: isKey ? 1.6 : isGold ? 1.1 : 1.35,
      roughness: 0.18,
      metalness: 0.25,
      map: getCrystalTex(),
    });
    const core = new THREE.Mesh(this.coreGeo, this.coreMat);
    core.castShadow = true;
    core.name = 'pickupCore';
    this.group.add(core);

    // Inner shard
    const shardGeo = new THREE.OctahedronGeometry(0.14, 0);
    this.glowGeo = shardGeo;
    this.glowMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.9,
    });
    const shard = new THREE.Mesh(shardGeo, this.glowMat);
    this.group.add(shard);

    this.ringGeo = new THREE.TorusGeometry(0.36, 0.012, 6, 24);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.45,
    });
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.rotation.x = Math.PI / 2.4;
    this.group.add(ring);

    // Soft halo sprite
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 64;
    haloCanvas.height = 64;
    const ctx = haloCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (isKey) {
        grad.addColorStop(0, 'rgba(255,140,180,0.9)');
        grad.addColorStop(0.45, 'rgba(255,100,140,0.3)');
      } else if (isGold) {
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
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.9);
    this.group.add(halo);
    this.group.userData.halo = halo;
    this.group.userData.haloTex = haloTex;
    this.group.userData.haloMat = haloMat;
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.group.rotation.y += delta * 1.6;
    const core = this.group.children[0];
    if (core) core.rotation.x = elapsed * 1.1 + this.phase;
    const shard = this.group.children[1];
    if (shard) {
      shard.rotation.y = -elapsed * 1.8;
      shard.scale.setScalar(0.85 + Math.sin(elapsed * 3 + this.phase) * 0.1);
    }
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
    const core = this.group.children[0];
    if (core) core.rotation.set(0, 0, 0);
  }

  dispose(): void {
    this.coreGeo.dispose();
    this.glowGeo.dispose();
    this.ringGeo.dispose();
    this.coreMat.dispose();
    this.glowMat.dispose();
    this.ringMat.dispose();
    const haloTex = this.group.userData.haloTex as THREE.Texture | undefined;
    const haloMat = this.group.userData.haloMat as THREE.Material | undefined;
    haloTex?.dispose();
    haloMat?.dispose();
  }
}
