import * as THREE from 'three';
import { PostFx } from './postfx';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  vertexShader: string;
  fragmentShader: string;
  /**
   * Override the offscreen target format. Only the diagnostic harness uses this; the app
   * itself always renders to the 8-bit target described in the constructor.
   */
  targetType?: THREE.TextureDataType | undefined;
  /**
   * Force the target size instead of measuring the canvas. The parity probe is a 1x1 canvas
   * that never enters the document, so its clientWidth is 0 and the measured path falls back
   * to the window size — a full-screen target no small read buffer can hold.
   */
  fixedSize?: { width: number; height: number } | undefined;
}

export interface FrameContext {
  time: number;
  delta: number;
}

const TARGET_FPS = 55;
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.0;

/**
 * Fullscreen-quad vertex shader. Needs no attributes or buffers.
 *
 * No `#version` directive: Three.js prepends it from the `glslVersion: GLSL3` setting, and
 * a second one is a compile error.
 */
export const QUAD_VERT = /* glsl */ `precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle from gl_VertexID. The corner offsets are in {-1, 3}, so the uv
  // must be scaled by 0.5 to land in [0, 1] — leaving them unscaled makes every post pass
  // sample outside the source texture.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p * 0.5;
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
  private readonly frustum = new THREE.Frustum();
  private readonly material: THREE.RawShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private sceneTarget: THREE.WebGLRenderTarget;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private pinnedWidth = 0;
  private pinnedHeight = 0;
  private scale = 1;
  private accum = 0;
  private frames = 0;
  private lost = false;

  constructor(private readonly opts: RendererOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: false,
      // Keeps the drawing buffer readable after compositing, so an external screenshot or
      // pixel probe sees the rendered frame rather than a cleared buffer.
      preserveDrawingBuffer: true,
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
      // A long lens. Real black hole imagery is made with a very narrow field of view from far
      // away, which is what compresses the accretion disk into a readable ellipse instead of
      // letting its plane sweep across the whole frame.
      uFov: { value: 0.60 },
      uAspect: { value: 1 },
      uScale: { value: 1e10 },
      uCameraPos: { value: new THREE.Vector3() },
      uCameraTarget: { value: new THREE.Vector3() },
      uAccent: { value: new THREE.Vector3(0.498, 0.831, 1.0) },
      uShowClocks: { value: 0 },
      uLowQuality: { value: 0 },
      uDebugMode: { value: 0 },
      // Declared because the parity probe shader uses them; the main shader does not.
      uProbeRadius: { value: 1 },
      uProbeB: { value: 1000 },
    };

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: opts.vertexShader,
      fragmentShader: opts.fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    // Exactly three vertices, non-indexed, no attributes used.
    //
    // The vertex shader synthesises a fullscreen triangle from gl_VertexID, so the geometry
    // exists only to make Three issue a three-vertex draw. PlaneGeometry is the wrong shape
    // for this: it is a 4-vertex *indexed* quad, so gl_VertexID returns index values in the
    // order 0,2,1,2,0,3, the reconstructed triangle is malformed, and only one corner's
    // colour reaches the screen.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3),
    );
    const quad = new THREE.Mesh(geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);

    // An 8-bit, non-sRGB target, allocated once at the canvas size and never resized.
    //
    // Each of the following produces a silently black canvas on the software rasteriser —
    // framebuffer complete, program linked, draw issued, no GL error, all readbacks zero:
    //
    //   1. Float targets, even though EXT_color_buffer_float is present.
    //   2. A target tagged SRGBColorSpace.
    //   3. A target whose size changes after allocation, whether via setSize or by being
    //      disposed and recreated.
    //
    // Plain RGBA8 at a fixed size works. The shaders do their own sRGB encode at the end of
    // the post chain, where it belongs, so no colour-space conversion is needed on the
    // target itself.
    const initialWidth = Math.max(
      1,
      opts.fixedSize?.width ?? opts.canvas.clientWidth ?? window.innerWidth,
    );
    const initialHeight = Math.max(
      1,
      opts.fixedSize?.height ?? opts.canvas.clientHeight ?? window.innerHeight,
    );
    this.sceneTarget = new THREE.WebGLRenderTarget(initialWidth, initialHeight, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.viewportWidth = initialWidth;
    this.viewportHeight = initialHeight;
    (this.uniforms.uResolution!.value as THREE.Vector2).set(initialWidth, initialHeight);
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

  /** Dimensions of the offscreen scene target, which the adaptive scaler may have shrunk. */
  sceneTargetSize(): { width: number; height: number } {
    return { width: this.sceneTarget.width, height: this.sceneTarget.height };
  }

  /**
   * Replace the fragment shader and render one frame. Used by the verification harness to
   * bisect a black frame: a solid colour distinguishes "the shader produced nothing" from
   * "the post chain lost the image".
   */
  debugUseShader(fragmentShader: string): void {
    // RawShaderMaterial compiles from a cache keyed on the source, so replacing the source
    // and setting needsUpdate is enough — but the readback must happen on a *later* draw,
    // because the frame that recompiles the program draws nothing. Callers go through
    // statsScenePixels, which draws once; use drawTwice for a single-shot swap.
    this.material.fragmentShader = fragmentShader;
    this.material.needsUpdate = true;
  }

  /** Current fragment shader source, so the harness can confirm what is loaded. */
  debugFragmentShader(): string {
    return this.material.fragmentShader;
  }

  /**
   * Swap the offscreen target for a byte-format one and render into it. Isolates a
   * float-render-target failure from a draw failure: if bytes render and floats do not,
   * the problem is the target format, not the pipeline.
   */
  /**
   * Recreate the offscreen target at the same size and format.
   *
   * This is the fix, not a diagnostic. On the SwiftShader backend used for verification,
   * a render target allocated at 1x1 and then grown via setSize renders *nothing* for the
   * rest of its life: the framebuffer reports complete, the program links, the draw call is
   * issued, every GL status is healthy, and every readback returns zero. Allocating each
   * target at its final size works. Since the app resizes whenever the adaptive scaler
   * changes resolution, it must reallocate rather than resize.
   */
  debugRecreateTarget(): void {
    this.sceneTarget.dispose();
    this.sceneTarget = new THREE.WebGLRenderTarget(this.sceneTarget.width, this.sceneTarget.height, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.drawToSceneTarget();
  }

  debugUseByteTarget(): void {
    this.sceneTarget.dispose();
    this.sceneTarget = new THREE.WebGLRenderTarget(this.sceneTarget.width, this.sceneTarget.height, {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.post.setSize(this.sceneTarget.width, this.sceneTarget.height);
    this.drawToSceneTarget();
  }

  /** Render one frame straight to the canvas, bypassing the post chain. */
  debugRenderDirect(): void {
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render straight to the canvas and read the result back in the same call, before any
   * other frame can run. Splitting these across frames lets the render loop overwrite the
   * buffer between the draw and the read.
   */
  debugDirectReadback(): { max: number; mean: number; glError: number } {
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

    let max = 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 4 * 29) {
      const lum = (px[i]! * 0.2126 + px[i + 1]! * 0.7152 + px[i + 2]! * 0.0722) / 255;
      max = Math.max(max, lum);
      sum += lum;
      n++;
    }
    return { max, mean: n ? sum / n : 0, glError: gl.getError() };
  }

  /**
   * Clear the default framebuffer to red and read it back, using no Three.js state at all.
   * A red pixel here proves the context, the drawing buffer and readPixels all work, which
   * localises any remaining black frame to the draw path rather than the plumbing.
   */
  debugClearRed(): { max: number; glError: number; status: number; w: number; h: number } {
    const gl = this.renderer.getContext();
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(4 * 4);
    gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { max: px[0] ?? 0, glError: gl.getError(), status, w, h };
  }

  /**
   * Render through the *whole* path — scene target, then post chain, then canvas — and read
   * the canvas back in the same synchronous call. This is the only readback that matches
   * what a reader sees, and the only one that can tell whether the post chain loses the
   * image.
   */
  debugFullReadback(time: number, delta: number): { max: number; mean: number; glError: number } {
    this.uniforms.uTime!.value = time;
    this.uniforms.uDelta!.value = delta;
    this.drawToSceneTarget();
    this.post.render(this.sceneTarget.texture, time, this.reducedMotion);
    this.renderer.setRenderTarget(null);

    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 4 * 29) {
      const lum = (px[i]! * 0.2126 + px[i + 1]! * 0.7152 + px[i + 2]! * 0.0722) / 255;
      max = Math.max(max, lum);
      sum += lum;
      n++;
    }
    return { max, mean: n ? sum / n : 0, glError: gl.getError() };
  }

  /** Luminance stats of the post-processed canvas, which is what a reader actually sees. */
  statsCanvas(time: number, delta: number): { max: number; mean: number; glError: number } {
    return this.debugFullReadback(time, delta);
  }

  /**
   * Clear the offscreen target to red and read it back. Combined with debugClearRed on the
   * default framebuffer, this separates "the render target is unusable" from "the draw
   * into it does not happen" — the two have identical symptoms from the canvas.
   */
  debugSceneTargetClearRed(): { max: number; glError: number; status: number } {
    const gl = this.renderer.getContext();
    this.renderer.setRenderTarget(this.sceneTarget);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4 * 4);
    const bytesPerPixel = this.sceneTarget.texture.type === THREE.FloatType ? 4 : 2;
    const buf =
      bytesPerPixel === 4 ? new Float32Array(4 * 4) : new Uint16Array(4 * 4);
    this.renderer.readRenderTargetPixels(this.sceneTarget, 0, 0, 2, 2, buf);
    const first = bytesPerPixel === 4 ? (buf[0] as number) : (buf[0] as number);
    this.renderer.setRenderTarget(null);
    void px;
    return { max: first, glError: gl.getError(), status };
  }

  /**
   * The decisive test: fill the offscreen target with a known colour, run the post chain
   * over it, then read the canvas.
   *
   * A red canvas means the target is fine and the post chain is at fault. A black canvas
   * means the render target itself is unusable. No other experiment distinguishes these
   * two without guessing.
   */
  debugPostChainRed(): { canvasMax: number; glError: number } {
    const gl = this.renderer.getContext();
    this.renderer.setRenderTarget(this.sceneTarget);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0.5, 0.25, 0.125, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Copy the filled target through the real post chain.
    this.post.render(this.sceneTarget.texture, 0, true);
    this.renderer.setRenderTarget(null);

    const px = new Uint8Array(4 * 4);
    gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { canvasMax: px[0] ?? 0, glError: gl.getError() };
  }

  /**
   * Luminance stats of any registered post-chain target, by name. Used to pinpoint which
   * stage of the chain loses the image rather than inferring it from the final output.
   */
  debugPostTargetStats(name: 'a' | 'b' | 'streak'): { max: number; mean: number } {
    const target = name === 'a' ? this.post.targetA() : name === 'b' ? this.post.targetB() : this.post.targetStreak();
    if (!target) return { max: 0, mean: 0 };
    const w = target.width;
    const h = target.height;
    const buf = new Uint8Array(w * h * 4);
    const r = this.renderer as THREE.WebGLRenderer;
    r.readRenderTargetPixels(target, 0, 0, w, h, buf);
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < buf.length; i += 4 * 7) {
      const lum = (buf[i]! * 0.2126 + buf[i + 1]! * 0.7152 + buf[i + 2]! * 0.0722) / 255;
      max = Math.max(max, lum);
      sum += lum;
      n++;
    }
    return { max, mean: n ? sum / n : 0 };
  }

  /** Draw the fullscreen quad with a solid colour, for bisecting the pipeline. */
  debugSolidShader(): void {
    this.debugUseShader(
      'precision highp float;\nin vec2 vUv;\nout vec4 fragColor;\n' +
        'void main(){ fragColor = vec4(vUv, 0.5, 1.0); }',
    );
  }

  /** Current GL error, 0 if none. */
  debugGlError(): number {
    return this.renderer.getContext().getError();
  }

  /**
   * Everything needed to tell "the draw never happened" from "the draw happened and wrote
   * zero": draw-call counts, the linked program's log, and whether the quad survived
   * frustum culling.
   */
  debugPipeline(): Record<string, unknown> {
    const info = this.renderer.info;
    const gl = this.renderer.getContext();
    const mesh = this.scene.children[0] as THREE.Mesh | undefined;
    // Three keeps the linked program on its internal program cache, not on the material's
    // public type, so it is reached through the renderer.
    const programs = (info.programs ?? []) as { program?: WebGLProgram }[];
    const program = programs[0]?.program;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      programs: programs.length,
      hasProgram: Boolean(program),
      programLinked: program ? gl.getProgramParameter(program, gl.LINK_STATUS) : null,
      programLog: program ? (gl.getProgramInfoLog(program) ?? '') : null,
      meshExists: Boolean(mesh),
      visible: mesh?.visible ?? null,
      frustumCulled: mesh?.frustumCulled ?? null,
      inFrustum: mesh ? this.frustum.intersectsObject(mesh) : null,
      targetType: this.sceneTarget.texture.type,
      targetSize: [this.sceneTarget.width, this.sceneTarget.height],
      drawBufferSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      framebufferComplete: (() => {
        this.renderer.setRenderTarget(this.sceneTarget);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        this.renderer.setRenderTarget(null);
        return status === gl.FRAMEBUFFER_COMPLETE ? 'complete' : String(status);
      })(),
    };
  }

  

  /**
   * The offscreen target is allocated exactly once, at construction, at the canvas size.
   *
   * It is deliberately never resized. Resizing a render target — including the recreate-
   * dispose-allocate cycle — leaves the software rasteriser in a state where the draw call
   * is issued, every status reports healthy, and the output reads back as zero. The
   * adaptive resolution scaler therefore changes the *viewport* rather than the target, so
   * the same allocated target renders a smaller region at a lower resolution.
   */
  resize(): void {
    const canvas = this.opts.canvas;
    const width =
      this.pinnedWidth || this.opts.fixedSize?.width || canvas.clientWidth || window.innerWidth;
    const height =
      this.pinnedHeight || this.opts.fixedSize?.height || canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.post.setSize(width, height);
    this.viewportWidth = Math.max(1, Math.round(width * this.scale));
    this.viewportHeight = Math.max(1, Math.round(height * this.scale));
    (this.uniforms.uResolution!.value as THREE.Vector2).set(
      this.viewportWidth,
      this.viewportHeight,
    );
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
    this.drawToSceneTarget();
    this.post.render(this.sceneTarget.texture, ctx.time, this.reducedMotion);
    this.renderer.setRenderTarget(null);
    this.lastCost = performance.now() - t0;
    this.adaptResolution(ctx.delta);
  }

  /**
   * Draw the scene into the offscreen target.
   *
   * autoClear is disabled and the target is cleared explicitly, because Three's implicit
   * clear respects the *current* clear colour while the viewport for a render target is not
   * reset by setRenderTarget alone. The symptom of getting this wrong is a target that is
   * cleared but never drawn into, which reads as a black canvas with no GL error.
   */
  private drawToSceneTarget(): void {
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    // Restore the full viewport so the post chain samples the whole target.
    this.renderer.setViewport(0, 0, this.sceneTarget.width, this.sceneTarget.height);
  }

  /**
   * Render one frame into the offscreen target and read it back, bypassing the post chain.
   *
   * Reading the canvas instead would be useless for numeric probes: the default
   * framebuffer is 8-bit and the post chain has already tone-mapped the result. This path
   * keeps full float precision, which is what the parity overlay needs.
   *
   * The buffer must match the target's type: a Uint8Array for the 8-bit sRGB target used
   * by the app, or a Float32Array for a float target. Passing the wrong one is an
   * INVALID_OPERATION rather than a silent zero fill.
   */
  readScenePixels(ctx: FrameContext, buffer: Uint8Array | Float32Array): void {
    this.uniforms.uTime!.value = ctx.time;
    this.uniforms.uDelta!.value = ctx.delta;
    this.drawToSceneTarget();
    this.renderer.readRenderTargetPixels(
      this.sceneTarget,
      0,
      0,
      this.sceneTarget.width,
      this.sceneTarget.height,
      buffer,
    );
    this.renderer.setRenderTarget(null);
  }

  /**
   * Mean and max luminance of the offscreen target. Convenience for the
   * verification harness, which needs to know whether a frame is empty without caring about
   * the target's storage format.
   */
  /**
   * Pin the target to a fixed size, ignoring the canvas.
   *
   * The parity probe is a 1x1 canvas that never enters the document, so clientWidth is 0
   * and the normal sizing path falls back to the window — producing a full-screen target
   * that a 4-byte read buffer cannot possibly hold.
   */
  pinSize(width: number, height: number): void {
    this.pinnedWidth = width;
    this.pinnedHeight = height;
  }

  /** Override the internal resolution, for diagnostics that need fewer pixels. */
  debugSetScale(scale: number): void {
    this.scale = scale;
    this.resize();
  }

  /** Draw the scene twice. The first frame after a program change compiles and draws nothing. */
  drawTwice(ctx: FrameContext): void {
    this.uniforms.uTime!.value = ctx.time;
    this.uniforms.uDelta!.value = ctx.delta;
    this.drawToSceneTarget();
    this.drawToSceneTarget();
  }

  /**
   * Read the offscreen target into a caller-supplied byte buffer.
   *
   * The viewport is reset to the whole target first, because drawToSceneTarget narrows it to
   * the adaptive-resolution region and a narrowed viewport would leave the rest unrendered.
   */
  readBack(buffer: Uint8Array): void {
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.setViewport(0, 0, this.sceneTarget.width, this.sceneTarget.height);
    this.renderer.readRenderTargetPixels(
      this.sceneTarget,
      0,
      0,
      this.sceneTarget.width,
      this.sceneTarget.height,
      buffer,
    );
    this.renderer.setRenderTarget(null);
  }

  statsScenePixels(ctx: FrameContext): { max: number; mean: number } {
    const { width, height } = this.sceneTarget;
    const buf = new Uint8Array(width * height * 4);
    this.readScenePixels(ctx, buf);
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < buf.length; i += 4 * 7) {
      const lum = (buf[i]! * 0.2126 + buf[i + 1]! * 0.7152 + buf[i + 2]! * 0.0722) / 255;
      max = Math.max(max, lum);
      sum += lum;
      n++;
    }
    return { max, mean: n ? sum / n : 0 };
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