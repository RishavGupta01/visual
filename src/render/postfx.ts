import * as THREE from 'three';

const POST_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;

void main() {
  vec3 sum = vec3(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec3 c = texture(uScene, vUv + vec2(float(x), float(y)) * uTexel).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      sum += c * smoothstep(uThreshold, uThreshold + 0.35, l);
    }
  }
  fragColor = vec4(sum / 9.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uDirection;

void main() {
  const float w0 = 0.2270270270;
  const float w1 = 0.1945945946;
  const float w2 = 0.1216216216;
  const float w3 = 0.0540540541;
  const float w4 = 0.0162162162;
  vec3 sum = texture(uSource, vUv).rgb * w0;
  sum += texture(uSource, vUv + uDirection).rgb * w1;
  sum += texture(uSource, vUv - uDirection).rgb * w1;
  sum += texture(uSource, vUv + uDirection * 2.0).rgb * w2;
  sum += texture(uSource, vUv - uDirection * 2.0).rgb * w2;
  sum += texture(uSource, vUv + uDirection * 3.0).rgb * w3;
  sum += texture(uSource, vUv - uDirection * 3.0).rgb * w3;
  sum += texture(uSource, vUv + uDirection * 4.0).rgb * w4;
  sum += texture(uSource, vUv - uDirection * 4.0).rgb * w4;
  fragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform vec2  uResolution;
uniform float uTime;
uniform float uGrain;
uniform float uAberration;

vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 srgbEncode(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float r2 = dot(centred, centred);

  // Chromatic aberration at the frame edge only, never more than about 1.2 px.
  vec2 px = (uAberration * r2 * 1.2) / uResolution;
  vec3 scene;
  scene.r = texture(uScene, uv + px).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - px).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 streak = texture(uStreak, uv).rgb;

  vec3 colour = acesTonemap(scene + bloom * 0.85 + streak * 0.22);
  colour = srgbEncode(colour);

  colour *= 1.0 - smoothstep(0.25, 0.95, r2) * 0.55;

  float g = hash12(gl_FragCoord.xy + vec2(uTime * 61.0, uTime * 37.0)) - 0.5;
  colour += g * uGrain;

  fragColor = vec4(colour, 1.0);
}
`;

interface Target {
  renderTarget: THREE.WebGLRenderTarget;
  texture: THREE.Texture;
}

function makeTarget(width: number, height: number): Target {
  const renderTarget = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  return { renderTarget, texture: renderTarget.texture };
}

export class PostFx {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly bright: THREE.RawShaderMaterial;
  private readonly blur: THREE.RawShaderMaterial;
  private readonly composite: THREE.RawShaderMaterial;
  private readonly a: Target;
  private readonly b: Target;
  private readonly streak: Target;
  private width = 1;
  private height = 1;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.bright = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: {
        uScene: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 0.42 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.blur = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        uSource: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.composite = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        uScene: { value: null },
        uBloom: { value: null },
        uStreak: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uGrain: { value: 0.03 },
        uAberration: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.a = makeTarget(1, 1);
    this.b = makeTarget(1, 1);
    this.streak = makeTarget(1, 1);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const w = Math.max(1, Math.floor(this.width / 2));
    const h = Math.max(1, Math.floor(this.height / 2));
    const ws = Math.max(1, Math.floor(this.width / 8));
    const hs = Math.max(1, Math.floor(this.height / 8));
    this.a.renderTarget.setSize(w, h);
    this.b.renderTarget.setSize(w, h);
    this.streak.renderTarget.setSize(ws, hs);
    (this.composite.uniforms.uResolution!.value as THREE.Vector2).set(this.width, this.height);
  }

  private pass(material: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  /** Run bright pass, two separable blur iterations, anamorphic streak, then composite. */
  render(sceneTexture: THREE.Texture, time: number, reducedMotion: boolean): void {
    (this.bright.uniforms.uScene!.value as THREE.Texture | null) = sceneTexture;
    (this.bright.uniforms.uTexel!.value as THREE.Vector2).set(1 / this.width, 1 / this.height);
    this.pass(this.bright, this.a.renderTarget);

    for (let i = 0; i < 2; i++) {
      const spread = 1 + i * 1.8;
      (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.a.texture;
      (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(spread / this.width, 0);
      this.pass(this.blur, this.b.renderTarget);
      (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.b.texture;
      (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(0, spread / this.height);
      this.pass(this.blur, this.a.renderTarget);
    }

    // Horizontal-only wide blur for the anamorphic streak.
    (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.a.texture;
    (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(10 / this.width, 0);
    this.pass(this.blur, this.streak.renderTarget);

    this.composite.uniforms.uScene!.value = sceneTexture;
    this.composite.uniforms.uBloom!.value = this.a.texture;
    this.composite.uniforms.uStreak!.value = this.streak.texture;
    this.composite.uniforms.uTime!.value = time;
    this.composite.uniforms.uGrain!.value = reducedMotion ? 0 : 0.03;
    this.pass(this.composite, null);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    for (const target of [this.a, this.b, this.streak]) target.renderTarget.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}