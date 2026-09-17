import * as THREE from 'three';

type Popup = {
  el: HTMLElement;
  life: number;
  maxLife: number;
  world: THREE.Vector3;
};

/** HTML floating score / combo popups projected from world space. */
export class ScorePopups {
  private readonly layer: HTMLElement;
  private readonly pool: Popup[] = [];
  private readonly camera: THREE.PerspectiveCamera;
  private readonly tmp = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.id = 'score-popups';
    this.layer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4;';
    document.querySelector('#app')?.appendChild(this.layer);
  }

  spawn(world: THREE.Vector3, text: string, accent = '#6ef0ff'): void {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position:absolute;transform:translate(-50%,-50%);
      font:800 1.05rem/1 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
      color:${accent};text-shadow:0 0 12px ${accent},0 2px 4px rgba(0,0,0,.45);
      letter-spacing:0.04em;white-space:nowrap;
    `;
    this.layer.appendChild(el);
    this.pool.push({ el, life: 0.75, maxLife: 0.75, world: world.clone() });
  }

  update(delta: number): void {
    for (let i = this.pool.length - 1; i >= 0; i -= 1) {
      const p = this.pool[i];
      p.life -= delta;
      p.world.y += delta * 1.4;
      if (p.life <= 0) {
        p.el.remove();
        this.pool.splice(i, 1);
        continue;
      }
      this.tmp.copy(p.world).project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * 100;
      const y = (-this.tmp.y * 0.5 + 0.5) * 100;
      const t = p.life / p.maxLife;
      p.el.style.left = `${x}%`;
      p.el.style.top = `${y}%`;
      p.el.style.opacity = String(Math.min(1, t * 1.6));
      p.el.style.transform = `translate(-50%,-50%) scale(${0.85 + (1 - t) * 0.25})`;
    }
  }

  dispose(): void {
    for (const p of this.pool) p.el.remove();
    this.pool.length = 0;
    this.layer.remove();
  }
}
