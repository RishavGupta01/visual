import * as THREE from 'three';

/**
 * Three vertices, non-indexed, with no attributes the shader reads.
 *
 * The vertex shader synthesises a fullscreen triangle from gl_VertexID, so the geometry's
 * only job is to make Three issue a three-vertex draw. An indexed quad is wrong here:
 * gl_VertexID then yields index values rather than vertex indices, the reconstructed
 * triangle is malformed, and the fragment shader writes a single corner's colour across the
 * whole target. That failure is silent — no GL error, a linked program, an issued draw.
 */
function fullscreenGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3),
  );
  return geometry;
}

/** No `#version` directive: Three.js prepends it from `glslVersion: GLSL3`. */
const POST_VERT = /* glsl */ `precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p * 0.5;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `
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

const BLUR_FRAG = /* glsl */ `
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

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloomWide;
uniform sampler2D uStreak;
uniform vec2  uResolution;
uniform float uTime;
uniform float uGrain;
uniform float uAberration;
uniform float uExposure;

// Narkowicz ACES fit. The scene target holds linear light, so the tonemap is applied to
// real radiance rather than to already-encoded sRGB, which is what lets the highlights roll
// off instead of clipping to flat white.
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

  // Lateral chromatic aberration, zero at the optical axis and growing quadratically to the
  // edge. A fixed offset instead shifted the whole frame, which reads as a mistake rather
  // than as a lens.
  vec2 px = (uAberration * r2 * 1.4) / uResolution;
  vec3 scene;
  scene.r = texture(uScene, uv + px).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - px).b;

  // Two bloom octaves. A single tight blur gives the small hot halo that reads as "glowy";
  // the wide octave is what wraps light around the subject and is most of the cinematic feel.
  // Weights are deliberately restrained. The wide octave and the triple-length streak both
  // spread light across a large fraction of the frame, and pushing either harder dissolves
  // the subject into a glow: at full strength the black hole stopped being an object with
  // a shadow and became a bright smear with a dark corner.
  vec3 bloom = texture(uBloom, uv).rgb * 0.34
             + texture(uBloomWide, uv).rgb * 0.26;
  vec3 streak = texture(uStreak, uv).rgb;

  vec3 hdr = scene * uExposure + bloom + streak * 0.14;

  vec3 colour = acesTonemap(hdr);
  colour = srgbEncode(colour);

  // Filmic contrast in display space: pivot at 0.18 so mid-grey stays put while the toe
  // crushes toward true black. This is the step that gives deep space its depth; without it
  // ACES alone still leaves a grey pedestal under everything.
  const float pivot = 0.18;
  colour = clamp((colour - pivot) * 1.16 + pivot, 0.0, 1.0);
  colour = colour * colour * (3.0 - 2.0 * colour) * 0.34 + colour * 0.66;

  // Gentle saturation lift. Deep space is mostly near-neutral, so this is kept small.
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  colour = mix(vec3(luma), colour, 1.12);

  // Vignette, applied before grain so the grain does not betray the falloff.
  colour *= 1.0 - smoothstep(0.18, 0.92, r2) * 0.42;

  // Shadow-weighted, fine grain. Uniform grain across the frame reads as sensor noise on a
  // flat image; weighting it toward the darks is both how film behaves and what keeps the
  // highlights clean.
  float shadowWeight = 1.0 - smoothstep(0.0, 0.55, luma);
  float g = hash12(gl_FragCoord.xy + vec2(uTime * 61.0, uTime * 37.0)) - 0.5;
  colour += g * uGrain * (0.35 + 0.65 * shadowWeight);

  fragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`;

interface Target {
  renderTarget: THREE.WebGLRenderTarget;
  texture: THREE.Texture;
}

/**
 * Byte + sRGB, matching the main target. The post chain reads an already-sRGB-encoded image,
 * so its intermediate targets must not encode a second time.
 */
/**
 * Allocate an intermediate target at its real size.
 *
 * Same constraint as the main scene target: these must be allocated once, at their final
 * size, and never resized. A resized target clears correctly but never receives the draw,
 * so the bloom chain produces black and the composite outputs black.
 */
function makeTarget(width: number, height: number): Target {
  const renderTarget = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.NoColorSpace,
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
  private a: Target;
  private b: Target;
  private streak: Target;
  private wide: Target;
  private width = 0;
  private height = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.bright = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: {
        uScene: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 0.40 },
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
        uBloomWide: { value: null },
        uStreak: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uGrain: { value: 0.022 },
        uAberration: { value: 1.0 },
        uExposure: { value: 1.15 },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Three vertices, non-indexed — the same constraint as the main renderer's quad. A
    // PlaneGeometry is an indexed 4-vertex quad, so gl_VertexID returns index values in the
    // order 0,2,1,2,0,3 and the synthesised fullscreen triangle is malformed. The bright
    // pass then samples nothing and the whole chain outputs black.
    this.quad = new THREE.Mesh(fullscreenGeometry(), this.bright);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    // Zero-sized: the first setSize allocates them at the real resolution.
    this.a = makeTarget(1, 1);
    this.b = makeTarget(1, 1);
    this.streak = makeTarget(1, 1);
    this.wide = makeTarget(1, 1);
    this.width = 0;
    this.height = 0;
  }

  /**
   * Allocate the intermediate targets at their real size.
   *
   * Reallocation rather than setSize, deliberately. A target created at 1x1 and then grown
   * renders nothing on the software rasteriser: the framebuffer reports complete, the
   * program links, the draw is issued, and every readback is zero, with no GL error. A
   * gl.clear into such a target works, which is what makes it so confusing — the bloom
   * chain was clearing fine and drawing nothing.
   */
  /** Accessors for the diagnostics in renderer.ts. */
  targetA(): THREE.WebGLRenderTarget {
    return this.a.renderTarget;
  }
  targetB(): THREE.WebGLRenderTarget {
    return this.b.renderTarget;
  }
  targetStreak(): THREE.WebGLRenderTarget {
    return this.streak.renderTarget;
  }

  setSize(width: number, height: number): void {
    const nextW = Math.max(1, width);
    const nextH = Math.max(1, height);
    if (nextW === this.width && nextH === this.height) return;

    this.width = nextW;
    this.height = nextH;

    const w = Math.max(1, Math.floor(nextW / 2));
    const h = Math.max(1, Math.floor(nextH / 2));
    const ws = Math.max(1, Math.floor(nextW / 8));
    const hs = Math.max(1, Math.floor(nextH / 8));

    this.a.renderTarget.dispose();
    this.b.renderTarget.dispose();
    this.streak.renderTarget.dispose();
    this.wide.renderTarget.dispose();

    this.a = makeTarget(w, h);
    this.b = makeTarget(w, h);
    this.streak = makeTarget(ws, hs);
    this.wide = makeTarget(Math.max(1, Math.floor(nextW / 4)), Math.max(1, Math.floor(nextH / 4)));

    (this.composite.uniforms.uResolution!.value as THREE.Vector2).set(nextW, nextH);
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

    // Wide octave: a much larger blur radius, downsampled again. This is the soft halo that
    // wraps the subject and sells the light as coming from a luminous source rather than
    // being pasted on top of the frame.
    (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.a.texture;
    (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(6 / this.width, 0);
    this.pass(this.blur, this.b.renderTarget);
    (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.b.texture;
    (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(0, 6 / this.height);
    this.pass(this.blur, this.wide.renderTarget);

    // Anamorphic streak: three horizontal passes of increasing length. One pass gives a short
    // smear; the doubling is what produces the long lens flare across the frame.
    (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.a.texture;
    (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(8 / this.width, 0);
    this.pass(this.blur, this.streak.renderTarget);
    for (let i = 0; i < 2; i++) {
      (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.streak.texture;
      (this.blur.uniforms.uDirection!.value as THREE.Vector2).set((12 + i * 10) / this.width, 0);
      this.pass(this.blur, this.b.renderTarget);
      (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.b.texture;
      (this.blur.uniforms.uDirection!.value as THREE.Vector2).set((12 + i * 10) / this.width, 0);
      this.pass(this.blur, this.streak.renderTarget);
    }

    this.composite.uniforms.uScene!.value = sceneTexture;
    this.composite.uniforms.uBloom!.value = this.a.texture;
    this.composite.uniforms.uBloomWide!.value = this.wide.texture;
    this.composite.uniforms.uStreak!.value = this.streak.texture;
    this.composite.uniforms.uTime!.value = time;
    this.composite.uniforms.uGrain!.value = reducedMotion ? 0 : 0.022;
    this.pass(this.composite, null);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    for (const target of [this.a, this.b, this.streak, this.wide]) target.renderTarget.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
