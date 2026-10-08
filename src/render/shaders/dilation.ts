// GEODESIC_RAYMARCH is not interpolated here: uber.ts already emits it once inside
// GRAVITY_BODY, and GLSL rejects duplicate struct and function definitions.
export const DILATION_BODY = /* glsl */ `
/** dtau/dt for a static clock at r. */
float staticRate(float r) { return sqrt(1.0 - 2.0 * uMass / r); }

/** dtau/dt for a circular geodesic at r. Exists for r > 3M, stable for r >= 6M. */
float orbitRate(float r) { return sqrt(1.0 - 3.0 * uMass / r); }

/** Angular velocity of that orbit, radians per unit coordinate time. */
float orbitOmega(float r) { return sqrt(uMass / (r * r * r)); }

/** Distance from p to the segment between two orbit positions, for strokes. */
float segmentDistance(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  return length(p - (a + ab * t));
}

/** A glowing arc of the orbit, drawn as a swept trail. */
vec3 strokeOrbit(vec3 p, float radius, float phase, vec3 colour, float width) {
  float sweep = orbitOmega(radius) * 1.6;
  vec3 a = vec3(cos(phase), 0.0, sin(phase)) * radius;
  vec3 b = vec3(cos(phase + sweep), 0.0, sin(phase + sweep)) * radius;
  float d = segmentDistance(p, a, b) / uMass;
  return colour * exp(-pow(d / width, 2.0));
}

vec3 renderDilation(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  float dPhi = uLowQuality > 0.5 ? 0.016 : 0.006;
  float rMax = max(length(ro), uMass * 40.0) * 60.0;

  // The same integrator as regime A. Lensing is not the point here, but reusing it keeps
  // one engine rather than two.
  Geodesic hit = traceSchwarzschild(ro, rd, uMass, rMax, dPhi, 2200);

  vec3 colour = hit.captured
    ? vec3(0.004, 0.006, 0.011)
    : nebula(hit.direction) + starfield(hit.direction) * 1.1;

  if (uRadius > 2.05 * uMass) {
    // The orbiting clock's trail, amber: this is the one that runs slow.
    colour += strokeOrbit(ro, uRadius, uTime, vec3(1.0, 0.706, 0.329), 0.9) * 1.4;

    // The static clock's marker, ice: it runs faster but does not move.
    float dm = length(ro - vec3(0.0, 0.0, uRadius)) / uMass;
    colour += vec3(0.498, 0.831, 1.0) * exp(-pow(dm / 0.7, 2.0)) * 1.6;

    // An ember stem dropping toward the horizon, marking the well they sit in.
    float stem = exp(-pow(ro.x / (uMass * 0.35), 2.0))
               * exp(-pow(ro.z / (uMass * 0.35), 2.0));
    colour += vec3(1.0, 0.36, 0.23) * stem * 0.10;
  }

  // Photon ring, so this regime visibly shares geometry with regime A.
  float bCrit = 3.0 * sqrt(3.0) * uMass;
  float rImpact = length(ro - rd * dot(ro, rd));
  colour += uAccent * exp(-pow((rImpact - bCrit) / (bCrit * 0.085), 2.0)) * 0.5;

  colour += uAccent * 0.008 * smoothstep(0.015, 0.0, abs(rd.y));

  return colour;
}
`;