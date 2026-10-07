export type RegimeIndex = 0 | 1 | 2 | 3;
export type EmbeddingKind = 'catenoid' | 'pseudosphere';

export interface AppState {
  regime: RegimeIndex;
  /** Schwarzschild mass in geometric metres (r_g = GM/c^2). */
  massMetres: number;
  /** Areal radius of the observer, in metres. */
  radiusMetres: number;
  embedding: EmbeddingKind;
  /** Regime-D throat radius, in metres. */
  throatMetres: number;
  /** Regime-C boost speed as a fraction of c. */
  boostBeta: number;
  mathOpen: boolean;
  parityOpen: boolean;
  transitioning: boolean;
  transitionFrom: RegimeIndex;
  transitionTo: RegimeIndex;
  /** Transition progress, 0..1. */
  transitionT: number;
}

export const MASS_MIN = 1e2;
export const MASS_MAX = 1e14;

/** The observer can never sit inside the horizon; the UI slider stops here. */
export const RADIUS_MIN_IN_M = 2.05;

const INITIAL: AppState = {
  regime: 0,
  massMetres: 3e9,
  radiusMetres: 3e10,
  embedding: 'catenoid',
  throatMetres: 1e4,
  boostBeta: 0.6,
  mathOpen: false,
  parityOpen: false,
  transitioning: false,
  transitionFrom: 0,
  transitionTo: 0,
  transitionT: 1,
};

export type Listener = (state: AppState) => void;

export interface Store {
  get(): Readonly<AppState>;
  set(patch: Partial<AppState>): void;
  subscribe(listener: Listener): () => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp the single-field ranges. Cross-field constraints live in clampPatch below. */
export function normalise(patch: Partial<AppState>): Partial<AppState> {
  const out: Partial<AppState> = { ...patch };
  if (out.massMetres !== undefined) out.massMetres = clamp(out.massMetres, MASS_MIN, MASS_MAX);
  if (out.boostBeta !== undefined) out.boostBeta = clamp(out.boostBeta, 0, 0.9999);
  if (out.throatMetres !== undefined && out.throatMetres <= 0) out.throatMetres = 1;
  if (out.transitionT !== undefined) out.transitionT = clamp(out.transitionT, 0, 1);
  return out;
}

export function createStore(initial: Partial<AppState> = {}): Store {
  let state: AppState = { ...INITIAL, ...normalise(initial) };
  const listeners = new Set<Listener>();

  /**
   * Normalise a patch so the store can never hold an out-of-range value. The cross-field
   * constraint is checked against the *current* state, not the patch alone, because an
   * areal radius is meaningless without knowing the mass.
   */
  const clampPatch = (patch: Partial<AppState>, current: AppState): Partial<AppState> => {
    const out = normalise(patch);
    const mass = out.massMetres ?? current.massMetres;

    // The horizon constraint must be re-applied on every patch, not only when the radius
    // is itself in the patch. Raising M can swallow a radius that was legal a moment ago,
    // and the observer would end up inside the horizon with no way to see why.
    const radius = out.radiusMetres ?? current.radiusMetres;
    const floor = RADIUS_MIN_IN_M * mass;
    if (out.radiusMetres !== undefined && out.radiusMetres < floor) {
      out.radiusMetres = floor;
    } else if (out.radiusMetres === undefined && out.massMetres !== undefined && radius < floor) {
      out.radiusMetres = floor;
    }
    return out;
  };

  return {
    get: () => state,
    set(patch) {
      const clean = clampPatch(patch, state);
      let changed = false;
      for (const key of Object.keys(clean) as (keyof AppState)[]) {
        if (!Object.is(state[key], clean[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...clean };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}