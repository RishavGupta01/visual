import { describe, expect, it } from 'vitest';
import { createTimeline } from '../src/core/timeline';

describe('timeline', () => {
  it('advances when playing', () => {
    // MAX_STEP caps a single advance at 0.1 s so a restored tab cannot time-jump, so a
    // 1 s call advances by 0.1 rather than by 1.
    const tl = createTimeline({ duration: 10 });
    tl.play();
    tl.advance(1);
    expect(tl.position).toBeCloseTo(0.1, 6);
  });

  it('advances a whole second when fed it in real frames', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    for (let i = 0; i < 60; i++) tl.advance(1 / 60);
    expect(tl.position).toBeCloseTo(1, 6);
  });

  it('does not advance when paused', () => {
    const tl = createTimeline({ duration: 10 });
    tl.advance(1);
    expect(tl.position).toBe(0);
  });

  it('loops rather than clamping at the end', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    tl.seek(9.95);
    tl.advance(0.1);
    expect(tl.position).toBeCloseTo(0.05, 6);
  });

  it('wraps when it crosses the end', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    tl.seek(9.5);
    for (let i = 0; i < 6; i++) tl.advance(0.1);
    expect(tl.position).toBeCloseTo(0.1, 6);
  });

  it('survives a step larger than the remaining loop without going negative', () => {
    const tl = createTimeline({ duration: 1 });
    tl.play();
    tl.seek(0.95);
    tl.advance(0.1);
    expect(tl.position).toBeGreaterThanOrEqual(0);
    expect(tl.position).toBeLessThan(1);
  });

  it('scrubs to an absolute position', () => {
    const tl = createTimeline({ duration: 10 });
    tl.scrubTo(0.25);
    expect(tl.position).toBeCloseTo(2.5, 6);
  });

  it('exposes a normalised position', () => {
    const tl = createTimeline({ duration: 10 });
    tl.scrubTo(0.25);
    expect(tl.position01).toBeCloseTo(0.25, 6);
  });

  it('clamps scrub input', () => {
    const tl = createTimeline({ duration: 10 });
    tl.scrubTo(5);
    expect(tl.position).toBe(10);
    tl.scrubTo(-1);
    expect(tl.position).toBe(0);
  });

  it('is frame-rate independent', () => {
    const at30 = createTimeline({ duration: 10 });
    const at144 = createTimeline({ duration: 10 });
    at30.play();
    at144.play();
    for (let i = 0; i < 30; i++) at30.advance(1 / 30);
    for (let i = 0; i < 144; i++) at144.advance(1 / 144);
    expect(at30.position).toBeCloseTo(at144.position, 10);
  });

  it('does not time-jump after a long gap', () => {
    const tl = createTimeline({ duration: 1000 });
    tl.play();
    tl.advance(0.016);
    const before = tl.position;
    tl.advance(30);
    expect(tl.position - before).toBeLessThanOrEqual(0.1001);
  });

  it('reports playing state', () => {
    const tl = createTimeline({ duration: 10 });
    tl.play();
    expect(tl.playing).toBe(true);
    tl.pause();
    expect(tl.playing).toBe(false);
    tl.toggle();
    expect(tl.playing).toBe(true);
  });
});