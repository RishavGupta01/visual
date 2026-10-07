import { GlRenderer, QUAD_VERT } from './render/renderer';
import { UBER_FRAG } from './render/shaders/uber';
import { createStore, type RegimeIndex } from './core/store';
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

  const rig = createRig({ mass: store.get().massMetres });
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
      rig.reset();
      timeline.scrubTo(0);
      if (!reducedMotion) timeline.play();
    },
    onCycleEmbedding() {
      const state = store.get();
      store.set({ embedding: state.embedding === 'catenoid' ? 'pseudosphere' : 'catenoid' });
    },
  });

  store.subscribe((state) => {
    hud.update(state, timeline.position);
    math.update(state);
    controls.update(state);
  });

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
    rig.drag((event.clientX - lastX) * 0.004, (event.clientY - lastY) * 0.004);
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

  const frame = (nowMs: number): void => {
    const time = nowMs / 1000;
    const delta = Math.min(0.1, time - last);
    last = time;

    transition.update(delta);
    timeline.advance(delta);

    const state = store.get();
    const { width, height } = renderer.drawSize;
    const shot = rig.sample(timeline.position01);
    const shaderTime = reducedMotion ? 12 : time;
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

    diagramHost.hidden = state.regime !== 2;
    if (!diagramHost.hidden) diagram.draw(timeline.position, state.boostBeta);

    if (state.parityOpen) {
      probe ??= createProbe(PROBE_FRAG, QUAD_VERT);
      parity.update(state, probe, time, delta);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    renderer.resize();
    diagram.resize();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) timeline.pause();
    else last = performance.now() / 1000;
  });
}

boot();