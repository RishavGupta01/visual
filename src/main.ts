import { GlRenderer, QUAD_VERT } from './render/renderer';
import { UBER_FRAG } from './render/shaders/uber';
import { createStore, type AppState, type RegimeIndex } from './core/store';
import { createTimeline } from './core/timeline';
import { createTransition, accentFor } from './core/transitions';
import { createRig } from './camera/rig';
import { mountHud } from './ui/hud';
import { mountControls } from './ui/controls';
import { mountMathLayer } from './ui/mathlayer';
import { mountMinkowskiDiagram } from './ui/minkowskiDiagram';
import { mountFallback } from './ui/fallback';
import { mountParityOverlay, createProbe } from './debug/parity';
import { PROBE_FRAG } from './render/shaders/common';

function boot(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  const hudHost = document.getElementById('hud');
  const controlsHost = document.getElementById('controls');
  const mathHost = document.getElementById('math');

  if (!canvas || !hudHost || !controlsHost || !mathHost) {
    throw new Error('expected #stage, #hud, #controls and #math in the document');
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.innerWidth < 900) document.body.classList.add('narrow');

  // Capability gate before anything else: the physics never needed a GPU, so the
  // degraded instrument is still worth showing.
  if (!document.createElement('canvas').getContext('webgl2')) {
    mountFallback(hudHost, 'WebGL2 is not available in this browser.');
    return;
  }

  const store = createStore();
  const timeline = createTimeline({ duration: 24 });
  if (reducedMotion) {
    timeline.pause();
    timeline.scrubTo(0.25);
  } else {
    timeline.play();
  }

  let renderer: GlRenderer;
  try {
    renderer = new GlRenderer({ canvas, vertexShader: QUAD_VERT, fragmentShader: UBER_FRAG });
  } catch (error) {
    console.error('WebGL2 initialisation failed', error);
    mountFallback(hudHost, 'The renderer failed to start.');
    return;
  }
  renderer.reducedMotion = reducedMotion;

  // Drag offsets live here rather than in a rig instance, because the rig is rebuilt per
  // frame with a per-regime scale and its own internal offset would be discarded.
  const view = { yaw: 0, pitch: 0 };

  const transition = createTransition({ store, reducedMotion });

  const hud = mountHud(hudHost);
  const math = mountMathLayer(mathHost);
  const parity = mountParityOverlay();
  const diagramHost = document.createElement('div');
  diagramHost.className = 'minkowski';
  diagramHost.hidden = true;
  const diagramCanvas = document.createElement('canvas');
  diagramHost.appendChild(diagramCanvas);
  document.body.appendChild(diagramHost);
  const diagram = mountMinkowskiDiagram(diagramCanvas);
  diagram.resize();

  const controls = mountControls(controlsHost, {
    store,
    timeline,
    reducedMotion,
    onRegime(next) {
      const from = store.get().regime;
      if (next === from) return;
      transition.start(from, next as RegimeIndex);
    },
    onResetCamera() {
      view.yaw = 0;
      view.pitch = 0;
      timeline.scrubTo(0);
      if (!reducedMotion) timeline.play();
    },
    onCycleEmbedding() {
      const state = store.get();
      store.set({ embedding: state.embedding === 'catenoid' ? 'pseudosphere' : 'catenoid' });
    },
  });

  // Paint the shell once at boot, then on every change. A subscription alone never fires
  // for the initial state, so without this the HUD, math layer and controls all sit empty
  // until the viewer happens to touch something.
  const refreshShell = (state: Readonly<AppState>): void => {
    hud.update(state, timeline.position);
    math.update(state);
    controls.update(state);
  };
  refreshShell(store.get());
  store.subscribe(refreshShell);

  // Scrubbing takes over from autoplay immediately, and a drag resumes it after a pause.
  window.addEventListener(
    'wheel',
    (event) => {
      timeline.pause();
      timeline.scrubTo(timeline.position01 + event.deltaY * 0.0004);
    },
    { passive: true },
  );

  let pointerDown = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    timeline.pause();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerDown) return;
    view.yaw += (event.clientX - lastX) * 0.004;
      view.pitch += (event.clientY - lastY) * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = (): void => {
    pointerDown = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // The parity probe is a second one-pixel renderer, created only when the overlay is
  // first opened so the hot path never pays for it.
  let probe: ReturnType<typeof createProbe> | null = null;

  let last = performance.now() / 1000;
  let frameCount = 0;

  let lastElapsed = Number.NaN;
  const frame = (nowMs: number): void => {
    const time = nowMs / 1000;
    const rawDelta = time - last;
    last = time;
    const delta = Math.min(0.1, rawDelta);
    frameCount++;

    // The transition runs on wall-clock time, not the clamped delta. The clamp exists so a
    // restored background tab cannot jump the *playhead*, but applying it to a 1400 ms
    // transition means a slow device stretches the transition to several seconds — the
    // regime change visibly lags behind the keypress. The tab-restore case is already
    // handled by resetting `last` in the visibilitychange handler.
    transition.update(Math.min(0.5, rawDelta));

    // The timeline is a loop, not a clock: clamping keeps playback smooth and monotonic
    // rather than skipping ahead after a stall.
    timeline.advance(Math.min(0.1, rawDelta));

    const state = store.get();
    const { width, height } = renderer.drawSize;
    const shaderTime = reducedMotion ? 12 : time;

    // The camera distance is per-regime. Regimes A and B frame a black hole, so they scale
    // with its Schwarzschild radius; regime D frames a wormhole throat, which has nothing to
    // do with the black hole's mass. Using the black hole distance for the wormhole put the
    // camera seven million throat-radii away, where a sphere-tracing loop can never reach the
    // surface and the frame comes back empty.
    // Framing is a fixed set of angles rather than an arbitrary distance. The shadow disc has
  // radius b_crit/2 = 2.598 M, the photon ring sits at 3 sqrt(3) M = 5.196 M, and the disk
  // starts at the ISCO = 6 M. At 20 M with a 0.6 rad lens the shadow fills about 45% of the
  // half-frame and the disk's inner limb falls inside the lower frame, which is the
  // composition the rig's low elevation assumes.
    const regimeScale =
      state.regime === 3 ? state.throatMetres * 4 : state.massMetres * 20;

    const rigForRegime = createRig({ mass: regimeScale, distance: 1 });
    rigForRegime.drag(view.yaw, view.pitch);
    const shot = rigForRegime.sample(timeline.position01);
    const sceneScale = Math.max(Math.abs(shot.position[0]), Math.abs(shot.position[2]));

    renderer.set('uAspect', width / Math.max(1, height));
    renderer.set('uScale', sceneScale);
    renderer.set('uRegimeA', state.transitioning ? state.transitionFrom : state.regime);
    renderer.set('uRegimeB', state.transitionTo);
    renderer.set('uMix', state.transitioning ? state.transitionT : 1);
    renderer.set('uMass', state.massMetres);
    renderer.set('uRadius', state.radiusMetres);
    renderer.set('uThroat', state.throatMetres);
    renderer.set('uBoost', state.boostBeta);
    renderer.set('uEmbedding', state.embedding === 'pseudosphere' ? 1 : 0);
    renderer.set('uShowClocks', state.regime === 1 ? 1 : 0);
    renderer.set('uCameraPos', shot.position);
    renderer.set('uCameraTarget', shot.target);
    renderer.set('uAccent', accentFor(state, state.transitionT));

    renderer.render({ time: shaderTime, delta });

    // The timeline advances every frame while the store does not, so a subscription alone
    // would freeze the elapsed clocks and the scrubber readout. Refresh the two elapsed-time
    // consumers only when the value actually changes, which keeps the DOM writes bounded.
    if (timeline.position !== lastElapsed) {
      lastElapsed = timeline.position;
      hud.update(state, lastElapsed);
      controls.update(state);
    }

    diagramHost.hidden = state.regime !== 2;
    if (!diagramHost.hidden) diagram.draw(timeline.position, state.boostBeta);

    if (state.parityOpen) {
      probe ??= createProbe(PROBE_FRAG, QUAD_VERT, { byteTarget: true });
      parity.update(state, probe, time, delta);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    renderer.resize();
    diagram.resize();
  });

  // Exposed so the verification harness can assert on real renderer state (frame count,
  // uniform values, timings) instead of inferring it from pixels. Read-only by convention;
  // nothing in the app reads it back.
  Object.assign(window, {
    __spacetime: {
      renderer,
      store,
      timeline,
      get probe() {
        return probe;
      },
      frameCount: () => frameCount,
      lastCost: () => renderer.lastCost,
      reducedSteps: () => renderer.reducedSteps,
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) timeline.pause();
    else last = performance.now() / 1000;
  });
}

boot();