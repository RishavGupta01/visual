import { DURATION, EASING, clamp01 } from './motion';
import type { AppState, RegimeIndex, Store } from './store';

export interface TransitionOptions {
  store: Store;
  reducedMotion: boolean;
  onFrame?(t: number): void;
}

export interface Transition {
  start(from: RegimeIndex, to: RegimeIndex): void;
  update(dt: number): void;
  readonly active: boolean;
  cancel(): void;
}

/**
 * Drives a regime change. Nothing here ever hard-cuts: the metric morph, the camera move
 * and the HUD swap are all driven from this single eased clock, so they cannot drift apart.
 */
export function createTransition(opts: TransitionOptions): Transition {
  const { store, reducedMotion } = opts;
  let elapsed = 0;
  let running = false;

  return {
    start(from, to) {
      if (from === to) return;
      store.set({
        transitioning: true,
        transitionFrom: from,
        transitionTo: to,
        transitionT: 0,
      });
      elapsed = 0;
      running = true;
    },
    update(dt) {
      if (!running) return;
      elapsed += dt * 1000;
      const duration = reducedMotion ? DURATION.instant : DURATION.regime;
      const raw = clamp01(elapsed / duration);
      const t = reducedMotion ? 1 : EASING.transition(raw);
      store.set({ transitionT: t });
      opts.onFrame?.(t);
      if (raw >= 1) {
        running = false;
        store.set({ transitioning: false, transitionT: 1, regime: store.get().transitionTo });
      }
    },
    get active() {
      return running;
    },
    cancel() {
      if (!running) return;
      running = false;
      store.set({ transitioning: false, transitionT: 1, regime: store.get().transitionTo });
    },
  };
}

/**
 * Rotate an accent hue in OKLab. Interpolating amber to violet in RGB passes through a
 * muddy grey; OKLab keeps the chroma up through the whole transition.
 */
export function rotateAccentOklch(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): [number, number, number] {
  const a = srgbToOklab(from[0], from[1], from[2]);
  const b = srgbToOklab(to[0], to[1], to[2]);
  return oklabToSrgb(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToSrgb(L: number, a: number, bb: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const enc = (c: number): number =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  return [enc(lr), enc(lg), enc(lb)];
}

/** Per-regime accent colours, as sRGB triples. */
export const REGIME_ACCENT: [number, number, number][] = [
  [0.498, 0.831, 1.0],
  [1.0, 0.706, 0.329],
  [0.545, 0.831, 1.0],
  [0.608, 0.482, 1.0],
];

export function accentFor(state: AppState, t: number): [number, number, number] {
  if (!state.transitioning || t <= 0) return REGIME_ACCENT[state.transitionFrom]!;
  if (t >= 1) return REGIME_ACCENT[state.transitionTo]!;
  return rotateAccentOklch(
    REGIME_ACCENT[state.transitionFrom]!,
    REGIME_ACCENT[state.transitionTo]!,
    t,
  );
}