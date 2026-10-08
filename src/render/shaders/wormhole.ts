export const WORMHOLE_BODY = /* glsl */ `
/**
 * Signed distance to the surface of revolution whose meridian radius is rho(x):
 *
 *   rho(x) = b cosh(x / b)                    uEmbedding = 0  (catenoid render)
 *   rho^2  = x^2 - 2 b x + 2 b^2             uEmbedding = 1  (Beltrami pseudosphere)
 *
 * The catenoid is the graph of the metric functions, which is the classic embedding
 * diagram but is NOT an isometric embedding of the geometry: its own curvature varies
 * with x, while the metric's spatial slice has K = -1/b^2 everywhere. The pseudosphere
 * is the true isometric embedding, and E switches between them so the difference is
 * visible rather than argued.
 *
 * Negative inside.
 */
float wormholeSDF(vec3 p) {
  float b = max(uThroat, 1.0);
  float axial = p.x;
  float rho = length(p.yz);
  float rMax = 60.0 * b;

  if (uEmbedding < 0.5) {
    // Newton on f(x) = b cosh(x/b) - rho. Away from the throat the slope is non-zero, so
    // a handful of iterations converge well below pixel size.
    float x = clamp(axial, -rMax, rMax);
    for (int i = 0; i < 8; i++) {
      float df = sinh(x / b);
      if (abs(df) < 1e-6) break;
      x = clamp(x - (b * cosh(x / b) - rho) / df, -rMax, rMax);
    }
    return rho - b * cosh(x / b);
  }

  // Newton on f(x) = x^2 - 2 b x + 2 b^2 - rho^2.
  float xx = clamp(axial, 0.0, rMax);
  for (int i = 0; i < 8; i++) {
    float df = 2.0 * xx - 2.0 * b;
    if (abs(df) < 1e-9) break;
    xx = clamp(xx - (xx * xx - 2.0 * b * xx + 2.0 * b * b - rho * rho) / df, 0.0, rMax);
  }
  return rho - sqrt(max(0.0, xx * xx - 2.0 * b * xx + 2.0 * b * b));
}

/** Surface normal by central differences on the SDF. */
vec3 wormholeNormal(vec3 p) {
  float h = max(uThroat * 0.003, 1e-4);
  return normalize(vec3(
    wormholeSDF(p + vec3(h, 0.0, 0.0)) - wormholeSDF(p - vec3(h, 0.0, 0.0)),
    wormholeSDF(p + vec3(0.0, h, 0.0)) - wormholeSDF(p - vec3(0.0, h, 0.0)),
    wormholeSDF(p + vec3(0.0, 0.0, h)) - wormholeSDF(p - vec3(0.0, 0.0, h))));
}

vec3 renderWormhole(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  vec3 colour = nebula(rd) + starfield(rd) * 1.05;

  float b = max(uThroat, 1.0);
  float t = 0.0;
  bool hit = false;
  float far = length(ro) + b * 40.0;

  for (int i = 0; i < 180; i++) {
    float d = wormholeSDF(ro + rd * t);
    if (d < b * 0.002) { hit = true; break; }
    t += max(abs(d), b * 0.004);
    if (t > far) break;
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

    // Rings at multiples of b along the axis, so the flare rate is legible as
    // r = b cosh(l/b) rather than being a smooth anonymous tube.
    float axial = abs(p.x) / b;
    colour += uAccent * smoothstep(0.94, 1.0, cos(axial * 6.2831853)) * 0.10;

    // The throat itself.
    colour += uAccent * exp(-pow(p.x / (b * 0.35), 2.0)) * 0.5;
  }

  // Light threading the tube: a straight null geodesic in the ambient flat space, which
  // is correct for this 2-slice.
  float beamAxis = abs(ro.y) + abs(ro.z);
  float beam = exp(-pow(beamAxis / (b * 0.06), 2.0));
  colour += vec3(0.498, 0.831, 1.0) * beam * step(abs(ro.x), b * 6.0) * 0.25;

  // Two mouths, so the two asymptotic regions are unmistakable.
  for (int i = 0; i < 2; i++) {
    float sign = i == 0 ? -1.0 : 1.0;
    float dm = length(ro - vec3(sign * b * 3.4, 0.0, 0.0)) / (b * 0.16);
    colour += uAccent * exp(-dm * dm) * 0.7;
  }

  colour += uAccent * 0.008;
  return colour;
}
`;