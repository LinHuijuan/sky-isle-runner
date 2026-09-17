import * as THREE from 'three';

export type PlayerIndex = 0 | 1;

/**
 * Per-player keyboard binding.
 * P1: A/D steer, Space jump, Shift dash
 * P2: ←/→ steer, Numpad0 or Enter jump, Numpad1 or / dash
 */
export class PlayerInput {
  private readonly keys = new Set<string>();
  private readonly keyVector = new THREE.Vector2();
  private jumpPressed = false;
  private jumpConsumed = false;
  private dashPressed = false;
  private dashConsumed = false;
  private touchSteer = 0;
  private arrowsForP1 = true;

  private readonly jumpCodes: string[];
  private readonly dashCodes: string[];
  private readonly leftCodes: string[];
  private readonly rightCodes: string[];

  constructor(readonly index: PlayerIndex) {
    if (index === 0) {
      this.jumpCodes = ['Space'];
      this.dashCodes = ['ShiftLeft', 'KeyJ'];
      this.leftCodes = ['KeyA'];
      this.rightCodes = ['KeyD'];
    } else {
      this.jumpCodes = ['Numpad0', 'Enter', 'KeyI'];
      this.dashCodes = ['Numpad1', 'Slash', 'KeyO'];
      this.leftCodes = ['ArrowLeft'];
      this.rightCodes = ['ArrowRight'];
    }
  }

  /** In coop, P1 must not steal P2's arrows. */
  setP1ArrowsEnabled(enabled: boolean): void {
    this.arrowsForP1 = enabled;
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    // Prevent page scroll / button activation while playing
    if (
      event.code === 'Space' ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown'
    ) {
      if (this.index === 0 || this.index === 1) event.preventDefault();
    }
    if (this.jumpCodes.includes(event.code)) {
      if (!this.jumpPressed) this.jumpConsumed = false;
      this.jumpPressed = true;
    }
    if (this.dashCodes.includes(event.code)) {
      if (!this.dashPressed) this.dashConsumed = false;
      this.dashPressed = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (this.jumpCodes.includes(event.code)) {
      this.jumpPressed = false;
      this.jumpConsumed = false;
    }
    if (this.dashCodes.includes(event.code)) {
      this.dashPressed = false;
      this.dashConsumed = false;
    }
  };

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  readSteer(target: THREE.Vector2): THREE.Vector2 {
    this.keyVector.set(0, 0);
    for (const c of this.leftCodes) if (this.keys.has(c)) this.keyVector.x -= 1;
    for (const c of this.rightCodes) if (this.keys.has(c)) this.keyVector.x += 1;
    // Single-player P1 also uses arrows (legacy / common expectation)
    if (this.index === 0 && this.arrowsForP1) {
      if (this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
      if (this.keys.has('ArrowRight')) this.keyVector.x += 1;
    }
    target.set(this.keyVector.x + this.touchSteer, 0);
    if (Math.abs(target.x) > 1) target.x = Math.sign(target.x);
    return target;
  }

  tryConsumeJump(): boolean {
    if (this.jumpPressed && !this.jumpConsumed) {
      this.jumpConsumed = true;
      return true;
    }
    return false;
  }

  tryConsumeDash(): boolean {
    if (this.dashPressed && !this.dashConsumed) {
      this.dashConsumed = true;
      return true;
    }
    return false;
  }

  injectSteer(x: number): void {
    this.touchSteer = THREE.MathUtils.clamp(x, -1, 1);
  }

  readSteerWithTouch(target: THREE.Vector2): THREE.Vector2 {
    this.readSteer(target);
    return target;
  }

  triggerJump(): void {
    this.jumpPressed = true;
    this.jumpConsumed = false;
  }

  triggerDash(): void {
    this.dashPressed = true;
    this.dashConsumed = false;
  }

  reset(): void {
    this.keys.clear();
    this.jumpPressed = false;
    this.jumpConsumed = false;
    this.dashPressed = false;
    this.dashConsumed = false;
    this.touchSteer = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
