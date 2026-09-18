import * as THREE from 'three';

export type RunnerState = 'grounded' | 'air' | 'fall' | 'land';

export type RunnerTuning = {
  autoSpeed: number;
  maxAutoSpeed: number;
  speedRamp: number;
  lateralSpeed: number;
  lateralAccel: number;
  jumpVelocity: number;
  gravity: number;
  coyoteTime: number;
  jumpBuffer: number;
};

export const DEFAULT_RUNNER_TUNING: RunnerTuning = {
  autoSpeed: 7.2,
  maxAutoSpeed: 12.5,
  speedRamp: 0.18,
  lateralSpeed: 6.2,
  lateralAccel: 18,
  jumpVelocity: 9.4,
  gravity: 24,
  coyoteTime: 0.12,
  jumpBuffer: 0.1,
};

import { getSkin, type SkinId } from './Skins';
import { loadGameTextures } from '../assets/Textures';

function getRunnerTex() {
  return loadGameTextures();
}

/**
 * Clean silhouette runner — intentional color blocks, no noise.
 * White suit · teal armor · gold trim · one flowing cape · glowing visor.
 */
export class Runner {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly forwardSpeed = { value: 0 };
  grounded = false;
  state: RunnerState = 'grounded';

  private lateralVel = 0;
  private verticalVel = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private runPhase = 0;
  private landBob = 0;
  private skinId: SkinId = 'jade';
  private cape!: THREE.Mesh;
  private emblem!: THREE.Mesh;
  private blobShadow!: THREE.Mesh;
  /** Last known ground height under the runner — drives the blob shadow fade. */
  private groundY = 0;
  private trailPoints?: THREE.Points;
  private trailPos!: Float32Array;
  private trailCol!: Float32Array;
  private trailLife!: Float32Array;
  private trailCursor = 0;
  private trailTimer = 0;
  private trailColor = new THREE.Color('#7af0ff');

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly bodyRoot = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  /** Elbow / knee pivots for two-bone limbs */
  private readonly elbowL = new THREE.Group();
  private readonly elbowR = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly kneeR = new THREE.Group();

  private cloth!: THREE.MeshStandardMaterial;
  private armor!: THREE.MeshStandardMaterial;
  private gold!: THREE.MeshStandardMaterial;
  private accent!: THREE.MeshStandardMaterial;
  private capeM!: THREE.MeshStandardMaterial;
  private hair!: THREE.MeshStandardMaterial;
  private skin!: THREE.MeshStandardMaterial;

  constructor(skinId: SkinId = 'jade') {
    this.group.name = 'runner';
    this.skinId = skinId;
    this.buildMaterials(skinId);
    this.buildBody();
    this.buildShadow();
    this.buildTrail();
    this.group.add(this.bodyRoot);
    this.group.rotation.y = Math.PI;
    this.bodyRoot.scale.setScalar(1.28);
  }

  setSkin(id: SkinId): void {
    if (id === this.skinId) return;
    this.skinId = id;
    const t = getSkin(id);
    this.cloth.color.set(t.cloth);
    this.armor.color.set(t.armor);
    this.armor.emissive.set(t.accentEmissive);
    this.gold.color.set(t.gold);
    this.accent.color.set(t.accent);
    this.accent.emissive.set(t.accentEmissive);
    this.capeM.color.set(t.cape);
    this.hair.color.set(t.hair);
    this.trailColor.set(t.trail);
  }

  private buildMaterials(id: SkinId): void {
    const t = getSkin(id);
    this.trailColor.set(t.trail);
    const tex = getRunnerTex();
    this.cloth = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f8f4ec',
        roughness: 0.68,
        metalness: 0.04,
        map: tex.suit,
      }),
    );
    this.armor = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: t.armor,
        roughness: 0.28,
        metalness: 0.5,
        emissive: t.accentEmissive,
        emissiveIntensity: 0.45,
        map: tex.helmet,
      }),
    );
    this.gold = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: t.gold,
        roughness: 0.2,
        metalness: 0.85,
        emissive: '#4a3808',
        emissiveIntensity: 0.4,
      }),
    );
    this.accent = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: t.accent,
        emissive: t.accentEmissive,
        emissiveIntensity: 2.0,
        roughness: 0.12,
        metalness: 0.6,
      }),
    );
    this.capeM = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: t.cape,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide,
        map: tex.cape,
      }),
    );
    this.hair = this.trackMat(
      new THREE.MeshStandardMaterial({ color: t.hair, roughness: 0.8, metalness: 0.08 }),
    );
    this.skin = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f0c8a8', roughness: 0.6, metalness: 0 }),
    );
  }

  /** Clean silhouette: tall torso, clear limbs, one cape, helmet. */
  private buildBody(): void {
    // — Pelvis (armor) —
    const pelvis = this.track(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 10));
    pelvis.scale(1.15, 1, 0.8);
    pelvis.translate(0, 0.52, 0);
    const pelvisM = new THREE.Mesh(pelvis, this.armor);
    pelvisM.castShadow = true;
    this.bodyRoot.add(pelvisM);

    // — Torso (cream suit, tapered) —
    const torso = this.track(new THREE.CylinderGeometry(0.16, 0.11, 0.42, 12));
    torso.scale(1.2, 1, 0.72);
    torso.translate(0, 0.82, 0);
    const torsoM = new THREE.Mesh(torso, this.cloth);
    torsoM.castShadow = true;
    this.bodyRoot.add(torsoM);

    // Chest armor plate (front)
    const chest = this.track(new THREE.BoxGeometry(0.22, 0.26, 0.05));
    const chestM = new THREE.Mesh(chest, this.armor);
    chestM.position.set(0, 0.88, -0.11);
    chestM.castShadow = true;
    this.bodyRoot.add(chestM);

    // Gold V on chest
    const vBar = this.track(new THREE.BoxGeometry(0.16, 0.025, 0.02));
    for (const sx of [-1, 1]) {
      const v = new THREE.Mesh(vBar, this.gold);
      v.position.set(sx * 0.03, 0.96, -0.14);
      v.rotation.z = sx * 0.5;
      this.bodyRoot.add(v);
    }

    // Glowing core gem
    const gem = this.track(new THREE.OctahedronGeometry(0.045, 0));
    const gemM = new THREE.Mesh(gem, this.accent);
    gemM.position.set(0, 0.86, -0.155);
    gemM.name = 'emblem';
    this.emblem = gemM;
    this.bodyRoot.add(gemM);

    // — Shoulders (teal pads) —
    const pad = this.track(new THREE.SphereGeometry(0.1, 12, 10));
    pad.scale(1.3, 0.7, 1.05);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(pad, this.armor);
      p.position.set(sx * 0.22, 1.08, 0);
      p.castShadow = true;
      this.bodyRoot.add(p);
    }

    // — Neck + head —
    const neck = this.track(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8));
    neck.translate(0, 1.12, 0);
    this.bodyRoot.add(new THREE.Mesh(neck, this.skin));

    const head = this.track(new THREE.SphereGeometry(0.13, 16, 14));
    head.scale(0.95, 1.05, 1);
    const headM = new THREE.Mesh(head, this.skin);
    headM.position.y = 1.26;
    headM.castShadow = true;
    this.bodyRoot.add(headM);

    // Helmet shell (teal, open face)
    const helmet = this.track(
      new THREE.SphereGeometry(0.145, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    );
    helmet.scale(1.05, 1.08, 1.08);
    const helmetM = new THREE.Mesh(helmet, this.armor);
    helmetM.position.y = 1.28;
    helmetM.castShadow = true;
    this.bodyRoot.add(helmetM);

    // Visor strip (glow)
    const visor = this.track(new THREE.BoxGeometry(0.18, 0.035, 0.03));
    const visorM = new THREE.Mesh(visor, this.accent);
    visorM.position.set(0, 1.27, -0.125);
    this.bodyRoot.add(visorM);

    // Crest fin
    const crest = this.track(new THREE.BoxGeometry(0.03, 0.1, 0.18));
    const crestM = new THREE.Mesh(crest, this.gold);
    crestM.position.set(0, 1.42, 0.02);
    crestM.rotation.x = -0.2;
    this.bodyRoot.add(crestM);

    // — Cape (single clean sheet) —
    const capeGeo = this.track(new THREE.PlaneGeometry(0.44, 0.68, 6, 10));
    const pos = capeGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = (0.34 - y) / 0.68;
      pos.setX(i, x * (0.5 + t * 0.65));
      pos.setZ(i, t * 0.32);
    }
    pos.needsUpdate = true;
    capeGeo.computeVertexNormals();
    this.cape = new THREE.Mesh(capeGeo, this.capeM);
    this.cape.position.set(0, -0.28, 0.16);
    this.cape.rotation.x = 0.5;
    this.cape.castShadow = true;
    this.bodyRoot.add(this.cape);

    // Gold clasp + back emblem
    const clasp = this.track(new THREE.SphereGeometry(0.04, 10, 8));
    const claspM = new THREE.Mesh(clasp, this.gold);
    claspM.position.set(0, 1.08, 0.12);
    this.bodyRoot.add(claspM);

    const backGem = this.track(new THREE.OctahedronGeometry(0.035, 0));
    const backGemM = new THREE.Mesh(backGem, this.accent);
    backGemM.position.set(0, 0.9, 0.13);
    this.bodyRoot.add(backGemM);

    // — Arms: shoulder → elbow → wrist —
    this.buildArm(this.armL, this.elbowL);
    this.buildArm(this.armR, this.elbowR);
    this.armL.position.set(-0.23, 1.05, 0);
    this.armR.position.set(0.23, 1.05, 0);
    this.bodyRoot.add(this.armL, this.armR);

    // — Legs: hip → knee → ankle —
    this.buildLeg(this.legL, this.kneeL);
    this.buildLeg(this.legR, this.kneeR);
    this.legL.position.set(-0.1, 0.5, 0);
    this.legR.position.set(0.1, 0.5, 0);
    this.bodyRoot.add(this.legL, this.legR);
  }

  /** Shoulder-pivoted arm with visible elbow/wrist joints. */
  private buildArm(shoulder: THREE.Group, elbow: THREE.Group): void {
    // Upper arm
    const upperGeo = this.track(new THREE.CapsuleGeometry(0.042, 0.13, 3, 8));
    const upper = new THREE.Mesh(upperGeo, this.cloth);
    upper.position.y = -0.085;
    upper.castShadow = true;
    shoulder.add(upper);

    // Shoulder joint ring
    const shRingGeo = this.track(new THREE.TorusGeometry(0.048, 0.012, 6, 10));
    const shRing = new THREE.Mesh(shRingGeo, this.gold);
    shRing.rotation.x = Math.PI / 2;
    shoulder.add(shRing);

    // Elbow pivot at end of upper arm
    elbow.position.y = -0.17;
    shoulder.add(elbow);

    const elbowBallGeo = this.track(new THREE.SphereGeometry(0.038, 10, 8));
    const elbowBall = new THREE.Mesh(elbowBallGeo, this.gold);
    elbowBall.castShadow = true;
    elbow.add(elbowBall);

    const elbowRingGeo = this.track(new THREE.TorusGeometry(0.042, 0.01, 6, 10));
    const elbowRing = new THREE.Mesh(elbowRingGeo, this.armor);
    elbowRing.rotation.x = Math.PI / 2;
    elbow.add(elbowRing);

    // Forearm
    const foreGeo = this.track(new THREE.CapsuleGeometry(0.036, 0.12, 3, 8));
    const fore = new THREE.Mesh(foreGeo, this.armor);
    fore.position.y = -0.08;
    fore.castShadow = true;
    elbow.add(fore);

    // Wrist
    const wrist = new THREE.Group();
    wrist.position.y = -0.15;
    elbow.add(wrist);
    const wristBallGeo = this.track(new THREE.SphereGeometry(0.03, 8, 6));
    wrist.add(new THREE.Mesh(wristBallGeo, this.gold));

    const handGeo = this.track(new THREE.SphereGeometry(0.042, 8, 6));
    const hand = new THREE.Mesh(handGeo, this.cloth);
    hand.position.y = -0.04;
    hand.scale.set(0.9, 1.1, 0.85);
    wrist.add(hand);
  }

  /** Hip-pivoted leg with visible knee/ankle joints. */
  private buildLeg(hip: THREE.Group, knee: THREE.Group): void {
    const thighGeo = this.track(new THREE.CapsuleGeometry(0.05, 0.14, 3, 8));
    const thigh = new THREE.Mesh(thighGeo, this.armor);
    thigh.position.y = -0.1;
    thigh.castShadow = true;
    hip.add(thigh);

    // Hip joint ring
    const hipRingGeo = this.track(new THREE.TorusGeometry(0.055, 0.012, 6, 10));
    const hipRing = new THREE.Mesh(hipRingGeo, this.gold);
    hipRing.rotation.x = Math.PI / 2;
    hip.add(hipRing);

    knee.position.y = -0.2;
    hip.add(knee);

    const kneeBallGeo = this.track(new THREE.SphereGeometry(0.045, 10, 8));
    const kneeBall = new THREE.Mesh(kneeBallGeo, this.gold);
    kneeBall.castShadow = true;
    knee.add(kneeBall);

    const kneeRingGeo = this.track(new THREE.TorusGeometry(0.048, 0.012, 6, 10));
    const kneeRing = new THREE.Mesh(kneeRingGeo, this.armor);
    kneeRing.rotation.x = Math.PI / 2;
    knee.add(kneeRing);

    const shinGeo = this.track(new THREE.CapsuleGeometry(0.038, 0.13, 3, 8));
    const shin = new THREE.Mesh(shinGeo, this.cloth);
    shin.position.y = -0.085;
    shin.castShadow = true;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -0.16;
    knee.add(ankle);
    const ankleBallGeo = this.track(new THREE.SphereGeometry(0.032, 8, 6));
    ankle.add(new THREE.Mesh(ankleBallGeo, this.gold));

    const bootGeo = this.track(new THREE.BoxGeometry(0.08, 0.07, 0.18));
    const bp = bootGeo.attributes.position;
    for (let i = 0; i < bp.count; i += 1) {
      if (bp.getZ(i) < -0.04) bp.setY(i, bp.getY(i) * 0.6);
    }
    bp.needsUpdate = true;
    bootGeo.computeVertexNormals();
    const boot = new THREE.Mesh(bootGeo, this.gold);
    boot.position.set(0, -0.05, -0.03);
    boot.castShadow = true;
    ankle.add(boot);

    const soleGeo = this.track(new THREE.BoxGeometry(0.085, 0.018, 0.16));
    const sole = new THREE.Mesh(soleGeo, this.armor);
    sole.position.set(0, -0.08, -0.03);
    ankle.add(sole);
  }

  private buildShadow(): void {
    const geo = this.track(new THREE.CircleGeometry(0.36, 24));
    const mat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: '#000',
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    const s = new THREE.Mesh(geo, mat);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.02;
    s.name = 'blob-shadow';
    this.blobShadow = s;
    this.group.add(s);
  }

  private buildTrail(): void {
    const count = 80;
    this.trailPos = new Float32Array(count * 3);
    this.trailCol = new Float32Array(count * 3);
    this.trailLife = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      this.trailPos[i * 3 + 1] = -999;
      this.trailCol[i * 3] = this.trailColor.r;
      this.trailCol[i * 3 + 1] = this.trailColor.g;
      this.trailCol[i * 3 + 2] = this.trailColor.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.trailPoints = new THREE.Points(geo, mat);
    this.trailPoints.frustumCulled = false;
    this.group.add(this.trailPoints);
    this.materials.push(mat);
  }

  private emitTrail(): void {
    if (!this.trailPoints) return;
    const i = this.trailCursor;
    this.trailCursor = (this.trailCursor + 1) % (this.trailPos.length / 3);
    this.trailPos[i * 3] = (Math.random() - 0.5) * 0.25;
    this.trailPos[i * 3 + 1] = 0.2 + Math.random() * 0.4;
    this.trailPos[i * 3 + 2] = -0.2;
    this.trailCol[i * 3] = this.trailColor.r;
    this.trailCol[i * 3 + 1] = this.trailColor.g;
    this.trailCol[i * 3 + 2] = this.trailColor.b;
    this.trailLife[i] = 0.3 + Math.random() * 0.25;
    (this.trailPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.trailPoints.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateTrail(delta: number): void {
    if (!this.trailPoints) return;
    let any = false;
    for (let i = 0; i < this.trailLife.length; i += 1) {
      if (this.trailLife[i] <= 0) continue;
      this.trailLife[i] -= delta;
      if (this.trailLife[i] <= 0) {
        this.trailPos[i * 3 + 1] = -999;
        any = true;
        continue;
      }
      this.trailPos[i * 3 + 1] += delta * 0.7;
      this.trailPos[i * 3 + 2] -= delta * 2.8;
      any = true;
    }
    if (any) {
      (this.trailPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  launch(velocity: number): void {
    this.verticalVel = velocity;
    this.grounded = false;
    this.state = 'air';
    this.jumpBuffer = 0;
    this.coyote = 0;
  }

  reset(position: THREE.Vector3): void {
    this.group.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.lateralVel = 0;
    this.verticalVel = 0;
    this.forwardSpeed.value = 0;
    this.grounded = true;
    this.state = 'grounded';
    this.groundY = position.y;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.runPhase = 0;
    this.group.rotation.set(0, Math.PI, 0);
    this.bodyRoot.rotation.set(0, 0, 0);
    this.bodyRoot.position.set(0, 0, 0);
    this.bodyRoot.scale.set(1.28, 1.28, 1.28);
    this.cape.rotation.set(0.5, 0, 0);
    this.elbowL.rotation.set(0, 0, 0);
    this.elbowR.rotation.set(0, 0, 0);
    this.kneeL.rotation.set(0, 0, 0);
    this.kneeR.rotation.set(0, 0, 0);
  }

  update(
    delta: number,
    elapsed: number,
    steerX: number,
    jumpRequested: boolean,
    tuning: RunnerTuning,
    surfaceY: number | null,
    active: boolean,
  ): void {
    if (!active) {
      this.animateIdle(elapsed);
      this.updateTrail(delta);
      return;
    }

    this.forwardSpeed.value = Math.min(
      tuning.maxAutoSpeed,
      this.forwardSpeed.value + tuning.speedRamp * delta,
    );
    if (this.forwardSpeed.value < tuning.autoSpeed) {
      this.forwardSpeed.value = Math.min(tuning.autoSpeed, this.forwardSpeed.value + 12 * delta);
    }

    const targetLateral = -steerX * tuning.lateralSpeed;
    this.lateralVel = THREE.MathUtils.damp(
      this.lateralVel,
      targetLateral,
      tuning.lateralAccel,
      delta,
    );

    if (jumpRequested) this.jumpBuffer = tuning.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - delta);

    if (this.grounded) this.coyote = tuning.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - delta);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.verticalVel = tuning.jumpVelocity;
      this.grounded = false;
      this.state = 'air';
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.bodyRoot.scale.set(1.28 * 0.88, 1.28 * 1.14, 1.28 * 0.88);
    }

    this.verticalVel -= tuning.gravity * delta;
    const prevY = this.group.position.y;
    this.group.position.x += this.lateralVel * delta;
    this.group.position.z += this.forwardSpeed.value * delta;
    this.group.position.y += this.verticalVel * delta;

    if (surfaceY !== null) this.groundY = surfaceY;
    if (surfaceY !== null && this.group.position.y <= surfaceY + 0.08 && this.verticalVel <= 0.01) {
      const wasAir = !this.grounded;
      this.group.position.y = surfaceY;
      this.verticalVel = 0;
      this.grounded = true;
      if (wasAir && prevY > surfaceY + 0.25) {
        this.state = 'land';
        this.landBob = 1;
        this.bodyRoot.scale.set(1.28 * 1.15, 1.28 * 0.8, 1.28 * 1.15);
      } else {
        this.state = 'grounded';
      }
    } else {
      this.grounded = false;
      this.state = this.verticalVel > 0 ? 'air' : 'fall';
    }

    this.group.rotation.y = Math.PI + this.lateralVel * 0.035;
    this.bodyRoot.rotation.y = THREE.MathUtils.damp(
      this.bodyRoot.rotation.y,
      -steerX * 0.3,
      10,
      delta,
    );
    this.bodyRoot.rotation.z = THREE.MathUtils.damp(
      this.bodyRoot.rotation.z,
      steerX * 0.12,
      10,
      delta,
    );
    this.bodyRoot.rotation.x = THREE.MathUtils.damp(
      this.bodyRoot.rotation.x,
      this.grounded ? 0.1 : -0.2,
      8,
      delta,
    );

    this.animateLocomotion(delta, elapsed);
    this.velocity.set(this.lateralVel, this.verticalVel, this.forwardSpeed.value);

    if (this.forwardSpeed.value > 7.5) {
      this.trailTimer += delta;
      while (this.trailTimer > 0.028) {
        this.trailTimer -= 0.028;
        this.emitTrail();
      }
    }
    this.updateTrail(delta);
  }

  private animateLocomotion(delta: number, elapsed: number): void {
    const speed = this.forwardSpeed.value;
    const speedN = THREE.MathUtils.clamp((speed - 6) / 8, 0, 1);
    this.runPhase += delta * (3.8 + speed * 0.65);
    const c = Math.cos(this.runPhase);
    const s = Math.sin(this.runPhase);

    this.landBob = Math.max(0, this.landBob - delta * 5);
    this.bodyRoot.scale.x = THREE.MathUtils.damp(this.bodyRoot.scale.x, 1.28, 10, delta);
    this.bodyRoot.scale.y = THREE.MathUtils.damp(this.bodyRoot.scale.y, 1.28, 10, delta);
    this.bodyRoot.scale.z = this.bodyRoot.scale.x;

    // Cached reference — getObjectByName() walked the whole subtree every frame.
    const emb = this.emblem;
    if (emb) {
      const mat = emb.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.6 + Math.sin(elapsed * 3) * 0.5;
      emb.rotation.y = elapsed * 1.5;
    }

    if (this.grounded) {
      // Two-bone run cycle: hip/knee + shoulder/elbow
      const hip = s * (0.6 + speedN * 0.4);
      // Knee bends most when leg is back (opposite of hip swing)
      const kneeBendL = Math.max(0, c) * (0.9 + speedN * 0.5);
      const kneeBendR = Math.max(0, -c) * (0.9 + speedN * 0.5);
      this.legL.rotation.x = hip;
      this.legR.rotation.x = -hip;
      this.kneeL.rotation.x = kneeBendL;
      this.kneeR.rotation.x = kneeBendR;
      // Slight ankle toe-off
      this.kneeL.rotation.z = 0.02;
      this.kneeR.rotation.z = -0.02;

      const armSwing = s * (0.75 + speedN * 0.35);
      // Elbows always slightly bent, more on forward swing
      const elbowL = 0.35 + Math.max(0, -s) * (0.5 + speedN * 0.3);
      const elbowR = 0.35 + Math.max(0, s) * (0.5 + speedN * 0.3);
      this.armL.rotation.x = -armSwing;
      this.armR.rotation.x = armSwing;
      this.elbowL.rotation.x = -elbowL;
      this.elbowR.rotation.x = -elbowR;
      this.armL.rotation.z = 0.16 + Math.abs(s) * 0.06;
      this.armR.rotation.z = -0.16 - Math.abs(s) * 0.06;

      this.bodyRoot.position.y = Math.abs(s) * (0.03 + speedN * 0.02);
      this.bodyRoot.rotation.x = THREE.MathUtils.damp(
        this.bodyRoot.rotation.x,
        0.1 + speedN * 0.1,
        8,
        delta,
      );
    } else {
      // Air pose: tuck knees, reach arms
      const rising = this.verticalVel > 0;
      const tuck = rising ? 1.1 : 0.4;
      this.legL.rotation.x = THREE.MathUtils.damp(this.legL.rotation.x, rising ? 0.35 : 0.1, 8, delta);
      this.legR.rotation.x = THREE.MathUtils.damp(this.legR.rotation.x, rising ? 0.2 : 0.05, 8, delta);
      this.kneeL.rotation.x = THREE.MathUtils.damp(this.kneeL.rotation.x, tuck, 8, delta);
      this.kneeR.rotation.x = THREE.MathUtils.damp(this.kneeR.rotation.x, tuck * 0.55, 8, delta);
      this.armL.rotation.x = THREE.MathUtils.damp(
        this.armL.rotation.x,
        rising ? -1.2 : -0.45,
        8,
        delta,
      );
      this.armR.rotation.x = THREE.MathUtils.damp(
        this.armR.rotation.x,
        rising ? -1.0 : -0.3,
        8,
        delta,
      );
      this.elbowL.rotation.x = THREE.MathUtils.damp(
        this.elbowL.rotation.x,
        rising ? -0.9 : -0.5,
        8,
        delta,
      );
      this.elbowR.rotation.x = THREE.MathUtils.damp(
        this.elbowR.rotation.x,
        rising ? -0.7 : -0.35,
        8,
        delta,
      );
      this.armL.rotation.z = THREE.MathUtils.damp(this.armL.rotation.z, 0.55, 8, delta);
      this.armR.rotation.z = THREE.MathUtils.damp(this.armR.rotation.z, -0.55, 8, delta);
      this.bodyRoot.position.y = Math.sin(elapsed * 2.2) * 0.02;
      this.bodyRoot.rotation.x = THREE.MathUtils.damp(
        this.bodyRoot.rotation.x,
        rising ? -0.28 : 0.04,
        8,
        delta,
      );
    }

    // Cape flutter
    const ph = elapsed * (3.5 + speed * 0.4);
    this.cape.rotation.x = 0.5 + Math.sin(ph) * (0.06 + speedN * 0.08) + speed * 0.008;
    this.cape.rotation.z = Math.sin(ph * 0.6) * 0.04;

    // Blob shadow fades with height above the last known ground.
    // (Previously surfaceGuess() returned the runner's own Y, so `air` was
    // always 0 and the shadow never changed.)
    const blob = this.blobShadow;
    if (blob) {
      const air = Math.max(0, this.group.position.y - this.groundY);
      const sc = THREE.MathUtils.clamp(1 - air * 0.1, 0.55, 1);
      blob.scale.setScalar(sc);
      (blob.material as THREE.MeshBasicMaterial).opacity = 0.32 * sc;
    }
  }

  private animateIdle(elapsed: number): void {
    this.bodyRoot.position.y = Math.sin(elapsed * 2) * 0.025;
    this.bodyRoot.rotation.x = Math.sin(elapsed * 1.4) * 0.02;
    this.legL.rotation.x = Math.sin(elapsed * 1.1) * 0.04;
    this.legR.rotation.x = -Math.sin(elapsed * 1.1) * 0.04;
    this.kneeL.rotation.x = 0.08;
    this.kneeR.rotation.x = 0.08;
    this.armL.rotation.x = 0.1 + Math.sin(elapsed * 2) * 0.04;
    this.armR.rotation.x = 0.1 + Math.sin(elapsed * 2 + 0.4) * 0.04;
    this.elbowL.rotation.x = -0.35;
    this.elbowR.rotation.x = -0.35;
    this.armL.rotation.z = 0.2;
    this.armR.rotation.z = -0.2;
    this.bodyRoot.rotation.y = Math.sin(elapsed * 0.6) * 0.08;
    this.cape.rotation.x = 0.47 + Math.sin(elapsed * 2) * 0.04;
  }

  stabilizeVisuals(): void {
    this.runPhase = 0;
    this.landBob = 0;
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.kneeL.rotation.x = 0;
    this.kneeR.rotation.x = 0;
    this.armL.rotation.x = 0;
    this.armR.rotation.x = 0;
    this.elbowL.rotation.x = 0;
    this.elbowR.rotation.x = 0;
    this.bodyRoot.position.y = 0;
    this.bodyRoot.scale.set(1.28, 1.28, 1.28);
    this.bodyRoot.rotation.set(0, 0, 0);
    this.cape.rotation.set(0.5, 0, 0);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.trailPoints?.geometry.dispose();
  }

  private track<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }
}
