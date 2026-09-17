import * as THREE from 'three';

type PointerState = {
  active: boolean;
  id: number | null;
  centerX: number;
  centerY: number;
  radius: number;
};

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly pointerState: PointerState = {
    active: false,
    id: null,
    centerX: 0,
    centerY: 0,
    radius: 1,
  };

  private jumpPressed = false;
  private jumpConsumed = false;
  private dashPressed = false;
  private dashConsumed = false;
  private touchSteer = 0;

  injectSteer(x: number): void {
    this.touchSteer = THREE.MathUtils.clamp(x, -1, 1);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (event.code === 'Space') {
      event.preventDefault();
      if (!this.jumpPressed) this.jumpConsumed = false;
      this.jumpPressed = true;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyJ') {
      if (!this.dashPressed) this.dashConsumed = false;
      this.dashPressed = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === 'Space') {
      this.jumpPressed = false;
      this.jumpConsumed = false;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyJ') {
      this.dashPressed = false;
      this.dashConsumed = false;
    }
  };

  private readonly onStickDown = (event: PointerEvent) => {
    event.preventDefault();
    const rect = this.stick.getBoundingClientRect();
    this.pointerState.active = true;
    this.pointerState.id = event.pointerId;
    this.pointerState.centerX = rect.left + rect.width / 2;
    this.pointerState.centerY = rect.top + rect.height / 2;
    this.pointerState.radius = rect.width * 0.42;
    try {
      this.stick.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events may not be capturable.
    }
    this.updatePointer(event.clientX, event.clientY);
  };

  private readonly onStickMove = (event: PointerEvent) => {
    if (!this.pointerState.active || event.pointerId !== this.pointerState.id) return;
    event.preventDefault();
    this.updatePointer(event.clientX, event.clientY);
  };

  private readonly onStickUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerState.id) return;
    event.preventDefault();
    this.pointerState.active = false;
    this.pointerState.id = null;
    this.pointer.set(0, 0);
    this.updateKnob();
  };

  private readonly onJumpDown = (event: PointerEvent) => {
    event.preventDefault();
    this.jumpPressed = true;
    this.jumpConsumed = false;
  };

  private readonly onJumpUp = (event: PointerEvent) => {
    event.preventDefault();
    this.jumpPressed = false;
    this.jumpConsumed = false;
  };

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly jumpButton: HTMLElement,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
    this.jumpButton.addEventListener('pointerdown', this.onJumpDown);
    this.jumpButton.addEventListener('pointerup', this.onJumpUp);
    this.jumpButton.addEventListener('pointercancel', this.onJumpUp);
    this.jumpButton.addEventListener('pointerleave', this.onJumpUp);
  }

  /** Lateral steer in [-1, 1]. Forward is auto-run. */
  readSteer(target: THREE.Vector2): THREE.Vector2 {
    this.keyVector.set(0, 0);
    // P1 only uses A/D here; arrows reserved for P2 when coop
    if (this.keys.has('KeyA')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD')) this.keyVector.x += 1;

    target.set(this.keyVector.x + this.pointer.x + this.touchSteer, 0);
    if (Math.abs(target.x) > 1) target.x = Math.sign(target.x);
    return target;
  }

  /** Edge-triggered jump; consumes one press per call. */
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

  reset(): void {
    this.keys.clear();
    this.pointer.set(0, 0);
    this.jumpPressed = false;
    this.jumpConsumed = false;
    this.dashPressed = false;
    this.dashConsumed = false;
    this.touchSteer = 0;
    this.pointerState.active = false;
    this.pointerState.id = null;
    this.updateKnob();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.stick.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('pointermove', this.onStickMove);
    this.stick.removeEventListener('pointerup', this.onStickUp);
    this.stick.removeEventListener('pointercancel', this.onStickUp);
    this.jumpButton.removeEventListener('pointerdown', this.onJumpDown);
    this.jumpButton.removeEventListener('pointerup', this.onJumpUp);
    this.jumpButton.removeEventListener('pointercancel', this.onJumpUp);
    this.jumpButton.removeEventListener('pointerleave', this.onJumpUp);
  }

  private updatePointer(clientX: number, clientY: number): void {
    const dx = clientX - this.pointerState.centerX;
    const dy = clientY - this.pointerState.centerY;
    this.pointer.set(dx / this.pointerState.radius, dy / this.pointerState.radius);
    if (this.pointer.lengthSq() > 1) this.pointer.normalize();
    this.updateKnob();
  }

  private updateKnob(): void {
    const distance = 38;
    this.knob.style.transform = `translate(calc(-50% + ${this.pointer.x * distance}px), calc(-50% + ${this.pointer.y * distance}px))`;
  }
}
