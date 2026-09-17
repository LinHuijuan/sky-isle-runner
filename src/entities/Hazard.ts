import * as THREE from 'three';

export type HazardKind = 'spinner' | 'mine' | 'laser' | 'wind' | 'drone';

export type HazardDef = {
  id: number;
  kind: HazardKind;
  position: THREE.Vector3;
  radius: number;
  armLength: number;
  phase: number;
  speed: number;
  /** laser: beam length along X; wind: push strength; drone: chase radius */
  extra?: number;
};

export class Hazard {
  readonly group = new THREE.Group();
  private readonly arm?: THREE.Group;
  private readonly mineCore?: THREE.Mesh;
  private readonly laserBeam?: THREE.Mesh;
  private readonly laserMat?: THREE.MeshBasicMaterial;
  private readonly windRing?: THREE.Mesh;
  private readonly drone?: THREE.Group;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(def: HazardDef) {
    this.group.name = `hazard-${def.kind}-${def.id}`;
    this.group.position.copy(def.position);

    if (def.kind === 'spinner') {
      const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 2.4, 8);
      const poleMat = new THREE.MeshStandardMaterial({
        color: '#5a4040',
        roughness: 0.5,
        metalness: 0.4,
      });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.2;
      pole.castShadow = true;
      this.group.add(pole);
      this.disposables.push(poleGeo, poleMat);

      this.arm = new THREE.Group();
      this.arm.position.y = 1.8;
      const armGeo = new THREE.BoxGeometry(def.armLength * 2, 0.12, 0.18);
      const armMat = new THREE.MeshStandardMaterial({
        color: '#ff5050',
        emissive: '#aa2020',
        emissiveIntensity: 1.2,
        roughness: 0.35,
        metalness: 0.35,
      });
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.castShadow = true;
      this.arm.add(arm);
      const tipGeo = new THREE.SphereGeometry(0.14, 8, 6);
      const tipMat = new THREE.MeshBasicMaterial({ color: '#ffcc44' });
      for (const sx of [-1, 1]) {
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.x = sx * def.armLength;
        this.arm.add(tip);
      }
      this.group.add(this.arm);
      this.disposables.push(armGeo, armMat, tipGeo, tipMat);
    } else if (def.kind === 'mine') {
      const mineGeo = new THREE.IcosahedronGeometry(0.35, 0);
      const mineMat = new THREE.MeshStandardMaterial({
        color: '#c44040',
        emissive: '#601010',
        emissiveIntensity: 0.9,
        roughness: 0.35,
        metalness: 0.45,
      });
      this.mineCore = new THREE.Mesh(mineGeo, mineMat);
      this.mineCore.position.y = def.radius * 0.35 + 0.2;
      this.mineCore.castShadow = true;
      this.group.add(this.mineCore);
      this.disposables.push(mineGeo, mineMat);

      const spikeGeo = new THREE.ConeGeometry(0.08, 0.28, 4);
      const spikeMat = new THREE.MeshStandardMaterial({ color: '#3a2020', roughness: 0.6 });
      for (let i = 0; i < 6; i += 1) {
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.32, this.mineCore.position.y, Math.sin(a) * 0.32);
        spike.lookAt(0, this.mineCore.position.y, 0);
        spike.rotateX(Math.PI / 2);
        this.group.add(spike);
      }
      this.disposables.push(spikeGeo, spikeMat);
    } else if (def.kind === 'laser') {
      const len = def.armLength * 2 || 4;
      const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6);
      const postMat = new THREE.MeshStandardMaterial({
        color: '#404858',
        metalness: 0.5,
        roughness: 0.4,
      });
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(sx * len * 0.5, 0.8, 0);
        post.castShadow = true;
        this.group.add(post);
      }
      this.disposables.push(postGeo, postMat);

      const beamGeo = new THREE.BoxGeometry(len, 0.08, 0.08);
      this.laserMat = new THREE.MeshBasicMaterial({
        color: '#ff2040',
        transparent: true,
        opacity: 0.95,
      });
      this.laserBeam = new THREE.Mesh(beamGeo, this.laserMat);
      this.laserBeam.position.y = 0.9;
      this.group.add(this.laserBeam);
      this.disposables.push(beamGeo, this.laserMat);

      // Warning floor ring
      const warnGeo = new THREE.RingGeometry(len * 0.4, len * 0.5, 24);
      const warnMat = new THREE.MeshBasicMaterial({
        color: '#ff4060',
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const warn = new THREE.Mesh(warnGeo, warnMat);
      warn.rotation.x = -Math.PI / 2;
      warn.position.y = 0.03;
      this.group.add(warn);
      this.disposables.push(warnGeo, warnMat);
    } else if (def.kind === 'wind') {
      const ringGeo = new THREE.TorusGeometry(def.radius, 0.06, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#9ad8ff',
        transparent: true,
        opacity: 0.55,
      });
      this.windRing = new THREE.Mesh(ringGeo, ringMat);
      this.windRing.rotation.x = Math.PI / 2;
      this.windRing.position.y = 0.4;
      this.group.add(this.windRing);
      this.disposables.push(ringGeo, ringMat);

      // Updraft cones
      const coneGeo = new THREE.ConeGeometry(0.15, 0.8, 5);
      const coneMat = new THREE.MeshBasicMaterial({
        color: '#b0e8ff',
        transparent: true,
        opacity: 0.35,
      });
      for (let i = 0; i < 5; i += 1) {
        const c = new THREE.Mesh(coneGeo, coneMat);
        const a = (i / 5) * Math.PI * 2;
        c.position.set(Math.cos(a) * def.radius * 0.5, 0.5, Math.sin(a) * def.radius * 0.5);
        c.rotation.x = Math.PI;
        this.group.add(c);
      }
      this.disposables.push(coneGeo, coneMat);
    } else if (def.kind === 'drone') {
      this.drone = new THREE.Group();
      const bodyGeo = new THREE.OctahedronGeometry(0.22, 0);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: '#ff7020',
        emissive: '#aa3000',
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.5,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      this.drone.add(body);
      const eyeGeo = new THREE.SphereGeometry(0.08, 8, 6);
      const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffee88' });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.z = -0.18;
      this.drone.add(eye);
      this.drone.position.y = 1.1;
      this.group.add(this.drone);
      this.disposables.push(bodyGeo, bodyMat, eyeGeo, eyeMat);
    }
  }

  update(elapsed: number, def: HazardDef, playerPos?: THREE.Vector3): void {
    if (def.kind === 'spinner' && this.arm) {
      this.arm.rotation.y = elapsed * def.speed + def.phase;
      return;
    }
    if (def.kind === 'mine' && this.mineCore) {
      const pulse = 1 + Math.sin(elapsed * 4 + def.phase) * 0.12;
      this.mineCore.scale.setScalar(pulse);
      const mat = this.mineCore.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.7 + Math.sin(elapsed * 4 + def.phase) * 0.4;
      return;
    }
    if (def.kind === 'laser' && this.laserBeam && this.laserMat) {
      // Pulse on/off cycle: 1.2s on, 0.8s off
      const cycle = (elapsed * def.speed + def.phase) % 2.0;
      const on = cycle < 1.2;
      this.laserBeam.visible = on;
      this.laserMat.opacity = on ? 0.7 + Math.sin(elapsed * 20) * 0.2 : 0;
      this.laserBeam.scale.y = on ? 1 : 0.01;
      return;
    }
    if (def.kind === 'wind' && this.windRing) {
      this.windRing.rotation.z = elapsed * 2;
      const mat = this.windRing.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.4 + Math.sin(elapsed * 3 + def.phase) * 0.2;
      this.windRing.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.06);
      return;
    }
    if (def.kind === 'drone' && this.drone) {
      const home = def.position;
      const hoverY = 1.1 + Math.sin(elapsed * 3 + def.phase) * 0.2;
      if (playerPos) {
        const dx = playerPos.x - home.x;
        const dz = playerPos.z - home.z;
        const dist = Math.hypot(dx, dz);
        const chaseR = def.extra ?? 6;
        if (dist < chaseR && dist > 0.3) {
          const pull = Math.min(1, elapsed % 1000) * 0; // keep deterministic-ish
          const t = 0.04 + (def.speed || 1) * 0.01;
          this.drone.position.x = THREE.MathUtils.lerp(this.drone.position.x, dx * 0.6, t + pull);
          this.drone.position.z = THREE.MathUtils.lerp(this.drone.position.z, dz * 0.6, t + pull);
        } else {
          this.drone.position.x = Math.sin(elapsed * def.speed + def.phase) * def.radius;
          this.drone.position.z = Math.cos(elapsed * def.speed * 0.8 + def.phase) * def.radius;
        }
      } else {
        this.drone.position.x = Math.sin(elapsed * (def.speed || 1) + def.phase) * def.radius;
        this.drone.position.z = Math.cos(elapsed * (def.speed || 1) * 0.8 + def.phase) * def.radius;
      }
      this.drone.position.y = hoverY;
      this.drone.rotation.y = elapsed * 2;
    }
  }

  hitsSpinner(playerX: number, playerZ: number, elapsed: number, def: HazardDef): boolean {
    if (def.kind !== 'spinner') return false;
    const angle = elapsed * def.speed + def.phase;
    const dx = playerX - this.group.position.x;
    const dz = playerZ - this.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > def.armLength + 0.55 || dist < 0.2) return false;
    const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
    const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
    return Math.abs(localZ) < 0.35 && Math.abs(localX) < def.armLength;
  }

  hitsMine(playerX: number, playerZ: number, playerY: number, def: HazardDef): boolean {
    if (def.kind !== 'mine') return false;
    const dx = playerX - this.group.position.x;
    const dz = playerZ - this.group.position.z;
    const mineY = this.group.position.y + def.radius * 0.35 + 0.2;
    const dy = playerY + 0.6 - mineY;
    return dx * dx + dz * dz < (def.radius * 0.9) ** 2 && Math.abs(dy) < 1.4;
  }

  hitsLaser(playerX: number, playerZ: number, playerY: number, elapsed: number, def: HazardDef): boolean {
    if (def.kind !== 'laser') return false;
    const cycle = (elapsed * def.speed + def.phase) % 2.0;
    if (cycle >= 1.2) return false;
    const len = (def.armLength * 2 || 4) * 0.5;
    const dx = playerX - this.group.position.x;
    const dz = playerZ - this.group.position.z;
    const dy = playerY + 0.6 - (this.group.position.y + 0.9);
    return Math.abs(dx) < len && Math.abs(dz) < 0.45 && Math.abs(dy) < 0.7;
  }

  /** Wind returns lateral push force, 0 if outside. */
  windForce(playerX: number, playerZ: number, def: HazardDef): number {
    if (def.kind !== 'wind') return 0;
    const dx = playerX - this.group.position.x;
    const dz = playerZ - this.group.position.z;
    if (dx * dx + dz * dz > def.radius * def.radius) return 0;
    return def.extra ?? 2.5;
  }

  hitsDrone(playerX: number, playerZ: number, playerY: number, def: HazardDef): boolean {
    if (def.kind !== 'drone' || !this.drone) return false;
    const dx = playerX - (this.group.position.x + this.drone.position.x);
    const dz = playerZ - (this.group.position.z + this.drone.position.z);
    const dy = playerY + 0.6 - (this.group.position.y + this.drone.position.y);
    return dx * dx + dz * dz + dy * dy < 0.85 * 0.85;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
