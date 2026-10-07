import { B_CRIT, R_ISCO } from '../physics/constants';
import { circularOrbitRate, staticClockRate } from '../physics/schwarzschild';
import { clockRate } from '../physics/minkowski';
import {
  gaussianCurvature,
  minimumThroatForComfort,
  throatTension,
} from '../physics/wormhole';
import { REGIME_META } from './equations';
import { km, sig } from '../core/units';

const G0 = 9.80665;

/**
 * When WebGL2 is missing the instrument is degraded, not broken: the equations, the
 * landmark values and the formulas all still work, because none of them ever needed a GPU.
 */
export function mountFallback(root: HTMLElement, reason: string): void {
  const sunMass = 1.477e3;

  const landmarks: [string, string, string][] = [
    ['event horizon', '2 M', `${sig(km(2 * sunMass), 4)} km for a solar-mass hole`],
    ['photon sphere', '3 M', `${sig(km(3 * sunMass), 4)} km`],
    ['ISCO', `${R_ISCO} M`, `${sig(km(R_ISCO * sunMass), 4)} km`],
    ['shadow radius', 'b = 3√3 M', `${sig(km(B_CRIT * sunMass), 4)} km`],
  ];

  root.innerHTML = `
    <div class="fallback">
      <p class="fallback-reason">${escapeHtml(reason)}</p>
      <h1>Spacetime</h1>
      <p class="fallback-lede">
        This visualiser renders four general-relativistic regimes with WebGL2. Your browser
        does not provide it, so here are the numbers the renderer would have shown.
      </p>

      <h2>Landmarks</h2>
      <table>
        <thead>
          <tr><th>feature</th><th>in units of M</th><th>for M = one solar mass</th></tr>
        </thead>
        <tbody>
          ${landmarks.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>

      <h2>Clock rates at the ISCO</h2>
      <p>static — <code>dτ/dt = √(1 − 2M/r)</code> = ${sig(staticClockRate(R_ISCO, 1), 5)}</p>
      <p>circular orbit — <code>dτ/dt = √(1 − 3M/r)</code> = ${sig(circularOrbitRate(R_ISCO, 1), 5)}</p>
      <p>ratio — <code>${sig(circularOrbitRate(R_ISCO, 1) / staticClockRate(R_ISCO, 1), 5)}</code></p>

      <h2>Light speed</h2>
      <p>Lapse is exactly <code>1</code>. Every observer measures <code>c</code>. A clock moving
      at <code>0.6 c</code> runs at <code>${sig(clockRate(0.6), 5)}</code> of station time.
      Nothing bends here, because there is nothing to bend it.</p>

      <h2>Wormhole</h2>
      <p>Lapse is exactly <code>1</code> — no time dilation, no horizon. Spatial slice
      curvature <code>K = ${sig(gaussianCurvature(1, 1), 4)} 1/m²</code> for a 1 m throat, which
      is hyperbolic, not flat. Throat tension <code>${sig(throatTension(1), 4)}</code> with zero
      energy density, so every energy condition fails.</p>
      <p>A 2 m traveller needs a throat of at least
      <code>${sig(km(minimumThroatForComfort(2, 10 * G0)), 4)} km</code> to stay under 10 g.</p>

      <h2>What each regime was</h2>
      <ol>
        ${REGIME_META.map((m) => `<li><strong>${escapeHtml(m.name)}</strong> — ${escapeHtml(m.thesis)}</li>`).join('')}
      </ol>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}