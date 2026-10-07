import * as THREE from 'three';
import { PostFx } from './postfx';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  vertexShader: string;
  fragmentShader: string;
}

export interface FrameContext {
  time: number;
  delta: number;
}

const TARGET_FPS = 55;
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.0;

/** Fullscreen-quad vertex shader. Needs no attributes or buffers. */
export const QUAD_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export class GlRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** True once the resolution scaler has bottomed out; the shader then cuts its step budget. */
  reducedSteps = false;
  reducedMotion = false;
  readonly post: PostFx;
  lastCost = 0;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.RawShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private scale = 1;
  private accum = 0;
  private frames = 0;
  private lost = false;

  constructor(private readonly opts: RendererOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.uniforms = {
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uRegimeA: { value: 0 },
      uRegimeB: { value: 0 },
      uMix: { value: 0 },
      uMass: { value: 3e9 },
      uRadius: { value: 3e10 },
      uThroat: { value: 1e4 },
      uBoost: { value: 0.6 },
      uEmbedding: { value: 0 },
      uFov: { value: 0.9 },
      uAspect: { value: 1 },
      uScale: { value: 1e10 },
      uCameraPos: { value: new THREE.Vector3() },
      uCameraTarget: { value: new THREE.Vector3() },
      uAccent: { value: new THREE.Vector3(0.498, 0.831, 1.0) },
      uShowClocks: { value: 0 },
      uLowQuality: { value: 0 },
    };

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: opts.vertexShader,
      fragmentShader: opts.fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.post = new PostFx(this.renderer);

    opts.canvas.addEventListener('webglcontextlost', this.onContextLost);
    opts.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
  };

  private onContextRestored = (): void => {
    this.lost = false;
    this.resize();
  };

  get contextLost(): boolean {
    return this.lost;
  }

  get uniformBlock(): Record<string, THREE.IUniform> {
    return this.uniforms;
  }

  /** Width and height the canvas is actually being drawn at, for the HUD and the camera. */
  get drawSize(): { width: number; height: number } {
    return { width: this.opts.canvas.clientWidth, height: this.opts.canvas.clientHeight };
  }

  resize(): void {
    const canvas = this.opts.canvas;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    const rw = Math.max(1, Math.round(width * this.scale));
    const rh = Math.max(1, Math.round(height * this.scale));
    this.sceneTarget.setSize(rw, rh);
    this.post.setSize(rw, rh);
    (this.uniforms.uResolution!.value as THREE.Vector2).set(rw, rh);
  }

  /** Assign a uniform, converting arrays into vector uniforms. */
  set(name: string, value: unknown): void {
    const u = this.uniforms[name];
    if (!u) return;
    const current = u.value;
    if (Array.isArray(value)) {
      if (current instanceof THREE.Vector2) {
        (current as THREE.Vector2).fromArray(value as number[]);
        return;
      }
      if (current instanceof THREE.Vector3) {
        (current as THREE.Vector3).fromArray(value as number[]);
        return;
      }
    }
    u.value = value;
  }

  /**
   * Hold the frame budget by moving the internal resolution in 0.05 steps. Only reacts
   * after a window of frames, so a single hitch cannot cause a visible jump.
   */
  private adaptResolution(delta: number): void {
    this.accum += delta;
    this.frames += 1;
    if (this.frames < 30) return;
    const fps = this.frames / this.accum;
    this.accum = 0;
    this.frames = 0;
    const previous = this.scale;
    if (fps < TARGET_FPS) this.scale = Math.max(SCALE_MIN, this.scale - 0.05);
    else if (fps > TARGET_FPS * 1.25) this.scale = Math.min(SCALE_MAX, this.scale + 0.05);
    if (Math.abs(this.scale - previous) > 1e-6) {
      this.reducedSteps = this.scale <= SCALE_MIN + 1e-6;
      this.set('uLowQuality', this.reducedSteps ? 1 : 0);
      this.resize();
    }
  }

  render(ctx: FrameContext): void {
    if (this.lost) return;
    const t0 = performance.now();
    this.uniforms.uTime!.value = ctx.time;
    this.uniforms.uDelta!.value = ctx.delta;
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.post.render(this.sceneTarget.texture, ctx.time, this.reducedMotion);
    this.renderer.setRenderTarget(null);
    this.lastCost = performance.now() - t0;
    this.adaptResolution(ctx.delta);
  }

  dispose(): void {
    this.opts.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.opts.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.sceneTarget.dispose();
    this.post.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}