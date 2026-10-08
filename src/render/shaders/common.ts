/**
 * The shared metric kernel. Every regime is a parameter set over three primitives —
 * lapse, shift, spatialMetric — which is what makes "one engine, four regimes" literally
 * true rather than a slogan.
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

/**
 * Procedural stars on the unit sphere. Not a texture: the direction is hashed, so the
 * field has no resolution, no tiling, and every ray samples it independently. That
 * matters here because the direction a ray arrives from IS the thing being measured.
 */
/**
 * Blackbody-ish colour for a star, from cool red dwarf to hot blue giant.
 * t runs 0 (cool) to 1 (hot).
 */
vec3 starColour(float t) {
  vec3 red   = vec3(1.00, 0.60, 0.36);
  vec3 amber = vec3(1.00, 0.83, 0.64);
  vec3 white = vec3(1.00, 0.98, 0.95);
  vec3 blue  = vec3(0.70, 0.81, 1.00);
  vec3 c = mix(red, amber, smoothstep(0.0, 0.38, t));
  c = mix(c, white, smoothstep(0.38, 0.66, t));
  c = mix(c, blue, smoothstep(0.66, 1.0, t));
  return c;
}

/**
 * Directional star field.
 *
 * Two things mattered for legibility. First, every star centre is kept strictly inside its
 * own cell: placing it at up to cell + 1.85 put some stars outside the 3x3x3 neighbourhood
 * being sampled, so they were clipped by the cell boundary and rendered as hard squares.
 * Second, each star is a tight core plus a wide faint halo rather than a single Gaussian,
 * which is what makes bright stars read as light sources instead of as dots.
 *
 * No twinkle: there is no atmosphere out here to scintillate starlight, and adding some
 * would be an invention the rest of the project is trying not to make.
 */
vec3 starfield(vec3 dir) {
  vec3 acc = vec3(0.0);
  vec3 p = dir * 160.0;
  vec3 cell = floor(p);
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dz = -1; dz <= 1; dz++) {
        vec3 c = cell + vec3(float(dx), float(dy), float(dz));
        vec3 h = vec3(hash13(c), hash13(c + 17.3), hash13(c + 41.7));
        if (h.z > 0.90) {
          // Confined to [0.15, 0.85] of the cell, so it is never clipped by sampling.
          vec3 centre = c + 0.15 + h * 0.7;
          float d = length(p - centre);

          // Magnitude distribution skewed hard towards faint, as a real sky is: many dim
          // stars, very few bright ones.
          float mag = 0.06 + 0.34 * pow(fract(h.x * 91.7), 4.0);
          if (h.x > 0.988) mag *= 7.0;

          float core = exp(-d * d * 130.0);
          float halo = exp(-d * d * 11.0);
          acc += starColour(hash13(c + 3.1)) * (core * 1.7 + halo * 0.22) * mag;
        }
      }
    }
  }
  return acc;
}

/**
 * A faint interstellar background, so the void reads as a sky rather than as a dead
 * screen. Art direction, not physics: it is drawn behind the stars and never displaces
 * the arrival directions the geodesics compute.
 *
 * Kept deliberately dim. An earlier version filled the mid-tones and lifted the black
 * floor across the whole frame, which flattened every shot; deep space needs to stay
 * genuinely black for the subject to read.
 */
vec3 nebula(vec3 dir) {
  float band = exp(-pow(dir.y * 2.2, 2.0));

  // Two scales: a broad mass plus finer structure, so the clouds have silhouette instead
  // of reading as one smooth wash.
  float broad = fbm(dir * 2.2 + vec3(11.0, 3.0, 7.0));
  float fine = fbm(dir * 6.5 + vec3(4.0, 19.0, 2.0));
  float density = broad * 0.72 + fine * 0.28;

  // Dense cores run cold blue; the thinning edges pick up a warmer cast, which is what gives
  // the clouds their colour separation.
  vec3 core = vec3(0.012, 0.020, 0.042);
  vec3 edge = vec3(0.042, 0.020, 0.030);
  vec3 colour = mix(edge, core, smoothstep(0.35, 0.72, density));

  return colour * band * pow(density, 2.1) * 1.15;
}

struct Ray { vec3 origin; vec3 dir; };

Ray makeRay(vec3 ro, vec3 target, vec2 ndc, float fov, float aspect) {
  vec3 fwd = normalize(target - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0) + vec3(1e-6, 0.0, 0.0)));
  vec3 up = cross(right, fwd);
  float s = tan(fov * 0.5);
  return Ray(ro, normalize(fwd + right * ndc.x * s * aspect + up * ndc.y * s));
}
`;

/**
 * The Schwarzschild null-geodesic raymarcher, mirroring src/physics/geodesic.ts.
 *
 * Three details are carried across deliberately, because each one is a silent physics
 * error if it is missed:
 *
 *   1. sin(psi) = (b/r) sqrt(1 - 2M/r), not b/r. The sqrt is the difference between the
 *      areal radius and a proper radial distance.
 *   2. dt/dphi = r^2 / (b (1 - 2Mu)) is not constant; only E and L are.
 *   3. Termination is tested in u = 1/r, with the escape test ahead of the u <= 0 guard,
 *      because one step can carry u past zero once rMax is large.
 */
export const GEODESIC_RAYMARCH = /* glsl */ `
struct Geodesic {
  bool captured;
  bool escaped;
  vec3  direction;    // unit direction of the arriving ray
  float phiSwept;
  float deflection;
  float properTime;
  float coordinateTime;
  float rMin;
  float invariantDrift;
};

/** The conserved quantity w^2 + u^2 - 2M u^3. */
float firstIntegral(float u, float w, float M) {
  return w * w + u * u - 2.0 * M * u * u * u;
}

float geodesicAccel(float uu, float M) { return -uu + 3.0 * M * uu * uu; }

/**
 * Integrate the exact Schwarzschild null geodesic for a ray starting at ro with unit
 * direction roDir. Spherical symmetry keeps the path in the plane containing ro, so this
 * is exact rather than an approximation.
 */
Geodesic traceSchwarzschild(vec3 ro, vec3 dir, float M, float rMax, float dPhi, int maxSteps) {
  Geodesic o;
  o.captured = false;
  o.escaped = false;
  o.direction = dir;
  o.phiSwept = 0.0;
  o.deflection = 0.0;
  o.properTime = 0.0;
  o.coordinateTime = 0.0;
  o.rMin = length(ro);
  o.invariantDrift = 0.0;

  float r0 = o.rMin;
  vec3 e1 = ro / r0;
  float cosPsi = clamp(dot(e1, dir), -1.0, 1.0);
  vec3 perp = dir - cosPsi * e1;
  float sinPsi = max(length(perp), 1e-6);
  vec3 e2 = perp / sinPsi;

  // The orbital plane, spanned by the radial direction and the transverse component.
  float psi = atan(dot(perp, e2), cosPsi);

  // b = L/E follows from sin(psi) = (b/r) sqrt(1 - 2M/r).
  float b = r0 * sinPsi / max(sqrt(max(1.0 - 2.0 * M / r0, 0.0)), 1e-6);

  float u = 1.0 / r0;
  float w = -cosPsi / (r0 * sinPsi);
  float invariant0 = firstIntegral(u, w, M);

  float uHorizon = 1.0 / (2.0 * M);
  float uEscape = 1.0 / rMax;

  float t = 0.0;
  float tau = 0.0;
  float phi = 0.0;
  float prevU = u;
  float prevPhi = 0.0;
  float prevT = 0.0;
  float prevTau = 0.0;
  int used = 0;

  for (int i = 0; i < 6000; i++) {
    if (i >= maxSteps) break;
    used = i;
    if (!(u > 0.0) || !(u < 1e18)) break;

    // Escape before the u <= 0 guard: a step may carry u past zero when uEscape is tiny.
    if (u <= uEscape && w < 0.0) {
      float du = prevU - u;
      if (du > 0.0) {
        float frac = clamp((prevU - uEscape) / du, 0.0, 1.0);
        phi = prevPhi + (phi - prevPhi) * frac;
        t = prevT + (t - prevT) * frac;
        tau = prevTau + (tau - prevTau) * frac;
      }
      o.escaped = true;
      break;
    }
    if (u >= uHorizon) { o.captured = true; break; }

    o.rMin = min(o.rMin, 1.0 / u);
    prevU = u;
    prevPhi = phi;
    prevT = t;
    prevTau = tau;

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

    float f = 1.0 - 2.0 * M * u;
    float dt = 1.0 / (max(b, 1e-6) * u * u * f);
    t += dt * dPhi;
    if (f > 0.0) tau += dt * sqrt(f) * dPhi;
  }

  o.phiSwept = phi;
  o.properTime = tau;
  o.coordinateTime = t;
  o.invariantDrift =
      abs(firstIntegral(u, w, M) - invariant0) / max(abs(invariant0), 1e-30);

  // The straight line that leaves at the same angle sweeps this much; the difference is
  // the deflection.
  float bFlat = r0 * sinPsi;
  float flatSweep = acos(clamp(bFlat / r0, -1.0, 1.0))
                  + acos(clamp(bFlat / rMax, -1.0, 1.0));
  o.deflection = phi - flatSweep;

  // Reconstruct the arriving ray from the orbit curve r(theta) = 1/u: the tangent is
  // dr/dtheta radially plus r angularly.
  float rEnd = 1.0 / max(u, 1e-12);
  float dr = -w / (u * u);
  float theta = psi + phi;
  vec3 radialDir = cos(theta) * e1 + sin(theta) * e2;
  vec3 angularDir = -sin(theta) * e1 + cos(theta) * e2;
  o.direction = normalize(dr * radialDir + rEnd * angularDir);
  return o;
}
`;

/**
 * A one-pixel render used only by the parity overlay. It evaluates the *shader's* copies
 * of the formulas, so the values read back are genuinely the GPU's rather than the
 * TypeScript ones echoed back.
 */
export const PROBE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uMass;
uniform float uProbeRadius;
uniform float uProbeB;

${METRIC_KERNEL}
${GEODESIC_RAYMARCH}

void main() {
  float M = max(uMass, 1e-9);
  float r = max(uProbeRadius, 2.000001 * M);
  float alpha = sqrt(max(0.0, 1.0 - 2.0 * M / r));

  // Inflate a geodesic to the probe impact parameter and read off the deflection.
  // Deflection for a ray at impact parameter b = uProbeB, with M = 1 so the ratio
  // deflection / M is the quantity the TypeScript side compares against.
  float probeM = 1.0;
  float b = max(uProbeB, 1e-3);
  float r0 = 1e5 * probeM;
  float sinPsi = clamp(b / r0, 1e-9, 0.999999) * sqrt(max(1.0 - 2.0 * probeM / r0, 0.0));
  float cosPsi = -sqrt(max(0.0, 1.0 - sinPsi * sinPsi));

  vec3 start = vec3(r0, 0.0, 0.0);
  vec3 dir = normalize(vec3(cosPsi, sinPsi, 0.0));
  Geodesic hit = traceSchwarzschild(start, dir, probeM, r0 * 1e3, 1e-4, 400000);

  // Encoded for an 8-bit target. The deflection is about 4e-3 in units of M, which would
  // quantise to zero if sent raw, so channel 1 carries (ratio - 1) * 100 where ratio is
  // deflection / (4M/b). That keeps the value mid-range and gives ~4e-5 resolution on the
  // ratio. See parity.ts for the decode.
  float ratio = hit.deflection / (4.0 / b);
  fragColor = vec4(alpha, clamp((ratio - 1.0) * 100.0, 0.0, 1.0), 0.0, 1.0);
}
`;
