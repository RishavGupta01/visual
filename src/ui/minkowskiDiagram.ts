import { clockRate } from '../physics/minkowski';

/**
 * The 2D worldline diagram for regime C. Photons are drawn at exactly 45 degrees from a
 * common origin — the invariant, shown rather than stated. Both twins integrate the same
 * dt; only their beta differs, and the asymmetry comes from the shape of the worldlines
 * rather than from anything happening at the reunion.
 */
export interface MinkowskiHandle {
  draw(elapsed: number, beta: number): void;
  resize(): void;
}

export function mountMinkowskiDiagram(canvas: HTMLCanvasElement): MinkowskiHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for the Minkowski diagram');

  let width = 1;
  let height = 1;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth || 320;
    height = canvas.clientHeight || 220;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  return {
    resize,
    draw(elapsed, beta) {
      const originX = width * 0.5;
      const originY = height * 0.86;
      const scale = Math.min(width * 0.44, height * 0.78);
      const font = '10px ui-sans-serif, system-ui, sans-serif';

      ctx.clearRect(0, 0, width, height);

      // Axes.
      ctx.strokeStyle = 'rgba(232, 230, 223, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(width, originY);
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, height);
      ctx.stroke();

      // Light cone from the origin, at exactly 45 degrees.
      ctx.strokeStyle = 'rgba(127, 212, 255, 0.8)';
      ctx.lineWidth = 1.25;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + sign * scale, originY - scale);
        ctx.stroke();
      }

      // Twin A stays at x = 0. Twin B's worldline bends because its speed varies, which is
      // the entire content of the twin paradox.
      const horizon = Math.min(elapsed, scale);
      ctx.strokeStyle = 'rgba(255, 180, 84, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      const steps = 120;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const t = horizon * f;
        const bNow = beta * Math.sin(Math.PI * Math.min(1, f * 1.02));
        ctx.lineTo(originX + clockRate(bNow) * t, originY - t);
      }
      ctx.stroke();

      // Twin A.
      ctx.strokeStyle = 'rgba(232, 230, 223, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX, originY - horizon);
      ctx.stroke();

      ctx.font = font;
      ctx.fillStyle = 'rgba(232, 230, 223, 0.55)';
      ctx.fillText('t', originX + 5, 11);
      ctx.fillText('x', width - 11, originY - 4);
      ctx.fillStyle = 'rgba(127, 212, 255, 0.9)';
      ctx.fillText('light 45°', originX + scale * 0.4, originY - scale * 0.52);
      ctx.fillStyle = 'rgba(255, 180, 84, 0.95)';
      ctx.fillText('traveller', originX + 7, originY - horizon - 9);
      ctx.fillStyle = 'rgba(232, 230, 223, 0.85)';
      ctx.fillText('home', originX + 7, originY - 9);
    },
  };
}