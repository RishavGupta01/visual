import { describe, expect, it } from 'vitest';
import { catmullRom, createRig, hashAngle, type Vec3 } from '../src/camera/rig';

describe('catmullRom', () => {
  it('passes through its control points', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 1, 0],
      [3, 0, 0],
    ];
    for (let i = 0; i < pts.length; i++) {
      const p = catmullRom(pts, i, i, 1);
      expect(p[0]).toBeCloseTo(pts[i]![0], 10);
      expect(p[1]).toBeCloseTo(pts[i]![1], 10);
      expect(p[2]).toBeCloseTo(pts[i]![2], 10);
    }
  });

  it('interpolates midway between two points', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ];
    expect(catmullRom(pts, 1, 2, 0.5)[0]).toBeCloseTo(1.5, 6);
  });

  it('clamps t outside the unit interval', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    expect(catmullRom(pts, 0, 1, -1)).toEqual(catmullRom(pts, 0, 1, 0));
    expect(catmullRom(pts, 0, 1, 2)).toEqual(catmullRom(pts, 0, 1, 1));
  });
});

describe('hashAngle', () => {
  it('stays within half a revolution', () => {
    for (let i = 0; i < 64; i++) expect(Math.abs(hashAngle(i))).toBeLessThanOrEqual(Math.PI);
  });

  it('is deterministic', () => {
    expect(hashAngle(7)).toBe(hashAngle(7));
  });
});

describe('rig', () => {
  it('produces finite camera state', () => {
    const state = createRig().sample(0.3);
    expect(Number.isFinite(state.position[0])).toBe(true);
    expect(Number.isFinite(state.target[0])).toBe(true);
  });

  it('never enters the horizon', () => {
    const rig = createRig({ mass: 1000 });
    for (let i = 0; i <= 40; i++) {
      const { position } = rig.sample(i / 40);
      expect(Math.hypot(...position)).toBeGreaterThan(2000);
    }
  });

  it('applies and resets drag', () => {
    const rig = createRig();
    const before = rig.sample(0.5).position[0];
    rig.drag(0.4, 0.2);
    expect(rig.sample(0.5).position[0]).not.toBeCloseTo(before, 6);
    rig.reset();
    expect(rig.sample(0.5).position[0]).toBeCloseTo(before, 6);
  });

  it('never returns NaN along the whole path', () => {
    const rig = createRig({ mass: 3e9 });
    for (let i = 0; i <= 100; i++) {
      const { position } = rig.sample(i / 100);
      expect(position.every(Number.isFinite)).toBe(true);
    }
  });

  it('closes the loop seam', () => {
    // The camera coordinates are ~1e10, so absolute closeness is meaningless; what matters
    // is that the seam is negligible relative to the path's own size.
    const rig = createRig();
    const end = rig.sample(1).position;
    const start = rig.sample(0).position;
    const scale = Math.hypot(...start);
    const gap = Math.hypot(end[0]! - start[0]!, end[1]! - start[1]!, end[2]! - start[2]!);
    expect(gap / scale).toBeLessThan(1e-9);
  });

  it('never jumps discontinuously between adjacent samples', () => {
    const rig = createRig({ mass: 3e9 });
    let previous = rig.sample(0).position;
    for (let i = 1; i <= 200; i++) {
      const current = rig.sample(i / 200).position;
      const step = Math.hypot(
        current[0]! - previous[0]!,
        current[1]! - previous[1]!,
        current[2]! - previous[2]!,
      );
      expect(step).toBeLessThan(Math.hypot(...previous) * 0.15);
      previous = current;
    }
  });

  it('always looks at the origin', () => {
    const rig = createRig();
    for (let i = 0; i <= 20; i++) {
      expect(rig.sample(i / 20).target).toEqual([0, 0, 0]);
    }
  });
});