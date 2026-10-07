# Universal Spacetime Visualiser — Design Document

**Date:** 2026-10-07
**Repo:** `RishavGupta01/visual` → GitHub Pages at `https://rishavgupta01.github.io/visual/`
**Status:** Approved for implementation

---

## 1. What this is

A single-page WebGL2 application that renders **time dilation, gravity, light speed, and wormholes**
as one continuous, physically-exact instrument.

The four phenomena are not four demos sharing a stylesheet. They are four **regimes of one metric kernel**.
Gravity, time dilation, and light speed are all statements about how a metric distributes
`dτ` against `dt` and how null geodesics bend. The wormhole is a different metric, but it is
still answered by the same three questions: *what is the lapse? what is the shift? what is the
spatial metric?* That is why one engine is honest here rather than merely convenient.

Two layers ship simultaneously:

- **Cinematic (default).** A staged, self-playing sequence with continuous camera work.
- **Math layer (one keystroke).** Every visual is backed by the actual equation, the actual
  integral, and a live numeric readout computed by the same code that draws the pixels.

Nothing on screen is faked to look plausible. Where a rendering is an approximation
(the wormhole embedding, transition frames), the UI says so.

### Non-goals

- No Kerr / frame dragging. Schwarzschild only for rotating bodies.
- No cosmological redshift / redshifted CMB background.
- No numerical integrator for the Einstein field equations. Every metric here is **analytic**.
- No mobile-first design. Desktop-first with a reduced path that stays correct on smaller screens.
- No narration, audio, or video. Text only.

---

## 2. Physics contract

This section is the source of truth. Every formula here is implemented twice: once in GLSL
(for pixels) and once in TypeScript (for readouts and unit tests), and the two are cross-checked
in a debug overlay. If a shader and the TypeScript disagree, the build is wrong.

### 2.1 Units

Geometric units (`G = c = 1`) internally, where mass and length both carry metres.
The gravitational radius is `r_g = GM/c²`.

| object | `M` (geometric metres) |
|---|---|
| Sun | 1.477 km |
| Earth | 8.87 mm |
| S2 star (Sgr A*) | ~4.0 × 10¹⁰ m |
| Sgr A* (6.5 × 10⁹ M☉) | 1.24 × 10¹⁰ m |

Readouts are converted to SI (metres, seconds, years, `g`) at the HUD layer only.
This is why a black hole readout can honestly say *Earth would be 8.9 mm across*.

### 2.2 Regime A — Gravity (Schwarzschild)

Metric:

```
ds² = -(1 - 2M/r) c² dt² + (1 - 2M/r)⁻¹ dr² + r² dΩ²
```

Lapse `α(r) = √(1 - 2M/r)`.

Exact landmarks (displayed live and marked on the scene):

| feature | radius |
|---|---|
| event horizon | `2M` |
| photon sphere | `3M` |
| marginally bound orbit | `4M` |
| ISCO | `6M` |

**Light.** Null geodesics are integrated exactly, per pixel, in the plane containing the
origin and the pixel ray (spherical symmetry guarantees the geodesic stays in that plane).
The orbit equation for Schwarzschild null geodesics is

```
d²u/dφ² = -u + 3M u² ,        u = 1/r
```

with the conserved quantity

```
w² + u² - 2Mu³ = k² u⁴ ,      w = du/dφ
```

and `dt/dφ = k`, where `k = r²/L` is constant along the geodesic (`E = 1` normalisation).
Equivalently `(dr/dφ)² = k² - r²(1 - 2M/r)`.

Initial conditions at the near plane, from the ray's start position `p₀` and unit
direction `d₀`, with `r₀ = |p₀|` and `ψ` the angle between `d₀` and the outward radial
direction:

```
u₀ = 1/r₀          k = r₀ / sin ψ          w₀ = -cos ψ / (r₀ sin ψ)
```

These are exact: substituting them reproduces the invariant above identically, which is
asserted in the test suite. `sin ψ` is clamped to `1e-6` for exactly radial rays, where the
integrator correctly yields capture for `cos ψ < 0` and escape for `cos ψ > 0`.
Consequences that must emerge on their own, with no special-casing:

- The shadow radius is `b_crit = 3√3 M ≈ 5.196 M`. We assert this in a test.
- Capture occurs for `b < 3√3 M`; rays with `b > 3√3 M` escape.
- Weak-field deflection → `4M/b`.
- Multiple images, Einstein rings, and higher-order looping rays from rays that wind past `3M`
  and escape. These appear for free from integrating in `φ`.

Integration: RK4 in `φ` with a fixed step, `dφ = 0.01`, capped at 4000 steps.
Terminate on capture (`u ≥ 1/(2M)`), escape (`u < 1/r_max` with outward `dr/dφ`), or step cap.

**Shading.** Accretion is not simulated. The black hole is rendered as an optically thin
volumetric glow with a temperature ramp, plus a photon-ring caustic from the escaping-ray density
falloff at `b ≈ 3√3 M`. The starfield behind is genuinely ray-traced through the metric, so
the star positions *stretch* around the shadow. That stretching is the payload.

**Redshift.** A ray's frequency shift accumulates as `α` along the path:

```
ν_obs / ν_emit = α_emit / α_obs
```

### 2.3 Regime B — Time Dilation (Schwarzschild, three clocks)

Same metric. Three observers, each with an exact clock rate:

| observer | `dτ/dt` | domain |
|---|---|---|
| static (hovering) | `α(r) = √(1 - 2M/r)` | `r > 2M` |
| circular geodesic | `√(1 - 3M/r)` | `r > 3M`, stable iff `r ≥ 6M` |
| free-fall from rest at `r₀` | `1 - 2M/r` term integrated numerically | `r > 2M` |

Ratio between orbiting and static clocks:

```
τ_orb / τ_static = √( (1 - 3M/r) / (1 - 2M/r) )
```

Anchor values asserted in tests:

- `r = 6M` → static `0.8165`, orbit `0.7071`, ratio `0.8660`.
- `r → 2M` → static rate → `0`; divergence is unbounded, so the readout switches to
  logarithmic scale near the horizon rather than printing `Infinity`.

This regime is the payoff. A single tick counter runs both clocks from `t = 0`
with the same `dt`, and the divergence between them is displayed as a live
"one hour here = N years there" line with `N` recomputed every frame.

The `dτ/dt` readout is **not** a curve artist drew. It is the same
`lapse()` / orbit-rate function the camera and clock sprites use.

### 2.4 Regime C — Light Speed (Minkowski, β = 0)

Flat spacetime. **Lapse is exactly 1 and there is no curvature.** This is deliberate:
the regime exists to make the contrast legible. The renderer must therefore *not*
bend any ray here, and a debug assertion checks that a straight ray stays straight.

- Invariant interval `ds² = -c²dτ²`, with `dτ = 0` for light.
- `γ = 1/√(1 - β²)`; proper time along any timelike worldline
  `τ = ∫ √(1 - β(t)²) dt`, integrated per frame.
- Twin paradox: both clocks integrate the same `dt`; only their `β(t)` differ.
  The asymmetry comes from the *shape* of the worldlines, not from any magic at the reunion.
- Velocity addition: `u = (u' + v)/(1 + u'v/c²)`, used to drive the moving frame's grid.
- Doppler for a receding source: `f_obs/f_src = √((1 - β)/(1 + β))`.
- Aberration is rendered via the boost, not faked.

Visual: a 3D lab scene seen through a Lorentz-boosted frame (length contraction and
time dilation of the grid are real consequences of the boost matrix, not animation curves),
paired with a live 2D Minkowski diagram showing 45° light cones, the two twin worldlines,
and both `τ` readings. Photons are drawn at exactly 45° in every frame — that is the invariant.

The classic wrong idea (*"the photon slows down for the chaser"*) is called out in the math layer
with the invariant-interval demonstration.

### 2.5 Regime D — Wormhole (Morris–Thorne)

Metric:

```
ds² = -c²dt² + dl² + b² cosh²(l/b) dΩ² ,      l ∈ (-∞, ∞)
```

`r(l) = b cosh(l/b)`, so `r(0) = b` is the throat and `r` is **not** monotonic.

**Truths the app asserts:**

1. **`Φ(r) = 0`, so lapse `α = 1` everywhere.** A Morris–Thorne wormhole has *no* time
   dilation and *no* horizon. Pop-science wormholes that dilate time are describing
   something else. This is the single most important correction in the app.
2. **The spatial slice has constant negative Gaussian curvature `K = -1/b²`.**
   For a line element `dl² + r(l)²dΩ²` the Gaussian curvature is `K = -r''/r`. With
   `r = b cosh(l/b)` we have `r'' = r/b²`, so `K = -1/b²` everywhere: the slice is a patch of
   the **hyperbolic plane H²**, maximally symmetric, with the throat as its equator.
   The same `1/b²` scale sets the tidal forces below. The app computes and displays this,
   and uses the *same* `1/b²` to size the tidal readout so the two numbers visibly agree.
3. **Axial traversal takes exactly `T = 2L/c`.** Along the axis `ds² = -c²dt² + dl²`, i.e. a
   flat 2D slice, so an axial path of proper length `2L` takes `2L/c`. There is no extra delay.
   The wormhole's benefit is *distance*, not time.
4. **Tidal forces are large and computable.** `|R| = 1/b²` at the throat, so a height `h`
   feels `a ≈ c²h/(2b²)`. For a 2 m traveller this exceeds comfortable limits until
   `b ≳ 3 × 10⁷ m` (~30,000 km throat radius). The app computes the minimum viable throat
   for a chosen comfort limit and displays it.
5. **The throat needs exotic matter.** `ρ = 0` with surface tension
   `τ = 1/(8πb)` at the throat, so `τ > ρc²`. Every energy condition is violated. This is why
   the thing does not exist.

**Honesty about the rendering — the part most visualisations get wrong.**

The iconic Morris–Thorne picture is the *embedding diagram*: the graph of the areal radius
against proper distance, `ρ(l) = b cosh(l/b)`, revolved about the `l` axis. That surface is a
**catenoid** — and it is the default render for regime D, because it is the image that actually
communicates the shape.

It is **not** an isometric embedding, and the app says so. The catenoid's own intrinsic curvature
is `K = -1/(b²cosh⁴(l/b))`, which varies with `l`. The metric's slice has `K = -1/b²`, constant.
They disagree, because the picture is a plot of the metric *functions*, not of the metric.

So regime D ships a second render, toggled in the math layer:

- **Catenoid** (default) — the classic embedding diagram. Recognisable, and labelled as a
  metric-function plot.
- **Pseudosphere** (toggle) — Beltrami's surface of revolution `(x - b)² + z² = b²`, which is the
  *true* isometric embedding of a `K = -1/b²` surface. The two sit side by side with their
  curvatures printed, so the difference is visible rather than argued.

The full 4-dimensional spacetime is curved in any case; the 2-slice picture never claims otherwise.

Light through the wormhole is shown as straight null geodesics in the ambient 3-space
(correct for this slice) threading the tube from one mouth to the other, with a photon that
never touches the throat visibly arriving in the far region.

---

## 3. Architecture

### 3.1 The metric kernel

One shader entry point, `render()`, dispatches on a `uRegime` uniform. Three composable
primitives define the kernel, and each regime is a parameter set over them:

| primitive | signature | meaning |
|---|---|---|
| `lapse` | `α(r) → f32` | clock rate, `dτ = α dt` |
| `shift` | `v(p) → vec3` | local 3-velocity relative to the render frame |
| `spatialMetric` | `g(p, dir) → f32` | squared length of a direction, bends space |

Regime parameter sets:

| regime | `α` | `shift` | `spatialMetric` |
|---|---|---|---|
| A gravity | `√(1-2M/r)` | `0` | Schwarzschild `g_rr`, `r²dΩ²` |
| B dilation | `√(1-2M/r)` | circular-orbit field | as A |
| C light | `1` | boost `v` | Euclidean |
| D wormhole | `1` | `0` | MT embedding: catenoid (default) or Beltrami pseudosphere |

Consequences that fall out of this design rather than being coded:

- Transitions between regimes are parameter morphs plus a camera move, never a cut.
- Every readout is produced by the same code that shades the pixel, so they cannot disagree.
- Adding a fifth regime is a parameter set, not a new renderer.

### 3.2 Stack

- **Vite 7** + **TypeScript** (strict), zero runtime framework.
- **Three.js** for the WebGL2 context, render targets, and buffer plumbing only. All shading
  and all physics are hand-written GLSL and TypeScript. Three.js is not doing the interesting work.
- **Vitest** for physics tests.
- Hand-written post-processing (bloom, ACES tonemap, chromatic aberration, vignette, grain).
  No `postprocessing` library — it is 100 KB for effects we can write in 200 lines.

No React. The state model is a ~60-line typed store with subscription; the UI is a handful of
direct-DOM controls. A framework here would be the largest dependency in the project and would
earn nothing.

### 3.3 Module layout

```
src/
  main.ts                    boot, capability check, mount
  core/
    store.ts                 typed state + subscriptions
    timeline.ts              play / scrub / loop, frame-rate independent
    transitions.ts           regime morph, camera splines, easing
    motion.ts                shared easing + duration tokens
    units.ts                 constants, SI conversion
  physics/                   pure TypeScript, 100% unit-tested, zero DOM/GPU imports
    schwarzschild.ts         lapse, landmarks, clock rates, geodesic ODE
    minkowski.ts             γ, proper-time integral, velocity addition, Doppler
    wormhole.ts              r(l), flatness proof, tidal accel, traversal time
    geodesic.ts              RK4 integrator
    constants.ts             landmark radii, test anchors
  render/
    renderer.ts              WebGL2 setup, targets, adaptive resolution
    uber.ts                  single uber-fragment shader + regime dispatch
    shaders/
      common.ts              noise, tonemap, metric kernel primitives
      gravity.ts
      dilation.ts
      lightspeed.ts
      wormhole.ts
    postfx.ts                bloom, tonemap, grain, vignette, aberration
    starfield.ts             procedural, ray-traced (not a texture)
  ui/
    hud.ts                   live numeric readouts
    mathlayer.ts             equations, derivations, honesty notes
    controls.ts              sliders, regime nav
    minkowskiDiagram.ts      2D canvas overlay for regime C
    legend.ts                scale markers (2M, 3M, 6M…)
  camera/
    rig.ts                   orbit control + cinematic spline
  debug/
    parity.ts                GPU vs TypeScript cross-check overlay
```

The `physics/` directory has no imports outside itself and no DOM access. That constraint is
what makes the unit tests meaningful.

### 3.4 Data flow

```
user input ──▶ store ──▶ timeline ──▶ renderer's uniform block ──▶ shader ──▶ framebuffer
                  │                          ▲
                  │                          │
                  └──────▶ physics/*.ts ─────┘   (same formulas, CPU side)
                             │
                             ▼
                          HUD / math layer (live text)
```

Single direction. The renderer never writes to the store; physics never reads the DOM.
`debug/parity.ts` reads both sides and displays the max absolute error per regime.

### 3.5 Numerical strategy

- Physics on the GPU uses the same RK4 and same step sizes as `physics/geodesic.ts`.
- The CPU integrator runs at 60 Hz for clock/readout integration (a handful of steps).
- `lapse`, `shift`, `spatialMetric` are pure functions of position — no time dependence — so
  readouts are single evaluations, not integrations, except proper time along a path.
- All readouts are derived from the exact same expression as the pixel shading. There is no
  "display formula" that could drift from the "render formula".

---

## 4. Visual design

### 4.1 Art direction — deep-space observatory

Instrument, not toy. The reference points are ESA mission consoles and Numberphile, not
science-fiction film. Precision is the aesthetic.

**Palette.** Near-black ground (`#05070A`), never pure black — pure black kills bloom
falloff and reads as a broken asset.

| role | value | use |
|---|---|---|
| void | `#05070A` | background |
| ice | `#7FD4FF` | photon paths, neutral data |
| amber | `#FFB454` | clocks, proper time, "your" frame |
| bone | `#E8E6DF` | primary text, axis lines |
| ember | `#FF5C3A` | horizons, warnings, exotic matter |
| violet | `#9B7BFF` | wormhole regime accent |

Every regime carries a signature colour but shares the void ground and the bone type ramp, so
the four feel like one instrument switched between modes rather than four products.

**Type.** Two families only.

- UI / labels: a neutral grotesque at `11–13px`, `+0.08em` tracking, uppercase for section headers.
- Math: a serif italic for variables, matching the convention of printed GR, set at `15–19px`.

Numbers are tabular-lined. A readout that jitters in width is a broken readout.

**Form.** Hairline rules at `1px` at 12% opacity. No drop shadows, no glassmorphism, no
rounded-corner cards. Structure comes from rules, alignment, and negative space — the same
reasons an instrument panel reads as precise.

**Depth.** Everything glows, nothing has a shadow. Light is emitted by the physics objects
(photons, clocks, throat) into a void. Bloom is tight and low-threshold, never a haze.

**Post-processing chain:** ACES tonemap → threshold bloom (3-tap downsample, separable
Gaussian, 3 mips) → subtle anamorphic horizontal streak on bright pixels → chromatic
aberration at the frame edge only (≤1.2 px) → animated film grain at 3% → vignette.

### 4.2 Layout

Full-bleed canvas. HUD is a fixed overlay grid on a 12-column grid at 24px gutters.

- **Top-left** — regime name, regime number, one-line thesis.
- **Left rail** — parameters, each with its symbol, its value in SI units, and its current
  range. Sliders are thin, trackless, and show the value numerically at all times.
- **Top-right** — live readouts: the numbers that matter right now.
- **Bottom-left** — scale legend: horizontal ruler with labelled marks (`2M`, `3M`, `6M`,
  `r=1000M`) positioned in true perspective against the rendered geometry.
- **Bottom-centre** — transport: play/pause, scrub bar, regime nav (`1`–`4`).
- **Bottom-right** — `[M]` math-layer toggle.
- **Right rail (math layer only)** — the equation stack, with the live value highlighted.

Everything is `position: fixed` over the canvas. No scrolling page.

### 4.3 Motion system

One duration scale, one easing set, defined once in `core/motion.ts` and mirrored in CSS
custom properties. Nothing invents its own timing.

| token | ms | used for |
|---|---|---|
| `instant` | 120 | hover, focus |
| `quick` | 220 | slider value text, small fades |
| `base` | 420 | panel enter/exit, HUD element swaps |
| `regime` | 1400 | full regime transition |
| `reveal` | 900 | staggered child entrance |

Easings: `easeOutQuint` for entrances, `easeInOutQuart` for transitions, linear for anything
driven by physics or scrub position. Physics-driven motion is never eased — it is integrated,
so easing it would be a lie about the rate.

**Regime transition (1400 ms).** Never a cut, never a cross-dissolve alone. Composed of:

1. **0–900 ms — camera.** Catmull–Rom spline through three control points from the outgoing
   to incoming framing. Position and target interpolated independently so the move curves
   rather than arcs.
2. **120–1000 ms — metric morph.** `uRegimeA`/`uRegimeB` blend with a
   luminance-weighted spatial mask biased by depth, so the new geometry emerges from the
   darker regions outward. Transition frames are explicitly labelled as non-physical in the
   math layer.
3. **300–1400 ms — HUD.** Elements exit staggered at 30 ms intervals, swap at 520 ms, and
   re-enter staggered 30 ms apart. Readouts cross-fade rather than snapping.
4. **0–1400 ms — colour.** The regime accent hue rotates through the shortest arc in OKLCH,
   which avoids the muddy midpoint that an RGB lerp produces between amber and violet.

### 4.4 Interaction

Cinematic autoplay on entry; any input takes over instantly.

- **Scroll** — scrubs the timeline. Wheel deltas accumulate into a single 0–1 playhead.
- **Drag** — orbits the camera. Releasing resumes autoplay after 2.5 s of inactivity.
- **Click a parameter readout** — pins it, expanding into the derivation.
- **Keys** — `1`–`4` regimes, `Space` play/pause, `←`/`→` scrub, `M` math layer,
  `R` reset camera, `E` cycle regime-D embedding (catenoid / pseudosphere), `~` parity
  overlay, `?` shortcut sheet.
- **Reduced motion** — `prefers-reduced-motion: reduce` disables autoplay, grain, and all
  transitions; the scene renders a static representative pose per regime and every readout
  still works. Nothing becomes unusable.

---

## 5. Error handling and capability

| condition | behaviour |
|---|---|
| no WebGL2 | full-page fallback: the four regimes' key equations, definitions, and landmark values as styled text. The instrument is degraded, not broken. |
| WebGL2 present, float render targets missing | halve raymarch step budget, disable the streak pass, show a one-time notice |
| shader compile failure | caught with the offending source and line logged to console, plus a visible in-page error panel. Never a blank canvas. |
| context lost (`webglcontextlost`) | caught, paused, restored on `webglcontextrestored` with full resource rebuild |
| `prefers-reduced-motion` | as §4.4 |
| small viewport (<900px) | HUD collapses to a bottom sheet, readouts drop to the four most relevant, raymarch resolution caps at 1.0× DPR 1 |
| tab hidden | render loop parks, timeline clock holds, resumes without a time jump |

The adaptive resolution scaler targets 55 fps and moves in 0.05 steps within `[0.5, 2.0]`.
If it pins at 0.5 for 3 s, it reduces the raymarch step count instead of degrading further.

---

## 6. Testing

**Vitest, in `physics/`, all pure:**

- `lapse(3M)`, `lapse(6M)` to 6 decimals.
- Circular-orbit rate `√(1-3M/r)` at `6M` equals `0.7071`; ratio to static equals `0.8660`.
- **Shadow capture boundary**: sweeping impact parameter across `3√3M` flips exactly from
  escape to capture within `0.1%`. This is the test that proves the geodesic integrator is
  right rather than merely plausible.
- Weak-field deflection at `b = 1000M` matches `4M/b` to `<1%`.
- Free-fall geodesic `dr/dτ = -√((1-2M/r₀)² - 1 + 2M/r)` reproduces the Newtonian limit
  `τ = √(2(r₀ - r₁)/g)` with `g = M/r₀²` to `<0.5%` for `r₀ = 1000M`. This validates the
  integrator and the GR→Newtonian limit in one assertion.
- `γ`, Doppler, and velocity addition against closed forms.
- `r(l) = b cosh(l/b)` round-trips `l ↔ r` to `1e-12`.
- Gaussian curvature: `K = -r''/r` on the spatial slice evaluates to `-1/b²` across the
  surface, and the catenoid render's own curvature `-1/(b²cosh⁴(l/b))` is shown to differ
  from it — the test asserts they are *not* equal, so the honesty claim cannot silently rot.
- Wormhole axial traversal `T = 2L/c` matches the numeric integration.
- Minimum throat radius for a 2 m traveller at 10 g matches the analytic `c²h/(2b²)`.
- Minkowski straight-ray invariance: a ray marched in regime C accumulates zero deflection.

**Parity overlay (`debug/parity.ts`, `~` key):** renders GPU-computed lapse, shadow radius,
and clock rate alongside the TypeScript values with the absolute error displayed per regime.
This is what keeps "one engine" from quietly becoming two engines.

**Build gate:** `tsc --noEmit` and `vitest run` must pass before deploy.

---

## 7. Deployment

- **Repo made public** (GitHub Pages does not serve private repos on the free plan).
- `vite.config.ts` sets `base: '/visual/'` for the project-path Pages URL.
- **GitHub Actions:** on push to `main`, build with Vite, upload `dist/` as a Pages artifact,
  deploy via `actions/deploy-pages`. On pull request, build + test only.
- `MIT` licence, README with the physics contract, a screenshot, and keyboard shortcuts.
- Base-relative asset URLs so the site works from any prefix.

---

## 8. Scope discipline

Explicitly deferred, and not to be smuggled in:

- Kerr metric and frame dragging
- Gravitational waves / binary inspirals
- Redshifted CMB backgrounds
- Ray-traced accretion fluid dynamics (the glow is analytic, and the README says so)
- Sound, narration, video
- Save/share of camera state beyond the URL query string
- Any content management, telemetry, or backend

The one thing not deferred is honesty: every approximation is labelled in the product itself,
not only in the README.