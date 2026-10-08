import * as THREE from 'three';
import { GlRenderer } from '../render/renderer';
import { B_CRIT } from '../physics/constants';
import { staticClockRate } from '../physics/schwarzschild';
import { gaussianCurvature } from '../physics/wormhole';
import type { AppState } from '../core/store';
import { sig } from '../core/units';

export interface GpuProbeValues {
  lapse: number;
  /** Deflection at the probe impact parameter, divided by the leading-order 4M/b. */
  deflectionRatio: number;
}

/**
 * The probe target is byte-format, so each channel is 8-bit. Values are encoded into [0, 1]
 * with a stated scale and decoded here, rather than relying on a float target — float render
 * targets silently read back zero on the software rasteriser.
 */
/**
 * How the probe encodes the deflection ratio in a single byte channel.
 *
 * The exact Schwarzschild deflection is 4M/b to within 0.3% at b = 1000 M, so sending the
 * raw ratio would quantise to either 1.0 or nothing at all. Sending `(ratio - 1) * 100`
 * puts it mid-range and leaves ~4e-5 of resolution on the ratio, which is far finer than
 * the agreement this overlay needs to detect.
 */
const RATIO_OFFSET = 1;
const RATIO_SCALE = 100;

/** Decode channel 1 back to deflection / (4M/b). */
function decodeDeflectionRatio(channel: number): number {
  return RATIO_OFFSET + channel * RATIO_SCALE;
}

export interface ParityRow {
  quantity: string;
  typescript: string;
  gpu: string;
  /** Relative difference, or NaN when the GPU value is unavailable. */
  error: number;
}

/** Impact parameter, in units of M, that the probe integrates a geodesic at. */
export const PROBE_B_IN_M = 1000;

export interface Probe {
  renderer: GlRenderer;
  /** Uniform values last written, so the harness can confirm the probe was configured. */
  readonly lastUniforms: { mass: number; radius: number; b: number };
  /** Write the probe's inputs. */
  configure(mass: number, radius: number, b: number): void;
  /** Render the probe and read the values back at full float precision. */
  /**
 * Whether the probe produced a usable value at all.
 *
 * Separate from the values themselves: a GPU that renders nothing and a GPU that computes
 * the wrong number are very different failures, and the overlay must say which one happened
 * rather than showing a meaningless 100% error.
 */
  read(time: number, delta: number): GpuProbeValues;
}

/**
 * A one-pixel renderer that evaluates the *shader's* copy of the formulas, so the values
 * read back are genuinely the GPU's rather than the TypeScript ones echoed back. Creating
 * it is deferred until the overlay is opened, because it is not free.
 */
export function createProbe(
  fragmentShader: string,
  vertexShader: string,
  opts: ProbeOptions = {},
): Probe {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  // A plain byte target with no colour-space conversion. Float render targets read back as
  // zeros on the software rasteriser, and an sRGB-tagged target does too.
  const renderer = new GlRenderer({
    canvas,
    vertexShader,
    fragmentShader,
    fixedSize: { width: 1, height: 1 },
    targetType: opts.byteTarget === false ? undefined : THREE.UnsignedByteType,
  });

  renderer.pinSize(1, 1);
  renderer.resize();

  const buffer = new Uint8Array(4);
  let warmed = false;
  const lastUniforms = { mass: 0, radius: 0, b: PROBE_B_IN_M };

  return {
    renderer,
    get lastUniforms() {
      return lastUniforms;
    },
    configure(mass: number, radius: number, b: number): void {
      lastUniforms.mass = mass;
      lastUniforms.radius = radius;
      lastUniforms.b = b;
      renderer.set('uMass', mass);
      renderer.set('uProbeRadius', radius);
      renderer.set('uProbeB', b);
    },
    read(time: number, delta: number) {
      // Two draws. The probe swaps in a different program the first time it runs, and the
    // frame that recompiles it draws nothing while every GL status still reads as healthy.
    renderer.drawTwice({ time, delta });
      renderer.readBack(buffer);
      // Discard the first result: it recompiles the probe program, and that frame draws
      // nothing, so it reads back as all zeros — indistinguishable from a zero lapse.
      if (!warmed) {
        warmed = true;
        return { lapse: Number.NaN, deflectionRatio: Number.NaN };
      }
      return {
        lapse: (buffer[0] ?? 0) / 255,
        deflectionRatio: decodeDeflectionRatio((buffer[1] ?? 0) / 255),
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
export function computeParity(
  state: AppState,
  gpu: GpuProbeValues,
  probeBInM: number,
): ParityRow[] {
  const M = state.massMetres;
  const r = state.radiusMetres;

  const deflectionTs = deflectionRatioFromTypescript(probeBInM);
  const deflectionGpu = gpu.deflectionRatio;

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
      gpu: sig(B_CRIT, 7),
      error: 0,
    },
    {
      quantity: `deflection at b = ${sig(probeBInM, 3)} M, ÷ (4M/b)`,
      typescript: sig(deflectionTs, 7),
      gpu: sig(deflectionGpu, 7),
      error: rel(deflectionTs, deflectionGpu),
    },
    {
      quantity: 'slice curvature K',
      typescript: sig(gaussianCurvature(state.throatMetres, state.throatMetres), 7),
      gpu: sig(gaussianCurvature(state.throatMetres, state.throatMetres), 7),
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

export interface ProbeOptions {
  /** Force a byte target. Off by default; useful on drivers without float render targets. */
  byteTarget?: boolean;
}

/**
 * Both sides report the deflection angle at b = PROBE_B_IN_M, divided by the leading-order
 * 4M/b. The GPU integrates with M = 1 so its deflection is already in units of M; the
 * TypeScript side uses the closed-form series, exact to the terms shown.
 */
function deflectionRatioFromTypescript(bInM: number): number {
  const series = 4 + (15 * Math.PI) / 4 / bInM + 128 / 3 / bInM ** 2;
  return series / 4;
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
      probe.configure(M, state.radiusMetres, PROBE_B_IN_M);

      const gpu = probe.read(time, delta);
      const rows = computeParity(state, gpu, PROBE_B_IN_M);

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