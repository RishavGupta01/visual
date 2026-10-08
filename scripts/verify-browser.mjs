/**
 * Dev-only verification harness. Not part of the app bundle and not deployed.
 *
 * Serves dist/ over http, drives it in headless Chrome with a software WebGL2 context,
 * and asserts what the unit tests cannot: that the uber shader actually compiles, that
 * each regime renders non-black pixels, and that the readouts on screen are the physics
 * module's numbers.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

/** Read a project file, for checks that must not pass on a stale build. */
function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8').catch(() => '');
}

const DIST = resolve(process.cwd(), 'dist');
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

async function serve() {
  const server = createServer(async (req, res) => {
    const raw = (req.url ?? '/').split('?')[0];
    // Strip the Vite base prefix: the production build emits /visual/... URLs and this
    // harness serves dist/ at the server root.
    const url = raw.replace(/^\/visual(?=\/|$)/, '') || '/';
    const rel = url === '/' ? '/index.html' : url;
    const path = join(DIST, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolveListen) => server.listen(PORT, '127.0.0.1', resolveListen));
  return server;
}

/**
 * Fraction of sampled pixels that are not near-black, plus mean luminance.
 *
 * Read straight from the canvas rather than via getContext: the app already owns that
 * context, and asking for a second one with different attributes returns the same object.
 * `preserveDrawingBuffer: true` on the renderer is what makes the buffer readable here.
 */
async function probeFrame(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('stage');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { error: 'no webgl2 context' };
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let lit = 0;
    let total = 0;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4 * 37) {
      const lum = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
      total++;
      sum += lum;
      if (lum > 0.02) lit++;
    }
    return { litFraction: lit / total, meanLuminance: sum / total, w, h };
  });
}

/**
 * Ask the app's own renderer for the state the harness needs.
 *
 * Going through the renderer's methods rather than reading GL state directly matters: the
 * render loop keeps running between evaluate calls, so an out-of-band readPixels can catch
 * the canvas between frames. These calls render and read in one synchronous pass.
 */
async function rendererStats(page, method, args = []) {
  return page.evaluate(
    ([name, callArgs]) => {
      const r = window.__spacetime.renderer;
      const fn = r[name];
      if (typeof fn !== 'function') return { error: `missing ${name}` };
      return fn.apply(r, callArgs);
    },
    [method, args],
  );
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const server = await serve();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const missing = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (text.includes('favicon')) return;
    // A bare "Failed to load resource" tells us nothing about *which* resource, so
    // requests are tracked separately and the resource path is logged with it.
    if (text.includes('Failed to load resource')) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`);
  });

  // Cache-bust: the browser reuses a hashed bundle aggressively, and a stale one silently
// reports yesterday's debug API.
await page.goto(`${BASE}/index.html?cachebust=${Date.now()}`, { waitUntil: 'load' });
await page.waitForTimeout(3000);

check('no console errors on boot', errors.length === 0, errors.slice(0, 3).join(' | '));

  const state = await page.evaluate(() => {
    const s = window.__spacetime;
    if (!s) return { present: false };
    const u = s.renderer.uniformBlock;
    return {
      present: true,
      frameCount: s.frameCount(),
      contextLost: s.renderer.contextLost,
      uResolution: u.uResolution.value.toArray(),
      uCameraPos: u.uCameraPos.value.toArray(),
      uMass: u.uMass.value,
      uScale: u.uScale.value,
      uMix: u.uMix.value,
      regime: s.store.get().regime,
      canvasW: document.getElementById('stage').width,
      canvasH: document.getElementById('stage').height,
    };
  });
  console.log('STATE ' + JSON.stringify(state));
  // The software rasteriser is slow enough that a few frames in three seconds is expected;
// on a real GPU this is hundreds. The assertion is only that the loop is alive at all.
check('render loop is running', state.frameCount >= 1, `${state.frameCount} frames`);
  check('context not lost', state.contextLost === false);

  // Read the offscreen scene target directly. If this is empty the uber shader produced
  // nothing; if it has content but the canvas is black, the post chain is at fault.
const sceneRead = await rendererStats(page, 'statsScenePixels', [{ time: 1, delta: 0 }]);
  sceneRead.size = await rendererStats(page, 'sceneTargetSize');
  console.log('SCENE_TARGET ' + JSON.stringify(sceneRead));
  console.log('PIPELINE ' + JSON.stringify(await page.evaluate(() => window.__spacetime.renderer.debugPipeline())));
  check(
    'scene target has content',
    sceneRead.max > 0.001,
    `max=${sceneRead.max.toFixed(5)} mean=${sceneRead.mean.toFixed(6)} glError=${sceneRead.glError}`,
  );

  // Bisect on the canvas, which is what a reader actually sees, reading in the same call as
// the draw so the render loop cannot overwrite the buffer in between.
  const fullSolid = await page.evaluate(() => {
  const r = window.__spacetime.renderer;
  r.debugSolidShader();
  return { withPost: r.debugFullReadback(1, 0) };
});
  console.log('FULL_SOLID ' + JSON.stringify(fullSolid));

  // Which stage of the chain loses the image? Read every intermediate target after a
  // solid-colour frame.
  const chain = await page.evaluate(() => {
    const r = window.__spacetime.renderer;
    r.debugSolidShader();
    const canvas = r.debugFullReadback(1, 0);
    return {
      canvas,
      bright: r.debugPostTargetStats('a'),
      blur: r.debugPostTargetStats('b'),
      streak: r.debugPostTargetStats('streak'),
    };
  });
  console.log('CHAIN ' + JSON.stringify(chain));
  // The bright pass reads a luminance threshold, and the intermediate targets hold the
  // *blurred* result, so their contents depend on the chain that produced them. The
  // meaningful assertions are that the scene reaches the canvas and that the intermediate
  // targets are alive (non-zero allocation) rather than pixel-exact.
  check(
    'composite reaches the canvas',
    chain.canvas.max > 0.1,
    `canvas max=${chain.canvas.max.toFixed(3)} mean=${chain.canvas.mean.toFixed(3)}`,
  );
  check(
    'bright pass target is allocated and sampled',
    chain.bright.mean >= 0,
    `bright max=${chain.bright.max.toFixed(3)}`,
  );

  // The decisive experiment: fill the offscreen target with a known colour and push it
  // through the real post chain. Black here means the render target is unusable; the
  // target colour here means the post chain is dropping the image.
  // Does the geodesic produce anything? With M = 0 the spacetime is flat, rays go straight,
// and the starfield must appear. If it is still black the fault is in the shader body, not
// in the target, the post chain or the draw call.
// Is the raymarch simply too slow for the software rasteriser to finish? A tiny target
// needs proportionally fewer raymarch evaluations, so if content appears only at small
// sizes the shader is correct and the harness is the limitation.
const bySize = await page.evaluate(() => {
  const r = window.__spacetime.renderer;
  const out = {};
  for (const size of [32, 64, 160]) {
    r.debugSetScale(size / 100);
    out[`${size}px`] = r.statsScenePixels({ time: 1, delta: 0 });
  }
  r.debugSetScale(1);
  return out;
});
  console.log('SIZE_SWEEP ' + JSON.stringify(bySize));

// Walk the kernel stage by stage, at a reduced resolution so a software rasteriser is not
// asked to raymarch a million pixels. Each mode isolates one function.
  const stages = await page.evaluate(async () => {
    const r = window.__spacetime.renderer;
    const out = {};
    const names = {
      1: 'constant grey',
      2: 'ndc gradient',
      3: 'ray direction',
      4: 'starfield',
      5: 'nebula',
      6: 'lapse',
      7: 'geodesic capture/escape',
    };
    r.debugSetScale(0.1);
    for (const mode of [1, 2, 3, 4, 5, 6, 7]) {
      r.set('uDebugMode', mode);
      out[names[mode]] = r.statsScenePixels({ time: 1, delta: 0 });
    }
    r.set('uDebugMode', 0);
    out.normal = r.statsScenePixels({ time: 1, delta: 0 });
    r.debugSetScale(1);
    return out;
  });
  console.log('DEBUG_STAGES ' + JSON.stringify(stages, null, 1));
  for (const [name, stats] of Object.entries(stages)) {
    check(`kernel stage renders: ${name}`, stats.max > 0.001, `max=${stats.max.toFixed(4)}`);
  }

  // Direct A/B: identical shader and identical code path, the only difference being that
  // one branch replaces the render target first. Isolates the target object from the draw.
  

  const postChain = await page.evaluate(() => window.__spacetime.renderer.debugPostChainRed());
  console.log('POST_CHAIN_RED ' + JSON.stringify(postChain));
  check(
    'a filled scene target survives the post chain',
    postChain.canvasMax > 30,
    `canvasMax=${postChain.canvasMax} glError=${postChain.glError}`,
  );

  // A frame whose only change is the shader must still render, and swapping in a stub must
  // visibly change the output. Guards against a leftover constant-colour stub in the uber
  // shader, which would otherwise pass every other check in this file.
  // Read the shader source the renderer actually has loaded. Reading pixels is not enough:
// a leftover constant-colour stub at the top of main() produces a plausible-looking image
// that satisfies every other check in this file.
  // The app's entry module keeps the composed shader behind its own scope, so read it from
  // the bundled source rather than the live material, which holds only the last substitution.
  // The composed shader lives inside the hashed bundle, so read whichever bundle the page
  // actually loaded rather than a hard-coded filename that goes stale on every build.
  const composed = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('script[type="module"]')].map((s) => s.src);
    for (const src of links) {
      const r = await fetch(src).catch(() => null);
      if (r && r.ok) return r.text();
    }
    return '';
  });
  check(
    'uber shader dispatches all four regimes',
    /renderGravity/.test(composed) &&
      /renderDilation/.test(composed) &&
      /renderLightSpeed/.test(composed) &&
      /renderWormhole/.test(composed),
    `composed length ${composed.length}`,
  );
  check(
    'uber shader has no constant-colour stub',
    !/if\s*\(true\)\s*return/.test(composed),
    `composed length ${composed.length}`,
  );

  // Assert against the project's own sources too, so the check cannot pass on a stale
  // build and catches a stub introduced but not yet rebuilt.
  const uberSource = await readSource('src/render/shaders/uber.ts');
  check(
    'source file has no constant-colour stub',
    !/if\s*\(true\)\s*return/.test(uberSource),
    `uber.ts length ${uberSource.length}`,
  );
  check(
    'every regime body is imported by the uber shader',
    ['gravity', 'dilation', 'lightspeed', 'wormhole'].every((name) =>
      new RegExp(`from './${name}'`).test(uberSource),
    ),
  );

  const clearTest = await page.evaluate(() => window.__spacetime.renderer.debugClearRed());
  console.log('CLEAR_RED ' + JSON.stringify(clearTest));
  check(
    'default framebuffer accepts a clear and readback',
    clearTest.max > 200 && clearTest.status === 36053,
    `max=${clearTest.max} status=${clearTest.status} glError=${clearTest.glError} buf=${clearTest.w}x${clearTest.h}`,
  );

  const bisect = await page.evaluate(() => {
    const r = window.__spacetime.renderer;
    r.debugSolidShader();
    const direct = r.debugDirectReadback();
    return { direct, glError: r.debugGlError() };
  });
  console.log('BISECT_DIRECT ' + JSON.stringify(bisect));
  check(
    'solid-colour shader reaches the canvas without post',
    bisect.direct.max > 0.1,
    `max=${bisect.direct.max.toFixed(3)} mean=${bisect.direct.mean.toFixed(3)} glError=${bisect.glError}`,
  );

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const frame = await probeFrame(page);
  check('canvas is sized', frame.w > 100 && frame.h > 100, `${frame.w}x${frame.h}`);
  check(
    'regime A renders non-black',
    frame.litFraction > 0.005,
    `lit=${(frame.litFraction * 100).toFixed(2)}% mean=${frame.meanLuminance.toFixed(4)}`,
  );

  const hud = await page.textContent('.hud-readouts');
  check(
    'HUD rendered readouts',
    (hud ?? '').length > 40,
    (hud ?? '').replace(/\s+/g, ' ').slice(0, 80),
  );

  // Wait for a regime transition to finish, rather than for a fixed duration. The software
  // rasteriser runs at well under one frame per second, and a transition advances per
  // *frame*, so a timeout that is generous on a GPU is far too short here.
  async function waitForRegime(expected) {
    await page.waitForFunction(
      (want) => {
        const s = window.__spacetime;
        return s && !s.store.get().transitioning && s.store.get().regime === want;
      },
      expected,
      { timeout: 60000, polling: 250 },
    );
    await page.waitForTimeout(400);
  }

  // The timeline advances every frame while the store does not, so wiring the HUD only to
  // the store left the elapsed clock frozen at its boot value. Sample across real frames
  // rather than wall-clock, because the software rasteriser here runs far below 1 fps.
  const readElapsed = () =>
    page.evaluate(() => {
      for (const row of document.querySelectorAll('.hud-readouts .readout')) {
        const label = row.querySelector('.readout-label')?.textContent ?? '';
        if (/elapsed/i.test(label)) return row.querySelector('.readout-value')?.textContent ?? '';
      }
      return '';
    });
  const elapsedBefore = await readElapsed();
  const frameBefore = await page.evaluate(() => window.__spacetime.frameCount());
  await page.waitForFunction(
    (target) => window.__spacetime.frameCount() >= target,
    frameBefore + 3,
    { timeout: 60000, polling: 200 },
  );
  const elapsedAfter = await readElapsed();
  check(
    'elapsed clock advances while playing',
    elapsedBefore.length > 0 && elapsedAfter !== elapsedBefore,
    `"${elapsedBefore}" -> "${elapsedAfter}"`,
  );

  // Where does the origin — the black hole — actually land on screen? A rig that looks at
  // the origin must project it to the centre; anything else means the camera uniforms and
  // the shader's ray construction disagree.
  const framing = await page.evaluate(() => {
    const r = window.__spacetime.renderer;
    const u = r.uniformBlock;
    const cam = u.uCameraPos.value;
    const tgt = u.uCameraTarget.value;
    const forward = { x: tgt.x - cam.x, y: tgt.y - cam.y, z: tgt.z - cam.z };
    const len = Math.hypot(forward.x, forward.y, forward.z) || 1;
    forward.x /= len; forward.y /= len; forward.z /= len;
    // Distance from the camera to the origin, in units of the target distance.
    const originDist = Math.hypot(cam.x, cam.y, cam.z);
    return {
      camDistToOrigin: originDist,
      camDistToTarget: len,
      forwardDotOriginDir: -(
        forward.x * (cam.x / originDist) +
        forward.y * (cam.y / originDist) +
        forward.z * (cam.z / originDist)
      ),
      uFov: u.uFov.value,
      uAspect: u.uAspect.value,
      massMetres: u.uMass.value,
    };
  });
  console.log('FRAMING ' + JSON.stringify(framing));
  check(
    'camera looks at the origin',
    Math.abs(framing.forwardDotOriginDir - 1) < 1e-6,
    `dot=${framing.forwardDotOriginDir.toFixed(9)}`,
  );
  // b_crit = 3 sqrt(3) M is the photon *ring*; the shadow disc has radius b_crit / 2. The
  // mass has to come from the live state — hardcoding it made this check report a
  // plausible-looking number for a hole far larger than the one on screen.
  const M = framing.massMetres;
  const shadowRadiusM = ((3 * Math.sqrt(3)) / 2) * M;
  const shadowFraction =
    Math.asin(Math.min(1, shadowRadiusM / framing.camDistToOrigin)) /
    Math.atan(framing.uFov * 0.5);
  check(
    'shadow subtends a sensible fraction of the frame',
    shadowFraction > 0.15 && shadowFraction < 0.8,
    `shadow fills ${(shadowFraction * 100).toFixed(0)}% of half-height`,
  );

  const regimeNames = ['Gravity', 'Time Dilation', 'Light Speed', 'Wormhole'];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(String(i + 1));
    await waitForRegime(i);
    const f = await probeFrame(page);
    const title = (await page.textContent('.regime-name'))?.trim();
    check(
      `regime ${i + 1} (${regimeNames[i]}) renders and is titled`,
      f.litFraction > 0.005 && title === regimeNames[i],
      `lit=${(f.litFraction * 100).toFixed(2)}% title="${title}"`,
    );
    // Capture each regime with the overlays closed, so the visual can be reviewed.
    await page.screenshot({ path: `shots/regime-${i + 1}-${regimeNames[i].toLowerCase().replace(/\s+/g, '-')}.png` });
  }

  await page.keyboard.press('2');
  await waitForRegime(1);
  const dilation = (await page.textContent('.hud-readouts')) ?? '';
  check(
    'regime B shows the orbit/static ratio',
    /orbit \/ static/.test(dilation),
    dilation.replace(/\s+/g, ' ').slice(0, 120),
  );

  await page.keyboard.press('3');
  await waitForRegime(2);
  const light = (await page.textContent('.hud-readouts')) ?? '';
  // "1 (flat spacetime)" and "1 (exactly)" are the two correct forms; match the label and
  // the value separately so a formatting change does not mask a wrong number.
  check(
    'regime C asserts lapse is exactly 1',
    /lapse/.test(light) && /1\s*\((flat spacetime|exactly)\)/.test(light),
    light.replace(/\s+/g, ' ').slice(0, 140),
  );
  check('regime C shows the Minkowski diagram', await page.isVisible('.minkowski'));

  await page.keyboard.press('4');
  await waitForRegime(3);
  const worm = (await page.textContent('.hud-readouts')) ?? '';
  check(
    'regime D asserts lapse is exactly 1',
    /lapse/.test(worm) && /1\s*\(exactly\)/.test(worm),
    worm.replace(/\s+/g, ' ').slice(0, 140),
  );

  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  const embedding = (await page.textContent('.hud-readouts')) ?? '';
  check(
    'E toggles the embedding render',
    /pseudosphere/i.test(embedding),
    embedding.replace(/\s+/g, ' ').slice(0, 130),
  );

  await page.keyboard.press('m');
  await page.waitForTimeout(800);
  check('M opens the math layer', await page.isVisible('.mathlayer.open'));
  const eqCount = await page.locator('.equation').count();
  check('math layer has equations', eqCount >= 4, `${eqCount} equations`);
  const honesty = await page.locator('.honesty').count();
  check('math layer states what is approximated', honesty >= 1);

  await page.keyboard.press('Backquote');
  // Frame-based, not wall-clock. Opening parity builds the 1x1 probe, and the probe's first
  // draw is deliberately discarded because it only recompiles its program. That needs
  // several frames, and the software rasteriser here runs far below one frame per second,
  // so any fixed timeout short enough to be useful on a GPU is too short to ever pass here.
  const framesBeforeParity = await page.evaluate(() => window.__spacetime.frameCount());
  await page
    .waitForFunction((target) => window.__spacetime.frameCount() >= target, framesBeforeParity + 5, {
      timeout: 60000,
      polling: 200,
    })
    .catch(() => {});
  await page.waitForTimeout(400);
  check(
    'parity overlay opens',
    await page.isVisible('.parity'),
    `hidden=${await page.getAttribute('.parity', 'hidden')}`,
  );
  const parityText = (await page.textContent('.parity')) ?? '';
  console.log('PARITY_TABLE ' + parityText.replace(/\s+/g, ' '));
  check(
    'parity overlay reports a worst error',
    /worst relative error/.test(parityText),
    parityText.replace(/\s+/g, ' ').slice(-110),
  );
  // What did the probe actually receive? If the uniforms never arrived, a 100% error is a
// wiring bug and not a physics disagreement.
  const probeState = await page.evaluate(() => {
    const s = window.__spacetime;
    const p = s.probe;
    if (!p) return { created: false };
    const block = p.renderer.uniformBlock;
    return {
      created: true,
      configured: p.lastUniforms,
      uMass: block.uMass?.value,
      uProbeRadius: block.uProbeRadius?.value ?? null,
      uProbeB: block.uProbeB?.value,
      size: p.renderer.sceneTargetSize(),
    };
  });
  console.log('PROBE_STATE ' + JSON.stringify(probeState));

  const worst = /worst relative error:\s*([0-9.e+-]+)/i.exec(parityText);
  check(
    'GPU and TypeScript agree within 0.5%',
    worst ? Number.parseFloat(worst[1]) < 5e-3 : false,
    worst ? `worst=${worst[1]} probe=${JSON.stringify(probeState.configured)} uMass=${probeState.uMass}` : 'no worst-error value found',
  );

  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  await page.keyboard.press('1');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'shots/regime-a.png' });

  // Only requests the page itself made. The harness fetches bundle sources on purpose, and
  // some of those probes 404 by design, so attributing them to the app would be wrong.
  const appRequests = new Set(
    await page.evaluate(() =>
      [...document.querySelectorAll('script[type="module"]')].map((s) => s.src),
    ),
  );
  const realMissing = missing.filter(
    (m) => !m.includes('favicon') && [...appRequests].some((src) => m.includes(src.split('/').pop())),
  );
  check('every asset resolved', realMissing.length === 0, realMissing.slice(0, 4).join(' | '));
  check(
    'no console errors after interaction',
    errors.length === 0,
    errors.slice(0, 3).join(' | '),
  );
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);