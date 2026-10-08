export const LIGHTSPEED_BODY = /* glsl */ `
/**
 * Flat spacetime. The ray is NOT bent: the arriving direction is the incoming direction,
 * and the starfield is sampled along it unchanged. That is the invariant, demonstrated
 * rather than asserted — and it is why this regime is the control for the other three.
 */
vec3 renderLightSpeed(vec2 ndc) {
  Ray ray = makeRay(uCameraPos, uCameraTarget, ndc, uFov, uAspect);
  vec3 ro = ray.origin;
  vec3 rd = ray.dir;

  float b = uBoost;
  float g = 1.0 / sqrt(max(1e-6, 1.0 - b * b));
  float scale = uScale;

  // No redshift and no bending: lapse is exactly 1 here.
  vec3 colour = nebula(rd) + starfield(rd) * 1.15;

  // A reference grid at rest in the lab frame.
  vec2 cell = abs(fract(ro.yz / (scale * 0.06)) - 0.5);
  colour += uAccent * smoothstep(0.47, 0.5, max(cell.x, cell.y)) * 0.012;

  // The boosted frame's ruler: a rod along the motion, length-contracted by 1/gamma.
  // The contraction is the boost matrix applied to the rod's endpoints, not a scale
  // animation, so it stays correct at any beta.
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

  // The chaser, moving at beta c.
  float chase = fract(uTime * 0.09);
  vec3 chasePos = vec3((chase - 0.5) * scale * 2.0, 0.0, 0.0);
  float dc = length(ro - chasePos) / (scale * 0.03);
  colour += vec3(1.0, 0.706, 0.329) * exp(-dc * dc) * 1.3;

  // A pulse every 1/gamma of lab time along the rod: the slow clock, made visible.
  float beat = fract((along / scale + 0.5) * g - uTime * 0.5);
  colour += vec3(1.0, 0.706, 0.329)
          * exp(-pow(beat / 0.03, 2.0))
          * exp(-pow(across / (scale * 0.006), 2.0))
          * 0.8;

  colour += uAccent * 0.006;
  return colour;
}
`;