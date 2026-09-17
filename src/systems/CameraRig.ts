import * as THREE from 'three';

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private trauma = 0;
  private shakeTime = 0;
  private bank = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    // Slightly lower / closer for hero framing
    private readonly offset = new THREE.Vector3(0, 2.85, -4.7),
  ) {
    this.camera.fov = 48;
    this.camera.near = 0.1;
    this.camera.far = 240;
    this.camera.updateProjectionMatrix();
  }

  snapTo(target: THREE.Vector3): void {
    this.desiredPosition.copy(target).add(this.offset);
    this.camera.position.copy(this.desiredPosition);
    // Look ahead up the course, slightly above player — shows next isles
    this.smoothLook.copy(target).add(new THREE.Vector3(0, 1.35, 4.2));
    this.lookTarget.copy(this.smoothLook);
    this.camera.lookAt(this.lookTarget);
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(
    delta: number,
    target: THREE.Vector3,
    lag = 0.18,
    steerX = 0,
    speed = 8,
  ): void {
    const lead = THREE.MathUtils.clamp(steerX, -1, 1) * 0.9;
    // Slight speed pull-back so high speed feels faster
    const pull = THREE.MathUtils.clamp((speed - 7) / 6, 0, 1) * 0.35;
    this.desiredPosition.set(
      target.x * 0.78 + lead * 0.3,
      target.y + this.offset.y + pull * 0.15,
      target.z + this.offset.z - pull,
    );
    const factor = 1 - Math.exp(-delta / Math.max(0.001, lag));
    this.camera.position.lerp(this.desiredPosition, factor);

    this.lookTarget.set(
      target.x * 0.5 + lead * 0.7,
      target.y + 1.25,
      target.z + 5.0 + speed * 0.1,
    );
    this.smoothLook.lerp(this.lookTarget, factor);
    this.camera.lookAt(this.smoothLook);

    this.bank = THREE.MathUtils.damp(this.bank, -steerX * 0.035, 6, delta);
    this.camera.rotateZ(this.bank);

    this.shakeTime += delta;
    this.trauma = Math.max(0, this.trauma - delta * 1.5);
    if (this.trauma > 0.001) {
      const s = this.trauma * this.trauma;
      const t = this.shakeTime * 28;
      this.camera.position.x += Math.sin(t * 1.7) * 0.16 * s;
      this.camera.position.y += Math.cos(t * 1.3) * 0.12 * s;
      this.camera.rotation.z += Math.sin(t * 0.9) * 0.018 * s;
    }

    this.camera.updateMatrixWorld();
  }

  setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
