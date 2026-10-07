/** Speed of light, m/s. Exact by SI definition. */
export const C_LIGHT = 299792458;

/** Newtonian constant of gravitation, m^3 kg^-1 s^-2. */
export const G_NEWTON = 6.6743e-11;

/** Solar mass, kg. */
export const M_SUN = 1.98892e30;

/** Schwarzschild radius of a solar-mass black hole, in geometric metres. */
export const R_SUN = (G_NEWTON * M_SUN) / (C_LIGHT * C_LIGHT);

/** Convert a physical mass in kg to its Schwarzschild radius in geometric metres. */
export function massToGeometricMetres(kg: number): number {
  return (G_NEWTON * kg) / (C_LIGHT * C_LIGHT);
}

/** Metres to kilometres. */
export function km(metres: number): number {
  return metres / 1000;
}

/** Seconds to Julian years. */
export function years(seconds: number): number {
  return seconds / (365.25 * 24 * 3600);
}

/** Metres per second as a percentage of c. */
export function percentOfC(metresPerSecond: number): number {
  return (metresPerSecond / C_LIGHT) * 100;
}

/**
 * Format with `digits` significant figures and a hard character budget, so a readout
 * never reflows its width while animating.
 */
export function sig(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-3) {
    const exp = Math.floor(Math.log10(abs));
    return `${(value / Math.pow(10, exp)).toFixed(Math.max(0, digits - 1))}e${exp}`;
  }
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(abs)));
  return value.toFixed(Math.min(decimals, 6));
}