# Spacetime Visualiser

A browser-based, real-time visualiser for four relativistic effects, rendered by
integrating the actual geodesics rather than by approximating them.

| Regime | What it shows |
| --- | --- |
| 01 Gravity | Light bending around a Schwarzschild black hole |
| 02 Time Dilation | Lapse, clock rates, and free fall towards the horizon |
| 03 Light Speed | Lorentz contraction, simultaneity, and the light cone |
| 04 Wormhole | A Morris–Thorne throat with its spatial slice |

Live at **<https://rishavgupta01.github.io/visual/>**

## The approach

Every regime is the same engine: one WebGL2 renderer, one GLSL metric kernel,
one tone curve. The physics lives in TypeScript modules under `src/physics/`,
and the shaders mirror them line for line.

That mirroring is enforced rather than assumed. The `parity` overlay (press
`` ` ``) renders a 1x1 probe through the GPU and compares it against the
TypeScript implementations of the same quantities. If a shader drifts from its
CPU twin, the table shows the relative error instead of quietly disagreeing.
Current worst-case error is **2.95e-3**.

## Physics notes

**Null geodesics** are integrated with RK4 on the exact orbit equation

```
d²u/dφ² = -u + 3Mu²
```

using the first integral `w² + u² - 2Mu³ = C`. The integration runs in `u = 1/r`
and terminates on escape before the `u <= 0` guard, since a step can carry `u`
past zero when the escape radius is small. Deflection is compared against the
same launch angle in flat space, so the comparison is like for like.

**Morris–Thorne** is treated honestly: the lapse is exactly `1` and there is no
time dilation or event horizon to find. The embedding toggle switches between
the catenoid slice and the Beltrami pseudosphere, and the math layer says so.

**Aberration** uses the corrected form `tanθ' = sinθ / [γ(cosθ - β)]`. At `β = 0`
a perpendicular ray appears from directly behind; the uncorrected form puts it
at 45°, which is the classic tell of a visualiser that never checked.

## Known limitations

These are stated in the app's math layer as well, not just here:

- The accretion disk is **not drawn**. Its shading is implemented and correct in
  isolation (beaming from the real circular-geodesic speed `v = √(M/(r-2M))`,
  which is 0.5c at the ISCO), but it needs the plane crossings along the *bent*
  ray path to place it and to show the far side lensed over the shadow. A
  straight-line crossing renders a wash instead of a disk.
- The nebula is art direction, not astrophysics. It never displaces the arrival
  directions the geodesics compute.
- Redshift on lensed rays uses the static lapse ratio. Full radiative transfer
  through an accretion flow is out of scope.

## Development

```bash
npm install
npm run dev
npm test          # 116 unit tests
npm run typecheck
npm run build

node scripts/verify-browser.mjs   # 44 checks in headless Chrome
node scripts/probe-frame.mjs      # camera state + framebuffer luminance grid
```

`verify-browser.mjs` drives the built site in headless Chrome with a software
WebGL2 context and asserts on real renderer state rather than on pixels where it
can. `probe-frame.mjs` exists because composition questions ("where is the hole
actually landing?") need answers from the framebuffer, not from a screenshot.

## Licence

MIT. See [LICENSE](LICENSE).