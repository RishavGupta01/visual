import { METRIC_KERNEL } from './common';
import { GRAVITY_BODY } from './gravity';
import { DILATION_BODY } from './dilation';
import { LIGHTSPEED_BODY } from './lightspeed';
import { WORMHOLE_BODY } from './wormhole';

/**
 * One shader entry point for all four regimes. This is what makes the app one engine:
 * the regimes share the kernel, the camera, the tone curve and the transition path, and
 * differ only in the body each dispatches to.
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
// repeats them — GLSL rejects duplicate declarations in one linked program.
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