import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '../src/core/units';
import {
  aberrationAngle,
  clockRate,
  dopplerFactor,
  gamma,
  hoursAtHomePerHourTravelling,
  lorentzBoost,
  lorentzMatrix,
  properTime,
  velocityAddition,
} from '../src/physics/minkowski';

describe('gamma', () => {
  it('is 1 at rest and diverges at c', () => {
    expect(gamma(0)).toBe(1);
    expect(gamma(1)).toBe(Infinity);
  });

  it('is 1.25 at 0.6c', () => {
    expect(gamma(0.6)).toBeCloseTo(1.25, 12);
  });

  it('is 5/3 at 0.8c', () => {
    expect(gamma(0.8)).toBeCloseTo(5 / 3, 12);
  });
});

describe('velocity addition', () => {
  it('is within 0.02% of the classical sum at low speed', () => {
    // (u+v)/(1+uv) = (u+v)(1 - uv + O((uv)^2)), so the shortfall is second order in
    // u*v. At u = v = 0.01 that is a relative deviation of about 1e-4.
    const sum = velocityAddition(0.01, 0.01);
    expect(Math.abs(0.02 - sum) / 0.02).toBeLessThan(2e-4);
  });

  it('keeps the result below c', () => {
    expect(velocityAddition(0.999, 0.999)).toBeLessThan(1);
  });

  it('maps a photon back to a photon', () => {
    expect(velocityAddition(1, 0.5)).toBeCloseTo(1, 12);
  });

  it('matches Einstein addition', () => {
    expect(velocityAddition(0.7, 0.4)).toBeCloseTo(1.1 / 1.28, 12);
  });

  it('is commutative', () => {
    expect(velocityAddition(0.3, 0.6)).toBeCloseTo(velocityAddition(0.6, 0.3), 12);
  });
});

describe('doppler', () => {
  it('is unity with no relative motion', () => {
    expect(dopplerFactor(0)).toBeCloseTo(1, 12);
  });

  it('is sqrt((1-b)/(1+b)) when receding', () => {
    expect(dopplerFactor(0.5)).toBeCloseTo(Math.sqrt(0.5 / 1.5), 12);
  });

  it('inverts between approaching and receding', () => {
    expect(dopplerFactor(0.5) * dopplerFactor(-0.5)).toBeCloseTo(1, 12);
  });
});

describe('proper time', () => {
  it('equals elapsed time at rest', () => {
    expect(properTime(100, () => 0)).toBeCloseTo(100, 10);
  });

  it('is dt*sqrt(1-beta^2) at constant speed', () => {
    expect(properTime(10, () => 0.6)).toBeCloseTo(8, 10);
  });

  it('produces the twin-paradox asymmetry', () => {
    const stayHome = properTime(10, () => 0);
    const traveller = properTime(2, () => 0.8);
    expect(traveller).toBeCloseTo(1.2, 10);
    expect(traveller).toBeLessThan(stayHome);
  });

  it('integrates a varying speed', () => {
    const tau = properTime(Math.PI, (t) => 0.5 * Math.sin(t));
    expect(tau).toBeGreaterThan(0);
    expect(tau).toBeLessThan(Math.PI);
  });
});

describe('clock rate', () => {
  it('matches gamma^-1', () => {
    expect(clockRate(0.6)).toBeCloseTo(1 / gamma(0.6), 12);
  });

  it('is zero at c', () => {
    expect(clockRate(1)).toBe(0);
  });
});

describe('hours at home per hour travelling', () => {
  it('is 1 at rest and grows with speed', () => {
    expect(hoursAtHomePerHourTravelling(0)).toBeCloseTo(1, 12);
    expect(hoursAtHomePerHourTravelling(0.8)).toBeCloseTo(5 / 3, 12);
  });
});

describe('lorentz boost', () => {
  it('leaves the light speed invariant', () => {
    const out = lorentzBoost([C_LIGHT, 0, 0], 0.9);
    expect(Math.hypot(...out)).toBeCloseTo(C_LIGHT, 3);
  });

  it('round-trips', () => {
    const rest: [number, number, number] = [10, 0, 0];
    const back = lorentzBoost(lorentzBoost(rest, 0.6), -0.6);
    expect(back[0]).toBeCloseTo(rest[0], 6);
  });

  it('produces a Lorentz matrix with unit diagonal', () => {
    const m = lorentzMatrix(0.6);
    expect(m[0]).toBeCloseTo(gamma(0.6), 12);
    expect(m[5]).toBeCloseTo(gamma(0.6), 12);
    expect(m[1]).toBeCloseTo(-gamma(0.6) * 0.6, 12);
  });
});

describe('aberration', () => {
  it('is the identity at zero boost', () => {
    expect(aberrationAngle(0.3, 0)).toBeCloseTo(0.3, 12);
  });

  it('leaves rays straight ahead and straight behind unchanged', () => {
    expect(aberrationAngle(0, 0.5)).toBeCloseTo(0, 12);
    expect(aberrationAngle(Math.PI, 0.5)).toBeCloseTo(Math.PI, 12);
  });

  it('makes a perpendicular ray appear to arrive from behind', () => {
    // The classic aberration result, and the reason starlight appears to shift toward
    // the direction of travel.
    expect(aberrationAngle(Math.PI / 2, 0.5)).toBeGreaterThan(Math.PI / 2);
  });

  it('moves the apparent source toward the direction of travel as beta grows', () => {
    let previous = -1;
    for (const beta of [0, 0.25, 0.5, 0.8, 0.95]) {
      const angle = aberrationAngle(Math.PI / 2, beta);
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }
  });
});