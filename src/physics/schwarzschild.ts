/**
 * Schwarzschild geometry in geometric units (G = c = 1), where a mass M and a length both
 * carry metres. The lapse and metric components are pure functions of r, so the same
 * functions serve the shader's CPU twin and the HUD readouts.
 *
 *   ds^2 = -(1 - 2M/r) dt^2 + (1 - 2M/r)^-1 dr^2 + r^2 dOmega^2
 */

import { R_HORIZON, R_PHOTON_SPHERE } from './constants';

/** Lapse alpha(r) = sqrt(1 - 2M/r). NaN inside the horizon, where it is imaginary. */
export function gravity(r: number, M: number): number {
  return Math.sqrt(1 - (2 * M) / r);
}

/** True at or inside the event horizon r = 2M. */
export function isHorizon(r: number, M: number): boolean {
  return r <= 2 * M;
}

/** dtau/dt for an observer holding station at r. Equals the lapse. */
export function staticClockRate(r: number, M: number): number {
  return gravity(r, M);
}

/**
 * dtau/dt on a circular geodesic orbit of areal radius r: sqrt(1 - 3M/r).
 * Exists for r > 3M; stable only for r >= 6M.
 */
export function circularOrbitRate(r: number, M: number): number {
  return Math.sqrt(1 - (3 * M) / r);
}

/** Coordinate-time angular velocity Omega = sqrt(M / r^3). */
export function orbitalAngularVelocity(r: number, M: number): number {
  return Math.sqrt(M / (r * r * r));
}

/** Proper acceleration required to hold station at r. Undefined at the horizon. */
export function properAcceleration(r: number, M: number): number {
  return M / (r * r * Math.sqrt(1 - (2 * M) / r));
}

/** Radial tidal acceleration per unit height, geometric units. Negative means stretch. */
export function tidalAcceleration(r: number, M: number, height: number): number {
  return (-2 * M * height) / (r * r * r);
}

/** Transverse tidal acceleration per unit height. Positive means squeeze. */
export function transverseTidalAcceleration(
  r: number,
  M: number,
  height: number,
): number {
  return (M * height) / (r * r * r);
}

/** nu_obs / nu_emit = alpha_emit / alpha_obs for a static emitter and observer. */
export function redshiftStatic(rEmit: number, rObs: number, M: number): number {
  return gravity(rEmit, M) / gravity(rObs, M);
}

/** Proper period of a circular geodesic, in metres (c = 1). */
export function circularOrbitProperPeriod(r: number, M: number): number {
  return ((2 * Math.PI) / orbitalAngularVelocity(r, M)) * circularOrbitRate(r, M);
}

export function iscoRadius(M: number): number {
  return 6 * M;
}

export function horizonRadius(M: number): number {
  return R_HORIZON * M;
}

export function photonSphereRadius(M: number): number {
  return R_PHOTON_SPHERE * M;
}

/**
 * Proper time for radial free fall from rest at r0 down to radius r.
 *
 *   (dr/dtau)^2 = E^2 - 1 + 2M/r,    E = 1 - 2M/r0
 *
 * The integrand is singular as 1/sqrt(r0 - r) at the turning point, so we substitute
 * r = r0 sin^2(s), which regularises it exactly. In the weak field this must reduce to
 * Newtonian free fall, sqrt(2 (r0 - r) / g) with g = M/r0^2.
 */
export function freeFallProperTime(r0: number, r: number, M: number, steps = 8192): number {
  if (r0 <= 2 * M || r > r0 || r <= 0) return Number.NaN;
  const target = Math.max(r, 2 * M);
  const E = 1 - (2 * M) / r0;
  const prefactor = (2 * Math.pow(r0, 1.5)) / Math.sqrt(2 * M);

  const s1 = Math.asin(Math.sqrt(Math.min(1, target / r0)));
  const dS = s1 / steps;

  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const s = dS * (i + 0.5);
    const sinS = Math.sin(s);
    const rr = r0 * sinS * sinS;
    const v = E * E - 1 + (2 * M) / rr;
    if (v <= 0) return Number.NaN;
    sum += (sinS * sinS) / Math.sqrt(v);
  }
  return prefactor * sum * dS;
}