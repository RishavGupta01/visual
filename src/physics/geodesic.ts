/**
 * Exact Schwarzschild null geodesics.
 *
 * Spherical symmetry keeps a geodesic in the plane containing the origin and its initial
 * direction, so a single ODE in phi is exact rather than an approximation. The Binet form
 * of the orbit equation is
 *
 *   d^2u/dphi^2 = -u + 3M u^2 ,        u = 1/r
 *
 * whose first integral is
 *
 *   w^2 + u^2 - 2M u^3 = C',          w = du/dphi
 *
 * with C' fixed by the initial direction. That first integral is conserved exactly, so its
 * drift along an integrated ray is a direct measure of integrator error — which is what
 * the test suite asserts.
 *
 * Two details that are easy to get wrong and are the reason this file exists:
 *
 *   1. The angle psi between the ray and the outward radial direction satisfies
 *      sin(psi) = (b/r) * sqrt(1 - 2M/r), NOT sin(psi) = b/r. The extra sqrt(f) is the
 *      difference between the areal radius and a proper radial distance, and dropping it
 *      puts every ray on the wrong trajectory.
 *
 *   2. dt/dphi = r^2 / (b (1 - 2Mu)) is NOT constant. Only E and L are conserved. Treating
 *      dt/dphi as constant produces a plausible-looking but wrong redshift.
 */

export interface NullGeodesicOptions {
  /** Impact parameter b = L/E, in metres. */
  b: number;
  /** Central mass in geometric metres. */
  M: number;
  /** Radius at which the ray starts. Should be large compared to M. */
  r0: number;
  /** Radius at which the ray counts as escaped. Defaults to r0 * 1e3. */
  rMax?: number;
  /**
   * Step size in phi. Defaults to 1e-4, which is small enough to resolve a 4M/b
   * deflection to four figures. The shader deliberately uses a far coarser step, because
   * it only needs the arriving direction, not the deflection angle.
   */
  dPhi?: number;
  /** Hard step cap. Defaults to 400000. */
  maxSteps?: number;
  /** Overrides psi directly, for exactly radial rays where sin(psi) = 0. */
  psiOverride?: number;
}

export interface NullGeodesicResult {
  captured: boolean;
  escaped: boolean;
  /** Total change in phi, radians. */
  phiSwept: number;
  /** Deflection angle, radians. Zero for a straight line. */
  deflection: number;
  /** Proper time accumulated along the ray, in metres (c = 1). */
  properTime: number;
  /** Coordinate time elapsed, in metres. */
  coordinateTime: number;
  /** Closest approach radius, in metres. */
  rMin: number;
  /** Relative drift of the conserved first integral. The integrator's error bar. */
  invariantDrift: number;
}

const SIN_PSI_FLOOR = 1e-6;

/** The conserved quantity w^2 + u^2 - 2M u^3, evaluated at (u, w). */
export function firstIntegral(u: number, w: number, M: number): number {
  return w * w + u * u - 2 * M * u * u * u;
}

/**
 * Total angle swept by a straight line from r0 to rMax at impact parameter b. Subtracting
 * this from the geodesic's sweep gives the deflection.
 */
export function flatSweep(b: number, r0: number, rMax: number): number {
  const c = (x: number): number => Math.acos(Math.max(-1, Math.min(1, x)));
  return c(b / r0) + c(b / rMax);
}

export function nullGeodesic(opts: NullGeodesicOptions): NullGeodesicResult {
  const { b, M, r0, rMax = r0 * 1e3, dPhi = 1e-4, maxSteps = 400000, psiOverride } = opts;

  const f0 = Math.max(1 - (2 * M) / r0, 0);

  const sinRaw =
    psiOverride !== undefined ? Math.sin(psiOverride) : (Math.abs(b) / r0) * Math.sqrt(f0);
  const cosRaw =
    psiOverride !== undefined
      ? Math.cos(psiOverride)
      : -Math.sqrt(Math.max(0, 1 - Math.min(1, (Math.abs(b) / r0) ** 2 * f0)));

  const s = Math.max(Math.abs(sinRaw), SIN_PSI_FLOOR);
  const direction = sinRaw < 0 ? -1 : 1;

  let u = 1 / r0;
  // dr/dphi = r0 cos(psi)/sin(psi), and du/dphi = -(1/r^2) dr/dphi.
  let w = -cosRaw / (r0 * s);
  const invariant0 = firstIntegral(u, w, M);

  let t = 0;
  let tau = 0;
  let phi = 0;
  let rMin = r0;
  let captured = false;
  let escaped = false;

  let prevR = r0;
  let prevU = 1 / r0;
  let prevPhi = 0;
  let prevT = 0;
  let prevTau = 0;

  const impactParam = Math.abs(b) > 0 ? Math.abs(b) : r0 * s;
  const uHorizon = 1 / (2 * M);
  const uEscape = 1 / rMax;

  for (let i = 0; i < maxSteps; i++) {
    // Termination is tested in u = 1/r rather than in r. r diverges at u -> 0, so a test on
    // r overshoots past zero and misses the escape entirely once rMax is large. In u both
    // boundaries are finite and monotone.
    if (!Number.isFinite(u)) break;

    // Escape is tested before the u <= 0 break on purpose: a single step can carry u past
    // zero (it is a big relative step when uEscape is tiny), and testing escape first is
    // what makes the landing interpolation work at all.
    if (u <= uEscape && w < 0) {
      // Land exactly on u = 1/rMax. Interpolate within the step just taken; near the
      // asymptote w has almost stopped changing, so u is very nearly linear in phi and
      // this is accurate to far better than the deflection we are trying to measure.
      const du = prevU - u;
      if (du > 0) {
        const frac = Math.max(0, Math.min(1, (prevU - uEscape) / du));
        phi = prevPhi + (phi - prevPhi) * frac;
        t = prevT + (t - prevT) * frac;
        tau = prevTau + (tau - prevTau) * frac;
      }
      escaped = true;
      break;
    }

    if (u >= uHorizon) {
      captured = true;
      break;
    }
    if (u <= 0) break;

    const r = 1 / u;
    rMin = Math.min(rMin, r);
    prevU = u;
    prevPhi = phi;
    prevT = t;
    prevTau = tau;

    // RK4 on u with phi as the independent variable: u'' = -u + 3M u^2.
    const accel = (uu: number): number => -uu + 3 * M * uu * uu;

    const k1u = w;
    const k1w = accel(u);
    const k2u = w + 0.5 * dPhi * k1w;
    const k2w = accel(u + 0.5 * dPhi * k1u);
    const k3u = w + 0.5 * dPhi * k2w;
    const k3w = accel(u + 0.5 * dPhi * k2u);
    const k4u = w + dPhi * k3w;
    const k4w = accel(u + dPhi * k3u);

    u += (dPhi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
    w += (dPhi / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    phi += direction * dPhi;

    const f = 1 - (2 * M) * u;
    // dt/dphi = r^2 / (b f) and dtau/dphi = dt/dphi * sqrt(f).
    const dt = 1 / (impactParam * u * u * f);
    t += dt * dPhi;
    if (f > 0) tau += dt * Math.sqrt(f) * dPhi;
  }

  const phiSwept = Math.abs(phi);

  // Compare against the straight line that starts with the SAME angle, which means the
  // same sin(psi) and therefore b_flat = r0 sin(psi) = b sqrt(f0). Using the raw impact
  // parameter here compares two rays that leave in slightly different directions.
  const bFlat = r0 * Math.abs(sinRaw);
  const drift =
    Math.abs(firstIntegral(u, w, M) - invariant0) / Math.max(Math.abs(invariant0), 1e-30);

  return {
    captured,
    escaped,
    phiSwept,
    deflection: phiSwept - flatSweep(bFlat, r0, rMax),
    properTime: tau,
    coordinateTime: t,
    rMin,
    invariantDrift: drift,
  };
}

/** The M = 0 control, used as a test oracle and as the shader's flat-spacetime path. */
export function straightRay(opts: {
  b: number;
  r0: number;
  rMax?: number;
}): { captured: boolean; escaped: boolean; phiSwept: number; deflection: number } {
  const rMax = opts.rMax ?? opts.r0 * 1e3;
  return {
    captured: false,
    escaped: true,
    phiSwept: flatSweep(opts.b, opts.r0, rMax),
    deflection: 0,
  };
}

/**
 * Radial free fall from rest at r0 down to r1, in metres of proper time (c = 1).
 * Re-exported from schwarzschild.ts rather than reimplemented — one formula, one place.
 */
export function radialFreeFall(opts: {
  r0: number;
  r1: number;
  M: number;
  steps?: number;
}): number {
  const { r0, r1, M, steps = 8192 } = opts;
  return freeFallProperTime(r0, r1, M, steps);
}