import * as THREE from 'three';
import {
  createGoalGate,
  createIslandMesh,
  type IslandDef,
  type IslandKind,
  type IslandMeshBundle,
} from './Island';

export type { IslandDef, IslandKind };

export type PowerSpawn = {
  id: number;
  kind: 'magnet' | 'shield' | 'boost';
  position: THREE.Vector3;
};

export type HazardSpawn = {
  id: number;
  kind: 'spinner' | 'mine' | 'laser' | 'wind' | 'drone';
  position: THREE.Vector3;
  radius: number;
  armLength: number;
  phase: number;
  speed: number;
  extra?: number;
};

export type BoostPad = {
  id: number;
  islandId: number;
  position: THREE.Vector3;
  radius: number;
};

export type CourseConfig = {
  seed: number;
  baseDifficulty: number;
  segments: number;
  narrowBias: number;
  crumbleBias: number;
  movingBias: number;
  bouncyBias: number;
  spinnerRate: number;
  mineRate: number;
  laserRate: number;
  windRate: number;
  droneRate: number;
  endless: boolean;
  exclusive: 'none' | 'bouncy-garden' | 'crumble-flood' | 'wind-corridor' | 'minefield' | 'boss-gate';
  bossKeys: number;
};

export type CourseData = {
  islands: IslandDef[];
  meshes: Map<number, IslandMeshBundle>;
  totalCrystals: number;
  keyCrystalIds: number[];
  bossKeysRequired: number;
  finishZ: number;
  goalGate: THREE.Group;
  powerSpawns: PowerSpawn[];
  hazardSpawns: HazardSpawn[];
  boostPads: BoostPad[];
  group: THREE.Group;
  dispose: () => void;
};

/**
 * Procedural course along +Z driven by CourseConfig (stage / endless / trial).
 */
export function buildCourse(config: CourseConfig): CourseData {
  const rng = mulberry32(config.seed);
  const group = new THREE.Group();
  group.name = 'course';
  const disposables: IslandMeshBundle[] = [];
  const meshes = new Map<number, IslandMeshBundle>();

  const sharedRock = new THREE.MeshStandardMaterial({
    color: '#8a7260',
    roughness: 0.85,
    metalness: 0.06,
    flatShading: true,
  });

  const islands: IslandDef[] = [];
  const powerSpawns: PowerSpawn[] = [];
  const hazardSpawns: HazardSpawn[] = [];
  const boostPads: BoostPad[] = [];
  const keyCrystalIds: number[] = [];
  let z = 0;
  let x = 0;
  let topY = 0;
  let id = 0;
  let powerId = 0;
  let hazardId = 0;
  let padId = 0;
  let keysPlaced = 0;

  // Opening pad
  islands.push(
    makeIsland({
      id: id++,
      kind: 'normal',
      x: 0,
      z: 0,
      radius: 4.2,
      lengthZ: 4,
      height: 1.6,
      topY: 0,
      hasCrystal: false,
      rng,
    }),
  );
  z = 6.8;

  const segments = config.segments;
  for (let i = 0; i < segments; i += 1) {
    const progress = i / Math.max(1, segments - 1);
    // Blend stage base difficulty with in-run ramp
    const ramp = progress * progress * 0.55 + progress * 0.45;
    const diff = THREE.MathUtils.clamp(config.baseDifficulty * 0.55 + ramp * 0.7, 0, 1);

    const radius = THREE.MathUtils.lerp(3.3, 1.55, diff) + rng() * 0.4;
    const gap = THREE.MathUtils.lerp(2.4, 4.8, diff) + rng() * 0.7;
    // Wider lateral swings for less linear route (softer early)
    const lateralAmp = progress < 0.2 ? 1.2 : THREE.MathUtils.lerp(1.8, 7.5, diff);
    const lateral = (rng() - 0.5) * lateralAmp;
    x = THREE.MathUtils.clamp(x + lateral, -9.5, 9.5);
    topY = THREE.MathUtils.clamp(
      topY + (rng() - 0.48) * THREE.MathUtils.lerp(0.6, 1.8, diff),
      -2.0,
      3.4,
    );

    let kind: IslandKind = 'normal';
    const roll = rng();
    if (roll < config.narrowBias * (0.5 + diff)) kind = 'narrow';
    else if (roll < (config.narrowBias + config.crumbleBias) * (0.5 + diff)) kind = 'crumble';
    else if (roll < (config.narrowBias + config.crumbleBias + config.movingBias) * (0.5 + diff))
      kind = 'moving';
    else if (roll > 1 - config.bouncyBias) kind = 'bouncy';
    if (progress < 0.12) kind = 'normal';
    if (kind === 'crumble' && islands[islands.length - 1]?.kind === 'crumble') kind = 'normal';

    const hasCrystal = rng() > (kind === 'bouncy' ? 0.5 : 0.14);

    const def = makeIsland({
      id: id++,
      kind,
      x,
      z,
      radius,
      lengthZ: kind === 'narrow' ? 3.2 + rng() * 2.2 : radius * 2,
      height: 1.6 + rng() * 2.6,
      topY,
      hasCrystal,
      rng,
    });
    islands.push(def);

    // Boost pads on wide recovery islands
    if (kind === 'normal' && def.radius > 3.2 && rng() > 0.45) {
      boostPads.push({
        id: padId++,
        islandId: def.id,
        position: new THREE.Vector3(def.position.x, def.topY + 0.05, def.position.z),
        radius: Math.min(1.4, def.radius * 0.4),
      });
    }

    // Power-ups
    if (progress > 0.1 && rng() > 0.76) {
      const kinds: Array<'magnet' | 'shield' | 'boost'> = ['magnet', 'shield', 'boost'];
      const pk = kinds[Math.floor(rng() * kinds.length)];
      powerSpawns.push({
        id: powerId++,
        kind: pk,
        position: new THREE.Vector3(
          def.position.x + (rng() - 0.5) * def.radius * 0.4,
          def.topY + 1.2,
          def.position.z + (rng() - 0.5) * def.radius * 0.4,
        ),
      });
    }

    // Hazards — weighted by config
    if (progress > 0.18 && (kind === 'normal' || kind === 'narrow')) {
      const rates = [
        { kind: 'spinner' as const, r: config.spinnerRate },
        { kind: 'mine' as const, r: config.mineRate },
        { kind: 'laser' as const, r: config.laserRate },
        { kind: 'wind' as const, r: config.windRate },
        { kind: 'drone' as const, r: config.droneRate },
      ];
      const pick = rng();
      let acc = 0;
      let chosen: (typeof rates)[0]['kind'] | null = null;
      for (const item of rates) {
        acc += item.r * (0.4 + diff);
        if (pick < acc) {
          chosen = item.kind;
          break;
        }
      }
      if (chosen && def.radius > 1.6) {
        const base = {
          id: hazardId++,
          position: new THREE.Vector3(def.position.x, def.topY, def.position.z),
          phase: rng() * Math.PI * 2,
        };
        if (chosen === 'spinner') {
          hazardSpawns.push({
            ...base,
            kind: 'spinner',
            radius: 0.5,
            armLength: Math.min(def.radius * 0.8, 2.4),
            speed: 1.6 + rng() * 1.5 + diff * 1.0,
          });
        } else if (chosen === 'mine') {
          hazardSpawns.push({
            ...base,
            kind: 'mine',
            position: new THREE.Vector3(
              def.position.x + (rng() - 0.5) * def.radius * 0.5,
              def.topY,
              def.position.z + (rng() - 0.5) * def.radius * 0.5,
            ),
            radius: 0.7 + rng() * 0.35,
            armLength: 0,
            speed: 0,
          });
        } else if (chosen === 'laser') {
          hazardSpawns.push({
            ...base,
            kind: 'laser',
            radius: 0.4,
            armLength: Math.max(1.5, def.radius * 0.85),
            speed: 1.1 + rng() * 0.6 + diff * 0.4,
          });
        } else if (chosen === 'wind') {
          hazardSpawns.push({
            ...base,
            kind: 'wind',
            position: new THREE.Vector3(
              def.position.x + (rng() - 0.5) * def.radius * 0.3,
              def.topY,
              def.position.z + (rng() - 0.5) * def.radius * 0.3,
            ),
            radius: Math.min(def.radius * 0.7, 1.8),
            armLength: 0,
            speed: 1.5 + rng(),
            extra: 2.2 + diff * 2.5,
          });
        } else {
          hazardSpawns.push({
            ...base,
            kind: 'drone',
            radius: 1.2 + rng() * 0.8,
            armLength: 0,
            speed: 1.2 + rng() * 1.2,
            extra: 5 + diff * 4,
          });
        }
      }
    }

    // Stage exclusive: bouncy garden — fewer, smaller
    if (config.exclusive === 'bouncy-garden' && progress > 0.4 && progress < 0.65 && rng() > 0.78) {
      islands.push(
        makeIsland({
          id: id++,
          kind: 'bouncy',
          x: THREE.MathUtils.clamp(x + (rng() > 0.5 ? -1 : 1) * (2.2 + rng() * 1.2), -9, 9),
          z: z + (rng() - 0.5) * 1.2,
          radius: 1.1 + rng() * 0.3,
          lengthZ: 2,
          height: 1.6,
          topY: topY + (rng() - 0.3) * 0.6,
          hasCrystal: true,
          rng,
        }),
      );
    }

    // Key crystals for boss gate — place at fixed progress points for reliability
    if (config.bossKeys > 0 && keysPlaced < config.bossKeys && progress > 0.2 && progress < 0.92) {
      // Place one key roughly every (1 / bossKeys) of the mid-late path
      const targetFrac = (keysPlaced + 1) / (config.bossKeys + 1);
      if (Math.abs(progress - targetFrac) < 0.06 && kind === 'normal' && def.radius > 2.0) {
        keyCrystalIds.push(def.id);
        keysPlaced += 1;
      } else if (rng() > 0.88 && kind === 'normal' && def.radius > 2.4 && progress > 0.3) {
        keyCrystalIds.push(def.id);
        keysPlaced += 1;
      }
    }

    // Stage exclusive: mandatory wind corridor strip
    if (config.exclusive === 'wind-corridor' && progress > 0.3 && progress < 0.85 && rng() > 0.7) {
      hazardSpawns.push({
        id: hazardId++,
        kind: 'wind',
        position: new THREE.Vector3(def.position.x, def.topY, def.position.z),
        radius: Math.max(def.radius * 0.85, 1.6),
        armLength: 0,
        phase: rng() > 0.5 ? 0.2 : Math.PI + 0.2,
        speed: 1.5,
        extra: 3.5 + diff * 2,
      });
    }

    // Stage exclusive: minefield denser
    if (config.exclusive === 'minefield' && progress > 0.3 && rng() > 0.55 && kind === 'normal') {
      hazardSpawns.push({
        id: hazardId++,
        kind: 'mine',
        position: new THREE.Vector3(
          def.position.x + (rng() - 0.5) * def.radius * 0.4,
          def.topY,
          def.position.z + (rng() - 0.5) * def.radius * 0.4,
        ),
        radius: 0.75 + rng() * 0.3,
        armLength: 0,
        phase: rng() * Math.PI * 2,
        speed: 0,
      });
    }

    // Stage exclusive: crumble flood
    if (
      config.exclusive === 'crumble-flood' &&
      progress > 0.2 &&
      progress < 0.85 &&
      kind === 'normal' &&
      rng() > 0.5
    ) {
      // Convert visual kind stays normal but we mark crumbleTimer path by changing def
      // Easier: spawn as crumble by mutating last pushed island
      const last = islands[islands.length - 1];
      if (last && last.kind === 'normal' && last.radius < 3) {
        last.kind = 'crumble';
      }
    }

    z += (kind === 'narrow' ? def.lengthZ * 0.4 : radius * 0.85) + gap;

    // Dual-path fork: softer early, denser later
    if (progress > 0.22 && rng() > 0.78) {
      const branchZ = z + gap * 0.3;
      const spread = 2.8 + rng() * 2.2;
      const yOff = (rng() - 0.5) * 1.2;
      for (const side of [-1, 1] as const) {
        const bx = THREE.MathUtils.clamp(x + side * spread, -10, 10);
        islands.push(
          makeIsland({
            id: id++,
            kind: rng() > 0.65 ? 'narrow' : 'normal',
            x: bx,
            z: branchZ,
            radius: 1.6 + rng() * 0.8,
            lengthZ: 2.8 + rng() * 1.6,
            height: 1.5 + rng() * 1.5,
            topY: topY + yOff + (rng() - 0.5) * 0.5,
            hasCrystal: true,
            rng,
          }),
        );
        // Mini crystal pad further out
        if (rng() > 0.5) {
          islands.push(
            makeIsland({
              id: id++,
              kind: 'normal',
              x: THREE.MathUtils.clamp(bx + side * (2 + rng()), -11, 11),
              z: branchZ + 1.5 + rng(),
              radius: 1.2 + rng() * 0.4,
              lengthZ: 2,
              height: 1.2,
              topY: topY + yOff + (rng() - 0.5) * 0.8,
              hasCrystal: true,
              rng,
            }),
          );
        }
      }
    }

    // Ambient mid-air rock clusters — rare, far out
    if (progress > 0.2 && rng() > 0.8) {
      const side = rng() > 0.5 ? 1 : -1;
      islands.push(
        makeIsland({
          id: id++,
          kind: 'normal',
          x: THREE.MathUtils.clamp(x + side * (8 + rng() * 4), -14, 14),
          z: z + (rng() - 0.5) * gap,
          radius: 1.2 + rng() * 1.0,
          lengthZ: 2,
          height: 2.5 + rng() * 2.5,
          topY: topY - 3 - rng() * 2,
          hasCrystal: false,
          rng,
        }),
      );
    }

    // Side branch crystal pad (legacy softer spawn)
    if (rng() > 0.85 - diff * 0.1) {
      const side = rng() > 0.5 ? 1 : -1;
      const sx = THREE.MathUtils.clamp(x + side * (radius + 2.2 + rng() * 1.4), -8.5, 8.5);
      const sy = topY + (rng() - 0.35) * 0.9;
      islands.push(
        makeIsland({
          id: id++,
          kind: rng() > 0.7 ? 'bouncy' : 'normal',
          x: sx,
          z: z - gap * 0.4,
          radius: 1.4 + rng() * 0.5,
          lengthZ: 2.5,
          height: 1.4,
          topY: sy,
          hasCrystal: true,
          rng,
        }),
      );
    }

    // Rare recovery wide pad after hard stretch
    if (i > 4 && i % 7 === 0 && diff > 0.3) {
      islands.push(
        makeIsland({
          id: id++,
          kind: 'normal',
          x: THREE.MathUtils.clamp(x, -5, 5),
          z: z - gap * 0.15,
          radius: 3.6,
          lengthZ: 4,
          height: 2,
          topY: topY,
          hasCrystal: true,
          rng,
        }),
      );
    }
  }

  // Guarantee key count for boss stages
  if (config.bossKeys > 0) {
    const keySet = new Set(keyCrystalIds);
    for (const def of islands) {
      if (keysPlaced >= config.bossKeys) break;
      if (keySet.has(def.id)) continue;
      if (def.kind !== 'normal' || def.radius < 1.8) continue;
      if (def.position.z < 20) continue;
      keySet.add(def.id);
      keyCrystalIds.push(def.id);
      keysPlaced += 1;
      def.hasCrystal = true;
    }
  }

  // Finish platform
  const finishTop = topY + 0.25;
  islands.push(
    makeIsland({
      id: id++,
      kind: 'normal',
      x,
      z: z + 1.8,
      radius: 5.0,
      lengthZ: 5,
      height: 2.2,
      topY: finishTop,
      hasCrystal: false,
      rng,
    }),
  );
  const finishZ = islands[islands.length - 1].position.z;

  for (const def of islands) {
    const mesh = createIslandMesh(def, rng, sharedRock);
    disposables.push(mesh);
    meshes.set(def.id, mesh);
    group.add(mesh.group);
  }

  const finishDef = islands[islands.length - 1];
  const gate = createGoalGate(config.bossKeys > 0);
  gate.group.position.set(finishDef.position.x, finishDef.topY, finishDef.position.z + 0.6);
  group.add(gate.group);
  disposables.push(gate);

  // Distant decorative isles — few, far
  const decorMat = new THREE.MeshStandardMaterial({
    color: '#5a6878',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
  });
  const decorGeo = new THREE.CylinderGeometry(2.4, 1.8, 1.0, 7);
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(decorGeo, decorMat);
    const side = i % 2 === 0 ? 1 : -1;
    m.position.set(side * (22 + rng() * 14), -8 + rng() * 8, rng() * finishZ);
    m.scale.setScalar(0.9 + rng() * 1);
    group.add(m);
  }

  return {
    islands,
    meshes,
    totalCrystals: islands.filter((i) => i.hasCrystal).length,
    keyCrystalIds,
    bossKeysRequired: config.bossKeys,
    finishZ,
    goalGate: gate.group,
    powerSpawns,
    hazardSpawns,
    boostPads,
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
      sharedRock.dispose();
      decorGeo.dispose();
      decorMat.dispose();
    },
  };
}

function makeIsland(args: {
  id: number;
  kind: IslandKind;
  x: number;
  z: number;
  radius: number;
  lengthZ: number;
  height: number;
  topY: number;
  hasCrystal: boolean;
  rng: () => number;
}): IslandDef {
  const { id, kind, x, z, radius, lengthZ, height, topY, hasCrystal, rng } = args;
  return {
    id,
    kind,
    position: new THREE.Vector3(x, 0, z),
    radius,
    lengthZ,
    height,
    topY,
    hasCrystal,
    crystalOffset: new THREE.Vector3((rng() - 0.5) * 0.5, 1.15, (rng() - 0.5) * 0.5),
    moveAmpX: kind === 'moving' ? 1.2 + rng() * 1.4 : 0,
    moveSpeed: kind === 'moving' ? 0.6 + rng() * 0.7 : 0,
    movePhase: rng() * Math.PI * 2,
    crumbleTimer: 0,
    crumbled: false,
    visualOffsetX: 0,
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Effective XZ center including moving-island offset. */
export function islandCenterX(island: IslandDef, elapsed: number): number {
  if (island.kind !== 'moving' || island.moveAmpX === 0) return island.position.x;
  return island.position.x + Math.sin(elapsed * island.moveSpeed + island.movePhase) * island.moveAmpX;
}

/** Find island under an XZ point; skips crumbled; supports narrow bridges. */
export function findIslandAt(
  islands: IslandDef[],
  x: number,
  z: number,
  elapsed: number,
): IslandDef | null {
  let best: IslandDef | null = null;
  for (const island of islands) {
    if (island.crumbled) continue;
    const cx = islandCenterX(island, elapsed);
    const dx = x - cx;
    const dz = z - island.position.z;

    let hit = false;
    if (island.kind === 'narrow') {
      const halfW = island.radius;
      const halfL = island.lengthZ * 0.5;
      hit = Math.abs(dx) <= halfW && Math.abs(dz) <= halfL;
    } else {
      const r = island.radius * 0.92;
      hit = dx * dx + dz * dz <= r * r;
    }

    if (hit) {
      if (!best || island.topY > best.topY) best = island;
    }
  }
  return best;
}
