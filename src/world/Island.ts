import * as THREE from 'three';
import { createGrassDetailTexture, loadGameTextures } from '../assets/Textures';

export type IslandKind = 'normal' | 'narrow' | 'bouncy' | 'crumble' | 'moving';

export type IslandDef = {
  id: number;
  kind: IslandKind;
  position: THREE.Vector3;
  radius: number;
  lengthZ: number;
  height: number;
  topY: number;
  hasCrystal: boolean;
  crystalOffset: THREE.Vector3;
  moveAmpX: number;
  moveSpeed: number;
  movePhase: number;
  crumbleTimer: number;
  crumbled: boolean;
  visualOffsetX: number;
};

export type IslandMeshBundle = {
  group: THREE.Group;
  kind: IslandKind;
  bounceCap?: THREE.Mesh;
  crumbleCap?: THREE.Mesh;
  glowRing?: THREE.Mesh;
  dispose: () => void;
};

const rockPalette = ['#7a6250', '#8a7058', '#6a5548', '#9a7a60'];
const grassPalette = ['#5aaa78', '#4e986c', '#64b888', '#488c60'];
const bouncyPalette = ['#5ec4a8', '#50b898', '#6ad0b0'];
const crumblePalette = ['#d4b07a', '#c49a62', '#e0c088'];
const movingPalette = ['#7ab8f0', '#6aa4e0', '#8ec8ff'];

let grassTex: THREE.Texture | null = null;
let rockTex: THREE.Texture | null = null;
let grassBladeTex: THREE.CanvasTexture | null = null;

function ensureTextures(): void {
  if (!grassTex) {
    const tex = loadGameTextures();
    grassTex = tex.grass;
    rockTex = tex.rock;
    if (!grassBladeTex) grassBladeTex = createGrassDetailTexture(64);
  }
}

export function disposeSharedIslandTextures(): void {
  // Shared PNG maps are disposed via disposeGameTextures; only clear locals
  grassBladeTex?.dispose();
  grassTex = null;
  rockTex = null;
  grassBladeTex = null;
}

export function createIslandMesh(
  def: IslandDef,
  rng: () => number,
  sharedRock: THREE.Material,
): IslandMeshBundle {
  ensureTextures();
  const group = new THREE.Group();
  group.name = `island-${def.id}-${def.kind}`;
  group.position.set(def.position.x, 0, def.position.z);
  const disposables: Array<{ dispose: () => void }> = [];
  const isNarrow = def.kind === 'narrow';

  const capColor =
    def.kind === 'bouncy'
      ? bouncyPalette[Math.floor(rng() * bouncyPalette.length)]
      : def.kind === 'crumble'
        ? crumblePalette[Math.floor(rng() * crumblePalette.length)]
        : def.kind === 'moving'
          ? movingPalette[Math.floor(rng() * movingPalette.length)]
          : grassPalette[Math.floor(rng() * grassPalette.length)];

  let capGeo: THREE.BufferGeometry;
  if (isNarrow) {
    capGeo = new THREE.BoxGeometry(def.radius * 2, 0.22, def.lengthZ);
    capGeo.translate(0, def.topY - 0.11, 0);
  } else if (def.kind === 'bouncy') {
    capGeo = new THREE.SphereGeometry(def.radius, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    capGeo.scale(1, 0.55, 1);
    capGeo.translate(0, def.topY - 0.15, 0);
  } else {
    capGeo = new THREE.CylinderGeometry(def.radius, def.radius * 0.88, 0.32, 12, 1);
    capGeo.translate(0, def.topY - 0.16, 0);
  }

  const useGrassMap = def.kind === 'normal' || def.kind === 'narrow';
  // When using generated albedo, tint lightly so texture detail shows
  const capMat = new THREE.MeshStandardMaterial({
    color: useGrassMap ? new THREE.Color(capColor).lerp(new THREE.Color('#ffffff'), 0.35) : capColor,
    roughness: def.kind === 'moving' ? 0.4 : 0.88,
    metalness: def.kind === 'moving' ? 0.28 : 0.02,
    map: useGrassMap && grassTex ? grassTex : null,
    emissive:
      def.kind === 'bouncy'
        ? '#0d4a3c'
        : def.kind === 'moving'
          ? '#1a3a60'
          : def.kind === 'crumble'
            ? '#3a2810'
            : '#000000',
    emissiveIntensity: def.kind === 'bouncy' || def.kind === 'moving' ? 0.35 : 0,
  });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);
  disposables.push(capGeo, capMat);

  // Darker rim under grass — reads as thick turf edge
  if ((def.kind === 'normal' || def.kind === 'crumble') && !isNarrow) {
    const rimGeo = new THREE.CylinderGeometry(def.radius * 0.92, def.radius * 0.82, 0.18, 12);
    rimGeo.translate(0, def.topY - 0.32, 0);
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#2a5a40',
      roughness: 0.95,
      metalness: 0.02,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.castShadow = true;
    group.add(rim);
    disposables.push(rimGeo, rimMat);
  }

  if (def.kind === 'bouncy') {
    const stemGeo = new THREE.CylinderGeometry(def.radius * 0.26, def.radius * 0.4, def.height, 10);
    stemGeo.translate(0, def.topY - def.height * 0.5 - 0.2, 0);
    const stemMat = new THREE.MeshStandardMaterial({
      color: '#e8d4b0',
      roughness: 0.88,
      metalness: 0.02,
      map: rockTex ?? undefined,
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.castShadow = true;
    group.add(stem);
    disposables.push(stemGeo, stemMat);
  } else if (isNarrow) {
    const bridgeGeo = new THREE.BoxGeometry(def.radius * 1.5, 0.6, def.lengthZ * 0.9);
    bridgeGeo.translate(0, def.topY - 0.42, 0);
    const bridgeMat = sharedRock.clone() as THREE.MeshStandardMaterial;
    bridgeMat.color = new THREE.Color(rockPalette[Math.floor(rng() * rockPalette.length)]);
    bridgeMat.map = rockTex;
    const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    group.add(bridge);
    disposables.push(bridgeGeo, bridgeMat);

    const railGeo = new THREE.BoxGeometry(0.08, 0.18, def.lengthZ * 0.95);
    const railMat = new THREE.MeshStandardMaterial({
      color: '#d8c9b0',
      roughness: 0.5,
      metalness: 0.2,
    });
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(sx * def.radius * 0.92, def.topY + 0.12, 0);
      rail.castShadow = true;
      group.add(rail);
    }
    disposables.push(railGeo, railMat);
  } else {
    const rockHeight = def.height * 1.35;
    const baseY = def.topY - 0.18;
    // Stacked frustums — volumetric mass, not a thin cone
    const layers = [
      { rTop: 0.95, rBot: 0.72, h: rockHeight * 0.38, y: baseY - rockHeight * 0.19 },
      { rTop: 0.72, rBot: 0.42, h: rockHeight * 0.34, y: baseY - rockHeight * 0.5 },
      { rTop: 0.42, rBot: 0.12, h: rockHeight * 0.3, y: baseY - rockHeight * 0.8 },
    ];
    for (let li = 0; li < layers.length; li += 1) {
      const L = layers[li];
      const g = new THREE.CylinderGeometry(
        def.radius * L.rTop,
        def.radius * L.rBot,
        L.h,
        10,
        1,
      );
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const j = (rng() - 0.5) * 0.12;
        pos.setX(i, pos.getX(i) * (1 + j));
        pos.setZ(i, pos.getZ(i) * (1 + j));
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      // Each layer slightly darker / different tint for readable mass
      const shade = 1.05 - li * 0.12;
      const mat = sharedRock.clone() as THREE.MeshStandardMaterial;
      mat.color = new THREE.Color(rockPalette[Math.floor(rng() * rockPalette.length)])
        .multiplyScalar(shade)
        .lerp(new THREE.Color('#ffffff'), 0.2);
      mat.map = rockTex;
      mat.roughness = 0.88;
      mat.flatShading = true;
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.y = L.y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(g, mat);
    }

    // Faceted mid belt for craggy read
    const beltGeo = new THREE.TorusGeometry(def.radius * 0.58, 0.14, 5, 10);
    const beltMat = new THREE.MeshStandardMaterial({
      color: '#6a5040',
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = baseY - rockHeight * 0.38;
    belt.scale.set(1, 1, 0.65);
    group.add(belt);
    disposables.push(beltGeo, beltMat);

    // Decorative pillars — only on extra-large pads, rarely
    if (def.kind === 'normal' && def.radius > 3.4 && rng() > 0.75) {
      const pilGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6);
      const pilMat = new THREE.MeshStandardMaterial({
        color: '#c8b89a',
        roughness: 0.7,
        metalness: 0.15,
      });
      const p = new THREE.Mesh(pilGeo, pilMat);
      p.position.set(def.radius * 0.4, def.topY + 0.45, 0);
      p.castShadow = true;
      group.add(p);
      disposables.push(pilGeo, pilMat);
    }

    // Soft under-island glow disc (depth cue)
    if (def.radius > 1.8) {
      const glowGeo = new THREE.CircleGeometry(def.radius * 0.7, 20);
      const glowMat = new THREE.MeshBasicMaterial({
        color: '#8ad8c0',
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = def.topY - rockHeight * 0.85;
      group.add(glow);
      disposables.push(glowGeo, glowMat);
    }

    // Tiny floating rock shards under isle
    if (def.radius > 2.2 && rng() > 0.3) {
      const shardGeo = new THREE.TetrahedronGeometry(0.12 + rng() * 0.1, 0);
      const shardMat = new THREE.MeshStandardMaterial({
        color: '#8a9aaa',
        roughness: 0.7,
        metalness: 0.15,
        transparent: true,
        opacity: 0.75,
      });
      const count = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i += 1) {
        const s = new THREE.Mesh(shardGeo, shardMat);
        const a = rng() * Math.PI * 2;
        const rr = def.radius * (0.3 + rng() * 0.5);
        s.position.set(
          Math.cos(a) * rr,
          def.topY - rockHeight * (0.3 + rng() * 0.4),
          Math.sin(a) * rr,
        );
        s.rotation.set(rng(), rng(), rng());
        group.add(s);
      }
      disposables.push(shardGeo, shardMat);
    }

    // Hanging roots — sparse, only large isles
    if (def.radius > 2.4) {
      const rootCount = 2 + Math.floor(rng() * 3);
      for (let r = 0; r < rootCount; r += 1) {
        const len = 0.7 + rng() * 1.6;
        const rootGeo = new THREE.CylinderGeometry(0.03, 0.01, len, 4);
        const rootMat = new THREE.MeshStandardMaterial({
          color: '#4a3a28',
          roughness: 0.95,
        });
        const root = new THREE.Mesh(rootGeo, rootMat);
        const a = rng() * Math.PI * 2;
        const rr = def.radius * (0.25 + rng() * 0.4);
        root.position.set(
          Math.cos(a) * rr,
          def.topY - def.height * 1.35 * 0.45 - len * 0.4,
          Math.sin(a) * rr,
        );
        root.rotation.z = (rng() - 0.5) * 0.35;
        group.add(root);
        disposables.push(rootGeo, rootMat);
      }
    }
  }

  // Grass tufts via InstancedMesh — denser near path
  if ((def.kind === 'normal' || def.kind === 'narrow') && grassBladeTex && def.radius > 1.1) {
    const tuftGeo = new THREE.PlaneGeometry(0.4, 0.55);
    tuftGeo.translate(0, 0.26, 0);
    const tuftMat = new THREE.MeshStandardMaterial({
      map: grassBladeTex,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.95,
      color: '#8ad8a0',
    });
    const count = isNarrow ? 12 : Math.min(22, Math.floor(def.radius * 6));
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.4;
      const rr = def.radius * (isNarrow ? 0.65 : 0.45 + rng() * 0.4);
      dummy.position.set(
        isNarrow ? (rng() - 0.5) * def.radius * 1.5 : Math.cos(a) * rr,
        def.topY,
        isNarrow ? (rng() - 0.5) * def.lengthZ * 0.85 : Math.sin(a) * rr,
      );
      dummy.rotation.y = rng() * Math.PI;
      dummy.scale.setScalar(0.65 + rng() * 0.7);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    }
    tufts.instanceMatrix.needsUpdate = true;
    tufts.castShadow = false;
    group.add(tufts);
    disposables.push(tuftGeo, tuftMat);
  }

  // Pebbles — fewer, only on large pads
  if (def.kind === 'normal' && def.radius > 2.6) {
    const pebbleGeo = new THREE.IcosahedronGeometry(0.14, 0);
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: '#b8a890',
      roughness: 0.75,
      metalness: 0.08,
      map: rockTex ?? undefined,
    });
    const count = 2 + Math.floor(rng() * 3);
    const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.4;
      const r = def.radius * (0.55 + rng() * 0.25);
      dummy.position.set(Math.cos(a) * r, def.topY + 0.07, Math.sin(a) * r);
      dummy.scale.setScalar(0.8 + rng() * 0.5);
      dummy.rotation.set(rng(), rng(), rng());
      dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
    }
    pebbles.instanceMatrix.needsUpdate = true;
    pebbles.castShadow = true;
    group.add(pebbles);
    disposables.push(pebbleGeo, pebbleMat);
  }

  let glowRing: THREE.Mesh | undefined;
  if (def.kind === 'moving') {
    const ringGeo = new THREE.TorusGeometry(def.radius * 0.95, 0.045, 6, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#9ad8ff',
      transparent: true,
      opacity: 0.75,
    });
    glowRing = new THREE.Mesh(ringGeo, ringMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = def.topY + 0.05;
    group.add(glowRing);
    disposables.push(ringGeo, ringMat);
  }

  if (def.kind === 'crumble') {
    const crackGeo = new THREE.BoxGeometry(def.radius * 1.4, 0.02, 0.04);
    const crackMat = new THREE.MeshBasicMaterial({ color: '#5a4020' });
    for (let i = 0; i < 3; i += 1) {
      const crack = new THREE.Mesh(crackGeo, crackMat);
      crack.position.y = def.topY + 0.02;
      crack.rotation.y = (i / 3) * Math.PI + rng() * 0.3;
      group.add(crack);
    }
    disposables.push(crackGeo, crackMat);
  }

  if (def.kind === 'bouncy') {
    const spotGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const spotMat = new THREE.MeshStandardMaterial({
      color: '#fff4d8',
      roughness: 0.6,
      emissive: '#4a3a10',
      emissiveIntensity: 0.25,
    });
    for (let i = 0; i < 4; i += 1) {
      const spot = new THREE.Mesh(spotGeo, spotMat);
      const a = (i / 4) * Math.PI * 2;
      spot.position.set(
        Math.cos(a) * def.radius * 0.45,
        def.topY + 0.12,
        Math.sin(a) * def.radius * 0.45,
      );
      group.add(spot);
    }
    disposables.push(spotGeo, spotMat);
  }

  return {
    group,
    kind: def.kind,
    bounceCap: def.kind === 'bouncy' ? cap : undefined,
    crumbleCap: def.kind === 'crumble' ? cap : undefined,
    glowRing,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function createGoalGate(locked = false): IslandMeshBundle {
  const group = new THREE.Group();
  group.name = 'goal-gate';
  const disposables: Array<{ dispose: () => void }> = [];

  const pillarGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.2, 8);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#d8c9b0',
    roughness: 0.55,
    metalness: 0.18,
  });
  const left = new THREE.Mesh(pillarGeo, pillarMat);
  left.position.set(-1.35, 1.6, 0);
  left.castShadow = true;
  const right = left.clone();
  right.position.x = 1.35;
  group.add(left, right);
  disposables.push(pillarGeo, pillarMat);

  const archGeo = new THREE.TorusGeometry(1.35, 0.12, 8, 24, Math.PI);
  const archMat = new THREE.MeshStandardMaterial({
    color: locked ? '#c04050' : '#f0b35a',
    emissive: locked ? '#401018' : '#8a5a18',
    emissiveIntensity: locked ? 0.4 : 1.1,
    roughness: 0.35,
    metalness: 0.4,
  });
  const arch = new THREE.Mesh(archGeo, archMat);
  arch.position.y = 2.2;
  arch.castShadow = true;
  arch.name = 'goal-arch';
  group.add(arch);
  disposables.push(archGeo, archMat);

  const portalGeo = new THREE.CircleGeometry(1.15, 32);
  const portalMat = new THREE.MeshBasicMaterial({
    color: locked ? '#ff6a8a' : '#8af4ff',
    transparent: true,
    opacity: locked ? 0.06 : 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const portal = new THREE.Mesh(portalGeo, portalMat);
  portal.position.y = 1.55;
  portal.name = 'goal-portal';
  group.add(portal);
  disposables.push(portalGeo, portalMat);

  const haloGeo = new THREE.TorusGeometry(1.55, 0.05, 6, 32, Math.PI);
  const haloMat = new THREE.MeshBasicMaterial({
    color: locked ? '#ff6a8a' : '#b0f8ff',
    transparent: true,
    opacity: 0.55,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.y = 2.2;
  halo.name = 'goal-halo';
  group.add(halo);
  disposables.push(haloGeo, haloMat);

  const beamGeo = new THREE.CylinderGeometry(0.15, 0.9, 8, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: locked ? '#ff4060' : '#6ef0ff',
    transparent: true,
    opacity: locked ? 0.03 : 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 4;
  beam.name = 'goal-beam';
  group.add(beam);
  disposables.push(beamGeo, beamMat);

  if (locked) {
    const barGeo = new THREE.BoxGeometry(2.5, 0.12, 0.12);
    const barMat = new THREE.MeshStandardMaterial({
      color: '#ff4060',
      emissive: '#801020',
      emissiveIntensity: 1.3,
      roughness: 0.3,
      metalness: 0.5,
    });
    for (let i = 0; i < 3; i += 1) {
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.set(0, 0.65 + i * 0.72, 0.05);
      bar.name = `boss-bar-${i}`;
      bar.castShadow = true;
      group.add(bar);
    }
    disposables.push(barGeo, barMat);

    const lockGeo = new THREE.OctahedronGeometry(0.3, 0);
    const lockMat = new THREE.MeshStandardMaterial({
      color: '#ff6a9a',
      emissive: '#801040',
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.45,
    });
    const lock = new THREE.Mesh(lockGeo, lockMat);
    lock.position.set(0, 1.55, 0.25);
    lock.name = 'boss-lock';
    group.add(lock);
    disposables.push(lockGeo, lockMat);
  }

  return {
    group,
    kind: 'normal',
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
