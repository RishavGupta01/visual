export type Vec3 = [number, number, number];

/**
 * Catmull-Rom through a point list, evaluated between p1 and p2, with t clamped to
 * [0, 1]. Exact at t = 0 and t = 1, which is what makes a regime transition land precisely
 * on its target framing.
 */
export function catmullRom(points: Vec3[], p1: number, p2: number, t: number): Vec3 {
  const n = points.length;
  const at = (i: number): Vec3 => {
    const c = points[Math.max(0, Math.min(n - 1, i))] as Vec3;
    return [c[0], c[1], c[2]];
  };
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = at(p1 - 1);
  const b = at(p1);
  const c = at(p2);
  const d = at(p2 + 1);
  const t2 = tt * tt;
  const t3 = t2 * tt;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a0 = a[i] ?? 0;
    const b0 = b[i] ?? 0;
    const c0 = c[i] ?? 0;
    const d0 = d[i] ?? 0;
    out[i] =
      0.5 *
      (2 * b0 +
        (-a0 + c0) * tt +
        (2 * a0 - 5 * b0 + 4 * c0 - d0) * t2 +
        (-a0 + 3 * b0 - 3 * c0 + d0) * t3);
  }
  return out;
}

/** Deterministic pseudo-random value in [-pi, pi] from an integer index. */
export function hashAngle(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * Math.PI;
}

export interface RigOptions {
  mass?: number;
  /** Camera distance as a multiple of the Schwarzschild radius. */
  distance?: number;
}

export interface RigState {
  position: Vec3;
  target: Vec3;
}

export interface Rig {
  sample(t: number): RigState;
  drag(dx: number, dy: number): void;
  reset(): void;
  readonly dragOffset: readonly [number, number];
}

/**
 * A closed cinematic path around the origin, scaled by the mass. The first and last control
 * points coincide so the loop has no seam.
 */
export function createRig(opts: RigOptions = {}): Rig {
  const mass = opts.mass ?? 3e9;
  const distance = opts.distance ?? 26;
  let offset: [number, number] = [0, 0];

  // Elevation is a compromise, and both extremes are wrong. Looking steeply down at the
  // equatorial plane (tens of degrees) hides the disk entirely: from high above, rays cross
  // the plane at radii far outside the frame, so nothing is in shot at all. Looking almost
  // edge-on instead collapses it into a bar across the frame. Roughly 15-25 degrees is what
  // puts the disk's inner limb in the lower frame while still reading as an ellipse.
  const shape: [number, number, number][] = [
    [1, 0.28, 0],
    [0.2, 0.9, 0.7],
    [-0.8, 0.3, 0.6],
    [-0.3, 0.22, -0.85],
    [0.55, 0.55, -0.5],
    [1, 0.28, 0],
  ];
  const path: Vec3[] = shape.map((p) => [p[0] * mass * distance, p[1] * mass, p[2] * mass * distance]);

  return {
    sample(t: number) {
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      const span = clamped * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(span));
      const local = span - i;
      const eased = local * local * (3 - 2 * local);
      const position = catmullRom(path, i, i + 1, eased);

      // The wobble is a sum of sines with integer frequencies, so it is exactly periodic over
      // the loop and the seam closes to zero. An index-based hash cannot do this: it jumps
      // at the wrap, which reads as a visible cut every 24 seconds.
      const tau = clamped * Math.PI * 2;
      const wobbleYaw =
        (Math.sin(tau * 3 + 0.7) + 0.5 * Math.sin(tau * 7 + 2.1)) * 0.045;
      const wobblePitch =
        (Math.sin(tau * 5 + 1.3) + 0.5 * Math.sin(tau * 11 + 0.4)) * 0.04;

      const yaw = offset[0] + wobbleYaw;
      const pitch = offset[1] + wobblePitch;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      return {
        position: [
          position[0] * cos - position[2] * sin,
          position[1] * Math.cos(pitch),
          position[0] * sin + position[2] * cos,
        ],
        target: [0, 0, 0],
      };
    },
    drag(dx, dy) {
      offset = [offset[0] + dx, offset[1] + dy];
    },
    reset() {
      offset = [0, 0];
    },
    get dragOffset() {
      return offset;
    },
  };
}