import * as THREE from 'three';

type Particle = {
  life: number;
  maxLife: number;
};

/**
 * Soft round sprite used by every particle.
 *
 * PointsMaterial draws each point as a flat screen-aligned quad. Without a map
 * those quads are solid squares, which is exactly what the sparkles used to look
 * like: hard-edged white cards. A radial falloff turns them into glows.
 *
 * The texture is only used as an alpha mask (the colour comes from the vertex
 * colour attribute), so it is left in the default no-colour-space state.
 */
let softTex: THREE.CanvasTexture | null = null;

function getSoftTexture(): THREE.CanvasTexture {
  if (softTex) return softTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.82)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.26)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  softTex = new THREE.CanvasTexture(canvas);
  softTex.needsUpdate = true;
  return softTex;
}

/** Release the shared soft sprite. Call from Game.dispose(). */
export function disposeSharedParticleAssets(): void {
  softTex?.dispose();
  softTex = null;
}

/**
 * Lightweight burst + trail particles.
 */
export class ParticleBursts {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  /** Untouched copy of each particle's colour, so the fade can be recomputed. */
  private readonly baseColors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly particles: Particle[];
  private cursor = 0;

  constructor(private readonly max = 400) {
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.baseColors = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.particles = Array.from({ length: max }, () => ({ life: 0, maxLife: 1 }));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    for (let i = 0; i < max; i += 1) this.positions[i * 3 + 1] = -999;

    // PointsMaterial is kept on purpose: it handles size attenuation and scene
    // fog for us. The soft map is what stops the points rendering as squares.
    const mat = new THREE.PointsMaterial({
      size: 0.2,
      map: getSoftTexture(),
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

  /** Stores a particle's spawn state and records its base colour for fading. */
  private spawn(
    i: number,
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    life: number,
  ): void {
    const p = this.particles[i];
    p.life = life;
    p.maxLife = life;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.baseColors[i * 3] = color.r;
    this.baseColors[i * 3 + 1] = color.g;
    this.baseColors[i * 3 + 2] = color.b;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
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
      this.velocities[i * 3] = (Math.random() - 0.5) * speed;
      this.velocities[i * 3 + 1] = Math.random() * speed * spreadY + 0.6;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.spawn(
        i,
        origin.x,
        origin.y,
        origin.z,
        color,
        0.4 + Math.random() * 0.45,
      );
    }
    this.flush();
  }

  /** Flat expanding dust ring on landing. */
  ring(origin: THREE.Vector3, color: THREE.Color, count = 20, radiusSpeed = 3.5): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = (n / count) * Math.PI * 2 + Math.random() * 0.2;
      this.velocities[i * 3] = Math.cos(a) * radiusSpeed;
      this.velocities[i * 3 + 1] = 0.4 + Math.random() * 0.8;
      this.velocities[i * 3 + 2] = Math.sin(a) * radiusSpeed;
      this.spawn(
        i,
        origin.x,
        origin.y + 0.05,
        origin.z,
        color,
        0.35 + Math.random() * 0.25,
      );
    }
    this.flush();
  }

  /** Soft speed trail behind the runner. */
  trail(origin: THREE.Vector3, color: THREE.Color, count = 2): void {
    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.velocities[i * 3] = (Math.random() - 0.5) * 0.4;
      this.velocities[i * 3 + 1] = 0.2 + Math.random() * 0.5;
      this.velocities[i * 3 + 2] = -1.5 - Math.random();
      this.spawn(
        i,
        origin.x + (Math.random() - 0.5) * 0.25,
        origin.y + 0.15 + Math.random() * 0.25,
        origin.z - 0.2,
        color,
        0.22 + Math.random() * 0.18,
      );
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
        p.life = 0;
        // Park dead particles far below the scene.
        this.positions[i * 3 + 1] = -999;
        this.colors[i * 3] = 0;
        this.colors[i * 3 + 1] = 0;
        this.colors[i * 3 + 2] = 0;
        any = true;
        continue;
      }
      this.velocities[i * 3 + 1] -= 7 * delta;
      this.positions[i * 3] += this.velocities[i * 3] * delta;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;

      // Linear fade to black. Under additive blending that is a true fade-out;
      // the previous `*= 0.999` per frame was ~3% over a particle's whole life,
      // so sparkles vanished abruptly instead of fading.
      const t = p.life / p.maxLife;
      this.colors[i * 3] = this.baseColors[i * 3] * t;
      this.colors[i * 3 + 1] = this.baseColors[i * 3 + 1] * t;
      this.colors[i * 3 + 2] = this.baseColors[i * 3 + 2] * t;
      any = true;
    }
    if (any) this.flush();
  }

  private flush(): void {
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
