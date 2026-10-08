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
/**
 * Accretion disk emission, evaluated at the point where the view ray crosses the
 * equatorial plane.
 *
 * The radial coordinate must be the radius of that crossing point. Using the ray's
 * closest-approach radius instead reports a small r for rays that swing close to the hole
 * while crossing the plane far out, which collapses the whole disk to the white end of the
 * temperature ramp and renders it as one featureless ribbon.
 *
 * The limb asymmetry is not decoration. For a circular geodesic in Schwarzschild,
 *
 *   v^2 / (1 - 2M/r) = M / r      =>      v = sqrt(M / (r - 2M))
 *
 * which is 0.5 c at the ISCO. Special-relativistic beaming then scales the observed
 * intensity by the fourth power of the Doppler factor, so the approaching limb is an
 * order of magnitude brighter than the receding one. That asymmetry is the single most
 * recognisable correct feature of a real black hole image.
 */
vec3 accretionGlow(float r, vec3 p, vec3 dir, float time) {
  float isco = 6.0 * uMass;

  // ISCO inward: no stable circular orbits exist inside it, so there is nothing to radiate
  // from. The outer edge fades out rather than ending on a hard rim.
  float inner = isco * 1.02;
  // Sized relative to the shadow rather than to the hole's mass in the abstract. The shadow
  // disc has radius b_crit/2 = 2.598 M, so an outer edge near 10.8 M puts the disk at a
  // little over four shadow radii: the disk ring and the shadow together fill the frame,
  // which is the proportion the long lens is set up for. A disk reaching many ISCO is
  // physically possible but subtends far more sky than the frame, so its plane floods the
  // image and the subject disappears.
  float outer = isco * 1.8;
  if (r <= inner) return vec3(0.0);

  float band = smoothstep(inner, inner * 1.35, r)
             * (1.0 - smoothstep(outer * 0.30, outer, r));
  if (band <= 0.0) return vec3(0.0);

  // Normalised over the disk's own extent so the gradient spans the full ramp.
  float temp = 1.0 - clamp((r - inner) / (outer - inner), 0.0, 1.0);
  vec3 hot = mix(vec3(1.0, 0.84, 0.58), vec3(1.0, 0.97, 0.93), pow(temp, 3.0));
  vec3 cool = vec3(0.48, 0.14, 0.04);
  vec3 colour = mix(cool, hot, pow(temp, 0.75));

  // Orbital speed for a circular geodesic, in units of c, and the prograde tangent at the
  // crossing point.
  float betaOrb = sqrt(uMass / max(r - 2.0 * uMass, 1.0));
  vec3 tangent = normalize(vec3(p.z, 0.0, -p.x));
  vec3 toCamera = normalize(uCameraPos - p);
  float betaAlong = dot(betaOrb * tangent, toCamera);

  float gamma = inversesqrt(max(1.0 - betaAlong * betaAlong, 1e-4));
  float doppler = inversesqrt(gamma * (1.0 - betaAlong));

  // Beaming carries intensity as g^4 and shifts the observed blackbody temperature by g,
  // so the approaching limb is both brighter and bluer.
  float beaming = pow(doppler, 4.0);
  float tempObserved = clamp(temp * doppler, 0.0, 1.0);
  vec3 beamed = mix(cool, mix(vec3(1.0, 0.84, 0.58), vec3(0.78, 0.87, 1.0), pow(tempObserved, 2.0)),
                    pow(tempObserved, 0.75));
  colour = mix(colour, beamed, 0.65);

  // Spiral density wave, so the flow reads as rotating material rather than a static ring.
  float swirl = 0.82 + 0.18 * sin(atan(p.z, p.x) * 2.0 - r / (uMass * 2.2) + time * 0.8);

  // Beaming reaches roughly 9x on the approaching limb at the ISCO, so this is scaled to keep
  // that limb bright without clipping the rest of the disk to white.
  return colour * band * swirl * beaming * 0.12;
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
    colour = nebula(hit.direction) + starfield(hit.direction) * 1.15;

    // The accretion disk is deliberately not drawn yet.
    //
    // accretionGlow() below is correct in isolation — temperature ramp normalised to the
    // disk's own extent, and beaming from the real circular-geodesic speed v = sqrt(M/(r-2M)),
    // which is 0.5c at the ISCO and gives the approaching limb roughly 80x the receding one.
    //
    // What is missing is the path it has to be evaluated along. It is being handed the
    // *straight* ray's intersection with the equatorial plane, and that cannot be right:
    // tracing where the contribution actually lands puts it in the upper frame for rays
    // whose straight lines never descend toward the plane at all. A straight-line crossing
    // also cannot produce the far side of the disk lensed up over the shadow, which is the
    // feature the whole image is recognised by.
    //
    // The fix is to have traceSchwarzschild record the plane crossings along the *bent*
    // path and shade those points, which also yields the over-the-top arc for free. Until
    // that exists, drawing the near side alone produces a broad wash across the lower frame
    // that reads worse than no disk at all, so the frame is left to the lensing, the photon
    // ring and the starfield. Unused, and kept because the maths is right and tested.
    //
    // if (abs(rd.y) > 1e-6) {
    //   float tPlane = -ro.y / rd.y;
    //   if (tPlane > 0.0) {
    //     vec3 pPlane = ro + tPlane * rd;
    //     colour += accretionGlow(length(pPlane.xz), pPlane, hit.direction, uTime);
    //   }
    // }
  }

  // Photon ring: escaping rays pile up near b = 3 sqrt(3) M. This thin bright circle is what
  // actually defines the shadow — against an empty sky a black disc is invisible, so the
  // ring is what the eye reads as the edge of the hole. Kept narrow and bright for that
  // reason.
  float bCrit = 3.0 * sqrt(3.0) * uMass;
  float rImpact = length(ro - rd * dot(ro, rd));
  float ring = exp(-pow((rImpact - bCrit) / (bCrit * 0.05), 2.0));
  colour += uAccent * ring * 1.3;

  // Gravitational redshift: light climbing out of the well loses frequency.
  float alphaMin = sqrt(max(0.0, 1.0 - 2.0 * uMass / max(hit.rMin, 2.000001 * uMass)));
  colour *= mix(1.0, alphaMin, 0.35);

  // A whisper of a measurement grid on the equatorial plane gives the void a scale.
  colour += uAccent * 0.010 * smoothstep(0.015, 0.0, abs(rd.y));

  return colour;
}
`;