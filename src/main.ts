import { GlRenderer, QUAD_VERT } from './render/renderer';
import { UBER_FRAG } from './render/shaders/uber';
import { createStore } from './core/store';
import { createTimeline } from './core/timeline';

function boot(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  const hud = document.getElementById('hud');
  if (!canvas) throw new Error('canvas #stage is missing from the document');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = createStore();
  const timeline = createTimeline({ duration: 24 });
  if (!reducedMotion) timeline.play();

  let renderer: GlRenderer;
  try {
    renderer = new GlRenderer({ canvas, vertexShader: QUAD_VERT, fragmentShader: UBER_FRAG });
  } catch (error) {
    console.error('WebGL2 initialisation failed', error);
    if (hud) hud.textContent = 'WebGL2 is unavailable in this browser.';
    return;
  }
  renderer.reducedMotion = reducedMotion;

  let last = performance.now() / 1000;

  const frame = (nowMs: number): void => {
    const time = nowMs / 1000;
    const delta = Math.min(0.1, time - last);
    last = time;
    timeline.advance(delta);

    const state = store.get();
    const { width, height } = renderer.drawSize;
    const angle = timeline.position01 * Math.PI * 2;
    const distance = Math.max(state.massMetres * 26, 1e9);
    const shaderTime = reducedMotion ? 12 : time;

    renderer.set('uAspect', width / Math.max(1, height));
    renderer.set('uScale', distance);
    renderer.set('uRegimeA', state.regime);
    renderer.set('uRegimeB', state.transitionTo);
    renderer.set('uMix', state.transitioning ? state.transitionT : 1);
    renderer.set('uMass', state.massMetres);
    renderer.set('uRadius', state.radiusMetres);
    renderer.set('uThroat', state.throatMetres);
    renderer.set('uBoost', state.boostBeta);
    renderer.set('uEmbedding', state.embedding === 'pseudosphere' ? 1 : 0);
    renderer.set('uShowClocks', state.regime === 1 ? 1 : 0);
    renderer.set('uCameraPos', [
      Math.cos(angle) * distance,
      state.massMetres * 2.4,
      Math.sin(angle) * distance,
    ]);
    renderer.set('uCameraTarget', [0, 0, 0]);

    renderer.render({ time: shaderTime, delta });

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  window.addEventListener('resize', () => renderer.resize());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) timeline.pause();
    else last = performance.now() / 1000;
  });
}

boot();