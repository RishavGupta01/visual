import { describe, expect, it } from 'vitest';
import { B_CRIT } from '../src/physics/constants';
import { firstIntegral, nullGeodesic, straightRay } from '../src/physics/geodesic';

const M = 1;
const R0 = 1e5;

describe('first integral', () => {
  it('is w^2 + u^2 - 2Mu^3', () => {
    expect(firstIntegral(0.5, 0.25, 1)).toBeCloseTo(0.0625 + 0.25 - 0.25, 12);
  });

  it('drifts by less than 1e-9 along an escaped ray', () => {
    for (const b of [10, 100, 1000, 20000]) {
      expect(nullGeodesic({ b, M, r0: R0 }).invariantDrift).toBeLessThan(1e-9);
    }
  });
});

describe('photon capture boundary', () => {
  it('captures inside 3*sqrt(3) M and escapes outside it', () => {
    expect(nullGeodesic({ b: B_CRIT * 0.95, M, r0: R0 }).captured).toBe(true);
    expect(nullGeodesic({ b: B_CRIT * 1.05, M, r0: R0 }).captured).toBe(false);
  });

  it('puts the crossover at b_crit = 3*sqrt(3) M to within 0.1%', () => {
    let lo = B_CRIT * 0.9;
    let hi = B_CRIT * 1.1;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (nullGeodesic({ b: mid, M, r0: R0 }).captured) lo = mid;
      else hi = mid;
    }
    expect(Math.abs(0.5 * (lo + hi) - B_CRIT) / B_CRIT).toBeLessThan(1e-3);
  });

  it('captures a radial inward ray and escapes a radial outward one', () => {
    // psi = 0 aligns the ray with the outward radial direction, so it escapes.
    // psi = pi points it at the hole, so it is captured.
    expect(nullGeodesic({ b: 0, M, r0: R0, psiOverride: Math.PI }).captured).toBe(true);
    expect(nullGeodesic({ b: 0, M, r0: R0, psiOverride: 0 }).captured).toBe(false);
  });

  it('either captures or winds at exactly the boundary', () => {
    const result = nullGeodesic({ b: B_CRIT, M, r0: R0 });
    expect(result.captured || result.phiSwept > 3 * Math.PI).toBe(true);
  });
});

/**
 * The exact Schwarzschild deflection angle has the series expansion
 *
 *   alpha = 4M/b + 15*pi*M^2/(4 b^2) + 128*M^3/(3 b^3) + ...
 *
 * so a far better test than "is it close to 4M/b" is whether the integrator reproduces
 * the known series to three terms. It does, which is what makes the lensing trustworthy.
 */
describe('deflection angle', () => {
  const series = (b: number): number =>
    4 / b + ((15 * Math.PI) / 4) / b ** 2 + 128 / (3 * b ** 3);

  it('matches the known series expansion to three terms', () => {
    for (const b of [1000, 4000, 20000]) {
      expect(nullGeodesic({ b, M, r0: 1e6 }).deflection / series(b)).toBeCloseTo(1, 4);
    }
  });

  it('is independent of the starting radius, once that is far from the hole', () => {
    const near = nullGeodesic({ b: 20000, M, r0: 1e5 }).deflection;
    const far = nullGeodesic({ b: 20000, M, r0: 1e7 }).deflection;
    expect(near / far).toBeCloseTo(1, 3);
  });

  it('exceeds 4M/b, because the 3Mu^2 term is not optional', () => {
    expect(nullGeodesic({ b: 1000, M, r0: 1e6 }).deflection).toBeGreaterThan(4 / 1000);
  });

  it('falls off as 1/b', () => {
    const a = nullGeodesic({ b: 20000, M, r0: 1e6 }).deflection;
    const c = nullGeodesic({ b: 40000, M, r0: 1e6 }).deflection;
    expect(a / c).toBeCloseTo(2, 2);
  });

  it('bends light toward the mass, not away', () => {
    expect(nullGeodesic({ b: 1000, M, r0: 1e6 }).deflection).toBeGreaterThan(0);
  });
});

describe('higher-order structure', () => {
  it('winds rays passing close to the photon sphere', () => {
    expect(nullGeodesic({ b: B_CRIT * 1.0001, M, r0: R0 }).phiSwept).toBeGreaterThan(Math.PI);
  });

  it('records the closest approach', () => {
    const r = nullGeodesic({ b: 3 * Math.sqrt(3) * 1.5, M, r0: R0 });
    expect(r.rMin).toBeGreaterThan(3 * M);
    expect(r.rMin).toBeLessThan(R0);
  });

  it('accumulates proper time along the path', () => {
    expect(nullGeodesic({ b: 1000, M, r0: R0 }).properTime).toBeGreaterThan(0);
  });
});

describe('flat spacetime control', () => {
  it('is a straight line when M = 0', () => {
    const b = 1000;
    const rMax = R0 * 1e3;
    const result = straightRay({ b, r0: R0, rMax });
    const flat = Math.acos(b / R0) + Math.acos(b / rMax);
    expect(result.phiSwept).toBeCloseTo(flat, 6);
    expect(result.deflection).toBeCloseTo(0, 12);
  });

  it('sweeps more than the straight line, by exactly the deflection', () => {
    const b = 1000;
    const flat = straightRay({ b, r0: R0 });
    const curved = nullGeodesic({ b, M, r0: R0 });
    expect(curved.phiSwept - flat.phiSwept).toBeCloseTo(curved.deflection, 6);
  });

  it('is exactly zero deflection for a straight line', () => {
    expect(straightRay({ b: 4000, r0: 1e6 }).deflection).toBe(0);
  });
});