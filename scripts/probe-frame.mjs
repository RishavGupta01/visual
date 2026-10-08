/**
 * Frame orientation probe.
 *
 * Reads the live camera and a coarse luminance grid off the rendered canvas, so questions
 * like "where is the hole actually landing?" get answered from the framebuffer instead of
 * from squinting at a screenshot.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  // The build targets the GitHub Pages base of /visual/, so requests arrive prefixed and the
  // prefix has to be stripped to resolve against dist/.
  const stripped = path.replace(/^\/visual/, '') || '/';
  const file = join(DIST, stripped === '/' ? 'index.html' : stripped);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log(`  [${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
page.on('requestfailed', (r) => console.log(`  [404] ${r.url()}`));
await page.goto(base);
await page.waitForTimeout(8000);
console.log('BOOTED', await page.evaluate(() => typeof window.__spacetime));
await page.waitForFunction(() => window.__spacetime && window.__spacetime.frameCount() > 2, null, {
  timeout: 120000,
  polling: 300,
});
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const s = window.__spacetime;
  const u = s.renderer.uniformBlock;
  s.timeline.pause();
  s.timeline.scrubTo(0);
  return {
    regime: s.store.get().regime,
    position01: s.timeline.position01,
    cam: [u.uCameraPos.value.x, u.uCameraPos.value.y, u.uCameraPos.value.z],
    target: [u.uCameraTarget.value.x, u.uCameraTarget.value.y, u.uCameraTarget.value.z],
    mass: u.uMass.value,
    fov: u.uFov.value,
  };
});
console.log('STATE', JSON.stringify(info));

// Sample the canvas itself. Averaging over blocks rather than reading single pixels keeps
// this insensitive to star noise.
const grid = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2');
  const w = canvas.width;
  const h = canvas.height;
  const cols = 24;
  const rows = 9;
  const out = [];
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      // readPixels returns rows bottom-up: buffer row 0 is the *bottom* of the image. So the
      // image's row r lives at buffer rows h-(r+1)*h/rows .. h-r*h/rows. Getting this wrong
      // flips the whole reading and makes a disk in the lower frame appear at the top.
      const x0 = Math.floor((c * w) / cols);
      const x1 = Math.floor(((c + 1) * w) / cols);
      const y0 = h - Math.floor(((r + 1) * h) / rows);
      const y1 = h - Math.floor((r * h) / rows);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          sum += px[(y * w + x) * 4];
          n++;
        }
      }
      line.push(n === 0 ? 0 : Math.round(sum / n));
    }
    out.push(line);
  }
  return out;
});
console.log('GRID (top row first, 0-255 mean red channel)');
for (const line of grid) console.log(line.map((v) => String(v).padStart(4)).join(''));

await browser.close();
server.close();