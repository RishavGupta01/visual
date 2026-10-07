# Addendum — Stars and Supernovae

**Date:** 2026-10-07
**Status:** Approved for implementation (appends to the main plan)
**Parent spec:** `docs/superpowers/specs/2026-10-07-universal-spacetime-visualiser-design.md`

---

## What already exists

Regime A already renders a **real** Schwarzschild black hole: the shadow, photon ring and
gravitational lensing all emerge from integrating null geodesics, and the "starfield" is a
procedural field sampled along each ray's *arriving* direction — so the stars are already
genuinely lensed. The black hole and the star field are not missing work.

What is genuinely new is **a star as a physical object** and **supernovae as timed events**.

## Regime E — Stellar Physics

A new regime, `Stellar`, sitting after `Wormhole`. It answers the question the other four
never ask: *where does the light in this simulation actually come from, and how long ago?*

### E1. A real star, at a real distance

The star is placed at a finite distance `D` (metres) and given a mass `M_star`, from which:

| quantity | relation | source |
|---|---|---|
| luminosity | `L = M_star^3.5` | mass–luminosity relation, `L/L☉ = (M/M☉)^3.5` |
| radius | `R = M_star^0.8` | main-sequence radius–mass relation, `R/R☉ = (M/M☉)^0.8` |
| temperature | `T = L / (4πR²σ)` | Stefan–Boltzmann, with `σ = 5.670e-8 W/m²/K⁴` |
| colour | Planck's law at `T`, CIE 1931 → sRGB | blackbody chromaticity |

Angular size at distance `D` is `θ = R/D`, and the app prints both `θ` in milliarcseconds
and `D` in light-minutes, so "a star the size of the Sun, eight light-minutes away" is a
number the viewer can check.

**Why Planck's law matters:** the star's colour is *computed from its temperature*, not chosen.
A 0.3 M☉ star renders orange-red at ~3,400 K; a 2 M☉ star renders blue-white at ~9,000 K.
Moving the mass slider changes the colour because the physics changed.

### E2. Supernova light-travel delay — the centrepiece

The star explodes at `t₀`. The explosion's light reaches the observer at

```
t_arrival = t₀ + D / c
```

which for a star at 1 kilolightyear is **~3.3 million years**. The HUD states this plainly.

The genuinely striking part falls out of the black hole geometry for free. Light can reach the
observer from the same star along geodesics of *different lengths* — the direct image, and
one or more lensed images that wind part-way around the hole. Each arrives at a different
time:

```
Δt between images = (ΔL_path) / c
```

So **the viewer sees the supernova happen more than once**, seconds or hours apart, because
the higher-order images took longer. Nothing draws this. It is the difference in accumulated
coordinate time along each geodesic, which the tracer already computes.

Implementation: for each arriving ray, compare its accumulated coordinate time `t_coord`
against the emission time implied by the star's current age. The star is drawn with the
surface brightness it had at emission, `L(t_coord)`. Different images therefore show
different points in the star's light curve *simultaneously on screen*.

### E3. The light curve

A real supernova is not a flash. The renderer uses a **Type Ia-like bolometric light curve**:
a fast rise (~1.7 days to peak), a slow decline. Implemented as an explicit analytic function
with named parameters, stated in the math layer as an approximation of observed light curves
rather than a hydrodynamic simulation.

Crucially the light curve is evaluated at *emission* time `t_emit = t_obs − D/c`, not at
observation time. That distinction is the whole point of the regime.

### E4. What this regime must not claim

Stated in the math layer, as with everything else:

- The light curve is a fitted approximation of observed bolometric curves, not a simulation.
- Blackbody colour is correct for a single-temperature photosphere; real stars are not blackbodies.
- The mass–luminosity relation holds for main-sequence stars and breaks down for giants,
  supergiants and remnants. The app says so.
- Nothing here is a hydrodynamic explosion model.

## New physics module

`src/physics/stellar.ts` — pure TypeScript, unit-tested like the rest:

```ts
export function luminosity(massSolar: number): number;          // L/L☉
export function radius(massSolar: number): number;              // R/R☉
export function effectiveTemperature(massSolar: number): number;// K
export function angularRadius(massSolar: number, distanceM: number): number; // rad
export function lightTravelTime(distanceM: number): number;     // s
export function bolometricFlux(luminositySolar: number, distanceM: number): number;
export function planckRGB(temperatureK: number): [number, number, number];
export function supernovaLightCurve(tDays: number): number;    // relative peak = 1
```

### Test anchors

| test | anchor |
|---|---|
| Sun | `L = 1`, `R = 1`, `T = 5,772 K` |
| Stefan–Boltzmann round trip | `L = 4πR²σT⁴` consistent to 1e-12 |
| 2 M☉ star | hotter and bluer than the Sun; `T > 5,772 K` |
| Sun at 1 AU | `θ = 6.96e-5 rad` ≈ 14.4 arcsec |
| Light travel to Proxima | `4.2465 yr` to 4 significant figures |
| Light curve | peak ≈ 1.0 near day 1.7, returns below 0.05 by day 200 |
| Planck colour | blue channel peaks above red for `T > 10,000 K`, below it for `T < 4,000 K` |
| Multi-image delay | secondary image delay is positive and equals path difference over `c` |

## Shader

`src/render/shaders/stellar.ts`, composed into the existing uber shader like the others:

- Reuses `traceSchwarzschild` — regime E is regime A with an emitting object at finite distance.
- The star is drawn by angular radius, so it subtends the correct solid angle and the black
  hole's shadow visibly *covers* it as it passes behind — occultation for free.
- Supernova brightness per ray comes from `supernovaLightCurve(t_emit)`, where `t_emit` is
  derived from that ray's own accumulated coordinate time.
- `uStarMass`, `uStarDistance`, `uExplosionAge` added to the shared uniform block.

## Store and UI

Three new fields: `starMassSolar`, `starDistanceM`, `explosionAgeDays`. Regime E's parameter
rail shows three sliders. HUD readouts: luminosity, radius, temperature, angular size,
light-travel time, current `t_emit`, and the observed brightness.

The math layer for regime E leads with the delay equation, and its honesty note lists all four
approximations above.

## Cost

Three tasks, appended as Tasks 22–24. Roughly a fifth of the work of regime A, because the
geodesic integrator, the renderer and the whole shell already exist and are reused unchanged.

---

## Verification additions

11. The star's angular size matches `R/D` at the displayed distance.
12. Moving the star behind the black hole visibly occults it, and lensed images appear.
13. The supernova is seen at more than one time on screen at once when a black hole is present.
14. The colour of the star changes with its mass, in the correct direction.