import { regimeMeta } from './equations';
import type { AppState } from '../core/store';
import { DURATION } from '../core/motion';

export interface MathLayerHandle {
  update(state: AppState): void;
}

export function mountMathLayer(root: HTMLElement): MathLayerHandle {
  root.innerHTML = '<aside class="mathlayer" aria-label="Equations and derivations"></aside>';
  const panel = root.querySelector<HTMLElement>('.mathlayer')!;
  let renderedKey = '';

  return {
    update(state) {
      const open = state.mathOpen;
      panel.classList.toggle('open', open);
      panel.setAttribute('aria-hidden', String(!open));

      // Re-render only when the visible content would actually change, so a live readout
      // ticking at 60 Hz does not rebuild the DOM underneath the reader.
      const key = `${state.regime}:${state.embedding}:${state.transitioning}`;
      if (!open || key === renderedKey) return;
      renderedKey = key;

      const meta = regimeMeta(state.regime);
      const items = meta.equations
        .map(
          (eq, i) => `
          <article class="equation" style="animation-delay:${i * 40}ms">
            <h2 class="equation-label">${escapeHtml(eq.label)}</h2>
            <p class="equation-plain">${escapeHtml(eq.plain)}</p>
            <p class="equation-note">${escapeHtml(eq.note)}</p>
          </article>`,
        )
        .join('');

      panel.innerHTML =
        `<div class="mathlayer-inner">${items}</div>` +
        honestyFor(state.regime) +
        (state.transitioning
          ? '<p class="transition-note">Transition frames are a visual transition, not a physical state.</p>'
          : '');

      panel.style.setProperty('--math-duration', `${DURATION.base}ms`);
    },
  };
}

/** What is exact and what is approximated, stated plainly per regime. */
function honestyFor(regime: number): string {
  switch (regime) {
    case 0:
    case 1:
      return (
        '<p class="honesty">The accretion glow is an analytic approximation, not a fluid ' +
        'simulation. The light paths, the shadow, the redshift and every clock rate are ' +
        'integrated from the metric.</p>'
      );
    case 2:
      return (
        '<p class="honesty">There is no curvature in this regime, so no ray bends — that ' +
        'absence is deliberate. It is the control case that makes the other three legible.</p>'
      );
    case 3:
      return (
        '<p class="honesty">The rendered surface is a visualisation of the metric ' +
        'functions, not a picture of three-dimensional space: there is no such space here. ' +
        'The metric itself is exact.</p>'
      );
    default:
      return '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}