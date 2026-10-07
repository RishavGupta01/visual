import { C_LIGHT, km, sig } from '../core/units';
import { B_CRIT } from '../physics/constants';
import { circularOrbitRate, freeFallProperTime, staticClockRate } from '../physics/schwarzschild';
import { clockRate, gamma } from '../physics/minkowski';
import {
  arealRadius,
  catenoidCurvature,
  gaussianCurvature,
  minimumThroatForComfort,
  throatTidalAcceleration,
  throatTension,
} from '../physics/wormhole';
import type { AppState } from '../core/store';
import { regimeMeta } from './equations';

const G0 = 9.80665;

export interface Readout {
  key: string;
  label: string;
  value: string;
  emphasis?: boolean;
}

/**
 * Every number the HUD shows, computed by the same physics module the shader mirrors.
 * There is deliberately no separate "display formula" that could drift from the render.
 */
export function computeReadouts(state: AppState, elapsed: number): Readout[] {
  const M = state.massMetres;
  const r = state.radiusMetres;

  switch (state.regime) {
    case 0:
    case 1: {
      const staticRate = staticClockRate(r, M);
      const orbitRate = circularOrbitRate(r, M);
      const ratio = orbitRate / staticRate;
      const rows: Readout[] = [
        { key: 'r', label: 'areal radius r', value: `${sig(km(r), 4)} km  ·  ${sig(r / M, 4)} M` },
        { key: 'alpha', label: 'lapse α', value: sig(staticRate, 5) },
        { key: 'orbit', label: 'orbit dτ/dt', value: sig(orbitRate, 5) },
        { key: 'ratio', label: 'orbit / static', value: sig(ratio, 5), emphasis: true },
        { key: 'shadow', label: 'shadow radius', value: `${sig(km(B_CRIT * M), 4)} km` },
        { key: 'elapsed', label: 'elapsed t', value: `${sig(elapsed, 5)} s` },
      ];
      if (state.regime === 1) {
        rows.push({
          key: 'divergence',
          label: 'one hour here =',
          value: staticRate > 0 ? `${sig(1 / ratio, 4)} hours there` : '∞',
          emphasis: true,
        });
        const fall = freeFallProperTime(r, 2 * M, M);
        rows.push({
          key: 'freefall',
          label: 'free fall τ to horizon',
          value: Number.isFinite(fall) ? `${sig(fall, 4)} s` : '—',
        });
        const omega = Math.sqrt(M / (r * r * r));
        rows.push({
          key: 'orbitBeta',
          label: 'orbit speed',
          value: `${sig((omega * r) / C_LIGHT, 4)} c`,
        });
      }
      return rows;
    }

    case 2: {
      const beta = state.boostBeta;
      return [
        { key: 'beta', label: 'frame speed β', value: `${sig(beta, 4)} c` },
        { key: 'vspeed', label: 'observer speed', value: `${sig(km(beta * C_LIGHT), 5)} km/s` },
        { key: 'gamma', label: 'γ', value: sig(gamma(beta), 5) },
        { key: 'clock', label: 'clock rate √(1−β²)', value: sig(clockRate(beta), 5), emphasis: true },
        { key: 'c', label: 'photon speed measured', value: 'c  (exactly)', emphasis: true },
        { key: 'lapse', label: 'lapse α', value: '1  (flat spacetime)' },
        { key: 'elapsed', label: 'elapsed t', value: `${sig(elapsed, 5)} s` },
      ];
    }

    case 3: {
      const b = state.throatMetres;
      return [
        { key: 'b', label: 'throat radius b', value: `${sig(km(b), 4)} km` },
        { key: 'lapse', label: 'lapse α', value: '1  (exactly)', emphasis: true },
        { key: 'K', label: 'slice curvature K', value: `${sig(gaussianCurvature(b, b), 4)} 1/m²` },
        {
          key: 'Krender',
          label: state.embedding === 'catenoid' ? 'render K (catenoid)' : 'render K (pseudosphere)',
          value: `${sig(catenoidCurvature(2000, b), 4)} 1/m²`,
        },
        {
          key: 'tidal',
          label: 'tidal a (2 m)',
          value: `${sig(throatTidalAcceleration(b, 2) / G0, 4)} g`,
          emphasis: true,
        },
        {
          key: 'minb',
          label: 'min b for 10 g',
          value: `${sig(km(minimumThroatForComfort(2, 10 * G0)), 4)} km`,
        },
        { key: 'tau', label: 'throat tension τ', value: sig(throatTension(b), 4) },
        {
          key: 'mouth',
          label: 'areal radius at l = 2b',
          value: `${sig(km(arealRadius(2 * b, b)), 4)} km`,
        },
      ];
    }

    default:
      return [];
  }
}

export interface HudHandle {
  update(state: AppState, elapsed: number): void;
}

export function mountHud(root: HTMLElement): HudHandle {
  root.innerHTML = `
    <header class="hud-top">
      <p class="regime-index"></p>
      <h1 class="regime-name"></h1>
      <p class="regime-thesis"></p>
    </header>
    <section class="hud-readouts" aria-live="polite" aria-label="Live physical readouts"></section>
    <div class="hud-legend" aria-hidden="true"></div>
  `;

  const indexEl = root.querySelector<HTMLElement>('.regime-index')!;
  const nameEl = root.querySelector<HTMLElement>('.regime-name')!;
  const thesisEl = root.querySelector<HTMLElement>('.regime-thesis')!;
  const readoutsEl = root.querySelector<HTMLElement>('.hud-readouts')!;
  const legendEl = root.querySelector<HTMLElement>('.hud-legend')!;
  const cache = new Map<string, HTMLElement>();
  let lastRegime = -1;

  return {
    update(state, elapsed) {
      const meta = regimeMeta(state.regime);
      if (state.regime !== lastRegime) {
        lastRegime = state.regime;
        indexEl.textContent = String(state.regime + 1).padStart(2, '0');
        nameEl.textContent = meta.name;
        thesisEl.textContent = meta.thesis;
      }

      const rows = computeReadouts(state, elapsed);
      const live = new Set(rows.map((row) => row.key));

      for (const row of rows) {
        let el = cache.get(row.key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'readout enter';
          el.style.animationDelay = `${readoutsEl.children.length * 30}ms`;
          el.innerHTML =
            '<span class="readout-label"></span><span class="readout-value"></span>';
          readoutsEl.appendChild(el);
          cache.set(row.key, el);
        }
        el.classList.toggle('emphasis', row.emphasis === true);
        const label = el.children[0];
        const value = el.children[1];
        if (label) label.textContent = row.label;
        if (value) value.textContent = row.value;
      }

      for (const [key, el] of cache) {
        if (!live.has(key)) {
          el.remove();
          cache.delete(key);
        }
      }

      renderLegend(legendEl, state);
    },
  };
}

/** A scale ruler marking the landmark radii, positioned linearly in r/M. */
function renderLegend(root: HTMLElement, state: AppState): void {
  if (state.regime > 1) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  const maxInM = 12;
  const marks: [string, number, string][] = [
    ['2M', 2, 'ember'],
    ['3M', 3, 'amber'],
    ['6M', 6, 'ice'],
  ];
  if (state.regime === 1) {
    marks.push([`r = ${sig(state.radiusMetres / state.massMetres, 3)} M`,
      state.radiusMetres / state.massMetres, 'bone']);
  }

  root.innerHTML =
    '<div class="legend-track"></div>' +
    marks
      .map(([label, valueInM, tone]) => {
        const pct = Math.max(0, Math.min(100, (valueInM / maxInM) * 100));
        return (
          `<div class="legend-mark tone-${tone}" style="left:${pct.toFixed(2)}%">` +
          '<span class="legend-tick"></span>' +
          `<span class="legend-label">${label}</span></div>`
        );
      })
      .join('');
}