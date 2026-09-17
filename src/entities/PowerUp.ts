import * as THREE from 'three';

export type PowerUpKind = 'magnet' | 'shield' | 'boost';

export class PowerUp {
  readonly group = new THREE.Group();
  active = true;
  private readonly coreGeo: THREE.BufferGeometry;
  private readonly ringGeo: THREE.BufferGeometry;
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly baseY: number;
  private readonly kind: PowerUpKind;

  constructor(
    readonly index: number,
    position: THREE.Vector3,
    kind: PowerUpKind,
  ) {
    this.kind = kind;
    this.baseY = position.y;
    this.group.name = `powerup-${kind}-${index}`;
    this.group.position.copy(position);

    const colors: Record<PowerUpKind, { c: string; e: string; label: string }> = {
      magnet: { c: '#ff7a9a', e: '#5a1028', label: 'magnet' },
      shield: { c: '#7ab8ff', e: '#103060', label: 'shield' },
      boost: { c: '#f0b35a', e: '#5a3008', label: 'boost' },
    };
    const cfg = colors[kind];

    this.coreGeo = new THREE.IcosahedronGeometry(0.28, 0);
    this.coreMat = new THREE.MeshStandardMaterial({
      color: cfg.c,
      emissive: cfg.e,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.3,
    });
    const core = new THREE.Mesh(this.coreGeo, this.coreMat);
    core.castShadow = true;
    core.name = 'pickupCore';
    this.group.add(core);

    // Icon mark via simple geometry
    if (kind === 'magnet') {
      const uGeo = new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI);
      const u = new THREE.Mesh(uGeo, new THREE.MeshBasicMaterial({ color: '#fff' }));
      u.position.y = 0.02;
      u.rotation.z = Math.PI;
      this.group.add(u);
      (this as { _extra?: Array<{ dispose: () => void }> })._extra = [uGeo];
    } else if (kind === 'shield') {
      const sGeo = new THREE.RingGeometry(0.14, 0.2, 6);
      const s = new THREE.Mesh(
        sGeo,
        new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide }),
      );
      this.group.add(s);
      (this as { _extra?: Array<{ dispose: () => void }> })._extra = [sGeo];
    } else {
      const bGeo = new THREE.ConeGeometry(0.1, 0.28, 4);
      const b = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ color: '#fff' }));
      b.rotation.x = Math.PI;
      this.group.add(b);
      (this as { _extra?: Array<{ dispose: () => void }> })._extra = [bGeo];
    }

    this.ringGeo = new THREE.TorusGeometry(0.42, 0.025, 6, 24);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: cfg.c,
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Soft halo
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 64;
    haloCanvas.height = 64;
    const ctx = haloCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, cfg.c + 'cc');
      grad.addColorStop(0.5, cfg.c + '33');
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
    halo.scale.setScalar(1.5);
    this.group.add(halo);
    this.group.userData.haloTex = haloTex;
    this.group.userData.haloMat = haloMat;
  }

  get powerKind(): PowerUpKind {
    return this.kind;
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.group.rotation.y += delta * 2;
    const core = this.group.children[0];
    if (core) core.rotation.x = elapsed * 1.4;
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

  dispose(): void {
    this.coreGeo.dispose();
    this.ringGeo.dispose();
    this.coreMat.dispose();
    this.ringMat.dispose();
    const extra = (this as { _extra?: Array<{ dispose: () => void }> })._extra;
    if (extra) for (const e of extra) e.dispose();
    const haloTex = this.group.userData.haloTex as THREE.Texture | undefined;
    const haloMat = this.group.userData.haloMat as THREE.Material | undefined;
    haloTex?.dispose();
    haloMat?.dispose();
  }
}
