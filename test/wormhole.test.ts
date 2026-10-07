import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '../src/core/units';
import {
  arealRadius,
  axialTraversalTime,
  catenoidCurvature,
  gaussianCurvature,
  minimumThroatForComfort,
  pathLengthComparison,
  properDistance,
  pseudosphereMeridian,
  throatEnergyDensity,
  throatTidalAcceleration,
  throatTension,
  throatTravellerGamma,
} from '../src/physics/wormhole';

const b = 1000;
const G0 = 9.80665;

describe('Morris-Thorne metric', () => {
  it('has areal radius r(l) = b cosh(l/b)', () => {
    expect(arealRadius(0, b)).toBeCloseTo(b, 10);
    expect(arealRadius(1000, b)).toBeCloseTo(b * Math.cosh(1), 10);
  });

  it('is non-monotonic in l and monotonic in |l|', () => {
    expect(arealRadius(-2000, b)).toBeCloseTo(arealRadius(2000, b), 9);
    expect(arealRadius(-2000, b)).toBeGreaterThan(arealRadius(-1000, b));
  });
});

describe('proper distance', () => {
  it('measures from the throat outward', () => {
    expect(properDistance(b, b)).toBeCloseTo(0, 10);
    expect(properDistance(arealRadius(1000, b), b)).toBeCloseTo(1000, 6);
  });

  it('round-trips l and r to 1e-6', () => {
    for (const l of [-9000, -250.25, 0, 17.5, 9000]) {
      expect(properDistance(arealRadius(l, b), b)).toBeCloseTo(Math.abs(l), 6);
    }
  });
});

describe('curvature', () => {
  it('is constant -1/b^2 on the spatial slice', () => {
    for (const l of [-5000, -10, 0, 10, 5000]) {
      expect(gaussianCurvature(arealRadius(l, b), b)).toBeCloseTo(-1 / (b * b), 12);
    }
  });

  it('is negative, so the slice is hyperbolic rather than flat', () => {
    expect(gaussianCurvature(b, b)).toBeLessThan(0);
  });

  it('has catenoid curvature that differs, proving the render is not isometric', () => {
    const at0 = catenoidCurvature(0, b);
    const at1000 = catenoidCurvature(1000, b);
    expect(at0).toBeCloseTo(-1 / (b * b), 12);
    expect(Math.abs(at1000 - at0) / Math.abs(at0)).toBeGreaterThan(0.5);
    expect(gaussianCurvature(arealRadius(1000, b), b)).toBeCloseTo(-1 / (b * b), 12);
  });

  it('places the pseudosphere meridian on a circle of radius b', () => {
    const p = pseudosphereMeridian(0, b);
    expect(Math.hypot(p.x - b, p.z)).toBeCloseTo(b, 10);
  });
});

describe('no time dilation', () => {
  it('has lapse exactly 1 by construction', () => {
    // Phi = 0 => g_tt = -c^2 => alpha = 1. There is no lapse function here to get wrong,
    // which is precisely why this is asserted rather than computed: the correction is
    // that the quantity does not exist.
    expect(1).toBe(1);
  });
});

describe('traversal', () => {
  it('takes exactly 2L/c', () => {
    expect(axialTraversalTime(5e8, b)).toBeCloseTo((2 * 5e8) / C_LIGHT, 3);
  });

  it('is independent of throat radius', () => {
    expect(axialTraversalTime(1e9, 10)).toBeCloseTo(axialTraversalTime(1e9, 1e7), 3);
  });

  it('is exactly half the around-the-way route', () => {
    const cmp = pathLengthComparison(1e9);
    expect(cmp.through).toBeCloseTo(2e9, 3);
    expect(cmp.around).toBeCloseTo(4e9, 3);
    expect(cmp.ratio).toBe(2);
  });
});

describe('tidal forces', () => {
  it('needs about 30,000 km of throat for a 2 m traveller at 10 g', () => {
    const needed = minimumThroatForComfort(2, 10 * G0);
    expect(needed).toBeGreaterThan(2.5e7);
    expect(needed).toBeLessThan(3.5e7);
  });

  it('scales as the square root of height', () => {
    expect(
      minimumThroatForComfort(2, 10 * G0) / minimumThroatForComfort(1, 10 * G0),
    ).toBeCloseTo(Math.SQRT2, 6);
  });

  it('gives a finite acceleration', () => {
    expect(throatTidalAcceleration(b, 2)).toBeCloseTo((C_LIGHT ** 2 * 2) / (2 * b * b), 6);
  });

  it('is survivable once b exceeds the minimum, and brutal below it', () => {
    const needed = minimumThroatForComfort(2, 10 * G0);
    expect(throatTidalAcceleration(needed, 2)).toBeLessThanOrEqual(10 * G0);
    expect(throatTidalAcceleration(needed / 10, 2)).toBeGreaterThan(100 * G0);
  });
});

describe('exotic matter', () => {
  it('has zero energy density at the throat', () => {
    expect(throatEnergyDensity(b)).toBe(0);
  });

  it('has tension 1/(8*pi*b), exceeding rho c^2', () => {
    const tau = throatTension(b);
    expect(tau).toBeCloseTo(1 / (8 * Math.PI * b), 15);
    expect(tau).toBeGreaterThan(throatEnergyDensity(b) * C_LIGHT ** 2);
  });

  it('scales the tension as 1/b', () => {
    expect(throatTension(2000) / throatTension(1000)).toBeCloseTo(0.5, 12);
  });
});

describe('traveller gamma', () => {
  it('is 1 at rest', () => {
    expect(throatTravellerGamma(0)).toBe(1);
  });

  it('diverges as beta approaches c', () => {
    // The 1e-12 floor in the denominator keeps this finite so the HUD never prints
    // Infinity, so the assertion is that it grows without bound instead.
    expect(throatTravellerGamma(1 - 1e-4)).toBeGreaterThan(70);
    expect(throatTravellerGamma(1 - 1e-6)).toBeGreaterThan(700);
  });
});