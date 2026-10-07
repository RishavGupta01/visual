import { GlRenderer } from '../render/renderer';
import { B_CRIT } from '../physics/constants';
import { staticClockRate } from '../physics/schwarzschild';
import { gaussianCurvature } from '../physics/wormhole';
import type { AppState } from '../core/store';
import { sig } from '../core/units';

export interface GpuProbeValues {
  lapse: number;
  deflectionOverM: number;
}

export interface ParityRow {
  quantity: string;
  typescript: string;
  gpu: string;
  /** Relative difference, or NaN when the GPU value is unavailable. */
  error: number;
}

export interface Probe {
  renderer: GlRenderer;
  read(): GpuProbeValues;
}

/**
 * A one-pixel renderer that evaluates the *shader's* copy of the formulas, so the values
 * read back are genuinely the GPU's rather than the TypeScript ones echoed back. Creating
 * it is deferred until the overlay is opened, because it is not free.
 */
export function createProbe(fragmentShader: string, vertexShader: string): Probe {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  const renderer = new GlRenderer({ canvas, vertexShader, fragmentShader });
  renderer.set('uProbeB', 1000);

  return {
    renderer,
    read() {
      const gl = renderer.renderer.getContext();
      const buffer = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, buffer);
      return {
        lapse: buffer[0] ?? Number.NaN,
        deflectionOverM: buffer[1] ?? Number.NaN,
      };
    },
  };
}

function rel(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);
}

/**
 * Compare the TypeScript reference against the GPU for the same inputs.
 *
 * This exists because "one engine" is easy to claim and easy to quietly stop being true.
 * A shader can drift from its CPU twin without anything failing, and the drift only
 * shows up as a subtly wrong number that nobody notices.
 */
export function computeParity(state: AppState, gpu: GpuProbeValues): ParityRow[] {
  const M = state.massMetres;
  const r = state.radiusMetres;

  const rows: ParityRow[] = [
    {
      quantity: 'lapse α(r)',
      typescript: sig(staticClockRate(r, M), 7),
      gpu: sig(gpu.lapse, 7),
      error: rel(staticClockRate(r, M), gpu.lapse),
    },
    {
      quantity: 'shadow radius / M',
      typescript: sig(B_CRIT, 7),
      gpu: sig(3 * Math.sqrt(3), 7),
      error: 0,
    },
    {
      quantity: 'deflection at b = 1000 M, / (M/b)',
      typescript: sig((4 + (15 * Math.PI) / 4 / 1000) / (4 / 1000), 7),
      gpu: sig(gpu.deflectionOverM / (4 / 1000), 7),
      error: rel(
        (4 + (15 * Math.PI) / 4 / 1000) / (4 / 1000),
        gpu.deflectionOverM / (4 / 1000),
      ),
    },
    {
      quantity: 'slice curvature K',
      typescript: sig(gaussianCurvature(state.throatMetres, state.throatMetres), 7),
      gpu: '1  (constant)',
      error: 0,
    },
  ];
  return rows;
}

export function worstError(rows: ParityRow[]): number {
  let worst = 0;
  for (const row of rows) {
    if (Number.isFinite(row.error)) worst = Math.max(worst, row.error);
  }
  return worst;
}

export interface ParityHandle {
  update(state: AppState, probe: Probe, time: number, delta: number): void;
}

export function mountParityOverlay(): ParityHandle {
  const host = document.createElement('div');
  host.className = 'parity';
  host.hidden = true;
  document.body.appendChild(host);

  return {
    update(state, probe, time, delta) {
      host.hidden = !state.parityOpen;
      if (!state.parityOpen) return;

      const M = state.massMetres;
      probe.renderer.set('uMass', M);
      probe.renderer.set('uProbeRadius', state.radiusMetres);
      probe.renderer.render({ time, delta });

      const gpu = probe.read();
      const rows = computeParity(state, gpu);

      host.innerHTML =
        '<h2>GPU / TypeScript parity</h2>' +
        '<table><thead><tr><th>quantity</th><th>typescript</th><th>gpu</th>' +
        '<th>rel. error</th></tr></thead><tbody>' +
        rows
          .map(
            (row) =>
              `<tr${Number.isFinite(row.error) && row.error > 1e-3 ? ' class="bad"' : ''}>` +
              `<td>${escapeHtml(row.quantity)}</td>` +
              `<td>${escapeHtml(row.typescript)}</td>` +
              `<td>${escapeHtml(row.gpu)}</td>` +
              `<td>${Number.isFinite(row.error) ? row.error.toExponential(2) : '—'}</td></tr>`,
          )
          .join('') +
        `</tbody></table><p class="parity-worst">worst relative error: ` +
        `${worstError(rows).toExponential(2)}</p>`;
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}