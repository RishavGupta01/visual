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
 * Optically thin analytic glow. This is NOT a fluid simulation and the math layer says
 * so. The temperature ramp is shaped by the real landmark radii so the geometry stays
 * honest.
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

vec3 renderGravity(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  float dPhi = uLowQuality > 0.5 ? 0.016 : 0.006;
  int maxSteps = uLowQuality > 0.5 ? 1200 : 2600;
  float rMax = max(length(ro), uMass * 40.0) * 60.0;

  Geodesic hit = traceSchwarzschild(ro, rd, uMass, rMax, dPhi, maxSteps);

  vec3 colour;

  if (hit.captured) {
    // Almost black on purpose, so the shadow reads as an absence rather than an object.
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
  float alphaMin = sqrt(max(0.0, 1.0 - 2.0 * uMass / max(hit.rMin, 2.000001 * uMass)));
  colour *= mix(1.0, alphaMin, 0.35);

  // A whisper of a measurement grid on the equatorial plane gives the void a scale.
  colour += uAccent * 0.010 * smoothstep(0.015, 0.0, abs(rd.y));

  return colour;
}
`;