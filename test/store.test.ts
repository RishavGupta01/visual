import { describe, expect, it, vi } from 'vitest';
import { MASS_MAX, createStore, normalise, type AppState } from '../src/core/store';

describe('store', () => {
  it('notifies subscribers on change', () => {
    const store = createStore();
    const spy = vi.fn();
    store.subscribe(spy);
    store.set({ regime: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the patch is a no-op', () => {
    const store = createStore();
    store.set({ regime: 1 });
    const spy = vi.fn();
    store.subscribe(spy);
    store.set({ regime: 1 });
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('hands the updated state to the subscriber', () => {
    const store = createStore();
    let seen: AppState | null = null;
    store.subscribe((s) => {
      seen = s;
    });
    store.set({ regime: 2 });
    expect(seen!.regime).toBe(2);
  });

  it('unsubscribes cleanly', () => {
    const store = createStore();
    const spy = vi.fn();
    const off = store.subscribe(spy);
    off();
    store.set({ regime: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('clamps mass into the supported range', () => {
    const store = createStore();
    store.set({ massMetres: 1e30 });
    expect(store.get().massMetres).toBe(MASS_MAX);
    store.set({ massMetres: -5 });
    expect(store.get().massMetres).toBeGreaterThan(0);
  });

  it('clamps boost below c', () => {
    expect(normalise({ boostBeta: 3 }).boostBeta).toBeLessThan(1);
    expect(normalise({ boostBeta: 3 }).boostBeta).toBeCloseTo(0.9999, 6);
  });

  it('holds the observer outside the horizon for any mass', () => {
    const store = createStore();
    store.set({ massMetres: 1e6 });
    store.set({ radiusMetres: 10 });
    expect(store.get().radiusMetres).toBeGreaterThanOrEqual(2.05 * 1e6);
  });

  it('keeps the radius outside the horizon when mass grows', () => {
    const store = createStore();
    store.set({ massMetres: 1e3, radiusMetres: 1e9 });
    store.set({ massMetres: 1e9 });
    expect(store.get().radiusMetres).toBeGreaterThanOrEqual(2.05 * 1e9);
  });

  it('leaves a radius that is already valid alone', () => {
    const store = createStore();
    store.set({ massMetres: 1e6, radiusMetres: 1e8 });
    expect(store.get().radiusMetres).toBe(1e8);
  });
});