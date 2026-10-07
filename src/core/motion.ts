/**
 * The single source of timing truth, mirrored as CSS custom properties in style.css.
 * Nothing anywhere else is allowed to invent a duration.
 */
export const DURATION = {
  instant: 120,
  quick: 220,
  base: 420,
  regime: 1400,
  reveal: 900,
} as const;

export type DurationKey = keyof typeof DURATION;

export type Easing = (t: number) => number;

export const easeOutQuint: Easing = (t) => 1 - Math.pow(1 - t, 5);

export const easeInOutQuart: Easing = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

export const linear: Easing = (t) => t;

export const EASING = {
  enter: easeOutQuint,
  transition: easeInOutQuart,
  /** Physics-driven motion must never be eased: it is integrated, not animated. */
  physics: linear,
} as const;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Map t from [a, b] to [0, 1], clamped. */
export function normalise(t: number, a: number, b: number): number {
  return clamp01((t - a) / (b - a));
}