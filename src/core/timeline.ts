export interface TimelineOptions {
  /** Loop length in seconds. */
  duration: number;
}

export interface Timeline {
  readonly position: number;
  readonly position01: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  scrubTo(normalised: number): void;
  /** Advance by dt seconds. Large gaps are clamped so a backgrounded tab cannot jump. */
  advance(dt: number): void;
}

/** Never advance more than this in one step, so a restored tab does not time-jump. */
const MAX_STEP = 0.1;

export function createTimeline(opts: TimelineOptions): Timeline {
  let position = 0;
  let playing = false;

  return {
    get position() {
      return position;
    },
    get position01() {
      return opts.duration > 0 ? position / opts.duration : 0;
    },
    get playing() {
      return playing;
    },
    play() {
      playing = true;
    },
    pause() {
      playing = false;
    },
    toggle() {
      playing = !playing;
    },
    seek(seconds) {
      position = clampRange(seconds, opts.duration);
    },
    scrubTo(normalised) {
      position = clampRange(normalised, 1) * opts.duration;
    },
    advance(dt) {
      if (!playing) return;
      position += Math.min(dt, MAX_STEP);
      if (position >= opts.duration) position -= opts.duration;
      if (position < 0) position = 0;
    },
  };
}

function clampRange(value: number, hi: number): number {
  return value < 0 ? 0 : value > hi ? hi : value;
}