/**
 * Morris-Thorne traversable wormhole.
 *
 *   ds^2 = -c^2 dt^2 + dl^2 + b^2 cosh^2(l/b) dOmega^2,    l in (-inf, +inf)
 *
 * Two facts this module exists to make impossible to get wrong:
 *
 *   1. Phi(r) = 0, so g_tt = -c^2 and the lapse is exactly 1 everywhere. There is no
 *      time dilation and no horizon. Pop-science wormholes that dilate time describe a
 *      different spacetime.
 *
 *   2. The famous "embedding diagram" is the graph of the metric functions,
 *      rho(l) = b cosh(l/b), revolved about the axis. That surface is a catenoid, whose
 *      own intrinsic curvature is -1/(b^2 cosh^4(l/b)) — NOT the metric's -1/b^2. The
 *      picture is a plot of the functions, not an isometric embedding of the geometry.
 *      The true isometric embedding is Beltrami's pseudosphere.
 */

import { C_LIGHT } from '../core/units';

/** Areal radius as a function of proper distance from the throat. */
export function arealRadius(l: number, b: number): number {
  return b * Math.cosh(l / b);
}

function acosh(x: number): number {
  return x <= 1 ? 0 : Math.log(x + Math.sqrt(x * x - 1));
}

/** Unsigned proper distance from the throat to areal radius r. */
export function properDistance(r: number, b: number): number {
  return b * acosh(Math.max(r, b) / b);
}

/**
 * Gaussian curvature of the 2-surface with line element dl^2 + r(l)^2 dPhi^2.
 * For that line element K = -r''/r. With r = b cosh(l/b), r'' = r/b^2, so K = -1/b^2
 * everywhere: a patch of the hyperbolic plane H^2, with the throat as its equator.
 */
export function gaussianCurvature(_r: number, b: number): number {
  return -1 / (b * b);
}

/**
 * Intrinsic curvature of the *catenoid* render, rho = b cosh(l/b) revolved about its axis:
 * K = -1/(b^2 cosh^4(l/b)). Exposed so the UI can print both curvatures side by side and
 * let the difference be seen rather than argued.
 */
export function catenoidCurvature(l: number, b: number): number {
  const c = Math.cosh(l / b);
  return -1 / (b * b * Math.pow(c, 4));
}

/**
 * Beltrami pseudosphere meridian, revolved about the x axis, for the isometric render.
 * Lies on the circle (x - b)^2 + z^2 = b^2 and has K = -1/b^2 exactly.
 */
export function pseudosphereMeridian(l: number, b: number): { x: number; z: number } {
  const u = l / b;
  return { x: b * (1 + Math.cos(u)), z: b * Math.sin(u) };
}

/**
 * Coordinate time for an axial path of proper half-length L, in seconds.
 *
 * Along the wormhole axis the line element reduces to ds^2 = -c^2 dt^2 + dl^2 — a flat
 * two-dimensional slice — so the transit is exactly 2L/c. The wormhole buys distance,
 * not time.
 */
export function axialTraversalTime(L: number, _b: number): number {
  return (2 * L) / C_LIGHT;
}

export function pathLengthComparison(L: number): {
  through: number;
  around: number;
  ratio: number;
} {
  return { through: 2 * L, around: 4 * L, ratio: 2 };
}

/** Radial tidal acceleration on a traveller of height h at the throat, in m/s^2. */
export function throatTidalAcceleration(b: number, height: number): number {
  return (C_LIGHT * C_LIGHT * height) / (2 * b * b);
}

/** Smallest throat radius keeping a traveller of height h under `limit` m/s^2. */
export function minimumThroatForComfort(height: number, limit: number): number {
  if (limit <= 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt((C_LIGHT * C_LIGHT * height) / (2 * limit));
}

/**
 * Energy density at the throat. The shape function of the MT wormhole is the constant b,
 * so b'(r) = 0 and rho = b'/(8 pi r^2) vanishes at r = b.
 */
export function throatEnergyDensity(_b: number): number {
  return 0;
}

/**
 * Surface tension at the throat: tau = (b/r - 2(r-b) Phi')/(8 pi r^2). With Phi' = 0 and
 * r = b this is 1/(8 pi b), which exceeds rho c^2 = 0. Every energy condition fails.
 */
export function throatTension(b: number): number {
  return 1 / (8 * Math.PI * b);
}

/** Lorentz factor of a traveller threading the throat at speed beta. */
export function throatTravellerGamma(beta: number): number {
  return 1 / Math.sqrt(Math.max(1e-12, 1 - beta * beta));
}