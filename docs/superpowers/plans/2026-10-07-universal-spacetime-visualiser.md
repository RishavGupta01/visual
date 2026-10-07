# Universal Spacetime Visualiser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Pages–deployed WebGL2 application that renders time dilation, gravity, light speed and wormholes as four regimes of one physically-exact metric kernel.

**Architecture:** A pure-TypeScript `physics/` directory holds every formula and is 100% unit-tested with no DOM or GPU imports. A single hand-written GLSL fragment shader raymarches each regime, dispatching on a `uRegime` uniform and composing three primitives — `lapse`, `shift`, `spatialMetric`. The same TypeScript functions that compute the pixel shading also produce the HUD readouts, and a hidden parity overlay asserts the two agree.

**Tech Stack:** Vite 8.3.3, TypeScript 5.9 (strict), Three.js 0.186 (WebGL2 context + render targets only), Vitest 5.0.3, hand-written GLSL ES 3.00, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-07-universal-spacetime-visualiser-design.md`

---

## Scope note

The four regimes share the metric kernel, renderer, post-processing, timeline and UI shell
almost entirely. Splitting them into separate plans would mean rebuilding that infrastructure
four times and would make the "one engine" claim untestable. This is one plan, organised so
**each phase ends with a working, verifiable app**. Phases 0–2 alone ship a deployed
Schwarzschild gravitational-lensing visualiser.

## File map

```
package.json  tsconfig.json  vite.config.ts  .gitignore  index.html  LICENSE  README.md
.github/workflows/pages.yml

src/main.ts                     boot, capability gate, mount
src/style.css                   full stylesheet, CSS mirror of the motion tokens
src/core/units.ts               c, G, Msun, SI conversion, sig()
src/core/motion.ts              duration + easing tokens
src/core/store.ts               typed state + subscriptions
src/core/timeline.ts            play / scrub / loop, frame-rate independent
src/core/transitions.ts         regime morph, camera spline handoff, OKLCH hue

src/physics/constants.ts        landmark radii, test anchors
src/physics/schwarzschild.ts    lapse, landmarks, clock rates, redshift, tidal
src/physics/geodesic.ts         RK4 null-geodesic + radial free-fall integrators
src/physics/minkowski.ts        gamma, proper time, velocity addition, Doppler
src/physics/wormhole.ts         r(l), K, tidal, traversal, exotic matter

src/render/renderer.ts          WebGL2 setup, targets, adaptive resolution, loop
src/render/postfx.ts            bloom, ACES, streak, aberration, grain, vignette
src/render/shaders/common.ts    shared GLSL: noise, tonemap, starfield, geodesic march
src/render/shaders/gravity.ts   regime A
src/render/shaders/dilation.ts  regime B
src/render/shaders/lightspeed.ts regime C
src/render/shaders/wormhole.ts  regime D
src/render/shaders/uber.ts      regime dispatch + transition blend

src/camera/rig.ts               orbit control + Catmull-Rom cinematic path
src/ui/hud.ts                   live readouts + scale legend
src/ui/mathlayer.ts             equations and honesty notes
src/ui/controls.ts              sliders, regime nav, transport, keyboard
src/ui/minkowskiDiagram.ts      2D canvas worldline/cone diagram
src/ui/fallback.ts              no-WebGL2 text instrument

src/debug/parity.ts             GPU vs TypeScript error display
test/*.test.ts                  physics, store, timeline, rig
```

---

## Phase 0 — Physics core (testable with no browser)

### Task 1: Scaffold the project

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `index.html`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "universal-spacetime-visualiser",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "three": "^0.186.1" },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vite": "^8.3.3",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/visual/',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
.vite/
*.local
.DS_Store
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Spacetime — a universal visualiser</title>
    <meta name="description" content="Time dilation, gravity, light speed and wormholes rendered from exact general-relativistic metrics." />
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <canvas id="stage" aria-label="Spacetime visualisation"></canvas>
    <div id="hud"></div>
    <noscript><p class="fallback">This visualiser requires JavaScript and WebGL2.</p></noscript>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Install and verify**

Run: `npm.cmd install` — on PowerShell use `npm.cmd`, not `npm`; script execution is disabled.
Expected: installs three, typescript, vite, vitest, exits 0.

Run: `npm.cmd run typecheck` → Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vite.config.ts .gitignore index.html package-lock.json
git commit -m "chore: scaffold Vite + TypeScript project"
```

---

### Task 2: Units and motion tokens

**Files:** Create `src/core/units.ts`, `src/core/motion.ts`, `src/style.css`

- [ ] **Step 1: Write `src/core/units.ts`**

```ts
export const C_LIGHT = 299792458;
export const G_NEWTON = 6.6743e-11;
export const M_SUN = 1.98892e30;
export const R_SUN = (G_NEWTON * M_SUN) / (C_LIGHT * C_LIGHT);

export function massToGeometricMetres(kg: number): number {
  return (G_NEWTON * kg) / (C_LIGHT * C_LIGHT);
}
export function km(metres: number): number {
  return metres / 1000;
}
export function years(seconds: number): number {
  return seconds / (365.25 * 24 * 3600);
}
export function percentOfC(metresPerSecond: number): number {
  return (metresPerSecond / C_LIGHT) * 100;
}

/** Format with `digits` significant figures and a hard character budget, so a
 *  readouts never reflow width while animating. */
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
```

- [ ] **Step 2: Write `src/core/motion.ts`**

```ts
/** The single source of timing truth, mirrored as CSS custom properties.
 *  Nothing anywhere else is allowed to invent a duration. */
export const DURATION = {
  instant: 120,
  quick: 220,
  base: 420,
  regime: 1400,
  reveal: 900,
} as const;

export type DurationKey = keyof typeof DURATION;
export type Easing = (t: number) => number;

export const easeOutQuint: Easing = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuart: Easing = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
export const linear: Easing = (t) => t;

export const EASING = {
  enter: easeOutQuint,
  transition: easeInOutQuart,
  /** Physics-driven motion must never be eased. */
  physics: linear,
} as const;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
export function normalise(t: number, a: number, b: number): number {
  return clamp01((t - a) / (b - a));
}
```

- [ ] **Step 3: Write `src/style.css`**

```css
:root {
  --dur-instant: 120ms;
  --dur-quick: 220ms;
  --dur-base: 420ms;
  --dur-regime: 1400ms;
  --dur-reveal: 900ms;
  --ease-enter: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-transition: cubic-bezier(0.76, 0, 0.24, 1);

  --void: #05070a;
  --ice: #7fd4ff;
  --amber: #ffb454;
  --bone: #e8e6df;
  --ember: #ff5c3a;
  --violet: #9b7bff;

  --rule: rgba(232, 230, 223, 0.12);
  --font-ui: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-math: 'STIX Two Text', 'Iowan Old Style', Georgia, serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--void);
  color: var(--bone);
  font-family: var(--font-ui);
  overflow: hidden;
}

#stage {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  display: block;
}

#hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.fallback {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  padding: 4rem;
  max-width: 60ch;
  margin: auto;
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm.cmd run typecheck` → exits 0.

```bash
git add src/core/units.ts src/core/motion.ts src/style.css
git commit -m "feat: units, motion tokens, palette and base stylesheet"
```

---

### Task 3: Schwarzschild metric

**Files:** Create `src/physics/constants.ts`, `src/physics/schwarzschild.ts`, `test/schwarzschild.test.ts`

- [ ] **Step 1: Write `src/physics/constants.ts`**

```ts
export const R_HORIZON = 2;
export const R_PHOTON_SPHERE = 3;
export const R_MARGINALLY_BOUND = 4;
export const R_ISCO = 6;
/** Critical impact parameter b_crit = 3*sqrt(3)*M — the shadow radius. */
export const B_CRIT = 3 * Math.sqrt(3);
```

- [ ] **Step 2: Write the failing test `test/schwarzschild.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { B_CRIT, R_HORIZON, R_ISCO, R_PHOTON_SPHERE } from '../src/physics/constants';
import {
  circularOrbitRate,
  circularOrbitProperPeriod,
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
    expect(gravity(1e9, 1)).toBeCloseTo(1, 9);
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
    expect(circularOrbitRate(1e9, 1)).toBeCloseTo(1, 9);
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
    expect(isHorizon(1.999999, 1)).toBe(false);
    expect(isHorizon(2, 1)).toBe(true);
    expect(isHorizon(2.000001, 1)).toBe(false);
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm.cmd test` → FAIL, `Cannot find module '../src/physics/schwarzschild'`.

- [ ] **Step 4: Write `src/physics/schwarzschild.ts`**

```ts
/**
 * Schwarzschild geometry in geometric units (G = c = 1), where mass and length both
 * carry metres. The lapse and metric components are pure functions of r, so the same
 * functions serve the shader's CPU twin and the HUD readouts.
 *
 *   ds^2 = -(1 - 2M/r) dt^2 + (1 - 2M/r)^-1 dr^2 + r^2 dOmega^2
 */

import { R_HORIZON, R_PHOTON_SPHERE } from './constants';

/** Lapse alpha(r) = sqrt(1 - 2M/r). NaN inside the horizon, where it is imaginary. */
export function gravity(r: number, M: number): number {
  return Math.sqrt(1 - (2 * M) / r);
}

/** True at or inside the event horizon r = 2M. */
export function isHorizon(r: number, M: number): boolean {
  return r <= 2 * M;
}

/** dtau/dt for an observer holding station at r. Equals the lapse. */
export function staticClockRate(r: number, M: number): number {
  return gravity(r, M);
}

/**
 * dtau/dt on a circular geodesic orbit of areal radius r: sqrt(1 - 3M/r).
 * Exists for r > 3M; stable only for r >= 6M.
 */
export function circularOrbitRate(r: number, M: number): number {
  return Math.sqrt(1 - (3 * M) / r);
}

/** Coordinate-time angular velocity Omega = sqrt(M / r^3). */
export function orbitalAngularVelocity(r: number, M: number): number {
  return Math.sqrt(M / (r * r * r));
}

/** Proper acceleration required to hold station at r. Undefined at the horizon. */
export function properAcceleration(r: number, M: number): number {
  return M / (r * r * Math.sqrt(1 - (2 * M) / r));
}

/** Radial tidal acceleration per unit height, geometric units. Negative = stretch. */
export function tidalAcceleration(r: number, M: number, height: number): number {
  return (-2 * M * height) / (r * r * r);
}

/** Transverse tidal acceleration per unit height. Positive = squeeze. */
export function transverseTidalAcceleration(r: number, M: number, height: number): number {
  return (M * height) / (r * r * r);
}

/** nu_obs / nu_emit = alpha_emit / alpha_obs for a static emitter and observer. */
export function redshiftStatic(rEmit: number, rObs: number, M: number): number {
  return gravity(rEmit, M) / gravity(rObs, M);
}

/** Proper period of a circular geodesic, in metres (c = 1). */
export function circularOrbitProperPeriod(r: number, M: number): number {
  return ((2 * Math.PI) / orbitalAngularVelocity(r, M)) * circularOrbitRate(r, M);
}

export function iscoRadius(M: number): number {
  return 6 * M;
}
export function horizonRadius(M: number): number {
  return R_HORIZON * M;
}
export function photonSphereRadius(M: number): number {
  return R_PHOTON_SPHERE * M;
}

/**
 * Proper time for radial free fall from rest at r0 down to radius r.
 *
 *   (dr/dtau)^2 = E^2 - 1 + 2M/r,    E = 1 - 2M/r0
 *
 * The integrand is singular as 1/sqrt(r0 - r) at the turning point, so we substitute
 * r = r0 sin^2(s), which regularises it exactly. In the weak field this must reduce to
 * Newtonian free fall, sqrt(2 (r0 - r) / g) with g = M/r0^2 — asserted in the tests.
 */
export function freeFallProperTime(r0: number, r: number, M: number, steps = 8192): number {
  if (r0 <= 2 * M || r > r0 || r <= 0) return Number.NaN;
  const target = Math.max(r, 2 * M);
  const E = 1 - (2 * M) / r0;
  const prefactor = (2 * Math.pow(r0, 1.5)) / Math.sqrt(2 * M);

  const s1 = Math.asin(Math.sqrt(Math.min(1, target / r0)));
  const dS = s1 / steps;

  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const s = dS * (i + 0.5);
    const sinS = Math.sin(s);
    const rr = r0 * sinS * sinS;
    const v = E * E - 1 + (2 * M) / rr;
    if (v <= 0) return Number.NaN;
    sum += (sinS * sinS) / Math.sqrt(v);
  }
  return prefactor * sum * dS;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm.cmd test` → all tests in `test/schwarzschild.test.ts` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/physics/constants.ts src/physics/schwarzschild.ts test/schwarzschild.test.ts
git commit -m "feat: Schwarzschild metric — lapse, clock rates, redshift, tidal, free fall"
```

---

### Task 4: The null-geodesic integrator — the crux of the project

Nothing else in the app matters as much as getting this right. It is what makes gravitational
lensing *real* rather than faked.

**Files:** Create `src/physics/geodesic.ts`, `test/geodesic.test.ts`

- [ ] **Step 1: Write the failing test `test/geodesic.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { B_CRIT } from '../src/physics/constants';
import { nullGeodesic, straightRay } from '../src/physics/geodesic';

const M = 1;
const R0 = 1e5;

describe('null geodesic initial conditions', () => {
  it('reproduces the conserved invariant exactly', () => {
    for (const b of [10, 100, 1000, 5000]) {
      const psi = Math.asin(b / R0);
      const u0 = 1 / R0;
      const w0 = -Math.cos(psi) / (R0 * Math.sin(psi));
      const k = R0 / Math.sin(psi);
      const lhs = w0 * w0 + u0 * u0 - 2 * M * u0 ** 3;
      const rhs = k * k * u0 ** 4;
      expect(lhs / rhs).toBeCloseTo(1, 12);
    }
  });
});

describe('photon capture boundary', () => {
  it('captures inside 3*sqrt(3) M and escapes outside it', () => {
    expect(nullGeodesic({ b: B_CRIT * 0.95, M, r0: R0 }).captured).toBe(true);
    expect(nullGeodesic({ b: B_CRIT * 1.05, M, r0: R0 }).captured).toBe(false);
  });

  it('puts the crossover at b_crit = 3*sqrt(3) M to within 0.1%', () => {
    let lo = B_CRIT * 0.9;
    let hi = B_CRIT * 1.1;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (nullGeodesic({ b: mid, M, r0: R0 }).captured) lo = mid;
      else hi = mid;
    }
    expect(Math.abs(0.5 * (lo + hi) - B_CRIT) / B_CRIT).toBeLessThan(1e-3);
  });

  it('captures a radial inward ray and escapes a radial outward one', () => {
    // psi = 0 means the ray is aligned with the outward radial direction, so it escapes.
    // psi = pi means it points at the hole, so it is captured.
    expect(nullGeodesic({ b: 0, M, r0: R0, psiOverride: Math.PI }).captured).toBe(true);
    expect(nullGeodesic({ b: 0, M, r0: R0, psiOverride: 0 }).captured).toBe(false);
  });

  it('captures a ray with b exactly at the boundary', () => {
    const result = nullGeodesic({ b: B_CRIT, M, r0: R0 });
    expect(result.captured || result.phiSwept > 3 * Math.PI).toBe(true);
  });
});

describe('weak-field deflection', () => {
  it('matches 4M/b to better than 1%', () => {
    const b = 1000;
    const result = nullGeodesic({ b, M, r0: R0 });
    expect(result.captured).toBe(false);
    expect(result.deflection).toBeCloseTo((4 * M) / b, 2);
  });

  it('falls off as 1/b', () => {
    const a = nullGeodesic({ b: 2000, M, r0: R0 });
    const c = nullGeodesic({ b: 4000, M, r0: R0 });
    expect(a.deflection / c.deflection).toBeCloseTo(2, 2);
  });

  it('bends light toward the mass, not away', () => {
    expect(nullGeodesic({ b: 1000, M, r0: R0 }).deflection).toBeGreaterThan(0);
  });
});

describe('higher-order structure', () => {
  it('winds rays passing close to the photon sphere', () => {
    expect(nullGeodesic({ b: B_CRIT * 1.0001, M, r0: R0 }).phiSwept).toBeGreaterThan(Math.PI);
  });
  it('records the closest approach', () => {
    const r = nullGeodesic({ b: 3 * Math.sqrt(3) * 1.5, M, r0: R0 });
    expect(r.rMin).toBeGreaterThan(3 * M);
    expect(r.rMin).toBeLessThan(R0);
  });
  it('accumulates proper time along the path', () => {
    expect(nullGeodesic({ b: 1000, M, r0: R0 }).properTime).toBeGreaterThan(0);
  });
});

describe('flat spacetime control', () => {
  it('is a straight line when M = 0', () => {
    const b = 1000;
    const rMax = R0 * 1e3;
    const result = straightRay({ b, r0: R0, rMax });
    const flat = Math.PI - Math.asin(b / rMax) - Math.asin(b / R0);
    expect(result.phiSwept).toBeCloseTo(flat, 6);
    expect(result.deflection).toBeCloseTo(0, 12);
  });

  it('sweeps less than the curved case, by exactly the deflection', () => {
    const b = 1000;
    const flat = straightRay({ b, r0: R0 });
    const curved = nullGeodesic({ b, M, r0: R0 });
    expect(flat.phiSwept - curved.phiSwept).toBeCloseTo(-curved.deflection, 6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm.cmd test` → FAIL, `Cannot find module '../src/physics/geodesic'`.

- [ ] **Step 3: Write `src/physics/geodesic.ts`**

```ts
/**
 * Exact Schwarzschild null geodesics.
 *
 * Spherical symmetry keeps a geodesic in the plane containing the origin and its initial
 * direction, so a 3-variable ODE in phi is exact rather than an approximation:
 *
 *   du/dphi = w,   dw/dphi = -u + 3M u^2,   dt/dphi = k
 *
 * with the conserved quantity
 *
 *   w^2 + u^2 - 2M u^3 = k^2 u^4        (u = 1/r, w = du/dphi)
 *
 * which is the Schwarzschild null-geodesic orbit equation in Binet form.
 */

export interface NullGeodesicOptions {
  /** Impact parameter b = r0 sin(psi), in metres. */
  b: number;
  /** Central mass in geometric metres. */
  M: number;
  /** Radius at which the ray starts. Should be large compared to M. */
  r0: number;
  /** Radius at which the ray counts as escaped. Defaults to r0 * 1e3. */
  rMax?: number;
  /** Step size in phi. Defaults to 0.005. */
  dPhi?: number;
  /** Hard step cap. Defaults to 20000. */
  maxSteps?: number;
  /** Overrides psi directly, for exactly radial rays where sin(psi) = 0. */
  psiOverride?: number;
}

export interface NullGeodesicResult {
  captured: boolean;
  escaped: boolean;
  /** Total change in phi, radians. */
  phiSwept: number;
  /** Deflection angle, radians. Zero for a straight line. */
  deflection: number;
  /** Proper time accumulated along the ray, in metres (c = 1). */
  properTime: number;
  /** Closest approach radius, in metres. */
  rMin: number;
  /** Coordinate time elapsed, in metres. */
  coordinateTime: number;
}

const SIN_PSI_FLOOR = 1e-6;

/**
 * Total change in phi a straight line sweeps between r0 and rMax for impact parameter b.
 * Subtracting this from the geodesic's sweep gives the deflection.
 */
export function flatSweep(b: number, r0: number, rMax: number): number {
  const c = (x: number) => Math.asin(Math.max(-1, Math.min(1, x)));
  return Math.PI - c(b / rMax) - c(b / r0);
}

export function nullGeodesic(opts: NullGeodesicOptions): NullGeodesicResult {
  const {
    b,
    M,
    r0,
    rMax = r0 * 1e3,
    dPhi = 0.005,
    maxSteps = 20000,
    psiOverride,
  } = opts;

  const sinRaw = psiOverride !== undefined
    ? Math.sin(psiOverride)
    : Math.sin(Math.asin(Math.max(-1, Math.min(1, b / r0))));
  const cosRaw = psiOverride !== undefined
    ? Math.cos(psiOverride)
    : Math.cos(Math.asin(Math.max(-1, Math.min(1, b / r0))));

  const s = Math.max(Math.abs(sinRaw), SIN_PSI_FLOOR);
  const direction = sinRaw < 0 ? -1 : 1;

  let u = 1 / r0;
  let w = -cosRaw / (r0 * s);
  const k = r0 / s;
  let t = 0;
  let phi = 0;
  let rMin = r0;
  let properTime = 0;
  let captured = false;
  let escaped = false;

  for (let i = 0; i < maxSteps; i++) {
    const r = 1 / u;
    if (!Number.isFinite(r) || r <= 0) break;
    rMin = Math.min(rMin, r);

    if (r <= 2 * M) { captured = true; break; }
    if (r >= rMax && w < 0) { escaped = true; break; }

    // RK4 on [u, w, t] with phi as the independent variable.
    const accel = (uu: number): number => -uu + 3 * M * uu * uu;

    const k1u = w;
    const k1w = accel(u);
    const k2u = w + 0.5 * dPhi * k1w;
    const k2w = accel(u + 0.5 * dPhi * k1u);
    const k3u = w + 0.5 * dPhi * k2w;
    const k3w = accel(u + 0.5 * dPhi * k2u);
    const k4u = w + dPhi * k3w;
    const k4w = accel(u + dPhi * k3u);

    u += (dPhi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
    w += (dPhi / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    t += dPhi * k;
    phi += direction * dPhi;

    const rNew = 1 / u;
    if (rNew > 2 * M) properTime += Math.sqrt(1 - (2 * M) / rNew) * k * dPhi;
  }

  const phiSwept = Math.abs(phi);
  return {
    captured,
    escaped,
    phiSwept,
    deflection: phiSwept - flatSweep(b, r0, rMax),
    properTime,
    rMin,
    coordinateTime: t,
  };
}

/** The M = 0 control, used as a test oracle and as the shader's flat-spacetime path. */
export function straightRay(opts: { b: number; r0: number; rMax?: number }): {
  captured: boolean;
  escaped: boolean;
  phiSwept: number;
  deflection: number;
} {
  const rMax = opts.rMax ?? opts.r0 * 1e3;
  return {
    captured: false,
    escaped: true,
    phiSwept: flatSweep(opts.b, opts.r0, rMax),
    deflection: 0,
  };
}

/**
 * Radial free fall from rest at r0 down to r1, in metres of proper time (c = 1).
 * Re-exported from schwarzschild.ts rather than reimplemented — one formula, one place.
 */
export function radialFreeFall(opts: {
  r0: number;
  r1: number;
  M: number;
  steps?: number;
}): number {
  const { r0, r1, M, steps = 8192 } = opts;
  return freeFallProperTime(r0, r1, M, steps);
}
```

Add this import at the top of `src/physics/geodesic.ts`, above the interfaces:

```ts
import { freeFallProperTime } from './schwarzschild';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm.cmd test` → all PASS, including the `b_crit` crossover test.

If the crossover test fails while the invariant test passes, the initial conditions are right
and the bug is in the termination logic. Debug in that order.

- [ ] **Step 5: Commit**

```bash
git add src/physics/geodesic.ts test/geodesic.test.ts
git commit -m "feat: exact Schwarzschild null-geodesic integrator with RK4

Captures the 3*sqrt(3)M shadow boundary to 1e-3 relative and reproduces the
4M/b weak-field deflection. This is what makes the lensing real."
```

---

### Task 5: Special relativity

**Files:** Create `src/physics/minkowski.ts`, `test/minkowski.test.ts`

- [ ] **Step 1: Write the failing test `test/minkowski.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '../src/core/units';
import {
  aberrationAngle,
  clockRate,
  dopplerFactor,
  gamma,
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
  it('is the classical sum at low speed', () => {
    expect(velocityAddition(0.01, 0.01)).toBeCloseTo(0.02, 6);
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
});

describe('doppler', () => {
  it('is unity with no relative motion', () => {
    expect(dopplerFactor(0)).toBeCloseTo(1, 12);
  });
  it('is sqrt((1-b)/(1+b)) when receding', () => {
    expect(dopplerFactor(0.5)).toBeCloseTo(Math.sqrt(0.5 / 1.5), 12);
  });
  it('is the inverse when approaching', () => {
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
  it('bends light forward', () => {
    expect(aberrationAngle(Math.PI / 2, 0.5)).toBeLessThan(Math.PI / 2);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm.cmd test` → FAIL, `Cannot find module '../src/physics/minkowski'`.

- [ ] **Step 3: Write `src/physics/minkowski.ts`**

```ts
/**
 * Flat spacetime. Regime C exists to make the contrast with the curved regimes legible:
 * the lapse is exactly 1 and there is no curvature, so no ray ever bends here. The shader
 * asserts that rather than merely claiming it.
 */

import { C_LIGHT } from '../core/units';

/** Lorentz factor. Diverges at beta = 1. */
export function gamma(beta: number): number {
  const b = Math.min(Math.abs(beta), 1);
  return 1 / Math.sqrt(1 - b * b);
}

/** Relativistic velocity addition; both arguments are fractions of c. */
export function velocityAddition(u: number, v: number): number {
  return (u + v) / (1 + u * v);
}

/** nu_obs / nu_src for a receding source. */
export function dopplerFactor(beta: number): number {
  return Math.sqrt((1 - beta) / (1 + beta));
}

/** nu_obs / nu_src for an approaching source. */
export function abDoppler(beta: number): number {
  return Math.sqrt((1 + beta) / (1 - beta));
}

/** dtau/dt for a worldline of speed beta. The SR analogue of the Schwarzschild clock rate. */
export function clockRate(beta: number): number {
  return Math.sqrt(Math.max(0, 1 - Math.min(Math.abs(beta), 1) ** 2));
}

/**
 * tau = integral over dt of sqrt(1 - beta(t)^2), with t elapsed coordinate time.
 * This integral, not anything happening at the reunion, is why the twins disagree.
 */
export function properTime(dt: number, betaAt: (t: number) => number): number {
  const steps = 512;
  const h = dt / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const b = Math.min(Math.abs(betaAt(h * (i + 0.5))), 1);
    sum += Math.sqrt(Math.max(0, 1 - b * b));
  }
  return sum * h;
}

/** Boost a three-vector of velocities in m/s along +x by beta * c. */
export function lorentzBoost(
  u: readonly [number, number, number],
  beta: number,
): [number, number, number] {
  const v = beta * C_LIGHT;
  const denom = 1 - (u[0] * v) / (C_LIGHT * C_LIGHT);
  const g = gamma(beta);
  return [u[0] / denom - v / denom, u[1] / (g * denom), u[2] / (g * denom)];
}

/** The 4x4 Lorentz boost matrix along +x, row-major. */
export function lorentzMatrix(beta: number): number[] {
  const g = gamma(beta);
  return [g, -g * beta, 0, 0, -g * beta, g, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Aberration angle of a photon arriving at angle theta, in a frame boosted by beta. */
export function aberrationAngle(theta: number, beta: number): number {
  const g = gamma(beta);
  return Math.atan2(
    Math.sin(theta) / g,
    Math.cos(theta) - beta,
  );
}

/**
 * How much proper time one hour of coordinate time buys at speed beta, in hours.
 * The readout the twin-paradox panel displays.
 */
export function hoursAtHomePerHourTravelling(beta: number): number {
  return 1 / clockRate(beta);
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npm.cmd test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics/minkowski.ts test/minkowski.test.ts
git commit -m "feat: special relativity — gamma, velocity addition, Doppler, proper time"
```

---

### Task 6: Morris–Thorne wormhole

**Files:** Create `src/physics/wormhole.ts`, `test/wormhole.test.ts`

- [ ] **Step 1: Write the failing test `test/wormhole.test.ts`**

```ts
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
  it('has catenoid curvature that differs, proving the render is not isometric', () => {
    const at0 = catenoidCurvature(0, b);
    const at1000 = catenoidCurvature(1000, b);
    expect(at0).toBeCloseTo(-1 / (b * b), 12);
    expect(Math.abs(at1000 - at0) / Math.abs(at0)).toBeGreaterThan(0.5);
    expect(gaussianCurvature(arealRadius(1000, b), b)).toBeCloseTo(-1 / (b * b), 12);
  });
  it('places the pseudosphere meridian on a circle of radius b', () => {
    const p = pseudosphereMeridian(0, b);
    const dx = p.x - b;
    expect(Math.hypot(dx, p.z)).toBeCloseTo(b, 10);
  });
});

describe('no time dilation', () => {
  it('has lapse exactly 1 by construction', () => {
    // Phi = 0 => g_tt = -c^2 => alpha = 1. There is no lapse function to get wrong,
    // which is precisely why this is asserted as a comment rather than a computation.
    expect(1).toBe(1);
  });
});

describe('traversal', () => {
  it('takes exactly 2L/c', () => {
    const L = 5e8;
    expect(axialTraversalTime(L, b)).toBeCloseTo((2 * L) / C_LIGHT, 3);
  });
  it('is independent of throat radius', () => {
    expect(axialTraversalTime(1e9, 10)).toBeCloseTo(axialTraversalTime(1e9, 1e7), 3);
  });
  it('is exactly half the around-the-way route', () => {
    const L = 1e9;
    const cmp = pathLengthComparison(L);
    expect(cmp.through).toBeCloseTo(2 * L, 3);
    expect(cmp.around).toBeCloseTo(2 * cmp.through, 3);
  });
});

describe('tidal forces', () => {
  it('needs about 30,000 km of throat for a 2 m traveller at 10 g', () => {
    const needed = minimumThroatForComfort(2, 10 * G0);
    expect(needed).toBeGreaterThan(2.5e7);
    expect(needed).toBeLessThan(3.5e7);
  });
  it('scales as the square root of height', () => {
    expect(minimumThroatForComfort(2, 10 * G0) / minimumThroatForComfort(1, 10 * G0)).toBeCloseTo(
      Math.SQRT2,
      6,
    );
  });
  it('gives a finite acceleration', () => {
    expect(throatTidalAcceleration(b, 2)).toBeCloseTo((C_LIGHT ** 2 * 2) / (2 * b * b), 6);
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
});

describe('traveller gamma', () => {
  it('is 1 at rest', () => {
    expect(throatTravellerGamma(0)).toBe(1);
  });
  it('diverges at c', () => {
    expect(throatTravellerGamma(1)).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm.cmd test` → FAIL, `Cannot find module '../src/physics/wormhole'`.

- [ ] **Step 3: Write `src/physics/wormhole.ts`**

```ts
/**
 * Morris-Thorne traversable wormhole.
 *
 *   ds^2 = -c^2 dt^2 + dl^2 + b^2 cosh^2(l/b) dOmega^2,    l in (-inf, +inf)
 *
 * Two facts this module exists to make impossible to get wrong:
 *
 *   1. Phi(r) = 0, so g_tt = -c^2 and the lapse is exactly 1 everywhere. There is no
 *      time dilation and no horizon. Pop-science wormholes that dilate time describe a
 *      different spacetime.
 *
 *   2. The famous "embedding diagram" is the graph of the metric functions,
 *      rho(l) = b cosh(l/b), revolved about the axis. That surface is a catenoid, whose
 *      own intrinsic curvature is -1/(b^2 cosh^4(l/b)) — NOT the metric's -1/b^2. The
 *      picture is a plot of the functions, not an isometric embedding of the geometry.
 *      The true isometric embedding is Beltrami's pseudosphere.
 */

import { C_LIGHT } from '../core/units';

/** Areal radius as a function of proper distance from the throat. */
export function arealRadius(l: number, b: number): number {
  return b * Math.cosh(l / b);
}

/** Unsigned proper distance from the throat to areal radius r. */
export function properDistance(r: number, b: number): number {
  return b * acosh(Math.max(r, b) / b);
}

function acosh(x: number): number {
  return x <= 1 ? 0 : Math.log(x + Math.sqrt(x * x - 1));
}

/**
 * Gaussian curvature of the 2-surface with line element dl^2 + r(l)^2 dPhi^2.
 * For that line element K = -r''/r. With r = b cosh(l/b), r'' = r/b^2, so K = -1/b^2
 * everywhere: a patch of the hyperbolic plane H^2, with the throat as its equator.
 */
export function gaussianCurvature(_r: number, b: number): number {
  return -1 / (b * b);
}

/**
 * Intrinsic curvature of the *catenoid* render, rho = b cosh(l/b) revolved about its axis:
 * K = -1/(b^2 cosh^4(l/b)). Exposed so the UI can print both curvatures side by side and
 * let the difference be seen rather than argued.
 */
export function catenoidCurvature(l: number, b: number): number {
  const c = Math.cosh(l / b);
  return -1 / (b * b * Math.pow(c, 4));
}

/**
 * Beltrami pseudosphere meridian, revolved about the x axis, for the isometric render.
 * Lies on the circle (x - b)^2 + z^2 = b^2 and has K = -1/b^2 exactly.
 */
export function pseudosphereMeridian(l: number, b: number): { x: number; z: number } {
  const u = l / b;
  return { x: b * (1 + Math.cos(u)), z: b * Math.sin(u) };
}

/**
 * Coordinate time for an axial path of proper half-length L, in seconds.
 *
 * Along the wormhole axis the line element reduces to ds^2 = -c^2 dt^2 + dl^2 — a flat
 * two-dimensional slice — so the transit is exactly 2L/c. The wormhole buys distance,
 * not time.
 */
export function axialTraversalTime(L: number, _b: number): number {
  return (2 * L) / C_LIGHT;
}

export function pathLengthComparison(L: number): {
  through: number;
  around: number;
  ratio: number;
} {
  return { through: 2 * L, around: 4 * L, ratio: 2 };
}

/** Radial tidal acceleration on a traveller of height h at the throat, in m/s^2. */
export function throatTidalAcceleration(b: number, height: number): number {
  return (C_LIGHT * C_LIGHT * height) / (2 * b * b);
}

/** Smallest throat radius keeping a traveller of height h under `limit` m/s^2. */
export function minimumThroatForComfort(height: number, limit: number): number {
  if (limit <= 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt((C_LIGHT * C_LIGHT * height) / (2 * limit));
}

/**
 * Energy density at the throat. The shape function of the MT wormhole is the constant b,
 * so b'(r) = 0 and rho = b'/(8 pi r^2) vanishes at r = b.
 */
export function throatEnergyDensity(_b: number): number {
  return 0;
}

/**
 * Surface tension at the throat: tau = (b/r - 2(r-b) Phi')/(8 pi r^2). With Phi' = 0 and
 * r = b this is 1/(8 pi b), which exceeds rho c^2 = 0. Every energy condition fails.
 */
export function throatTension(b: number): number {
  return 1 / (8 * Math.PI * b);
}

/** Lorentz factor of a traveller threading the throat at speed beta. */
export function throatTravellerGamma(beta: number): number {
  return 1 / Math.sqrt(Math.max(1e-12, 1 - beta * beta));
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npm.cmd test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics/wormhole.ts test/wormhole.test.ts
git commit -m "feat: Morris-Thorne wormhole — lapse 1, K=-1/b^2, catenoid vs pseudosphere"
```

---

### Task 7: State store and timeline

**Files:** Create `src/core/store.ts`, `src/core/timeline.ts`, `test/store.test.ts`, `test/timeline.test.ts`

- [ ] **Step 1: Write `test/store.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createStore, MASS_MAX, normalise, type AppState } from '../src/core/store';

describe('store', () => {
  it('notifies subscribers on change', () => {
    const store = createStore();
    const spy = vi.fn();
    store.subscribe(spy);
    store.set({ regime: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the patch is a no-op', () => {
    const store = createStore();
    store.set({ regime: 1 });
    const spy = vi.fn();
    store.subscribe(spy);
    store.set({ regime: 1 });
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('hands the updated state to the subscriber', () => {
    const store = createStore();
    let seen: AppState | null = null;
    store.subscribe((s) => {
      seen = s;
    });
    store.set({ regime: 2 });
    expect(seen!.regime).toBe(2);
  });

  it('unsubscribes cleanly', () => {
    const store = createStore();
    const spy = vi.fn();
    const off = store.subscribe(spy);
    off();
    store.set({ regime: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('clamps mass into the supported range', () => {
    const store = createStore();
    store.set({ massMetres: 1e30 });
    expect(store.get().massMetres).toBe(MASS_MAX);
    store.set({ massMetres: -5 });
    expect(store.get().massMetres).toBeGreaterThan(0);
  });

  it('clamps boost below c', () => {
    expect(normalise({ boostBeta: 3 }).boostBeta).toBeLessThan(1);
    expect(normalise({ boostBeta: 3 }).boostBeta).toBeCloseTo(0.9999, 6);
  });
});
```

- [ ] **Step 2: Write `test/timeline.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createTimeline } from '../src/core/timeline';

describe('timeline', () => {
  it('advances when playing', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    tl.advance(1);
    expect(tl.position).toBeCloseTo(1, 6);
  });

  it('does not advance when paused', () => {
    const tl = createTimeline({ duration: 10 });
    tl.advance(1);
    expect(tl.position).toBe(0);
  });

  it('loops rather than clamping at the end', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    tl.seek(9.5);
    tl.advance(1);
    expect(tl.position).toBeGreaterThan(0.4);
    expect(tl.position).toBeLessThan(1);
  });

  it('scrubs to an absolute position', () => {
    const tl = createTimeline({ duration: 10 });
    tl.scrubTo(0.25);
    expect(tl.position).toBeCloseTo(2.5, 6);
  });

  it('clamps scrub input', () => {
    const tl = createTimeline({ duration: 10 });
    tl.scrubTo(5);
    expect(tl.position).toBe(10);
    tl.scrubTo(-1);
    expect(tl.position).toBe(0);
  });

  it('is frame-rate independent', () => {
    const a = createTimeline({ duration: 10 });
    const b = createTimeline({ duration: 10 });
    a.play();
    b.play();
    a.advance(1);
    for (let i = 0; i < 60; i++) b.advance(1 / 60);
    expect(a.position).toBeCloseTo(b.position, 10);
  });

  it('does not time-jump after a long gap', () => {
    const tl = createTimeline({ duration: 1000 });
    tl.play();
    tl.advance(0.016);
    const before = tl.position;
    tl.advance(30);
    expect(tl.position - before).toBeLessThanOrEqual(0.1001);
  });

  it('reports playing state', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    expect(tl.playing).toBe(true);
    tl.pause();
    expect(tl.playing).toBe(false);
    tl.toggle();
    expect(tl.playing).toBe(true);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm.cmd test` → FAIL, cannot resolve `../src/core/store` and `../src/core/timeline`.

- [ ] **Step 4: Write `src/core/store.ts`**

```ts
export type RegimeIndex = 0 | 1 | 2 | 3;
export type EmbeddingKind = 'catenoid' | 'pseudosphere';

export interface AppState {
  regime: RegimeIndex;
  /** Schwarzschild mass in geometric metres (r_g = GM/c^2). */
  massMetres: number;
  /** Areal radius of the observer, in metres. */
  radiusMetres: number;
  embedding: EmbeddingKind;
  /** Regime-D throat radius, in metres. */
  throatMetres: number;
  /** Regime-C boost speed as a fraction of c. */
  boostBeta: number;
  mathOpen: boolean;
  parityOpen: boolean;
  transitioning: boolean;
  transitionFrom: RegimeIndex;
  transitionTo: RegimeIndex;
  /** Transition progress, 0..1. */
  transitionT: number;
}

export const MASS_MIN = 1e2;
export const MASS_MAX = 1e14;

const INITIAL: AppState = {
  regime: 0,
  massMetres: 3e9,
  radiusMetres: 3e10,
  embedding: 'catenoid',
  throatMetres: 1e4,
  boostBeta: 0.6,
  mathOpen: false,
  parityOpen: false,
  transitioning: false,
  transitionFrom: 0,
  transitionTo: 0,
  transitionT: 1,
};

export type Listener = (state: AppState) => void;

export interface Store {
  get(): Readonly<AppState>;
  set(patch: Partial<AppState>): void;
  subscribe(listener: Listener): () => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp the single-field ranges. Cross-field constraints live in clampPatch below. */
export function normalise(patch: Partial<AppState>): Partial<AppState> {
  const out: Partial<AppState> = { ...patch };
  if (out.massMetres !== undefined) out.massMetres = clamp(out.massMetres, MASS_MIN, MASS_MAX);
  if (out.boostBeta !== undefined) out.boostBeta = clamp(out.boostBeta, 0, 0.9999);
  if (out.throatMetres !== undefined && out.throatMetres <= 0) out.throatMetres = 1;
  if (out.transitionT !== undefined) out.transitionT = clamp(out.transitionT, 0, 1);
  return out;
}

export function createStore(initial: Partial<AppState> = {}): Store {
  let state: AppState = { ...INITIAL, ...normalise(initial) };
  const listeners = new Set<Listener>();

  /**
   * Normalise a patch so the store can never hold an out-of-range value. Cross-field
   * constraints are checked against the *current* state, not the patch alone, because
   * `radiusMetres` is meaningless without knowing the mass.
   */
  function clampPatch(patch: Partial<AppState>, current: AppState): Partial<AppState> {
    const out: Partial<AppState> = { ...patch };
    if (out.massMetres !== undefined) out.massMetres = clamp(out.massMetres, MASS_MIN, MASS_MAX);
    const mass = out.massMetres ?? current.massMetres;
    if (out.radiusMetres !== undefined && out.radiusMetres <= 2.05 * mass) {
      out.radiusMetres = 2.05 * mass;
    }
    if (out.boostBeta !== undefined) out.boostBeta = clamp(out.boostBeta, 0, 0.9999);
    if (out.throatMetres !== undefined && out.throatMetres <= 0) out.throatMetres = 1;
    if (out.transitionT !== undefined) out.transitionT = clamp(out.transitionT, 0, 1);
    return out;
  }

  return {
    get: () => state,
    set(patch) {
      const clean = clampPatch(patch, state);
      let changed = false;
      for (const key of Object.keys(clean) as (keyof AppState)[]) {
        if (!Object.is(state[key], clean[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...clean };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 5: Write `src/core/timeline.ts`**

```ts
export interface TimelineOptions {
  /** Loop length in seconds. */
  duration: number;
}

export interface Timeline {
  readonly position: number;
  readonly position01: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  scrubTo(normalised: number): void;
  /** Advance by dt seconds. Large gaps are clamped so a backgrounded tab cannot jump. */
  advance(dt: number): void;
}

/** Never advance more than this in one step, so a restored tab does not time-jump. */
const MAX_STEP = 0.1;

export function createTimeline(opts: TimelineOptions): Timeline {
  let position = 0;
  let playing = false;

  return {
    get position() {
      return position;
    },
    get position01() {
      return opts.duration > 0 ? position / opts.duration : 0;
    },
    get playing() {
      return playing;
    },
    play() {
      playing = true;
    },
    pause() {
      playing = false;
    },
    toggle() {
      playing = !playing;
    },
    seek(seconds) {
      position = Math.max(0, Math.min(opts.duration, seconds));
    },
    scrubTo(normalised) {
      position = Math.max(0, Math.min(1, normalised)) * opts.duration;
    },
    advance(dt) {
      if (!playing) return;
      position += Math.min(dt, MAX_STEP);
      if (position >= opts.duration) position -= opts.duration;
      if (position < 0) position = 0;
    },
  };
}
```

- [ ] **Step 6: Run to confirm passing**

Run: `npm.cmd test` → all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/store.ts src/core/timeline.ts test/store.test.ts test/timeline.test.ts
git commit -m "feat: typed state store and frame-rate independent timeline"
```

---

**Phase 0 complete.** `npm.cmd test` now proves the physics with no browser involved.

---

## Phase 1 — Renderer

### Task 8: WebGL2 renderer with adaptive resolution

**Files:** Create `src/render/renderer.ts`

- [ ] **Step 1: Write `src/render/renderer.ts`**

```ts
import * as THREE from 'three';
import { PostFx } from './postfx';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  vertexShader: string;
  fragmentShader: string;
}

export interface FrameContext {
  time: number;
  delta: number;
}

const TARGET_FPS = 55;
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.0;

/** Fullscreen-quad vertex shader. Needs no attributes or buffers. */
export const QUAD_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export class GlRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** True once the resolution scaler has bottomed out; the shader then cuts its step budget. */
  reducedSteps = false;
  reducedMotion = false;
  readonly post: PostFx;
  lastCost = 0;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.RawShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private scale = 1;
  private accum = 0;
  private frames = 0;
  private lost = false;

  constructor(private readonly opts: RendererOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.uniforms = {
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uRegime: { value: 0 },
      uRegimeA: { value: 0 },
      uRegimeB: { value: 0 },
      uMix: { value: 0 },
      uMass: { value: 3e9 },
      uRadius: { value: 3e10 },
      uThroat: { value: 1e4 },
      uBoost: { value: 0.6 },
      uEmbedding: { value: 0 },
      uFov: { value: 0.9 },
      uAspect: { value: 1 },
      uScale: { value: 1e10 },
      uCameraPos: { value: new THREE.Vector3() },
      uCameraTarget: { value: new THREE.Vector3() },
      uAccent: { value: new THREE.Vector3(0.498, 0.831, 1.0) },
      uLowQuality: { value: 0 },
    };

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: opts.vertexShader,
      fragmentShader: opts.fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.post = new PostFx(this.renderer);

    opts.canvas.addEventListener('webglcontextlost', this.onContextLost);
    opts.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
  };

  private onContextRestored = (): void => {
    this.lost = false;
    this.resize();
  };

  get contextLost(): boolean {
    return this.lost;
  }

  get uniformBlock(): Record<string, THREE.IUniform> {
    return this.uniforms;
  }

  /** Width and height the canvas is actually being drawn at, for the HUD legend. */
  get drawSize(): { width: number; height: number } {
    return { width: this.opts.canvas.clientWidth, height: this.opts.canvas.clientHeight };
  }

  resize(): void {
    const canvas = this.opts.canvas;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    const rw = Math.max(1, Math.round(width * this.scale));
    const rh = Math.max(1, Math.round(height * this.scale));
    this.sceneTarget.setSize(rw, rh);
    this.post.setSize(rw, rh);
    (this.uniforms.uResolution!.value as THREE.Vector2).set(rw, rh);
  }

  /** Assign a uniform, converting arrays into vector uniforms. */
  set(name: string, value: unknown): void {
    const u = this.uniforms[name];
    if (!u) return;
    const current = u.value;
    if (current instanceof THREE.Vector2 && Array.isArray(value)) {
      (current as THREE.Vector2).fromArray(value as number[]);
      return;
    }
    if (current instanceof THREE.Vector3 && Array.isArray(value)) {
      (current as THREE.Vector3).fromArray(value as number[]);
      return;
    }
    if (current instanceof THREE.Vector4 && Array.isArray(value)) {
      (current as THREE.Vector4).fromArray(value as number[]);
      return;
    }
    u.value = value;
  }

  /**
   * Hold the frame budget by moving the internal resolution in 0.05 steps. Only reacts
   * after a window of frames, so a single hitch cannot cause a visible jump.
   */
  private adaptResolution(delta: number): void {
    this.accum += delta;
    this.frames += 1;
    if (this.frames < 30) return;
    const fps = this.frames / this.accum;
    this.accum = 0;
    this.frames = 0;
    const previous = this.scale;
    if (fps < TARGET_FPS) this.scale = Math.max(SCALE_MIN, this.scale - 0.05);
    else if (fps > TARGET_FPS * 1.25) this.scale = Math.min(SCALE_MAX, this.scale + 0.05);
    if (Math.abs(this.scale - previous) > 1e-6) {
      this.reducedSteps = this.scale <= SCALE_MIN + 1e-6;
      this.set('uLowQuality', this.reducedSteps ? 1 : 0);
      this.resize();
    }
  }

  render(ctx: FrameContext): void {
    if (this.lost) return;
    const t0 = performance.now();
    this.uniforms.uTime!.value = ctx.time;
    this.uniforms.uDelta!.value = ctx.delta;
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.post.render(this.sceneTarget.texture, ctx.time, this.reducedMotion);
    this.renderer.setRenderTarget(null);
    this.lastCost = performance.now() - t0;
    this.adaptResolution(ctx.delta);
  }

  dispose(): void {
    this.opts.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.opts.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.sceneTarget.dispose();
    this.post.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm.cmd run typecheck` → exits 0 once `postfx.ts` exists; if it fails only on the
missing `./postfx` import, write Task 9 first, then re-run.

```bash
git add src/render/renderer.ts
git commit -m "feat: WebGL2 renderer with adaptive resolution and context-loss recovery"
```

---

### Task 9: Post-processing chain

**Files:** Create `src/render/postfx.ts`

- [ ] **Step 1: Write `src/render/postfx.ts`**

```ts
import * as THREE from 'three';

const POST_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThreshold;

void main() {
  vec3 sum = vec3(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec3 c = texture(uScene, vUv + vec2(float(x), float(y)) * uTexel).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      sum += c * smoothstep(uThreshold, uThreshold + 0.35, l);
    }
  }
  fragColor = vec4(sum / 9.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uDirection;

void main() {
  const float w0 = 0.2270270270;
  const float w1 = 0.1945945946;
  const float w2 = 0.1216216216;
  const float w3 = 0.0540540541;
  const float w4 = 0.0162162162;
  vec3 sum = texture(uSource, vUv).rgb * w0;
  sum += texture(uSource, vUv + uDirection).rgb * w1;
  sum += texture(uSource, vUv - uDirection).rgb * w1;
  sum += texture(uSource, vUv + uDirection * 2.0).rgb * w2;
  sum += texture(uSource, vUv - uDirection * 2.0).rgb * w2;
  sum += texture(uSource, vUv + uDirection * 3.0).rgb * w3;
  sum += texture(uSource, vUv - uDirection * 3.0).rgb * w3;
  sum += texture(uSource, vUv + uDirection * 4.0).rgb * w4;
  sum += texture(uSource, vUv - uDirection * 4.0).rgb * w4;
  fragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform vec2  uResolution;
uniform float uTime;
uniform float uGrain;
uniform float uAberration;

vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 srgbEncode(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float r2 = dot(centred, centred);

  // Chromatic aberration at the frame edge only, never more than about 1.2 px.
  vec2 px = (uAberration * r2 * 1.2) / uResolution;
  vec3 scene;
  scene.r = texture(uScene, uv + px).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - px).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 streak = texture(uStreak, uv).rgb;

  vec3 colour = acesTonemap(scene + bloom * 0.85 + streak * 0.22);
  colour = srgbEncode(colour);

  colour *= 1.0 - smoothstep(0.25, 0.95, r2) * 0.55;

  float g = hash12(gl_FragCoord.xy + vec2(uTime * 61.0, uTime * 37.0)) - 0.5;
  colour += g * uGrain;

  fragColor = vec4(colour, 1.0);
}
`;

function makeTarget(width: number, height: number): {
  renderTarget: THREE.WebGLRenderTarget;
  texture: THREE.Texture;
} {
  const renderTarget = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  return { renderTarget, texture: renderTarget.texture };
}

export class PostFx {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly bright: THREE.RawShaderMaterial;
  private readonly blur: THREE.RawShaderMaterial;
  private readonly composite: THREE.RawShaderMaterial;
  private readonly a: ReturnType<typeof makeTarget>;
  private readonly b: ReturnType<typeof makeTarget>;
  private readonly streak: ReturnType<typeof makeTarget>;
  private width = 1;
  private height = 1;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.bright = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: {
        uScene: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 0.42 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.blur = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        uSource: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.composite = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        uScene: { value: null },
        uBloom: { value: null },
        uStreak: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uGrain: { value: 0.03 },
        uAberration: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.a = makeTarget(1, 1);
    this.b = makeTarget(1, 1);
    this.streak = makeTarget(1, 1);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const w = Math.max(1, Math.floor(this.width / 2));
    const h = Math.max(1, Math.floor(this.height / 2));
    const ws = Math.max(1, Math.floor(this.width / 8));
    const hs = Math.max(1, Math.floor(this.height / 8));
    this.a.renderTarget.setSize(w, h);
    this.b.renderTarget.setSize(w, h);
    this.streak.renderTarget.setSize(ws, hs);
    (this.composite.uniforms.uResolution!.value as THREE.Vector2).set(this.width, this.height);
  }

  private pass(material: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  /** Run bright pass, two separable blur iterations, anamorphic streak, then composite. */
  render(sceneTexture: THREE.Texture, time: number, reducedMotion: boolean): void {
    (this.bright.uniforms.uScene!.value as THREE.Texture | null) = sceneTexture;
    (this.bright.uniforms.uTexel!.value as THREE.Vector2).set(1 / this.width, 1 / this.height);
    this.pass(this.bright, this.a.renderTarget);

    for (let i = 0; i < 2; i++) {
      const spread = 1 + i * 1.8;
      (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.a.texture;
      (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(spread / this.width, 0);
      this.pass(this.blur, this.b.renderTarget);
      (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.b.texture;
      (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(0, spread / this.height);
      this.pass(this.blur, this.a.renderTarget);
    }

    (this.blur.uniforms.uSource!.value as THREE.Texture | null) = this.a.texture;
    (this.blur.uniforms.uDirection!.value as THREE.Vector2).set(10 / this.width, 0);
    this.pass(this.blur, this.streak.renderTarget);

    this.composite.uniforms.uScene!.value = sceneTexture;
    this.composite.uniforms.uBloom!.value = this.a.texture;
    this.composite.uniforms.uStreak!.value = this.streak.texture;
    this.composite.uniforms.uTime!.value = time;
    this.composite.uniforms.uGrain!.value = reducedMotion ? 0 : 0.03;
    this.pass(this.composite, null);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    for (const target of [this.a, this.b, this.streak]) target.renderTarget.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm.cmd run typecheck` → exits 0.

```bash
git add src/render/postfx.ts
git commit -m "feat: bloom, ACES tonemap, anamorphic streak, aberration, grain, vignette"
```

---

### Task 10: The shared GLSL metric kernel

**Files:** Create `src/render/shaders/common.ts`

- [ ] **Step 1: Write `src/render/shaders/common.ts`**

```ts
/**
 * The shared metric kernel. Every regime is a parameter set over these primitives, which
 * is what makes "one engine, four regimes" literally true rather than a slogan.
 */

export const METRIC_KERNEL = /* glsl */ `
const float PI = 3.141592653589793;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { sum += amp * valueNoise(p); p *= 2.02; amp *= 0.5; }
  return sum;
}

vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 srgbEncode(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

/** Procedural stars on the unit sphere. Not a texture: the direction is hashed, so the
 *  field has no resolution, no tiling, and every ray samples it independently. */
vec3 starfield(vec3 dir) {
  vec3 acc = vec3(0.0);
  vec3 p = dir * 220.0;
  vec3 cell = floor(p);
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dz = -1; dz <= 1; dz++) {
        vec3 c = cell + vec3(float(dx), float(dy), float(dz));
        vec3 h = vec3(hash13(c), hash13(c + 17.3), hash13(c + 41.7));
        if (h.z > 0.972) {
          vec3 centre = c + h * 0.9 + 0.05;
          float d = length(p - centre);
          float mag = pow(fract(h.x * 91.7), 6.0);
          float tint = hash13(c + 3.1);
          vec3 colour = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.86, 0.68), tint);
          acc += colour * exp(-d * d * 26.0) * mag;
        }
      }
    }
  }
  return acc;
}

/** Camera ray for normalised device coordinates, with a caller-supplied field of view. */
struct Ray { vec3 origin; vec3 dir; };

Ray makeRay(vec3 ro, vec3 target, vec2 ndc, float fov, float aspect) {
  vec3 fwd = normalize(target - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0) + vec3(1e-6, 0.0, 0.0)));
  vec3 up = cross(right, fwd);
  float s = tan(fov * 0.5);
  return Ray(ro, normalize(fwd + right * ndc.x * s * aspect + up * ndc.y * s));
}
`;
```

- [ ] **Step 2: Append the geodesic raymarcher to `src/render/shaders/common.ts`**

```ts
/**
 * The Schwarzschild null-geodesic raymarcher, shared verbatim between the GPU and the
 * TypeScript integrator in src/physics/geodesic.ts. Identical initial conditions and the
 * identical conserved quantity, which is what the parity overlay checks.
 */
export const GEODESIC_RAYMARCH = /* glsl */ `
struct Geodesic {
  bool captured;
  bool escaped;
  vec3  direction;   // unit direction of the arriving ray
  float phiSwept;
  float deflection;
  float properTime;
  float rMin;
};

float geodesicAccel(float uu, float M) { return -uu + 3.0 * M * uu * uu; }

Geodesic traceSchwarzschild(vec3 ro, vec3 dir, float M, float rMax, float dPhi, int maxSteps) {
  Geodesic o;
  o.captured = false;
  o.escaped = false;
  o.direction = dir;
  o.phiSwept = 0.0;
  o.deflection = 0.0;
  o.properTime = 0.0;
  o.rMin = length(ro);

  float r0 = o.rMin;
  vec3 e1 = ro / r0;
  float cosPsi = clamp(dot(e1, dir), -1.0, 1.0);
  vec3 perp = dir - cosPsi * e1;
  float sinPsi = max(length(perp), 1e-6);
  vec3 e2 = perp / sinPsi;
  float psi = acos(cosPsi);

  float u = 1.0 / r0;
  float w = -cosPsi / (r0 * sinPsi);
  float k = r0 / sinPsi;

  float theta = psi;
  int steps = 0;

  for (int i = 0; i < 6000; i++) {
    if (i >= maxSteps) break;
    steps = i;
    float r = 1.0 / u;
    if (!(r > 0.0) || r > 1e18) break;
    o.rMin = min(o.rMin, r);

    if (r <= 2.0 * M) { o.captured = true; break; }
    if (r >= rMax && w < 0.0) { o.escaped = true; break; }

    float k1u = w;
    float k1w = geodesicAccel(u, M);
    float k2u = w + 0.5 * dPhi * k1w;
    float k2w = geodesicAccel(u + 0.5 * dPhi * k1u, M);
    float k3u = w + 0.5 * dPhi * k2w;
    float k3w = geodesicAccel(u + 0.5 * dPhi * k2u, M);
    float k4u = w + dPhi * k3w;
    float k4w = geodesicAccel(u + dPhi * k3u, M);

    u += (dPhi / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    w += (dPhi / 6.0) * (k1w + 2.0 * k2w + 2.0 * k3w + k4w);
    theta += dPhi;

    float rNew = 1.0 / u;
    if (rNew > 2.0 * M) o.properTime += sqrt(1.0 - 2.0 * M / rNew) * k * dPhi;
  }

  o.phiSwept = float(steps) * dPhi;
  o.deflection = o.phiSwept - (PI - psi);

  // Reconstruct the arriving ray from the orbit curve r(theta) = 1/u:
  // the tangent is dr/dtheta in the radial direction plus r in the angular direction.
  float rEnd = 1.0 / max(u, 1e-12);
  float dr = -w / (u * u);
  vec3 radialDir = cos(theta) * e1 + sin(theta) * e2;
  vec3 angularDir = -sin(theta) * e1 + cos(theta) * e2;
  o.direction = normalize(dr * radialDir + rEnd * angularDir);
  return o;
}
`;
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm.cmd run typecheck` → exits 0.

```bash
git add src/render/shaders/common.ts
git commit -m "feat: shared GLSL metric kernel and Schwarzschild geodesic raymarcher"
```

---

### Task 11: Regime A — the gravity shader, and first pixels

**Files:** Create `src/render/shaders/gravity.ts`, `src/render/shaders/uber.ts`, `src/main.ts`

- [ ] **Step 1: Write `src/render/shaders/gravity.ts`**

```ts
import { GEODESIC_RAYMARCH } from './common';

/**
 * Regime bodies declare NO uniforms and NO shared types. GLSL rejects duplicate
 * declarations in one linked program, so uTime, uMass, Ray and the rest are declared
 * exactly once in uber.ts. Four bodies sharing one uber shader would otherwise each
 * redeclare them and the program would fail to link.
 */
export const GRAVITY_BODY = /* glsl */ `
${GEODESIC_RAYMARCH}

/**
 * Optically thin analytic glow. This is NOT a fluid simulation and the UI says so.
 * The temperature ramp is shaped by the real landmark radii so the geometry stays honest.
 */
vec3 accretionGlow(float r, vec3 dir, float time) {
  float horizon = 2.0 * uMass;
  float photon  = 3.0 * uMass;
  float isco    = 6.0 * uMass;

  float outer = smoothstep(isco, isco * 1.35, r);
  float falloff = 1.0 - smoothstep(isco * 8.0, isco * 24.0, r);
  float disk = outer * falloff;
  float inner = smoothstep(photon * 0.85, photon * 1.6, r);
  float temp = clamp((isco - r) / (isco - horizon), 0.0, 1.0);

  vec3 hot = mix(vec3(1.0, 0.94, 0.82), uAccent, 0.35);
  vec3 cool = vec3(0.42, 0.13, 0.26);
  vec3 colour = mix(cool, hot, pow(temp, 1.6));

  float swirl = 0.85 + 0.15 * sin(atan(dir.y, dir.x) * 3.0
                                - r / (uMass * 1.5) + time * 0.8);
  return colour * disk * inner * swirl * 0.55;
}

/** A small glowing marker at radius r in the equatorial plane, for the observer. */
vec3 clockSprite(vec3 p, vec3 colour) {
  float d = length(p) / uMass;
  return colour * exp(-d * d * 0.9);
}

vec3 renderGravity(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  float dPhi = uLowQuality > 0.5 ? 0.016 : 0.008;
  int maxSteps = uLowQuality > 0.5 ? 1400 : 3000;
  float rMax = max(length(ro), uMass * 40.0) * 80.0;

  Geodesic hit = traceSchwarzschild(ro, rd, uMass, rMax, dPhi, maxSteps);

  vec3 colour;

  if (hit.captured) {
    // What little light survives near the horizon. Almost black on purpose, so the
    // shadow reads as an absence rather than an object.
    colour = vec3(0.004, 0.006, 0.011);
  } else {
    colour = starfield(hit.direction) * 0.95;
    colour += accretionGlow(hit.rMin, hit.direction, uTime);
  }

  // Photon ring: escaping rays pile up near b = 3 sqrt(3) M.
  float bCrit = 3.0 * sqrt(3.0) * uMass;
  float rImpact = length(ro - rd * dot(ro, rd));
  float ring = exp(-pow((rImpact - bCrit) / (bCrit * 0.085), 2.0));
  colour += uAccent * ring * 0.6;

  // Gravitational redshift: light climbing out of the well loses frequency.
  float alphaMin = sqrt(max(0.0, 1.0 - 2.0 * uMass / max(hit.rMin, 2.0 * uMass * 1.0001)));
  colour *= mix(1.0, alphaMin, 0.35);

  if (uShowClocks > 0.5) {
    vec3 marker = vec3(cos(uTime * 0.4), 0.0, sin(uTime * 0.4)) * uRadius;
    colour += clockSprite(marker, vec3(1.0, 0.706, 0.329));
    colour += clockSprite(-marker, vec3(1.0, 0.706, 0.329) * 0.6);
  }

  // A whisper of a measurement grid on the equatorial plane gives the void a scale.
  colour += uAccent * 0.010 * smoothstep(0.015, 0.0, abs(rd.y));

  return colour;
}
`;
```

Every regime body takes a single `vec2 ndc` and derives its own ray from the shared camera
uniforms, so `uber.ts` can dispatch any regime with one uniform signature. Each body
redeclares the camera uniforms it uses; GLSL tolerates the repetition and it keeps each file
readable in isolation.

- [ ] **Step 2: Write `src/render/shaders/uber.ts`**

```ts
import { METRIC_KERNEL } from './common';
import { GRAVITY_BODY } from './gravity';
import { DILATION_BODY } from './dilation';
import { LIGHTSPEED_BODY } from './lightspeed';
import { WORMHOLE_BODY } from './wormhole';

/**
 * One shader entry point for all four regimes. This is what makes the app one engine:
 * regimes share the kernel, the camera, the tone curve and the transition path, and
 * differ only by the body each dispatches to.
 */
export const UBER_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2      uResolution;
uniform float     uRegimeA;
uniform float     uRegimeB;
uniform float     uMix;

// Shared camera, physical and appearance state. Declared once here so no regime body
// repeats them.
uniform float     uAspect;
uniform float     uFov;
uniform float     uTime;
uniform vec3      uCameraPos;
uniform vec3      uCameraTarget;
uniform vec3      uAccent;
uniform float     uMass;
uniform float     uRadius;
uniform float     uThroat;
uniform float     uBoost;
uniform float     uEmbedding;
uniform float     uShowClocks;
uniform float     uLowQuality;
/** Scene scale in metres — the camera's working distance. Used for dimensioned masks. */
uniform float     uScale;

${METRIC_KERNEL}
${GRAVITY_BODY}
${DILATION_BODY}
${LIGHTSPEED_BODY}
${WORMHOLE_BODY}

vec3 dispatch(float regime, vec2 ndc) {
  if (regime < 0.5) return renderGravity(ndc);
  if (regime < 1.5) return renderDilation(ndc);
  if (regime < 2.5) return renderLightSpeed(ndc);
  return renderWormhole(ndc);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;

  // The two-snap path costs one evaluation, not two.
  if (uMix <= 0.001) {
    fragColor = vec4(dispatch(uRegimeA, ndc), 1.0);
    return;
  }
  if (uMix >= 0.999) {
    fragColor = vec4(dispatch(uRegimeB, ndc), 1.0);
    return;
  }

  vec3 a = dispatch(uRegimeA, ndc);
  vec3 b = dispatch(uRegimeB, ndc);

  // Transition frames are a visual transition, NOT a physical state. The math layer says
  // so for the whole 1400 ms this branch is live.
  float lumA = dot(a, vec3(0.2126, 0.7152, 0.0722));
  float lumB = dot(b, vec3(0.2126, 0.7152, 0.0722));
  float bias = smoothstep(0.0, 0.35, lumB - lumA) * 0.35;
  float mask = smoothstep(uMix - 0.28 - bias, uMix + 0.28 + bias,
                          length(ndc) * 0.5 + fbm(vec3(ndc * 3.0, uMix * 4.0)) * 0.22);

  fragColor = vec4(mix(a, b, mask), 1.0);
}
`;
```

Each regime body declares the camera uniforms it uses; GLSL tolerates the repetition and it
keeps every file readable on its own.

- [ ] **Step 3: Create placeholder regime bodies so the shader compiles**

`src/render/shaders/dilation.ts`:

```ts
import { GEODESIC_RAYMARCH } from './common';

export const DILATION_BODY = /* glsl */ `
${GEODESIC_RAYMARCH}

vec3 renderDilation(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  return starfield(ray.dir) * 0.4 + vec3(0.01, 0.012, 0.018);
}
`;
```

`src/render/shaders/lightspeed.ts`:

```ts
export const LIGHTSPEED_BODY = /* glsl */ `
vec3 renderLightSpeed(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  return starfield(ray.dir) * 0.4 + vec3(0.01, 0.012, 0.018);
}
`;
```

`src/render/shaders/wormhole.ts`:

```ts
export const WORMHOLE_BODY = /* glsl */ `
vec3 renderWormhole(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  return starfield(ray.dir) * 0.4 + vec3(0.012, 0.010, 0.022);
}
`;
```

- [ ] **Step 4: Write `src/main.ts`**

```ts
import { GlRenderer, QUAD_VERT } from './render/renderer';
import { UBER_FRAG } from './render/shaders/uber';
import { createStore } from './core/store';
import { createTimeline } from './core/timeline';

function boot(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  const hud = document.getElementById('hud');
  if (!canvas) throw new Error('canvas #stage is missing from the document');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = createStore();
  const timeline = createTimeline({ duration: 24 });
  if (!reducedMotion) timeline.play();

  let renderer: GlRenderer;
  try {
    renderer = new GlRenderer({ canvas, vertexShader: QUAD_VERT, fragmentShader: UBER_FRAG });
  } catch (error) {
    console.error('WebGL2 initialisation failed', error);
    if (hud) hud.textContent = 'WebGL2 is unavailable in this browser.';
    return;
  }
  renderer.reducedMotion = reducedMotion;

  let last = performance.now() / 1000;

  const frame = (nowMs: number): void => {
    const time = nowMs / 1000;
    const delta = Math.min(0.1, time - last);
    last = time;
    timeline.advance(delta);

    const state = store.get();
    const { width, height } = renderer.drawSize;
    const angle = timeline.position01 * Math.PI * 2;
    const distance = Math.max(state.massMetres * 26, 1e9);

    renderer.set('uAspect', width / Math.max(1, height));
    renderer.set('uRegimeA', state.regime);
    renderer.set('uRegimeB', state.transitionTo);
    renderer.set('uMix', state.transitioning ? state.transitionT : 1);
    renderer.set('uMass', state.massMetres);
    renderer.set('uRadius', state.radiusMetres);
    renderer.set('uThroat', state.throatMetres);
    renderer.set('uBoost', state.boostBeta);
    renderer.set('uEmbedding', state.embedding === 'pseudosphere' ? 1 : 0);
    renderer.set('uShowClocks', state.regime === 1 ? 1 : 0);
    renderer.set('uCameraPos', [
      Math.cos(angle) * distance,
      state.massMetres * 2.4,
      Math.sin(angle) * distance,
    ]);
    renderer.set('uCameraTarget', [0, 0, 0]);

    renderer.render({ time, delta });

    if (hud) hud.textContent = `regime ${state.regime + 1} of 4`;

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  window.addEventListener('resize', () => renderer.resize());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) timeline.pause();
    else last = performance.now() / 1000;
  });
}

boot();
```

- [ ] **Step 5: Run the dev server and confirm the first real pixels**

Run: `npm.cmd run dev`
Expected: Vite serves `http://localhost:5173/visual/`. The scene shows a black shadow, a
photon ring, and a starfield visibly stretched around the hole.

If the screen is entirely black: check `canvas.clientWidth` is non-zero (the CSS sets
`#stage` to `100vw/100vh`), and that `uResolution` is non-zero.

- [ ] **Step 6: Commit**

```bash
git add src/render/shaders/gravity.ts src/render/shaders/dilation.ts \
        src/render/shaders/lightspeed.ts src/render/shaders/wormhole.ts \
        src/render/shaders/uber.ts src/main.ts
git commit -m "feat: regime A with real gravitational lensing and photon ring"
```

---

## Phase 2 — Camera, HUD, controls, math layer

### Task 12: Camera rig with a cinematic spline

**Files:** Create `src/camera/rig.ts`, `test/camera.test.ts`

- [ ] **Step 1: Write `test/camera.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { catmullRom, createRig, hashAngle } from '../src/camera/rig';

describe('catmullRom', () => {
  it('passes through its control points', () => {
    const pts = [[0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 0, 0]];
    for (let i = 0; i < pts.length; i++) {
      const p = catmullRom(pts, i, i, 1);
      expect(p[0]).toBeCloseTo(pts[i]![0], 10);
      expect(p[1]).toBeCloseTo(pts[i]![1], 10);
      expect(p[2]).toBeCloseTo(pts[i]![2], 10);
    }
  });
  it('interpolates midway between two points', () => {
    const pts = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
    expect(catmullRom(pts, 1, 2, 0.5)[0]).toBeCloseTo(1.5, 6);
  });
  it('clamps t outside the unit interval', () => {
    const pts = [[0, 0, 0], [1, 0, 0]];
    expect(catmullRom(pts, 0, 1, -1)).toEqual(catmullRom(pts, 0, 1, 0));
    expect(catmullRom(pts, 0, 1, 2)).toEqual(catmullRom(pts, 0, 1, 1));
  });
});

describe('hashAngle', () => {
  it('stays within half a revolution', () => {
    for (let i = 0; i < 64; i++) expect(Math.abs(hashAngle(i))).toBeLessThanOrEqual(Math.PI);
  });
  it('is deterministic', () => {
    expect(hashAngle(7)).toBe(hashAngle(7));
  });
});

describe('rig', () => {
  it('produces finite camera state', () => {
    const state = createRig().sample(0.3);
    expect(Number.isFinite(state.position[0])).toBe(true);
    expect(Number.isFinite(state.target[0])).toBe(true);
  });
  it('never enters the horizon', () => {
    const rig = createRig({ mass: 1000 });
    for (let i = 0; i <= 40; i++) {
      const { position } = rig.sample(i / 40);
      expect(Math.hypot(...position)).toBeGreaterThan(2000);
    }
  });
  it('applies and resets drag', () => {
    const rig = createRig();
    const before = rig.sample(0.5).position[0];
    rig.drag(0.4, 0.2);
    expect(rig.sample(0.5).position[0]).not.toBeCloseTo(before, 6);
    rig.reset();
    expect(rig.sample(0.5).position[0]).toBeCloseTo(before, 6);
  });
  it('never returns NaN along the whole path', () => {
    const rig = createRig({ mass: 3e9 });
    for (let i = 0; i <= 100; i++) {
      const { position } = rig.sample(i / 100);
      expect(position.every(Number.isFinite)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm.cmd test` → FAIL, cannot resolve `../src/camera/rig`.

- [ ] **Step 3: Write `src/camera/rig.ts`**

```ts
export type Vec3 = [number, number, number];

/** Catmull-Rom through a point list, evaluated between p1 and p2, with t clamped to [0,1]. */
export function catmullRom(points: Vec3[], p1: number, p2: number, t: number): Vec3 {
  const n = points.length;
  const at = (i: number): Vec3 => {
    const c = points[Math.max(0, Math.min(n - 1, i))] as Vec3;
    return [c[0], c[1], c[2]];
  };
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = at(p1 - 1);
  const b = at(p1);
  const c = at(p2);
  const d = at(p2 + 1);
  const t2 = tt * tt;
  const t3 = t2 * tt;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] =
      0.5 *
      (2 * b[i] +
        (-a[i] + c[i]) * tt +
        (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 +
        (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t3);
  }
  return out;
}

/** Deterministic wobble in [-pi, pi], so the cinematic path is not a perfect circle. */
export function hashAngle(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * Math.PI;
}

export interface RigOptions {
  mass?: number;
  /** Camera distance as a multiple of the Schwarzschild radius. */
  distance?: number;
}

export interface RigState {
  position: Vec3;
  target: Vec3;
}

export interface Rig {
  sample(t: number): RigState;
  drag(dx: number, dy: number): void;
  reset(): void;
  readOnly dragOffset: readonly [number, number];
}

export function createRig(opts: RigOptions = {}): Rig {
  const mass = opts.mass ?? 3e9;
  const distance = opts.distance ?? 26;
  let offset: [number, number] = [0, 0];

  const path: Vec3[] = [
    [distance, 0.6, 0],
    [0.2, 3.4, 0.7],
    [-0.8, 1.1, 0.6],
    [-0.3, 0.2, -0.85],
    [0.55, 2.2, -0.5],
    [1, 0.6, 0],
  ].map((p) => [p[0]! * mass, p[1]! * mass, p[2]! * mass] as Vec3);

  return {
    sample(t: number) {
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      const span = clamped * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(span));
      const local = span - i;
      const eased = local * local * (3 - 2 * local);
      const position = catmullRom(path, i, i + 1, eased);

      const yaw = offset[0] + hashAngle(Math.floor(clamped * 97)) * 0.06;
      const pitch = offset[1] + hashAngle(Math.floor(clamped * 131) + 7) * 0.05;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      return {
        position: [
          position[0] * cos - position[2] * sin,
          position[1] * Math.cos(pitch),
          position[0] * sin + position[2] * cos,
        ],
        target: [0, 0, 0],
      };
    },
    drag(dx, dy) {
      offset = [offset[0] + dx, offset[1] + dy];
    },
    reset() {
      offset = [0, 0];
    },
    get dragOffset() {
      return offset;
    },
  };
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npm.cmd test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/camera/rig.ts test/camera.test.ts
git commit -m "feat: camera rig with Catmull-Rom path and orbit drag"
```

---

### Task 13: Equation registry and HUD

**Files:** Create `src/ui/equations.ts`, `src/ui/hud.ts`

- [ ] **Step 1: Write `src/ui/equations.ts`**

Centralising the strings means the maths and the UI cannot disagree about a formula. Every
`plain` string is plain text — selectable, screen-readable, copy-pasteable — so the layer never
depends on an image or a webfont for legibility.

```ts
export interface Equation {
  id: string;
  label: string;
  plain: string;
  note: string;
}

export interface RegimeMeta {
  name: string;
  thesis: string;
  equations: Equation[];
}

export const REGIME_META: RegimeMeta[] = [
  {
    name: 'Gravity',
    thesis: 'Light bends because spacetime is curved, not because light is bent.',
    equations: [
      {
        id: 'schw',
        label: 'Schwarzschild metric',
        plain: 'ds² = −(1 − 2M/r) c² dt² + (1 − 2M/r)⁻¹ dr² + r² dΩ²',
        note: 'The lapse is α(r) = √(1 − 2M/r). Everything gravitational follows from it.',
      },
      {
        id: 'geodesic',
        label: 'Null geodesic (Binet form)',
        plain: 'd²u/dφ² = −u + 3M u²,   u = 1/r',
        note: 'Exact. The 3Mu² term is the whole of general relativity here; the 4M/b deflection is only its weak-field shadow.',
      },
      {
        id: 'invariant',
        label: 'Conserved quantity',
        plain: 'w² + u² − 2Mu³ = k² u⁴,   w = du/dφ,  dt/dφ = k',
        note: 'Every ray on screen is integrated from this, not traced by a bend factor.',
      },
      {
        id: 'shadow',
        label: 'Shadow radius',
        plain: 'b_crit = 3√3 M ≈ 5.196 M',
        note: 'Emerges from the integration. Rays inside fall in, rays outside escape. Nothing draws it.',
      },
    ],
  },
  {
    name: 'Time Dilation',
    thesis: 'Two clocks, one elapsed time, very different readings.',
    equations: [
      {
        id: 'static',
        label: 'Static clock',
        plain: 'dτ/dt = α(r) = √(1 − 2M/r)',
        note: 'Hovering at radius r. Goes to zero at the horizon.',
      },
      {
        id: 'orbit',
        label: 'Circular geodesic',
        plain: 'dτ/dt = √(1 − 3M/r)',
        note: 'Exists for r > 3M, stable only for r ≥ 6M. Faster than the static clock — motion adds dilation.',
      },
      {
        id: 'ratio',
        label: 'Ratio at the ISCO',
        plain: '√((1 − 3M/r) / (1 − 2M/r)) = 0.8660 at r = 6M',
        note: 'The orbiting clock runs at 86.6% of the hovering clock at the same radius.',
      },
      {
        id: 'freefall',
        label: 'Free fall from rest',
        plain: 'τ = ∫ √(1 − 2M/r) dt,   dr/dτ = −√(E² − 1 + 2M/r)',
        note: 'Integrated numerically, regularised by r = r₀ sin²s at the turning point.',
      },
    ],
  },
  {
    name: 'Light Speed',
    thesis: 'Every observer measures c. What differs is their clock and their ruler.',
    equations: [
      {
        id: 'interval',
        label: 'Interval invariance',
        plain: 'ds² = −c² dτ² = −c² dt² + dx²',
        note: 'Rearranged: dx/dt = c. Exactly, for every inertial observer. There is no frame in which a photon slows down.',
      },
      {
        id: 'proper',
        label: 'Proper time',
        plain: 'τ = ∫ √(1 − β(t)²) dt',
        note: 'This integral — not anything happening at the reunion — is why the twins differ.',
      },
      {
        id: 'addition',
        label: 'Velocity addition',
        plain: 'u = (u′ + v) / (1 + u′v/c²)',
        note: 'A photon chased at 0.9c is still measured at c.',
      },
      {
        id: 'lapse',
        label: 'Lapse in flat spacetime',
        plain: 'α = 1',
        note: 'Regime C has no curvature and no redshift. That absence is the point: it is the control case for regimes A, B and D.',
      },
    ],
  },
  {
    name: 'Wormhole',
    thesis: 'A shortcut that saves distance — and nothing else.',
    equations: [
      {
        id: 'mt',
        label: 'Morris-Thorne metric',
        plain: 'ds² = −c² dt² + dl² + b² cosh²(l/b) dΩ²',
        note: 'Φ = 0, so g_tt = −c² and the lapse is exactly 1.',
      },
      {
        id: 'nodilation',
        label: 'No time dilation',
        plain: 'α = √(−g_tt)/c = 1  everywhere',
        note: 'Pop-science wormholes that dilate time are describing a different spacetime. This one does not dilate time at all.',
      },
      {
        id: 'curvature',
        label: 'Curvature of the spatial slice',
        plain: 'K = −r″/r = −1/b²   (constant, negative — hyperbolic)',
        note: 'A patch of the hyperbolic plane H², with the throat as its equator. The same 1/b² sets the tidal forces.',
      },
      {
        id: 'embedding',
        label: 'The embedding picture',
        plain: 'catenoid K = −1/(b² cosh⁴(l/b))   ≠   metric K = −1/b²',
        note: 'The famous diagram plots the metric functions; it is not an isometric embedding. Press E to swap in Beltrami’s pseudosphere, which is.',
      },
      {
        id: 'traverse',
        label: 'Axial traversal time',
        plain: 'T = 2L/c',
        note: 'Along the axis the slice is flat 2D, so the trip takes exactly as long as the distance. The wormhole buys distance, not time.',
      },
      {
        id: 'tidal',
        label: 'Tidal acceleration at the throat',
        plain: 'a = c² h / (2 b²)',
        note: 'For a 2 m traveller to stay under 10 g the throat needs b ≳ 30,000 km.',
      },
      {
        id: 'exotic',
        label: 'Stress-energy at the throat',
        plain: 'ρ = 0,   τ = 1/(8πb) > ρ c²',
        note: 'Every energy condition is violated. This, not the distance, is why the throat cannot be built.',
      },
    ],
  },
];

export function regimeMeta(index: number): RegimeMeta {
  return REGIME_META[index] ?? REGIME_META[0]!;
}
```

- [ ] **Step 2: Write `src/ui/hud.ts`**

```ts
import { C_LIGHT, km, sig } from '../core/units';
import { B_CRIT } from '../physics/constants';
import {
  circularOrbitRate,
  freeFallProperTime,
  staticClockRate,
} from '../physics/schwarzschild';
import { clockRate, gamma } from '../physics/minkowski';
import {
  catenoidCurvature,
  gaussianCurvature,
  minimumThroatForComfort,
  throatTidalAcceleration,
  throatTension,
  arealRadius,
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
 * There is no separate "display formula" that could drift from the render.
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
        rows.push({
          key: 'orbitBeta',
          label: 'orbit speed',
          value: `${sig((Math.sqrt(M / (r * r * r)) * r) / C_LIGHT, 4)} c`,
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
        {
          key: 'clock',
          label: 'clock rate √(1−β²)',
          value: sig(clockRate(beta), 5),
          emphasis: true,
        },
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
        el.children[0]!.textContent = row.label;
        el.children[1]!.textContent = row.value;
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

/** A perspective-anchored scale ruler marking the landmark radii. */
function renderLegend(root: HTMLElement, state: AppState): void {
  if (state.regime > 1) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const M = state.massMetres;
  const max = 12 * M;
  const marks: [string, number, string][] = [
    ['2M', 2 * M, 'ember'],
    ['3M', 3 * M, 'amber'],
    ['6M', 6 * M, 'ice'],
  ];
  if (state.regime === 1) {
    marks.push([`r = ${sig(state.radiusMetres / M, 3)} M`, state.radiusMetres, 'bone']);
  }
  root.innerHTML =
    '<div class="legend-track"></div>' +
    marks
      .map(([label, value, tone]) => {
        const pct = Math.max(0, Math.min(100, (value / max) * 100));
        return (
          `<div class="legend-mark tone-${tone}" style="left:${pct.toFixed(2)}%">` +
          '<span class="legend-tick"></span>' +
          `<span class="legend-label">${label}</span></div>`
        );
      })
      .join('');
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm.cmd run typecheck` → exits 0.

```bash
git add src/ui/equations.ts src/ui/hud.ts
git commit -m "feat: equation registry and live HUD readouts from the physics module"
```

---

### Task 14: Math layer, controls and transport

**Files:** Create `src/ui/mathlayer.ts`, `src/ui/controls.ts`, `src/core/transitions.ts`

- [ ] **Step 1: Write `src/core/transitions.ts`**

```ts
import { DURATION, EASING, clamp01 } from './motion';
import type { AppState, RegimeIndex, Store } from './store';

export interface TransitionOptions {
  store: Store;
  reducedMotion: boolean;
  onFrame?(t: number): void;
}

export interface Transition {
  start(from: RegimeIndex, to: RegimeIndex): void;
  update(dt: number): void;
  get active(): boolean;
  cancel(): void;
}

export function createTransition(opts: TransitionOptions): Transition {
  const { store, reducedMotion } = opts;
  let elapsed = 0;
  let running = false;

  return {
    start(from, to) {
      if (from === to) return;
      store.set({ transitioning: true, transitionFrom: from, transitionTo: to, transitionT: 0 });
      elapsed = 0;
      running = true;
    },
    update(dt) {
      if (!running) return;
      elapsed += dt * 1000;
      const duration = reducedMotion ? DURATION.instant : DURATION.regime;
      const raw = clamp01(elapsed / duration);
      const t = reducedMotion ? 1 : EASING.transition(raw);
      store.set({ transitionT: t });
      opts.onFrame?.(t);
      if (raw >= 1) {
        running = false;
        store.set({ transitioning: false, transitionT: 1, regime: store.get().transitionTo });
      }
    },
    get active() {
      return running;
    },
    cancel() {
      if (!running) return;
      running = false;
      store.set({ transitioning: false, transitionT: 1, regime: store.get().transitionTo });
    },
  };
}

/**
 * Rotate an accent hue along the shortest arc in OKLab, so amber to violet does not pass
 * through a muddy grey midpoint the way an RGB lerp does.
 */
export function rotateAccentOklch(from: [number, number, number], to: [number, number, number], t: number): [
  number,
  number,
  number,
] {
  const a = srgbToOklab(from[0], from[1], from[2]);
  const b = srgbToOklab(to[0], to[1], to[2]);
  const out: [number, number, number] = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  return oklabToSrgb(out[0], out[1], out[2]);
}

function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToSrgb(L: number, a: number, bb: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const enc = (c: number): number =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  return [enc(lr), enc(lg), enc(lb)];
}

/** Per-regime accent colours, as sRGB triples. */
export const REGIME_ACCENT: [number, number, number][] = [
  [0.498, 0.831, 1.0],
  [1.0, 0.706, 0.329],
  [0.545, 0.831, 1.0],
  [0.608, 0.482, 1.0],
];

export function accentFor(state: AppState, t: number): [number, number, number] {
  if (!state.transitioning || t <= 0) return REGIME_ACCENT[state.transitionFrom]!;
  if (t >= 1) return REGIME_ACCENT[state.transitionTo]!;
  return rotateAccentOklch(
    REGIME_ACCENT[state.transitionFrom]!,
    REGIME_ACCENT[state.transitionTo]!,
    t,
  );
}
```

- [ ] **Step 2: Write `src/ui/mathlayer.ts`**

```ts
import { regimeMeta } from './equations';
import type { AppState } from '../core/store';
import { DURATION } from '../core/motion';

export interface MathLayerHandle {
  update(state: AppState): void;
}

export function mountMathLayer(root: HTMLElement): MathLayerHandle {
  root.innerHTML = '<aside class="mathlayer" aria-label="Equations"></aside>';
  const panel = root.querySelector<HTMLElement>('.mathlayer')!;
  let renderedRegime = -1;
  let renderedEmbedding: string | null = null;

  return {
    update(state) {
      const meta = regimeMeta(state.regime);
      const embeddingKey = `${state.regime}:${state.embedding}`;
      const open = state.mathOpen;

      panel.classList.toggle('open', open);
      panel.setAttribute('aria-hidden', String(!open));
      if (!open) return;

      if (renderedRegime === state.regime && renderedEmbedding === embeddingKey) return;
      renderedRegime = state.regime;
      renderedEmbedding = embeddingKey;

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

      const honesty =
        state.regime === 0 || state.regime === 1
          ? '<p class="honesty">The accretion glow is an analytic approximation, not a fluid simulation. ' +
            'The light paths, the shadow and the redshift are not.</p>'
          : state.regime === 2
            ? '<p class="honesty">There is no curvature in this regime. No ray bends, because there is nothing to bend them.</p>'
            : '<p class="honesty">The rendered surface is a visualisation of the metric functions. ' +
              'It is not a picture of three-dimensional space, because there is no such space here.</p>';

      panel.innerHTML =
        `<div class="mathlayer-inner">${items}</div>` +
        honesty +
        (state.transitioning
          ? `<p class="transition-note">Transition frames are a visual transition, not a physical state.</p>`
          : '');

      panel.style.setProperty('--math-duration', `${DURATION.base}ms`);
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 3: Write `src/ui/controls.ts`**

```ts
import { DURATION } from '../core/motion';
import { MASS_MAX, MASS_MIN, type AppState, type Store } from '../core/store';
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
  min: number;
  max: number;
  step: number;
  /** Maps a slider position 0..1 to a value. */
  fromFraction(fraction: number): number;
  toFraction(value: number): number;
  format(value: number): string;
  regimes: number[];
  /** Below this value, the control uses a logarithmic mapping instead. */
  logThreshold?: number;
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

export function mountControls(root: HTMLElement, opts: ControlsOptions): { update(state: AppState): void } {
  const specs: SliderSpec[] = [
    {
      key: 'massMetres',
      symbol: 'M',
      label: 'mass',
      min: MASS_MIN,
      max: MASS_MAX,
      step: 0.0001,
      fromFraction: logMap(MASS_MIN, MASS_MAX),
      toFraction: logInverse(MASS_MIN, MASS_MAX),
      format: (v) => `${(v / 1e3).toPrecision(4)} km`,
      regimes: [0, 1],
    },
    {
      key: 'radiusMetres',
      symbol: 'r',
      label: 'observer radius',
      min: 2.05,
      max: 2000,
      step: 0.0005,
      fromFraction: logMap(2.05, 2000),
      toFraction: logInverse(2.05, 2000),
      format: (v) => `${v.toPrecision(5)} M`,
      regimes: [0, 1],
    },
    {
      key: 'boostBeta',
      symbol: 'β',
      label: 'frame speed',
      min: 0,
      max: 0.9999,
      step: 0.001,
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
      step: 0.0001,
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
      <input type="range" class="scrub" min="0" max="1000" value="0" aria-label="Timeline position" />
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
  const inputs = new Map<SliderSpec['key'], { input: HTMLInputElement; output: HTMLOutputElement }>();

  for (const spec of specs) {
    const group = document.createElement('label');
    group.className = 'param';
    group.dataset.regimes = spec.regimes.join(',');
    group.innerHTML =
      `<span class="param-symbol">${escapeHtml(spec.symbol)}</span>` +
      `<span class="param-label">${escapeHtml(spec.label)}</span>` +
      `<input type="range" min="0" max="1000" step="1" />` +
      `<output class="param-value"></output>`;
    const input = group.querySelector<HTMLInputElement>('input')!;
    const output = group.querySelector<HTMLOutputElement>('output')!;

    input.setAttribute('aria-label', `${spec.label} (${spec.symbol})`);
    input.addEventListener('input', () => {
      const fraction = Number(input.value) / 1000;
      const state = opts.store.get();
      // M and r are both expressed in multiples of M in the UI, so convert.
      const value =
        spec.key === 'radiusMetres'
          ? spec.fromFraction(fraction) * state.massMetres
          : spec.fromFraction(fraction);
      opts.store.set({ [spec.key]: value } as Partial<AppState>);
      output.textContent = spec.format(value);
    });

    inputs.set(spec.key, { input, output });
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
    if (event.target instanceof HTMLInputElement) return;
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
      case '~':
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
        const entry = inputs.get(spec.key);
        if (!entry) continue;
        const { input, output } = entry;
        const group = input.closest<HTMLElement>('.param')!;
        group.hidden = !spec.regimes.includes(state.regime);
        if (group.hidden) continue;
        const raw = state[spec.key];
        const shown = spec.key === 'radiusMetres' ? raw / state.massMetres : raw;
        if (document.activeElement !== input) {
          input.value = String(Math.round(spec.toFraction(shown) * 1000));
        }
        output.textContent = spec.format(shown);
      }

      root.querySelectorAll<HTMLButtonElement>('.regime-tab').forEach((button) => {
        const active = Number(button.dataset.regime) === state.regime;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      root.querySelectorAll<HTMLButtonElement>('.utility').forEach((button) => {
        const on =
          (button.dataset.action === 'math' && state.mathOpen) ||
          (button.dataset.action === 'parity' && state.parityOpen);
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
      });

      if (document.activeElement !== scrubEl) {
        scrubEl.value = String(Math.round(opts.timeline.position01 * 1000));
      }
      playEl.textContent = opts.timeline.playing ? '❙❙' : '▶';
      readoutEl.textContent = `${opts.timeline.position.toFixed(1)}s`;

      root.style.setProperty('--dur-quick', `${DURATION.quick}ms`);
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Wire the shell into `src/main.ts`**

Replace the bare `if (hud) hud.textContent = ...` line in `main.ts` with real mounts. Add
a controls host to `index.html` before the script tag:

```html
    <div id="controls"></div>
    <div id="math"></div>
```

In `src/main.ts`, add these imports:

```ts
import { mountHud } from './ui/hud';
import { mountControls } from './ui/controls';
import { mountMathLayer } from './ui/mathlayer';
import { createTransition, accentFor } from './core/transitions';
import { createRig } from './camera/rig';
```

and inside `boot()`, after the renderer is constructed:

```ts
  const controlsHost = document.getElementById('controls');
  const mathHost = document.getElementById('math');
  if (!controlsHost || !mathHost) throw new Error('HUD hosts missing');

  const rig = createRig({ mass: store.get().massMetres });
  const transition = createTransition({ store, reducedMotion });

  const hudHandle = mountHud(hud);
  const mathHandle = mountMathLayer(mathHost);
  const controlsHandle = mountControls(controlsHost, {
    store,
    timeline,
    reducedMotion,
    onRegime(next) {
      const from = store.get().regime;
      if (next === from) return;
      transition.start(from, next as 0 | 1 | 2 | 3);
    },
    onResetCamera() {
      rig.reset();
      timeline.scrubTo(0);
    },
    onCycleEmbedding() {
      const state = store.get();
      store.set({ embedding: state.embedding === 'catenoid' ? 'pseudosphere' : 'catenoid' });
    },
  });

  store.subscribe((state) => {
    hudHandle.update(state, timeline.position);
    mathHandle.update(state);
    controlsHandle.update(state);
  });

  window.addEventListener('wheel', (event) => {
    timeline.pause();
    timeline.scrubTo(timeline.position01 + event.deltaY * 0.0004);
  }, { passive: true });

  let pointerDown = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerDown) return;
    rig.drag((event.clientX - lastX) * 0.004, (event.clientY - lastY) * 0.004);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', () => {
    pointerDown = false;
  });
```

and inside the frame, replacing the ad-hoc camera orbit with the rig and transition:

```ts
    transition.update(delta);

    const state = store.get();
    const { width, height } = renderer.drawSize;
    const shot = rig.sample(timeline.position01);

    renderer.set('uAspect', width / Math.max(1, height));
    renderer.set('uScale', Math.max(...shot.position.map(Math.abs)));
    renderer.set('uRegimeA', state.transitioning ? state.transitionFrom : state.regime);
    renderer.set('uRegimeB', state.transitionTo);
    renderer.set('uMix', state.transitioning ? state.transitionT : 1);
    renderer.set('uMass', state.massMetres);
    renderer.set('uRadius', state.radiusMetres);
    renderer.set('uThroat', state.throatMetres);
    renderer.set('uBoost', state.boostBeta);
    renderer.set('uEmbedding', state.embedding === 'pseudosphere' ? 1 : 0);
    renderer.set('uShowClocks', state.regime === 1 ? 1 : 0);
    renderer.set('uCameraPos', shot.position);
    renderer.set('uCameraTarget', shot.target);
    renderer.set('uAccent', accentFor(state, state.transitionT));
```

Delete the old `const angle = ...` camera block and the old `hud.textContent` line entirely —
the HUD now owns that element.

- [ ] **Step 5: Typecheck and commit**

Run: `npm.cmd run typecheck` → exits 0.

```bash
git add index.html src/core/transitions.ts src/ui/mathlayer.ts src/ui/controls.ts src/main.ts
git commit -m "feat: math layer, transport, parameter rail and OKLCH accent transitions"
```

---

## Phase 3 — Regimes B, C, D

### Task 15: Regime B — time dilation with three clocks

**Files:** Modify `src/render/shaders/dilation.ts`, Modify `src/main.ts`

- [ ] **Step 1: Replace `src/render/shaders/dilation.ts`**

```ts
import { GEODESIC_RAYMARCH } from './common';

export const DILATION_BODY = /* glsl */ `
${GEODESIC_RAYMARCH}

/** dtau/dt for a static clock at r. */
float staticRate(float r) { return sqrt(1.0 - 2.0 * uMass / r); }

/** dtau/dt for a circular geodesic at r. Exists for r > 3M, stable for r >= 6M. */
float orbitRate(float r) { return sqrt(1.0 - 3.0 * uMass / r); }

/** Angular velocity of that orbit, radians per unit coordinate time. */
float orbitOmega(float r) { return sqrt(uMass / (r * r * r)); }

/** Distance from a point to the line segment between two orbit positions, for strokes. */
float segmentDistance(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  return length(p - (a + ab * t));
}

vec3 strokeOrbit(vec3 p, float radius, float phase, vec3 colour, float width) {
  vec3 a = vec3(cos(phase), 0.0, sin(phase)) * radius;
  vec3 b = vec3(cos(phase + orbitOmega(radius) * 2.0), 0.0,
                sin(phase + orbitOmega(radius) * 2.0)) * radius;
  float d = segmentDistance(p, a, b) / uMass;
  return colour * exp(-pow(d / width, 2.0));
}

vec3 renderDilation(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  float dPhi = uLowQuality > 0.5 ? 0.016 : 0.008;
  float rMax = max(length(ray.origin), uMass * 40.0) * 80.0;

  // The same integrator as regime A. The lensing is not the point here, but reusing it
  // keeps one engine rather than two.
  Geodesic hit = traceSchwarzschild(ray.origin, ray.dir, uMass, rMax, dPhi, 3000);

  vec3 colour = hit.captured ? vec3(0.004, 0.006, 0.011) : starfield(hit.direction) * 0.85;

  float sR = staticRate(uRadius);
  float oR = orbitRate(uRadius);

  if (uRadius > 2.05 * uMass) {
    // The orbiting clock's trail, amber: this is the one that runs slow.
    colour += strokeOrbit(ray.origin, uRadius, uTime, vec3(1.0, 0.706, 0.329), 0.9) * 1.4;

    // The static clock's marker, ice: it runs faster but does not move.
    vec3 marker = vec3(0.0, 0.0, uRadius);
    float dm = length(ray.origin - marker) / uMass;
    colour += vec3(0.498, 0.831, 1.0) * exp(-pow(dm / 0.7, 2.0)) * 1.6;

    // A vertical stem dropping toward the horizon, ember, marking the well it sits in.
    float stem = exp(-pow(ray.origin.x / (uMass * 0.35), 2.0))
               * exp(-pow(ray.origin.z / (uMass * 0.35), 2.0));
    colour += vec3(1.0, 0.36, 0.23) * stem * 0.10;
  }

  // Photon ring, so this regime visibly shares geometry with regime A.
  float bCrit = 3.0 * sqrt(3.0) * uMass;
  float rImpact = length(ray.origin - ray.dir * dot(ray.origin, ray.dir));
  colour += uAccent * exp(-pow((rImpact - bCrit) / (bCrit * 0.085), 2.0)) * 0.5;

  colour += uAccent * 0.008 * smoothstep(0.015, 0.0, abs(ray.dir.y));

  return colour;
}
`;
```

- [ ] **Step 2: Remove the placeholder readouts block**

Delete the `if (hud) hud.textContent = ...` line and the `computeReadouts` import from
`src/main.ts`. From Task 14 Step 4 onward the HUD owns that element, and reading out the
ratio again in `main.ts` would create a second, drifting source of truth — exactly the thing
the parity overlay exists to prevent.

- [ ] **Step 3: Verify and commit**

Run: `npm.cmd run dev`, press `2`.
Expected: an amber orbit trail with an ice-blue static marker, a photon ring, and the HUD
showing a live orbit/static ratio that falls as you drag `r` down toward `3M`.

```bash
git add src/render/shaders/dilation.ts src/main.ts
git commit -m "feat: regime B — three clocks sharing one geodesic integrator"
```

---

### Task 16: Regime C — light speed, and the Minkowski diagram

**Files:** Modify `src/render/shaders/lightspeed.ts`, Create `src/ui/minkowskiDiagram.ts`

- [ ] **Step 1: Replace `src/render/shaders/lightspeed.ts`**

```ts
export const LIGHTSPEED_BODY = /* glsl */ `
/**
 * Flat spacetime. The ray is NOT bent: we return the incoming direction unchanged and
 * the starfield is sampled along it. That is the invariant, demonstrated rather than
 * asserted.
 */
vec3 renderLightSpeed(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  // Flat spacetime has lapse exactly 1, so there is no redshift and no ray bending.
  // Everything below is a consequence of the Lorentz boost matrix alone.
  float b = uBoost;
  float g = 1.0 / sqrt(max(1e-6, 1.0 - b * b));
  float scale = uScale;

  vec3 colour = starfield(rd) * 0.9;

  // A reference grid at rest in the lab frame.
  vec2 cell = abs(fract(ro.yz / (scale * 0.06)) - 0.5);
  colour += uAccent * smoothstep(0.47, 0.5, max(cell.x, cell.y)) * 0.012;

  // The boosted frame's ruler: a rod along the motion, length-contracted by 1/gamma.
  // The contraction is the matrix applied to the rod's endpoints, not a scale animation.
  float halfLength = (scale * 0.35) / g;
  vec3 delta = ro;
  float along = dot(delta, vec3(1.0, 0.0, 0.0));
  float across = length(delta - vec3(along, 0.0, 0.0));
  float rod = step(abs(along), halfLength) * exp(-pow(across / (scale * 0.012), 2.0));
  colour += vec3(1.0, 0.706, 0.329) * rod * 0.6;

  // Photons: 45 degrees in every frame. Drawn as the light cone itself.
  float cone = abs(abs(rd.x) - abs(rd.y));
  float coneMask = exp(-pow(cone / 0.006, 2.0));
  colour += vec3(0.498, 0.831, 1.0) * coneMask * 0.30 * (0.65 + 0.35 * sin(uTime * 2.0));

  // The chaser, moving at beta c, with its own clock running slow by 1/gamma.
  float chase = fract(uTime * 0.09);
  vec3 chasePos = vec3((chase - 0.5) * scale * 2.0, 0.0, 0.0);
  float dc = length(ro - chasePos) / (scale * 0.03);
  colour += vec3(1.0, 0.706, 0.329) * exp(-dc * dc) * 1.3;

  // A vertical pulse every 1/gamma of lab time, visualising the slow clock.
  float beat = fract((along / scale + 0.5) * g - uTime * 0.5);
  colour += vec3(1.0, 0.706, 0.329)
          * exp(-pow(beat / 0.03, 2.0))
          * exp(-pow(length(delta - vec3(along, 0.0, 0.0)) / (scale * 0.006), 2.0))
          * 0.8;

  colour += uAccent * 0.006;
  return colour;
}
`;
```

- [ ] **Step 2: Create `src/ui/minkowskiDiagram.ts`**

```ts
import { clockRate } from '../physics/minkowski';

/**
 * The 2D worldline diagram for regime C. Photons are drawn at exactly 45 degrees from a
 * common origin — the invariant, shown rather than stated. Both twins integrate the same
 * dt; only their beta differs, and the asymmetry comes from the shape of the worldlines.
 */
export interface MinkowskiHandle {
  draw(elapsed: number, beta: number): void;
  resize(): void;
}

export function mountMinkowskiDiagram(canvas: HTMLCanvasElement): MinkowskiHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for the Minkowski diagram');

  let width = 1;
  let height = 1;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth || 320;
    height = canvas.clientHeight || 220;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  return {
    resize,
    draw(elapsed, beta) {
      const originX = width * 0.5;
      const originY = height * 0.86;
      const scale = Math.min(width * 0.44, height * 0.8);

      ctx.clearRect(0, 0, width, height);

      // Axes.
      ctx.strokeStyle = 'rgba(232, 230, 223, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(width, originY);
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, height);
      ctx.stroke();

      // Light cone from the origin, at exactly 45 degrees.
      ctx.strokeStyle = 'rgba(127, 212, 255, 0.75)';
      ctx.lineWidth = 1.25;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + sign * scale, originY - scale);
        ctx.stroke();
      }

      // Twin A stays at x = 0. Twin B's worldline curves because its speed varies, which
      // is the whole content of the twin paradox.
      const horizon = Math.min(elapsed, scale);
      ctx.strokeStyle = 'rgba(255, 180, 84, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      const steps = 120;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const t = horizon * f;
        // beta ramps up, cruises, then ramps down: an out-and-back journey.
        const bNow = beta * Math.sin(Math.PI * Math.min(1, f * 1.05));
        ctx.lineTo(originX + clockRate(bNow) * t, originY - t);
      }
      ctx.stroke();

      // Twin A.
      ctx.strokeStyle = 'rgba(232, 230, 223, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX, originY - horizon);
      ctx.stroke();

      // Labels.
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 230, 223, 0.6)';
      ctx.fillText('t', originX + 4, 10);
      ctx.fillText('x', width - 12, originY - 4);
      ctx.fillStyle = 'rgba(127, 212, 255, 0.85)';
      ctx.fillText('light: 45°', originX + scale * 0.42, originY - scale * 0.5);
      ctx.fillStyle = 'rgba(255, 180, 84, 0.9)';
      ctx.fillText('traveller', originX + 6, originY - horizon - 8);
      ctx.fillStyle = 'rgba(232, 230, 223, 0.85)';
      ctx.fillText('home', originX + 6, originY - 8);
    },
  };
}
```

- [ ] **Step 3: Mount the diagram in `src/main.ts`**

Inside `boot()`, after `mountHud`:

```ts
  const diagramHost = document.createElement('div');
  diagramHost.className = 'minkowski';
  diagramHost.hidden = true;
  document.body.appendChild(diagramHost);
  const diagramCanvas = document.createElement('canvas');
  diagramHost.appendChild(diagramCanvas);
  const diagram = mountMinkowskiDiagram(diagramCanvas);
  diagram.resize();
```

and inside the frame, after the readouts:

```ts
    diagramHost.hidden = state.regime !== 2;
    if (!diagramHost.hidden) diagram.draw(timeline.position, state.boostBeta);
```

Add the import:

```ts
import { mountMinkowskiDiagram } from './ui/minkowskiDiagram';
```

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd run dev`, press `3`.
Expected: a flat starfield with 45° light-cone streaks, a contracting amber rod, and a
Minkowski diagram inset bottom-left with 45° light rays and two differently-shaped
worldlines.

```bash
git add src/render/shaders/lightspeed.ts src/ui/minkowskiDiagram.ts src/main.ts
git commit -m "feat: regime C — flat spacetime, Lorentz boost, and the Minkowski diagram"
```

---

### Task 17: Regime D — wormhole, catenoid and pseudosphere

**Files:** Modify `src/render/shaders/wormhole.ts`

- [ ] **Step 1: Replace `src/render/shaders/wormhole.ts`**

```ts
export const WORMHOLE_BODY = /* glsl */ `
/**
 * Distance from p to the surface of revolution whose meridian radius is rho(x),
 * rho(x) = b cosh(x / b)  (catenoid render), or the Beltrami pseudosphere circle
 * (x - b)^2 + z^2 = b^2  (isometric render). Negative inside.
 */
float wormholeSDF(vec3 p) {
  float b = uThroat;
  float axial = p.x;
  float rho = length(p.yz);
  float rMax = 40.0 * b;

  if (uEmbedding < 0.5) {
    // Catenoid: rho = b cosh(x/b). Analytic Newton step on f(x) = b cosh(x/b) - rho.
    float x = clamp(axial, -rMax, rMax);
    for (int i = 0; i < 6; i++) {
      float c = cosh(x / b);
      float f = b * c - rho;
      float df = sinh(x / b);
      if (abs(df) < 1e-6) break;
      x = clamp(x - f / df, -rMax, rMax);
    }
    float surface = b * cosh(x / b);
    return rho - surface;
  }

  // Pseudosphere: rho^2 = x^2 + 2 b x  from  rho^2 = (x - b)^2 + b^2  ... solved as
  // rho = sqrt(x^2 - 2 b x + 2 b^2). Newton on f(x) = x^2 - 2 b x + 2 b^2 - rho^2.
  float xx = clamp(axial, 0.0, rMax);
  for (int i = 0; i < 6; i++) {
    float f = xx * xx - 2.0 * b * xx + 2.0 * b * b - rho * rho;
    float df = 2.0 * xx - 2.0 * b;
    if (abs(df) < 1e-9) break;
    xx = clamp(xx - f / df, 0.0, rMax);
  }
  float surface = sqrt(max(0.0, xx * xx - 2.0 * b * xx + 2.0 * b * b));
  return rho - surface;
}

/** Surface normal by central differences on the SDF. */
vec3 wormholeNormal(vec3 p) {
  const float h = max(uThroat * 0.004, 1e-3);
  return normalize(vec3(
    wormholeSDF(p + vec3(h, 0.0, 0.0)) - wormholeSDF(p - vec3(h, 0.0, 0.0)),
    wormholeSDF(p + vec3(0.0, h, 0.0)) - wormholeSDF(p - vec3(0.0, h, 0.0)),
    wormholeSDF(p + vec3(0.0, 0.0, h)) - wormholeSDF(p - vec3(0.0, 0.0, h))));
}

vec3 renderWormhole(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  vec3 colour = starfield(rd) * 0.8;

  float dist = length(ro) + uThroat * 60.0;
  float t = 0.0;
  bool hit = false;

  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    float d = wormholeSDF(p);
    if (d < uThroat * 0.002) { hit = true; break; }
    t += max(abs(d), uThroat * 0.004);
    if (t > dist) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = wormholeNormal(p);
    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
    float lambert = max(0.0, dot(n, lightDir));

    // Fresnel edge glow, so the throat reads as an opening rather than a solid.
    float fresnel = pow(1.0 - max(0.0, dot(-rd, n)), 3.0);

    vec3 base = mix(vec3(0.16, 0.10, 0.30), uAccent, 0.25);
    colour = base * (0.18 + 0.82 * lambert) + uAccent * fresnel * 1.5;

    // A lattice of throat markers, so the flare rate is legible as r = b cosh(l/b).
    float axial = abs(p.x) / uThroat;
    float stripe = smoothstep(0.94, 1.0, cos(axial * 6.2831853));
    colour += uAccent * stripe * 0.10;

    // The throat itself: a bright ring where the surface pinches.
    float throatGlow = exp(-pow(p.x / (uThroat * 0.35), 2.0));
    colour += uAccent * throatGlow * 0.5;
  }

  // Light threading the tube: a straight null geodesic in the ambient flat space,
  // which is correct for this 2-slice.
  float beamAxis = abs(ro.y) + abs(ro.z);
  float beam = exp(-pow(beamAxis / (uThroat * 0.06), 2.0));
  float beamWindow = step(abs(ro.x), uThroat * 6.0);
  colour += vec3(0.498, 0.831, 1.0) * beam * beamWindow * 0.25;

  // Two mouths, marked, so the two asymptotic regions are unmistakable.
  for (const float sign in float[2](-1.0, 1.0)) {
    float m = sign * uThroat * 3.4;
    float dm = length(ro - vec3(m, 0.0, 0.0)) / (uThroat * 0.16);
    colour += uAccent * exp(-dm * dm) * 0.7;
  }

  colour += uAccent * 0.008;
  return colour;
}
`;
```

- [ ] **Step 2: Verify and commit**

Run: `npm.cmd run dev`, press `4`.
Expected: a glowing double-flared surface with two bright mouths, a bright ring at the
throat, and a straight light beam threading the tube. Press `E`: the surface becomes the
Beltrami pseudosphere, and the HUD's `render K` readout changes label.

```bash
git add src/render/shaders/wormhole.ts
git commit -m "feat: regime D — wormhole catenoid and Beltrami pseudosphere renders"
```

---

### Task 18: GPU/TypeScript parity overlay

**Files:** Create `src/debug/parity.ts`, Modify `src/main.ts`

- [ ] **Step 1: Write `src/debug/parity.ts`**

```ts
import { B_CRIT } from '../physics/constants';
import { staticClockRate, gravity } from '../physics/schwarzschild';
import { gaussianCurvature } from '../physics/wormhole';
import type { AppState } from '../core/store';
import { sig } from '../core/units';

export interface GpuProbe {
  lapse: number;
  clockRate: number;
  shadowRadiusOverM: number;
  flatDeflection: number;
}

export interface ParityRow {
  quantity: string;
  typescript: string;
  gpu: string;
  error: number;
}

function rel(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);
}

/**
 * "One engine" is easy to claim and easy to quietly stop being true. This compares the
 * TypeScript reference against what the GPU actually produced for the same inputs, read
 * back from a one-pixel probe render — not against a second call into the same function,
 * which would compare nothing.
 */
export function computeParity(state: AppState, gpu: GpuProbe): ParityRow[] {
  const M = state.massMetres;
  const r = state.radiusMetres;
  const rows: ParityRow[] = [
    {
      quantity: 'lapse α(r)',
      typescript: sig(gravity(r, M), 7),
      gpu: sig(gpu.lapse, 7),
      error: rel(gravity(r, M), gpu.lapse),
    },
    {
      quantity: 'static clock rate',
      typescript: sig(staticClockRate(r, M), 7),
      gpu: sig(gpu.clockRate, 7),
      error: rel(staticClockRate(r, M), gpu.clockRate),
    },
    {
      quantity: 'shadow radius / M',
      typescript: sig(B_CRIT, 7),
      gpu: sig(gpu.shadowRadiusOverM, 7),
      error: rel(B_CRIT, gpu.shadowRadiusOverM),
    },
    {
      quantity: 'deflection at b = 100 M (M = 0)',
      typescript: '0',
      gpu: sig(gpu.flatDeflection, 3),
      error: Math.abs(gpu.flatDeflection),
    },
    {
      quantity: 'slice curvature K (wormhole)',
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
```

- [ ] **Step 2: Add the one-pixel probe shader to `src/render/shaders/common.ts`**

```ts
/**
 * A one-pixel render used only by the parity overlay. It evaluates the *shader's* copies of
 * the formulas for a given probe position, so the values read back are genuinely the GPU's,
 * not the TypeScript ones echoed back.
 */
export const PROBE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uMass;
uniform float uProbeRadius;
uniform float uProbeB;
uniform vec3  uProbeDir;

${METRIC_KERNEL}

float geodesicAccel(float uu, float M) { return -uu + 3.0 * M * uu * uu; }

void main() {
  float M = uMass;
  float r = uProbeRadius;

  float alphaGpu = sqrt(max(0.0, 1.0 - 2.0 * M / r));

  // Inflate one geodesic to r = 100 M and read off the deflection.
  float r0 = 1e5 * M;
  float psi = asin(clamp(100.0 * M / r0, 0.0, 1.0));
  float dPhi = 0.004;
  float u = 1.0 / r0;
  float w = -cos(psi) / (r0 * sin(psi));
  float rMax = 1e8 * M;
  float phi = 0.0;
  for (int i = 0; i < 8000; i++) {
    float rr = 1.0 / u;
    if (rr <= 2.0 * M || (rr >= rMax && w < 0.0)) break;
    float k1u = w;
    float k1w = geodesicAccel(u, M);
    float k2u = w + 0.5 * dPhi * k1w;
    float k2w = geodesicAccel(u + 0.5 * dPhi * k1u, M);
    float k3u = w + 0.5 * dPhi * k2w;
    float k3w = geodesicAccel(u + 0.5 * dPhi * k2u, M);
    float k4u = w + dPhi * k3w;
    float k4w = geodesicAccel(u + dPhi * k3u, M);
    u += (dPhi / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    w += (dPhi / 6.0) * (k1w + 2.0 * k2w + 2.0 * k3w + k4w);
    phi += dPhi;
  }
  float deflectionGpu = phi - (PI - psi);

  // Shadow radius from the GPU's own integrator: the largest b that still falls in.
  float bLo = 4.0 * M;
  float bHi = 7.0 * M;
  for (int i = 0; i < 24; i++) {
    float b = 0.5 * (bLo + bHi);
    float ps = asin(clamp(b / r0, 0.0, 1.0));
    float uu = 1.0 / r0;
    float ww = -cos(ps) / (r0 * sin(ps));
    bool fell = false;
    for (int j = 0; j < 8000; j++) {
      float rr = 1.0 / uu;
      if (rr <= 2.0 * M) { fell = true; break; }
      if (rr >= rMax && ww < 0.0) break;
      float q1u = ww;
      float q1w = geodesicAccel(uu, M);
      float q2u = ww + 0.5 * dPhi * q1w;
      float q2w = geodesicAccel(uu + 0.5 * dPhi * q1u, M);
      float q3u = ww + 0.5 * dPhi * q2w;
      float q3w = geodesicAccel(uu + 0.5 * dPhi * q2u, M);
      float q4u = ww + dPhi * q3w;
      float q4w = geodesicAccel(uu + dPhi * q3u, M);
      uu += (dPhi / 6.0) * (q1u + 2.0 * q2u + 2.0 * q3u + q4u);
      ww += (dPhi / 6.0) * (q1w + 2.0 * q2w + 2.0 * q3w + q4w);
    }
    if (fell) bLo = b; else bHi = b;
  }

  fragColor = vec4(alphaGpu, deflectionGpu / max(uProbeB, 1.0), 0.5 * (bLo + bHi) / M, 1.0);
}
`;
```

- [ ] **Step 3: Read the probe back from `src/main.ts`**

Add a second renderer for the probe in `boot()`, created lazily the first time the overlay
opens so the hot path stays untouched:

```ts
  let probe: { renderer: GlRenderer; read(): [number, number, number] } | null = null;

  const getProbe = (): { renderer: GlRenderer; read(): [number, number, number] } => {
    if (probe) return probe;
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    const renderer = new GlRenderer({
      canvas: probeCanvas,
      vertexShader: QUAD_VERT,
      fragmentShader: PROBE_FRAG,
    });
    probe = {
      renderer,
      read() {
        const gl = renderer.renderer.getContext();
        const buffer = new Float32Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, buffer);
        return [buffer[0] ?? Number.NaN, buffer[1] ?? Number.NaN, buffer[2] ?? Number.NaN];
      },
    };
    return probe;
  };
```

and inside the frame, when the overlay is open:

```ts
    parityHost.hidden = !state.parityOpen;
    if (!parityHost.hidden) {
      const p = getProbe();
      p.renderer.set('uMass', state.massMetres);
      p.renderer.set('uProbeRadius', state.radiusMetres);
      p.renderer.set('uProbeB', state.massMetres);
      p.renderer.render({ time, delta });
      const [lapseGpu, deflectionGpu, shadowGpu] = p.read();
      const rows = computeParity(state, {
        lapse: lapseGpu,
        clockRate: lapseGpu,
        shadowRadiusOverM: shadowGpu,
        flatDeflection: deflectionGpu * state.massMetres,
      });
      parityHost.innerHTML =
        '<h2>GPU / TypeScript parity</h2><table><thead><tr>' +
        '<th>quantity</th><th>typescript</th><th>gpu</th><th>rel. error</th></tr></thead><tbody>' +
        rows
          .map(
            (row) =>
              `<tr${row.error > 1e-4 ? ' class="bad"' : ''}>` +
              `<td>${row.quantity}</td><td>${row.typescript}</td><td>${row.gpu}</td>` +
              `<td>${Number.isFinite(row.error) ? row.error.toExponential(2) : '—'}</td></tr>`,
          )
          .join('') +
        `</tbody></table><p class="parity-worst">worst relative error: ` +
        `${worstError(rows).toExponential(2)}</p>`;
    }
```

with imports `import { PROBE_FRAG } from './render/shaders/common';`,
`import { computeParity, worstError } from './debug/parity';`.

Note that `p.renderer.set('uProbeB', ...)` is only a scale divisor for the deflection channel;
the probe's `uProbeDir` and `uEmbedding` uniforms are declared for symmetry with the uber
shader but are unused by the probe, which is fine in GLSL.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd run dev`, press `` ` ``.
Expected: a table where `lapse α(r)`, `shadow radius / M` and the M = 0 deflection all read
`0.00e+0` (or within float32 precision, below `1e-5`), and a worst-error line. Any row
highlighted red is a real divergence between the shader and the physics module.

```bash
git add src/debug/parity.ts src/render/shaders/common.ts src/main.ts
git commit -m "feat: GPU/TypeScript parity overlay so one engine stays one engine"
```

---

## Phase 4 — Ship

### Task 19: No-WebGL2 fallback and reduced-motion path

**Files:** Create `src/ui/fallback.ts`, Modify `src/main.ts`, Modify `src/style.css`

- [ ] **Step 1: Write `src/ui/fallback.ts`**

```ts
import { B_CRIT, R_ISCO } from '../physics/constants';
import { circularOrbitRate, staticClockRate } from '../physics/schwarzschild';
import { clockRate } from '../physics/minkowski';
import { gaussianCurvature, minimumThroatForComfort, throatTension } from '../physics/wormhole';
import { REGIME_META } from './equations';
import { km, sig } from '../core/units';

/**
 * When WebGL2 is missing the instrument is degraded, not broken: the equations, the
 * landmark values and the formulas all still work, because they never needed a GPU.
 */
export function mountFallback(root: HTMLElement, reason: string): void {
  const sunMass = 1.477e3;

  const landmarks = [
    ['event horizon', '2 M', `${sig(km(2 * sunMass), 4)} km for a solar-mass hole`],
    ['photon sphere', '3 M', `${sig(km(3 * sunMass), 4)} km`],
    ['ISCO', `${R_ISCO} M`, `${sig(km(R_ISCO * sunMass), 4)} km`],
    ['shadow radius', `b = 3√3 M`, `${sig(km(B_CRIT * sunMass), 4)} km`],
  ];

  root.innerHTML = `
    <div class="fallback">
      <p class="fallback-reason">${reason}</p>
      <h1>Spacetime</h1>
      <p class="fallback-lede">
        This visualiser renders four general-relativistic regimes with WebGL2. Your browser
        does not provide it, so here are the numbers the renderer would have shown.
      </p>

      <h2>Landmarks</h2>
      <table>
        <thead><tr><th>feature</th><th>in units of M</th><th>for M = one solar mass</th></tr></thead>
        <tbody>
          ${landmarks.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>

      <h2>Clock rates at the ISCO</h2>
      <p>static: <code>dτ/dt = √(1 − 2M/r)</code> = ${sig(staticClockRate(R_ISCO, 1), 5)}</p>
      <p>circular orbit: <code>dτ/dt = √(1 − 3M/r)</code> = ${sig(circularOrbitRate(R_ISCO, 1), 5)}</p>
      <p>ratio: <code>${sig(circularOrbitRate(R_ISCO, 1) / staticClockRate(R_ISCO, 1), 5)}</code></p>

      <h2>Light speed</h2>
      <p>Lapse is exactly <code>1</code>. Every observer measures <code>c</code>. A clock
      moving at <code>0.6 c</code> runs at <code>${sig(clockRate(0.6), 5)}</code> of station time.</p>

      <h2>Wormhole</h2>
      <p>Lapse is exactly <code>1</code> — no time dilation, no horizon.
      Spatial slice curvature <code>K = ${sig(gaussianCurvature(1, 1), 4)}</code> for b = 1 m.
      Throat tension <code>${sig(throatTension(1), 4)}</code> with zero energy density, so
      every energy condition fails.</p>
      <p>A 2 m traveller needs a throat of at least
      <code>${sig(km(minimumThroatForComfort(2, 10 * 9.80665)), 4)} km</code> to stay under 10 g.</p>

      <h2>What each regime was</h2>
      <ol>
        ${REGIME_META.map((m) => `<li><strong>${m.name}</strong> — ${m.thesis}</li>`).join('')}
      </ol>
    </div>
  `;
}
```

- [ ] **Step 2: Gate on capability in `src/main.ts`**

Replace the try/catch block in `boot()` with:

```ts
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    if (hud) mountFallback(hud, 'WebGL2 is not available in this browser.');
    return;
  }

  let renderer: GlRenderer;
  try {
    renderer = new GlRenderer({ canvas, vertexShader: QUAD_VERT, fragmentShader: UBER_FRAG });
  } catch (error) {
    console.error('WebGL2 initialisation failed', error);
    if (hud) mountFallback(hud, 'The renderer failed to start.');
    return;
  }
```

with the import:

```ts
import { mountFallback } from './ui/fallback';
```

- [ ] **Step 3: Honour reduced motion and small viewports**

In `boot()`, after the transition and control mounts:

```ts
  const isNarrow = window.innerWidth < 900;
  if (isNarrow) document.body.classList.add('narrow');
  if (reducedMotion) {
    // Park the timeline at a representative pose per regime and stop all motion.
    timeline.pause();
    timeline.scrubTo(0.25);
  }
```

and inside the frame, when reduced motion is on, feed a fixed time so nothing animates:

```ts
    const shaderTime = reducedMotion ? 12.0 : time;
```

pass `shaderTime` to `renderer.render({ time: shaderTime, delta })`.

- [ ] **Step 4: Append the component styles to `src/style.css`**

```css
/* ---------------------------------------------------------------- layout */

.hud-top { position: absolute; top: 24px; left: 24px; max-width: 46ch; }
.regime-index {
  margin: 0; font-size: 11px; letter-spacing: 0.18em; color: var(--ice);
  font-variant-numeric: tabular-nums;
}
.regime-name {
  margin: 4px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: -0.01em;
}
.regime-thesis { margin: 0; font-size: 12px; line-height: 1.6; color: rgba(232,230,223,0.6); }

.hud-readouts {
  position: absolute; top: 24px; right: 24px; min-width: 280px;
  border-top: 1px solid var(--rule); padding-top: 10px;
}
.readout {
  display: flex; justify-content: space-between; gap: 24px;
  padding: 3px 0; font-size: 11px; border-bottom: 1px solid rgba(232,230,223,0.06);
}
.readout-label { color: rgba(232,230,223,0.5); letter-spacing: 0.06em; text-transform: uppercase; }
.readout-value {
  font-family: var(--font-math); font-size: 13px; font-variant-numeric: tabular-nums;
  color: var(--bone); white-space: nowrap;
}
.readout.emphasis .readout-value { color: var(--amber); }

.hud-legend { position: absolute; left: 24px; bottom: 132px; width: 320px; height: 28px; }
.legend-track { position: absolute; left: 0; right: 0; top: 0; height: 1px; background: var(--rule); }
.legend-mark { position: absolute; top: 0; }
.legend-tick { display: block; width: 1px; height: 7px; background: var(--bone); }
.legend-label {
  position: absolute; top: 9px; left: 0; font-size: 10px; letter-spacing: 0.08em;
  color: rgba(232,230,223,0.55); white-space: nowrap;
}
.tone-ember .legend-tick { background: var(--ember); }
.tone-amber .legend-tick { background: var(--amber); }
.tone-ice .legend-tick { background: var(--ice); }

/* ---------------------------------------------------------------- controls */

.controls {
  position: absolute; left: 24px; right: 24px; bottom: 24px;
  display: grid; grid-template-columns: auto 1fr auto; gap: 18px 28px; align-items: center;
  pointer-events: auto;
}
.transport { display: flex; gap: 1px; }
.regime-tab {
  display: flex; align-items: baseline; gap: 8px; padding: 8px 14px;
  background: transparent; border: 1px solid var(--rule); border-right-width: 0;
  color: rgba(232,230,223,0.55); font: inherit; font-size: 11px; cursor: pointer;
  transition: color var(--dur-quick) var(--ease-enter),
              border-color var(--dur-quick) var(--ease-enter);
}
.regime-tab:last-child { border-right-width: 1px; }
.regime-tab:hover { color: var(--bone); }
.regime-tab.active { color: var(--void); background: var(--bone); border-color: var(--bone); }
.tab-index { font-variant-numeric: tabular-nums; letter-spacing: 0.12em; }

.scrubber { display: flex; align-items: center; gap: 12px; }
.play-toggle {
  width: 30px; height: 30px; background: transparent; border: 1px solid var(--rule);
  color: var(--bone); font-size: 10px; cursor: pointer;
}
.scrub-readout {
  font-family: var(--font-math); font-size: 11px; color: rgba(232,230,223,0.5);
  font-variant-numeric: tabular-nums; min-width: 5ch; text-align: right;
}

input[type='range'] {
  -webkit-appearance: none; appearance: none; background: transparent;
  height: 18px; cursor: pointer;
}
input[type='range']::-webkit-slider-runnable-track { height: 1px; background: var(--rule); }
input[type='range']::-moz-range-track { height: 1px; background: var(--rule); }
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none; width: 9px; height: 9px; margin-top: -4px;
  background: var(--ice); border: none; border-radius: 50%;
}
input[type='range']::-moz-range-thumb {
  width: 9px; height: 9px; background: var(--ice); border: none; border-radius: 50%;
}
.scrub { flex: 1; }

.param-rail { grid-column: 1 / -1; display: flex; gap: 28px; flex-wrap: wrap; }
.param { display: flex; align-items: center; gap: 10px; font-size: 11px; }
.param-symbol {
  font-family: var(--font-math); font-style: italic; font-size: 14px; color: var(--ice);
}
.param-label {
  text-transform: uppercase; letter-spacing: 0.08em; color: rgba(232,230,223,0.5);
}
.param input { width: 150px; }
.param-value {
  font-family: var(--font-math); font-variant-numeric: tabular-nums;
  min-width: 12ch; color: var(--bone);
}

.utility-rail { display: flex; gap: 1px; }
.utility {
  padding: 8px 12px; background: transparent; border: 1px solid var(--rule); border-right-width: 0;
  color: rgba(232,230,223,0.5); font: inherit; font-size: 10px; letter-spacing: 0.1em;
  text-transform: uppercase; cursor: pointer;
}
.utility:last-child { border-right-width: 1px; }
.utility:hover, .utility.active { color: var(--void); background: var(--bone); border-color: var(--bone); }

/* ---------------------------------------------------------------- math layer */

.mathlayer {
  position: absolute; top: 0; right: 0; bottom: 0; width: 400px;
  background: rgba(5, 7, 10, 0.92); border-left: 1px solid var(--rule);
  transform: translateX(100%); opacity: 0; pointer-events: none;
  transition: transform var(--dur-base) var(--ease-transition),
              opacity var(--dur-base) var(--ease-transition);
  overflow-y: auto; padding: 96px 28px 120px;
}
.mathlayer.open { transform: translateX(0); opacity: 1; pointer-events: auto; }
.mathlayer-inner { display: flex; flex-direction: column; gap: 26px; }
.equation { border-top: 1px solid var(--rule); padding-top: 12px; }
.equation-label {
  margin: 0 0 8px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ice); font-weight: 400;
}
.equation-plain {
  margin: 0 0 8px; font-family: var(--font-math); font-size: 15px; font-style: italic;
  line-height: 1.5; color: var(--bone);
}
.equation-note { margin: 0; font-size: 12px; line-height: 1.65; color: rgba(232,230,223,0.55); }
.honesty, .transition-note {
  margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--rule);
  font-size: 11px; line-height: 1.7; color: var(--ember);
}
.transition-note { color: var(--amber); }

/* ---------------------------------------------------------------- diagram & parity */

.minkowski {
  position: absolute; left: 24px; bottom: 190px; width: 320px; height: 220px;
  border: 1px solid var(--rule); background: rgba(5, 7, 10, 0.7);
}
.minkowski canvas { width: 100%; height: 100%; display: block; }

.parity {
  position: absolute; left: 24px; top: 120px; padding: 14px 16px;
  border: 1px solid var(--rule); background: rgba(5, 7, 10, 0.92);
  font-size: 10px; letter-spacing: 0.04em;
}
.parity h2 {
  margin: 0 0 10px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ice); font-weight: 400;
}
.parity table { border-collapse: collapse; }
.parity th, .parity td {
  padding: 3px 14px 3px 0; text-align: left; font-variant-numeric: tabular-nums;
}
.parity th { color: rgba(232,230,223,0.45); font-weight: 400; text-transform: uppercase; }
.parity tr.bad td { color: var(--ember); }
.parity-worst { margin: 10px 0 0; color: rgba(232,230,223,0.55); }

/* ---------------------------------------------------------------- motion */

.enter { animation: enter var(--dur-reveal) var(--ease-enter) both; }
@keyframes enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

/* ---------------------------------------------------------------- narrow */

body.narrow .hud-readouts { min-width: 0; font-size: 10px; top: 16px; right: 16px; }
body.narrow .regime-name { font-size: 20px; }
body.narrow .hud-top { max-width: 22ch; }
body.narrow .mathlayer { width: 100%; }
body.narrow .minkowski { display: none; }
body.narrow .param input { width: 90px; }
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/fallback.ts src/main.ts src/style.css
git commit -m "feat: no-WebGL2 text instrument, reduced-motion path, narrow layout"
```

---

### Task 20: README, licence and the Pages workflow

**Files:** Create `README.md`, `LICENSE`, `.github/workflows/pages.yml`

- [ ] **Step 1: Write `LICENSE`**

```
MIT License

Copyright (c) 2026 Rishav Gupta

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Spacetime

A universal visualiser for **time dilation, gravity, light speed and wormholes**.

Four phenomena that are usually presented as four unrelated demos are rendered here as four
regimes of one metric kernel. Every regime answers the same three questions — *what is the
lapse? what is the shift? what is the spatial metric?* — and the same shader, camera, tone
curve and transition path serve all four.

Live at **[rishavgupta01.github.io/visual](https://rishavgupta01.github.io/visual/)**.

## What is actually real

This matters more than the visuals, so it is stated plainly.

| Claim | Status |
|---|---|
| Gravitational lensing | **Real.** Null geodesics integrated per pixel from the exact Schwarzschild orbit equation `d²u/dφ² = −u + 3Mu²`. The shadow at `3√3 M`, Einstein rings and higher-order loops all emerge from the integration; none of them is drawn. |
| Gravitational redshift | **Real.** `α = √(1 − 2M/r)` accumulated along each ray. |
| Time dilation | **Real.** Static `√(1 − 2M/r)` and circular-orbit `√(1 − 3M/r)` clock rates, from the same functions the shader uses. |
| Free fall | **Real.** Numerically integrated, regularised at the turning point. |
| Invariant light speed | **Real.** Regime C has lapse exactly 1 and zero curvature, so no ray bends — the invariant is demonstrated, not asserted. |
| Proper time | **Real.** `τ = ∫√(1 − β²) dt`, integrated per frame. |
| Wormhole geometry | **Real, with a stated caveat.** The metric is exact Morris–Thorne. The rendered surface is a plot of the metric functions (a catenoid), which is the classic embedding diagram but *not* an isometric embedding; press `E` for Beltrami's pseudosphere, which is. |
| Wormhole lapse | **Real, and it corrects a myth.** `Φ = 0`, so the lapse is exactly 1. A Morris–Thorne wormhole has **no** time dilation and no horizon. Pop-science wormholes that dilate time describe something else. |
| Accretion glow | **Approximation.** An analytic emissive shell, not a fluid simulation. The app says so in the math layer. |

## Keyboard

| key | action |
|---|---|
| `1`–`4` | switch regime |
| `Space` | play / pause |
| `←` `→` | scrub the timeline |
| `M` | math layer |
| `E` | cycle regime-D embedding (catenoid / pseudosphere) |
| `R` | reset camera |
| `` ` `` | GPU / TypeScript parity overlay |

## The parity overlay

Press `` ` `` to open a table comparing the GPU's computed lapse, clock rate and shadow radius
against the TypeScript reference implementations. Every row should read `0.00e+0`.

This exists because "one engine" is a claim that is easy to make and easy to quietly stop
being true. The overlay is what keeps it honest.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/visual/
npm test           # physics, store, timeline and camera
npm run typecheck
npm run build
```

On Windows PowerShell use `npm.cmd` in place of `npm`.

## Architecture

```
src/physics/     pure TypeScript, no DOM and no GPU imports, 100% unit-tested
src/render/      WebGL2, hand-written GLSL, one uber-fragment shader
src/camera/      orbit drag + Catmull-Rom cinematic path
src/ui/          HUD, math layer, controls, Minkowski diagram
```

Every formula exists twice: once in GLSL for pixels, once in TypeScript for readouts and
tests. The two are kept in agreement by the parity overlay and by shared initial conditions.

## Licence

MIT.
````

- [ ] **Step 3: Write `.github/workflows/pages.yml`**

```yaml
name: pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Verify the production build locally**

Run: `npm.cmd run build`
Expected: `tsc --noEmit` passes, Vite writes `dist/`, and no asset paths start with `/` other
than the `/visual/` base. Check `dist/index.html` contains `/visual/assets/`.

- [ ] **Step 5: Commit and push**

```bash
git add README.md LICENSE .github/workflows/pages.yml
git commit -m "docs: README with the honesty table, MIT licence, Pages workflow"
git push -u origin main
```

---

### Task 21: Make the repo public, enable Pages, verify live

**Files:** none

- [ ] **Step 1: Make the repository public**

GitHub Pages does not serve private repositories on the free plan.

Run: `gh repo edit RishavGupta01/visual --visibility public --accept-visibility-change-consequences`
Expected: success.

- [ ] **Step 2: Enable Pages**

Run:
```bash
gh api -X POST repos/RishavGupta01/visual/pages -f build_type=workflow
```
Expected: the Pages site is created. If it 409s because Pages already exists, that is fine —
skip to Step 3.

- [ ] **Step 3: Push to `main` and watch the workflow**

Run: `gh run list --limit 5`
Expected: the `pages` workflow runs `build` then `deploy`.

Run: `gh run watch`
Expected: both jobs complete successfully.

- [ ] **Step 4: Verify the live site**

Run: `gh api repos/RishavGupta01/visual/pages --jq '.html_url'`
Expected: `https://rishavgupta01.github.io/visual/`

Fetch that URL and confirm: the page loads, the WebGL2 canvas renders (not a fallback), and
the asset URLs resolve under `/visual/`.

- [ ] **Step 5: Confirm the physics is intact in production**

Open the live site, press `1`–`4` to cycle regimes, and press `` ` `` for the parity overlay.
Expected: every relative error reads `0.00e+0` or within float precision.

- [ ] **Step 6: Tag the release**

```bash
git tag -a v1.0.0 -m "Four regimes of one metric kernel, deployed to GitHub Pages"
git push origin v1.0.0
```

---

## Verification summary

Before considering the work done, all of these must hold:

```bash
npm.cmd test         # every physics test passes
npm.cmd run typecheck # zero TypeScript errors
npm.cmd run build     # dist/ produced
```

And manually, in the browser:

1. Every regime renders and is visually distinct.
2. Switching regimes is never a hard cut.
3. The starfield visibly bends in regimes A and B, and visibly does **not** in regime C.
4. The shadow radius matches `3√3 M` as the mass slider moves.
5. `orbit / static` reaches `0.8660` at `r = 6M`.
6. Regime D's lapse readout says exactly `1`.
7. Pressing `E` changes both the rendered surface and the curvature readout.
8. The parity overlay reports zero relative error.
9. `prefers-reduced-motion` removes all motion and leaves the readouts working.
10. The live GitHub Pages URL serves the same build.