import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Contrast + saturation + vignette + cool/warm split-tone. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.42 },
    contrast: { value: 1.08 },
    saturation: { value: 1.08 },
    lift: { value: 0.01 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float contrast;
    uniform float saturation;
    uniform float lift;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Contrast around mid grey
      color.rgb = (color.rgb - 0.5) * contrast + 0.5 + lift;
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luma), color.rgb, saturation);
      // Split tone: shadows cool, highlights warm
      color.rgb += vec3(-0.03, -0.015, 0.05) * (1.0 - luma);
      color.rgb += vec3(0.04, 0.025, -0.02) * luma * luma;
      // Vignette
      vec2 p = vUv - 0.5;
      float vig = 1.0 - dot(p, p) * vignette * 2.2;
      color.rgb *= clamp(vig, 0.0, 1.0);
      gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), 1.0);
    }
  `,
};

export type PostPipeline = {
  composer: EffectComposer;
  setSize: (w: number, h: number, dpr: number) => void;
  setBloom: (strength: number) => void;
  render: () => void;
  dispose: () => void;
};

export function createPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostPipeline {
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.55, // strength
    0.55, // radius
    0.78, // threshold
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const output = new OutputPass();
  composer.addPass(output);

  return {
    composer,
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
    setBloom(strength) {
      bloom.strength = strength;
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
      bloom.dispose();
      grade.dispose();
      output.dispose();
    },
  };
}
