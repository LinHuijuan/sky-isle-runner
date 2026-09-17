import * as THREE from 'three';

type Particle = {
  life: number;
  maxLife: number;
};

/**
 * Lightweight burst + trail particles.
 */
export class ParticleBursts {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly particles: Particle[];
  private readonly sizes: Float32Array;
  private cursor = 0;
  private sizeAttr: THREE.BufferAttribute;

  constructor(private readonly max = 400) {
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.particles = Array.from({ length: max }, () => ({ life: 0, maxLife: 1 }));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    geo.setAttribute('size', this.sizeAttr);
    for (let i = 0; i < max; i += 1) this.positions[i * 3 + 1] = -999;

    // Use PointsMaterial with vertex colors; size via scale trick (no custom shader needed)
    const mat = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  burst(
    origin: THREE.Vector3,
    color: THREE.Color,
    count = 16,
    speed = 4,
    spreadY = 0.85,
  ): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.particles[i];
      p.life = 0.4 + Math.random() * 0.45;
      p.maxLife = p.life;
      this.velocities[i * 3] = (Math.random() - 0.5) * speed;
      this.velocities[i * 3 + 1] = Math.random() * speed * spreadY + 0.6;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.positions[i * 3] = origin.x;
      this.positions[i * 3 + 1] = origin.y;
      this.positions[i * 3 + 2] = origin.z;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      this.sizes[i] = 1;
    }
    this.flush();
  }

  /** Flat expanding dust ring on landing. */
  ring(origin: THREE.Vector3, color: THREE.Color, count = 20, radiusSpeed = 3.5): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.particles[i];
      p.life = 0.35 + Math.random() * 0.25;
      p.maxLife = p.life;
      const a = (n / count) * Math.PI * 2 + Math.random() * 0.2;
      this.velocities[i * 3] = Math.cos(a) * radiusSpeed;
      this.velocities[i * 3 + 1] = 0.4 + Math.random() * 0.8;
      this.velocities[i * 3 + 2] = Math.sin(a) * radiusSpeed;
      this.positions[i * 3] = origin.x;
      this.positions[i * 3 + 1] = origin.y + 0.05;
      this.positions[i * 3 + 2] = origin.z;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      this.sizes[i] = 0.7;
    }
    this.flush();
  }

  /** Soft speed trail behind the runner. */
  trail(origin: THREE.Vector3, color: THREE.Color, count = 2): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.particles[i];
      p.life = 0.22 + Math.random() * 0.18;
      p.maxLife = p.life;
      this.velocities[i * 3] = (Math.random() - 0.5) * 0.4;
      this.velocities[i * 3 + 1] = 0.2 + Math.random() * 0.5;
      this.velocities[i * 3 + 2] = -1.5 - Math.random();
      this.positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.25;
      this.positions[i * 3 + 1] = origin.y + 0.15 + Math.random() * 0.25;
      this.positions[i * 3 + 2] = origin.z - 0.2;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      this.sizes[i] = 0.45;
    }
    this.flush();
  }

  update(delta: number): void {
    let any = false;
    for (let i = 0; i < this.max; i += 1) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= delta;
      if (p.life <= 0) {
        this.positions[i * 3 + 1] = -999;
        any = true;
        continue;
      }
      this.velocities[i * 3 + 1] -= 7 * delta;
      this.positions[i * 3] += this.velocities[i * 3] * delta;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;
      const t = p.life / p.maxLife;
      this.colors[i * 3] *= 0.999;
      this.sizes[i] = t;
      any = true;
    }
    if (any) this.flush();
  }

  private flush(): void {
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
