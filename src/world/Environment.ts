import * as THREE from 'three';
import { createSkyEnvMap, loadGameTextures } from '../assets/Textures';
import { createSeededRandom } from '../utils/random';

export function createEnvironment(renderer: THREE.WebGLRenderer, seed = 7): {
  group: THREE.Group;
  update: (delta: number, elapsed: number, focus?: THREE.Vector3) => void;
  dispose: () => void;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  charLight: THREE.PointLight;
  charFill: THREE.PointLight;
  sky: THREE.Mesh;
  envMap: THREE.Texture;
} {
  const group = new THREE.Group();
  group.name = 'environment';
  const disposables: Array<{ dispose: () => void }> = [];
  const rng = createSeededRandom(seed);

  const envMap = createSkyEnvMap(renderer);

  // Generated sky panorama as background + soft blend with gradient dome
  const gameTex = loadGameTextures();
  const skyDomeGeo = new THREE.SphereGeometry(230, 48, 32);
  const skyDomeMat = new THREE.MeshBasicMaterial({
    map: gameTex.sky,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    transparent: true,
    opacity: 0.92,
  });
  const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -2;
  group.add(skyDome);
  disposables.push(skyDomeGeo, skyDomeMat);

  // Cooler top, restrained peach horizon
  const skyGeo = new THREE.SphereGeometry(240, 40, 28);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#0a1430') },
      midColor: { value: new THREE.Color('#3a5890') },
      horizonColor: { value: new THREE.Color('#8a5878') },
      bottomColor: { value: new THREE.Color('#b88868') },
      domeAlpha: { value: 0.45 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform float domeAlpha;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(bottomColor, horizonColor, smoothstep(-0.35, 0.0, h));
        col = mix(col, midColor, smoothstep(0.0, 0.32, h));
        col = mix(col, topColor, smoothstep(0.32, 0.8, h));
        float sun = exp(-pow((h - 0.0) * 7.0, 2.0) - pow((vDir.x + 0.4) * 3.0, 2.0));
        col += vec3(1.0, 0.75, 0.45) * sun * 0.22;
        float stars = step(0.9978, fract(sin(dot(floor(vDir * 220.0), vec3(12.98, 78.23, 45.16))) * 43758.5));
        col += vec3(0.85, 0.92, 1.0) * stars * smoothstep(0.4, 0.95, h) * 0.65;
        gl_FragColor = vec4(col, domeAlpha);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  skyMat.transparent = true;
  skyMat.depthWrite = false;
  group.add(sky);
  disposables.push(skyGeo, skyMat);

  const hemi = new THREE.HemisphereLight('#b0c4f0', '#2a2838', 0.85);
  group.add(hemi);

  // Stronger key from upper-left for form + long shadows
  const sun = new THREE.DirectionalLight('#ffd8a0', 3.1);
  sun.position.set(-22, 32, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2;
  group.add(sun);
  group.add(sun.target);

  // Cool rim from behind-right — silhouettes characters/edges
  const rim = new THREE.DirectionalLight('#88c8ff', 1.6);
  rim.position.set(10, 10, 22);
  group.add(rim);
  group.add(rim.target);

  // Soft cool fill
  const fill = new THREE.DirectionalLight('#7090c8', 0.55);
  fill.position.set(18, 6, -10);
  group.add(fill);

  // Character key light — follows player in update()
  const charLight = new THREE.PointLight('#ffe0b0', 3.2, 10, 1.8);
  charLight.position.set(0.8, 1.5, -1.2);
  group.add(charLight);
  // Secondary cool bounce on character
  const charFill = new THREE.PointLight('#90c8ff', 1.1, 7, 2);
  charFill.position.set(-0.6, 1.2, 1.0);
  group.add(charFill);

  // Clouds
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: '#e4dce8',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const cloudMat2 = new THREE.MeshStandardMaterial({
    color: '#b8a8c0',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 10; i += 1) {
    const g = new THREE.Group();
    const mat = i % 3 === 0 ? cloudMat2 : cloudMat;
    const blobs = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < blobs; b += 1) {
      const m = new THREE.Mesh(cloudGeo, mat);
      m.position.set((rng() - 0.5) * 4, (rng() - 0.5) * 0.7, (rng() - 0.5) * 3);
      m.scale.set(2.4 + rng() * 3, 0.85 + rng() * 0.7, 1.8 + rng() * 2);
      g.add(m);
    }
    g.position.set((rng() - 0.5) * 110, -10 + rng() * 24, rng() * 240 - 30);
    group.add(g);
    clouds.push(g);
  }
  disposables.push(cloudGeo, cloudMat, cloudMat2);

  // Distant silhouettes — flat layered isle plates
  const farMat = new THREE.MeshStandardMaterial({
    color: '#3a4860',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
  });
  const midMat = new THREE.MeshStandardMaterial({
    color: '#5a6880',
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.4,
  });
  const farGeo = new THREE.CylinderGeometry(3.5, 2.8, 1.2, 7);
  const midGeo = new THREE.CylinderGeometry(2.2, 1.6, 0.9, 7);
  // Under-hang rock cones for distant isles
  const hangGeo = new THREE.ConeGeometry(2.0, 3.5, 6);
  const farIsles: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i += 1) {
    const m = new THREE.Mesh(farGeo, farMat);
    const side = i % 2 === 0 ? 1 : -1;
    m.position.set(side * (28 + rng() * 24), -10 + rng() * 18, rng() * 260);
    m.scale.set(1.2 + rng() * 1.2, 0.5 + rng() * 0.4, 1.2 + rng() * 1);
    group.add(m);
    farIsles.push(m);
  }
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(midGeo, midMat);
    const side = i % 2 === 0 ? 1 : -1;
    m.position.set(side * (18 + rng() * 10), -8 + rng() * 10, rng() * 240);
    m.scale.set(0.9 + rng() * 0.8, 0.6 + rng() * 0.3, 0.9 + rng() * 0.7);
    group.add(m);
    farIsles.push(m);
  }
  disposables.push(farGeo, midGeo, hangGeo, farMat, midMat);

  // Dust
  const dustCount = 400;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (rng() - 0.5) * 50;
    dustPositions[i * 3 + 1] = rng() * 14 - 3;
    dustPositions[i * 3 + 2] = rng() * 160;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: '#ffe0c0',
    size: 0.065,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  group.add(dust);
  disposables.push(dustGeo, dustMat);

  return {
    group,
    sun,
    rim,
    charLight,
    charFill,
    sky,
    envMap,
    update(delta: number, elapsed: number, focus?: THREE.Vector3) {
      if (focus) {
        sky.position.copy(focus);
        skyDome.position.copy(focus);
        dust.position.set(focus.x, focus.y - 4, focus.z - 10);
        charLight.position.set(focus.x + 0.9, focus.y + 1.4, focus.z - 1.1);
        charFill.position.set(focus.x - 0.7, focus.y + 1.1, focus.z + 0.8);
        for (const m of farIsles) {
          if (m.position.z < focus.z - 50) m.position.z += 260;
          if (m.position.z > focus.z + 220) m.position.z -= 260;
        }
      }
      for (let i = 0; i < clouds.length; i += 1) {
        const c = clouds[i];
        c.position.x += delta * (0.18 + (i % 5) * 0.04);
        if (focus && c.position.z < focus.z - 45) c.position.z += 240;
        if (focus && c.position.z > focus.z + 200) c.position.z -= 240;
        if (c.position.x > 60) c.position.x = -60;
      }
      dust.rotation.y = elapsed * 0.012;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      hemi.dispose();
      sun.dispose();
      rim.dispose();
      fill.dispose();
      charLight.dispose();
      charFill.dispose();
      envMap.dispose();
      // Shared game textures disposed once by Game.dispose
    },
  };
}
