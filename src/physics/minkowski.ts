/**
 * Flat spacetime. Regime C exists to make the contrast with the curved regimes legible:
 * the lapse is exactly 1 and there is no curvature, so no ray ever bends here. The shader
 * returns the incoming direction unchanged rather than claiming otherwise.
 */

import { C_LIGHT } from '../core/units';

/** Lorentz factor. Diverges at beta = 1. */
export function gamma(beta: number): number {
  const b = Math.min(Math.abs(beta), 1);
  return 1 / Math.sqrt(1 - b * b);
}

/** Relativistic velocity addition; both arguments are fractions of c. */
export function velocityAddition(u: number, v: number): number {
  return (u + v) / (1 + u * v);
}

/** nu_obs / nu_src for a receding source. */
export function dopplerFactor(beta: number): number {
  return Math.sqrt((1 - beta) / (1 + beta));
}

/** nu_obs / nu_src for an approaching source. */
export function abDoppler(beta: number): number {
  return Math.sqrt((1 + beta) / (1 - beta));
}

/** dtau/dt for a worldline of speed beta. The SR analogue of the Schwarzschild clock rate. */
export function clockRate(beta: number): number {
  return Math.sqrt(Math.max(0, 1 - Math.min(Math.abs(beta), 1) ** 2));
}

/**
 * tau = integral over dt of sqrt(1 - beta(t)^2), with t elapsed coordinate time.
 * This integral — not anything happening at the reunion — is why the twins disagree.
 */
export function properTime(dt: number, betaAt: (t: number) => number): number {
  const steps = 512;
  const h = dt / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const b = Math.min(Math.abs(betaAt(h * (i + 0.5))), 1);
    sum += Math.sqrt(Math.max(0, 1 - b * b));
  }
  return sum * h;
}

/** Boost a three-vector of velocities in m/s along +x by beta * c. */
export function lorentzBoost(
  u: readonly [number, number, number],
  beta: number,
): [number, number, number] {
  const v = beta * C_LIGHT;
  const denom = 1 - (u[0] * v) / (C_LIGHT * C_LIGHT);
  const g = gamma(beta);
  return [u[0] / denom - v / denom, u[1] / (g * denom), u[2] / (g * denom)];
}

/** The 4x4 Lorentz boost matrix along +x, row-major. */
export function lorentzMatrix(beta: number): number[] {
  const g = gamma(beta);
  return [g, -g * beta, 0, 0, -g * beta, g, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Aberration angle of a photon arriving at angle theta (measured from +x) in a frame
 * boosted by beta along +x.
 *
 * Follows from the velocity transformation: tan(theta') = sin(theta) / (gamma (cos(theta)
 * - beta)). Note the consequence at theta = 90 degrees: a photon arriving perpendicular to
 * the motion appears to arrive from *behind* the boosted observer, which is the classic
 * aberration result and is why stars appear to shift toward the direction of travel.
 */
export function aberrationAngle(theta: number, beta: number): number {
  const g = gamma(beta);
  return Math.atan2(Math.sin(theta), g * (Math.cos(theta) - beta));
}

/** How much station time one hour of coordinate time buys at speed beta, in hours. */
export function hoursAtHomePerHourTravelling(beta: number): number {
  return 1 / clockRate(beta);
}