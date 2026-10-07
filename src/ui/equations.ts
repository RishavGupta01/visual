export interface Equation {
  id: string;
  label: string;
  /** Plain text, so it is selectable, screen-readable and copy-pasteable. */
  plain: string;
  note: string;
}

export interface RegimeMeta {
  name: string;
  thesis: string;
  equations: Equation[];
}

/**
 * Centralised so the maths and the UI cannot disagree about a formula. Nothing here is a
 * decorative re-typing of the physics module: the notes say what is real and what is
 * approximated, and the honesty line at the bottom of each regime is deliberate.
 */
export const REGIME_META: RegimeMeta[] = [
  {
    name: 'Gravity',
    thesis: 'Light bends because spacetime is curved, not because light is bent.',
    equations: [
      {
        id: 'schw',
        label: 'Schwarzschild metric',
        plain: 'ds² = −(1 − 2M/r) c² dt² + (1 − 2M/r)⁻¹ dr² + r² dΩ²',
        note: 'The lapse is α(r) = √(1 − 2M/r). Everything gravitational follows from it.',
      },
      {
        id: 'geodesic',
        label: 'Null geodesic, Binet form',
        plain: 'd²u/dφ² = −u + 3Mu²,   u = 1/r',
        note: 'Exact. The 3Mu² term is the whole of general relativity here; the familiar 4M/b deflection is only its weak-field shadow.',
      },
      {
        id: 'invariant',
        label: 'Conserved quantity',
        plain: 'w² + u² − 2Mu³ = C′,   w = du/dφ',
        note: 'Every ray on screen is integrated from this. C′ is fixed by the ray\'s initial direction.',
      },
      {
        id: 'shadow',
        label: 'Shadow radius',
        plain: 'b_crit = 3√3 M ≈ 5.196 M',
        note: 'Emerges from the integration. Rays inside fall in, rays outside escape. Nothing draws it.',
      },
    ],
  },
  {
    name: 'Time Dilation',
    thesis: 'Two clocks, one elapsed time, very different readings.',
    equations: [
      {
        id: 'static',
        label: 'Static clock',
        plain: 'dτ/dt = α(r) = √(1 − 2M/r)',
        note: 'Hovering at radius r. Goes to zero at the horizon, so the ratio diverges without bound.',
      },
      {
        id: 'orbit',
        label: 'Circular geodesic',
        plain: 'dτ/dt = √(1 − 3M/r)',
        note: 'Exists for r > 3M, stable only for r ≥ 6M. Faster than the static clock: the motion adds dilation rather than cancelling it.',
      },
      {
        id: 'ratio',
        label: 'Ratio at the ISCO',
        plain: '√((1 − 3M/r) / (1 − 2M/r)) = 0.8660 at r = 6M',
        note: 'The orbiting clock runs at 86.6% of the hovering clock at the same radius.',
      },
      {
        id: 'freefall',
        label: 'Free fall from rest',
        plain: 'dr/dτ = −√(E² − 1 + 2M/r),   E = 1 − 2M/r₀',
        note: 'Integrated numerically. The integrand is singular at the turning point, so it is regularised by r = r₀ sin²s.',
      },
    ],
  },
  {
    name: 'Light Speed',
    thesis: 'Every observer measures c. What differs is their clock and their ruler.',
    equations: [
      {
        id: 'interval',
        label: 'Interval invariance',
        plain: 'ds² = −c² dτ² = −c² dt² + dx²',
        note: 'Rearranged: dx/dt = c. Exactly, for every inertial observer. There is no frame in which a photon slows down.',
      },
      {
        id: 'proper',
        label: 'Proper time',
        plain: 'τ = ∫ √(1 − β(t)²) dt',
        note: 'This integral — not anything happening at the reunion — is why the twins disagree.',
      },
      {
        id: 'addition',
        label: 'Velocity addition',
        plain: 'u = (u′ + v) / (1 + u′v/c²)',
        note: 'A photon chased at 0.9c is still measured at c.',
      },
      {
        id: 'aberration',
        label: 'Aberration',
        plain: 'tan θ′ = sin θ / (γ (cos θ − β))',
        note: 'A photon arriving perpendicular to your motion appears to arrive from behind. That is why starlight seems to shift toward the direction of travel.',
      },
      {
        id: 'lapse',
        label: 'Lapse in flat spacetime',
        plain: 'α = 1',
        note: 'This regime has no curvature and no redshift. That absence is the point: it is the control case for the other three.',
      },
    ],
  },
  {
    name: 'Wormhole',
    thesis: 'A shortcut that saves distance — and nothing else.',
    equations: [
      {
        id: 'mt',
        label: 'Morris-Thorne metric',
        plain: 'ds² = −c² dt² + dl² + b² cosh²(l/b) dΩ²',
        note: 'Φ = 0, so g_tt = −c² and the lapse is exactly 1.',
      },
      {
        id: 'nodilation',
        label: 'No time dilation',
        plain: 'α = √(−g_tt)/c = 1   everywhere',
        note: 'Pop-science wormholes that dilate time describe a different spacetime. This one does not dilate time at all.',
      },
      {
        id: 'curvature',
        label: 'Curvature of the spatial slice',
        plain: 'K = −r″/r = −1/b²   (constant, negative — hyperbolic)',
        note: 'A patch of the hyperbolic plane H², with the throat as its equator. The same 1/b² sets the tidal forces.',
      },
      {
        id: 'embedding',
        label: 'The embedding picture',
        plain: 'catenoid K = −1/(b² cosh⁴(l/b))   ≠   metric K = −1/b²',
        note: 'The famous diagram plots the metric functions; it is not an isometric embedding. Press E to swap in Beltrami\'s pseudosphere, which is.',
      },
      {
        id: 'traverse',
        label: 'Axial traversal time',
        plain: 'T = 2L/c',
        note: 'Along the axis the slice is flat 2D, so the trip takes exactly as long as the distance. The wormhole buys distance, not time.',
      },
      {
        id: 'tidal',
        label: 'Tidal acceleration at the throat',
        plain: 'a = c² h / (2 b²)',
        note: 'For a 2 m traveller to stay under 10 g the throat needs b ≳ 30,000 km.',
      },
      {
        id: 'exotic',
        label: 'Stress-energy at the throat',
        plain: 'ρ = 0,   τ = 1/(8πb) > ρ c²',
        note: 'Every energy condition is violated. This, not the distance, is why the throat cannot be built.',
      },
    ],
  },
];

export function regimeMeta(index: number): RegimeMeta {
  return REGIME_META[index] ?? REGIME_META[0]!;
}