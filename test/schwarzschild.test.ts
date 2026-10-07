import { describe, expect, it } from 'vitest';
import { B_CRIT, R_HORIZON, R_ISCO, R_PHOTON_SPHERE } from '../src/physics/constants';
import {
  circularOrbitProperPeriod,
  circularOrbitRate,
  gravity,
  isHorizon,
  orbitalAngularVelocity,
  redshiftStatic,
  staticClockRate,
  tidalAcceleration,
  transverseTidalAcceleration,
} from '../src/physics/schwarzschild';

describe('lapse', () => {
  it('is sqrt(1 - 2M/r)', () => {
    expect(gravity(6, 1)).toBeCloseTo(Math.sqrt(1 - 2 / 6), 12);
    expect(gravity(3, 1)).toBeCloseTo(Math.sqrt(1 / 3), 12);
  });

  it('vanishes at the horizon', () => {
    expect(gravity(R_HORIZON, 1)).toBeCloseTo(0, 12);
  });

  it('is imaginary inside the horizon', () => {
    expect(Number.isNaN(gravity(1.5, 1))).toBe(true);
  });

  it('tends to 1 at infinity', () => {
    // sqrt(1 - 2e-9) is 1 - 1e-9, so the honest tolerance here is 8 decimal places.
    expect(gravity(1e9, 1)).toBeCloseTo(1, 8);
  });

  it('is independent of M at fixed r/M', () => {
    expect(gravity(20, 3)).toBeCloseTo(gravity(20 / 3, 1), 12);
  });
});

describe('static clock', () => {
  it('is 0.8165 at the ISCO', () => {
    expect(staticClockRate(6, 1)).toBeCloseTo(0.816496580927726, 10);
  });
});

describe('circular orbit clock', () => {
  it('is sqrt(1 - 3M/r)', () => {
    expect(circularOrbitRate(6, 1)).toBeCloseTo(Math.sqrt(0.5), 10);
  });

  it('gives the 0.8660 ratio against the static clock at the ISCO', () => {
    expect(circularOrbitRate(R_ISCO, 1) / staticClockRate(R_ISCO, 1)).toBeCloseTo(
      0.8660254037844387,
      10,
    );
  });

  it('is zero at the photon sphere', () => {
    expect(circularOrbitRate(R_PHOTON_SPHERE, 1)).toBeCloseTo(0, 12);
  });

  it('agrees with the static clock at infinity', () => {
    expect(circularOrbitRate(1e9, 1)).toBeCloseTo(1, 8);
  });
});

describe('orbital angular velocity', () => {
  it('is sqrt(M/r^3)', () => {
    expect(orbitalAngularVelocity(6, 1)).toBeCloseTo(Math.sqrt(1 / 216), 12);
  });
});

describe('proper period', () => {
  it('is shorter than the coordinate period', () => {
    expect(circularOrbitProperPeriod(10, 1)).toBeLessThan(
      (2 * Math.PI) / orbitalAngularVelocity(10, 1),
    );
  });
});

describe('horizon test', () => {
  it('detects the horizon exactly', () => {
    // Anything at or below 2M is inside; there is no physical surface just outside.
    expect(isHorizon(2.000001, 1)).toBe(false);
    expect(isHorizon(2, 1)).toBe(true);
    expect(isHorizon(1.999999, 1)).toBe(true);
    expect(isHorizon(1.9, 1)).toBe(true);
  });

  it('scales the horizon with mass', () => {
    expect(isHorizon(2 * 1477, 1477)).toBe(true);
    expect(isHorizon(2 * 1477 + 1, 1477)).toBe(false);
  });
});

describe('redshift', () => {
  it('is unity when emitter and observer coincide', () => {
    expect(redshiftStatic(10, 10, 1)).toBeCloseTo(1, 12);
  });

  it('redshifts light climbing out of a well', () => {
    expect(redshiftStatic(6, 1000, 1)).toBeLessThan(1);
    expect(redshiftStatic(1000, 6, 1)).toBeGreaterThan(1);
  });
});

describe('tidal acceleration', () => {
  it('is -2M h / r^3 radially', () => {
    expect(tidalAcceleration(10, 1, 2)).toBeCloseTo(-4 / 1000, 12);
  });

  it('is +M h / r^3 transversely', () => {
    expect(transverseTidalAcceleration(10, 1, 2)).toBeCloseTo(2 / 1000, 12);
  });

  it('shrinks as the cube of distance', () => {
    expect(Math.abs(tidalAcceleration(20, 1, 2))).toBeCloseTo(
      Math.abs(tidalAcceleration(10, 1, 2)) / 8,
      12,
    );
  });
});

describe('shadow constant', () => {
  it('is 3*sqrt(3) M', () => {
    expect(B_CRIT).toBeCloseTo(5.196152422706632, 12);
  });
});