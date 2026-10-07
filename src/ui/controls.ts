import { MASS_MAX, MASS_MIN, RADIUS_MIN_IN_M, type AppState, type Store } from '../core/store';
import type { Timeline } from '../core/timeline';
import { regimeMeta } from './equations';

export interface ControlsOptions {
  store: Store;
  timeline: Timeline;
  reducedMotion: boolean;
  onRegime(next: number): void;
  onResetCamera(): void;
  onCycleEmbedding(): void;
}

interface SliderSpec {
  key: 'massMetres' | 'radiusMetres' | 'throatMetres' | 'boostBeta';
  symbol: string;
  label: string;
  /** Slider endpoints, in the units the label shows. */
  min: number;
  max: number;
  fromFraction(fraction: number): number;
  toFraction(value: number): number;
  format(value: number): string;
  regimes: number[];
}

function logMap(min: number, max: number): (f: number) => number {
  const lo = Math.log(min);
  const hi = Math.log(max);
  return (f) => Math.exp(lo + f * (hi - lo));
}

function logInverse(min: number, max: number): (v: number) => number {
  const lo = Math.log(min);
  const hi = Math.log(max);
  return (v) => (Math.log(Math.max(min, Math.min(max, v))) - lo) / (hi - lo);
}

export function mountControls(
  root: HTMLElement,
  opts: ControlsOptions,
): { update(state: AppState): void } {
  // Every mass-like slider is logarithmic: the interesting range spans solar masses to
  // supermassive black holes, and a linear slider spends 99% of its travel in the middle.
  const specs: SliderSpec[] = [
    {
      key: 'massMetres',
      symbol: 'M',
      label: 'mass',
      min: MASS_MIN,
      max: MASS_MAX,
      fromFraction: logMap(MASS_MIN, MASS_MAX),
      toFraction: logInverse(MASS_MIN, MASS_MAX),
      format: (v) => `${(v / 1e3).toPrecision(4)} km`,
      regimes: [0, 1],
    },
    {
      key: 'radiusMetres',
      symbol: 'r',
      label: 'observer radius',
      min: RADIUS_MIN_IN_M,
      max: 2000,
      fromFraction: logMap(RADIUS_MIN_IN_M, 2000),
      toFraction: logInverse(RADIUS_MIN_IN_M, 2000),
      format: (v) => `${v.toPrecision(5)} M`,
      regimes: [0, 1],
    },
    {
      key: 'boostBeta',
      symbol: 'β',
      label: 'frame speed',
      min: 0,
      max: 0.9999,
      fromFraction: (f) => f * 0.9999,
      toFraction: (v) => v / 0.9999,
      format: (v) => `${v.toPrecision(4)} c`,
      regimes: [2],
    },
    {
      key: 'throatMetres',
      symbol: 'b',
      label: 'throat radius',
      min: 10,
      max: 1e7,
      fromFraction: logMap(10, 1e7),
      toFraction: logInverse(10, 1e7),
      format: (v) => `${(v / 1000).toPrecision(4)} km`,
      regimes: [3],
    },
  ];

  root.innerHTML = `
    <nav class="transport" aria-label="Regime navigation">
      ${[0, 1, 2, 3]
        .map(
          (i) =>
            `<button type="button" class="regime-tab" data-regime="${i}">` +
            `<span class="tab-index">${String(i + 1).padStart(2, '0')}</span>` +
            `<span class="tab-name">${escapeHtml(regimeMeta(i).name)}</span></button>`,
        )
        .join('')}
    </nav>
    <div class="scrubber">
      <button type="button" class="play-toggle" aria-label="Play or pause"></button>
      <input type="range" class="scrub" min="0" max="1000" step="1" value="0"
             aria-label="Timeline position" />
      <span class="scrub-readout"></span>
    </div>
    <div class="param-rail" aria-label="Parameters"></div>
    <div class="utility-rail">
      <button type="button" class="utility" data-action="math">equations</button>
      <button type="button" class="utility" data-action="embedding">embedding</button>
      <button type="button" class="utility" data-action="parity">parity</button>
      <button type="button" class="utility" data-action="reset">reset view</button>
    </div>
  `;

  const railEl = root.querySelector<HTMLElement>('.param-rail')!;
  const scrubEl = root.querySelector<HTMLInputElement>('.scrub')!;
  const playEl = root.querySelector<HTMLButtonElement>('.play-toggle')!;
  const readoutEl = root.querySelector<HTMLElement>('.scrub-readout')!;
  const entries = new Map<
    SliderSpec['key'],
    { input: HTMLInputElement; output: HTMLOutputElement; group: HTMLElement }
  >();

  for (const spec of specs) {
    const group = document.createElement('div');
    group.className = 'param';
    group.innerHTML =
      `<span class="param-symbol">${escapeHtml(spec.symbol)}</span>` +
      `<span class="param-label">${escapeHtml(spec.label)}</span>` +
      '<input type="range" min="0" max="1000" step="1" />' +
      '<output class="param-value"></output>';

    const input = group.querySelector<HTMLInputElement>('input')!;
    const output = group.querySelector<HTMLOutputElement>('output')!;
    input.setAttribute('aria-label', `${spec.label} (${spec.symbol})`);

    input.addEventListener('input', () => {
      const fraction = Number(input.value) / 1000;
      const state = opts.store.get();
      const raw = spec.fromFraction(fraction);
      // r is stored in metres but the slider works in units of M, because "3M" is the
      // meaningful unit for a radius and "5000000000 m" is not.
      const value = spec.key === 'radiusMetres' ? raw * state.massMetres : raw;
      opts.store.set({ [spec.key]: value } as Partial<AppState>);
      output.textContent = spec.format(raw);
    });

    entries.set(spec.key, { input, output, group });
    railEl.appendChild(group);
  }

  root.querySelectorAll<HTMLButtonElement>('.regime-tab').forEach((button) => {
    button.addEventListener('click', () => {
      opts.onRegime(Number(button.dataset.regime));
    });
  });

  root.querySelectorAll<HTMLButtonElement>('.utility').forEach((button) => {
    button.addEventListener('click', () => {
      const state = opts.store.get();
      switch (button.dataset.action) {
        case 'math':
          opts.store.set({ mathOpen: !state.mathOpen });
          break;
        case 'embedding':
          opts.onCycleEmbedding();
          break;
        case 'parity':
          opts.store.set({ parityOpen: !state.parityOpen });
          break;
        case 'reset':
          opts.onResetCamera();
          break;
        default:
          break;
      }
    });
  });

  playEl.addEventListener('click', () => opts.timeline.toggle());

  scrubEl.addEventListener('input', () => {
    opts.timeline.pause();
    opts.timeline.scrubTo(Number(scrubEl.value) / 1000);
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case '1':
      case '2':
      case '3':
      case '4':
        opts.onRegime(Number(event.key) - 1);
        break;
      case ' ':
        event.preventDefault();
        opts.timeline.toggle();
        break;
      case 'ArrowLeft':
        opts.timeline.scrubTo(opts.timeline.position01 - 0.02);
        break;
      case 'ArrowRight':
        opts.timeline.scrubTo(opts.timeline.position01 + 0.02);
        break;
      case 'm':
      case 'M':
        opts.store.set({ mathOpen: !opts.store.get().mathOpen });
        break;
      case 'e':
      case 'E':
        opts.onCycleEmbedding();
        break;
      case '`':
        opts.store.set({ parityOpen: !opts.store.get().parityOpen });
        break;
      case 'r':
      case 'R':
        opts.onResetCamera();
        break;
      default:
        break;
    }
  });

  return {
    update(state) {
      for (const spec of specs) {
        const entry = entries.get(spec.key);
        if (!entry) continue;
        entry.group.hidden = !spec.regimes.includes(state.regime);
        if (entry.group.hidden) continue;

        const shown = spec.key === 'radiusMetres' ? state.radiusMetres / state.massMetres
                                                    : state[spec.key];
        if (document.activeElement !== entry.input) {
          entry.input.value = String(Math.round(spec.toFraction(shown) * 1000));
        }
        entry.output.textContent = spec.format(shown);
      }

      root.querySelectorAll<HTMLButtonElement>('.regime-tab').forEach((button) => {
        const active = Number(button.dataset.regime) === state.regime;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      root.querySelectorAll<HTMLButtonElement>('.utility').forEach((button) => {
        const on =
          (button.dataset.action === 'math' && state.mathOpen) ||
          (button.dataset.action === 'parity' && state.parityOpen) ||
          (button.dataset.action === 'embedding' && state.embedding === 'pseudosphere');
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
      });

      if (document.activeElement !== scrubEl) {
        scrubEl.value = String(Math.round(opts.timeline.position01 * 1000));
      }
      playEl.textContent = opts.timeline.playing ? '❙❙' : '▶';
      playEl.setAttribute('aria-pressed', String(opts.timeline.playing));
      readoutEl.textContent = `${opts.timeline.position.toFixed(1)}s`;
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}