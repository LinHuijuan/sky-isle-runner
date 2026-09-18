/**
 * Perf probe v2: real draw-call / triangle counts + GL backend info.
 * Usage: node scripts/perf-probe2.mjs [url]
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5188';
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CON: ' + m.text());
});

// Patch GL before any page script runs
await page.addInitScript(() => {
  const state = { calls: 0, tris: 0, frames: 0, last: 0, history: [] };
  window.__gl = state;
  const patch = (Proto) => {
    if (!Proto) return;
    const de = Proto.drawElements;
    Proto.drawElements = function (mode, count, ...rest) {
      state.calls += 1;
      state.tris += count / 3;
      return de.call(this, mode, count, ...rest);
    };
    const da = Proto.drawArrays;
    Proto.drawArrays = function (mode, first, count) {
      state.calls += 1;
      state.tris += count / 3;
      return da.call(this, mode, first, count);
    };
    const dei = Proto.drawElementsInstanced;
    if (dei) {
      Proto.drawElementsInstanced = function (mode, count, type, offset, instances) {
        state.calls += 1;
        state.tris += (count / 3) * instances;
        return dei.call(this, mode, count, type, offset, instances);
      };
    }
    const dai = Proto.drawArraysInstanced;
    if (dai) {
      Proto.drawArraysInstanced = function (mode, first, count, instances) {
        state.calls += 1;
        state.tris += count * instances;
        return dai.call(this, mode, first, count, instances);
      };
    }
  };
  patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);

  const html = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = html.call(this, type, ...rest);
    if (ctx && (type === 'webgl2' || type === 'webgl') && !this.__probed) {
      this.__probed = true;
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        window.__glInfo = {
          vendor: ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
          renderer: ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
        };
      }
    }
    return ctx;
  };
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(900);

const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);

// Start a stage run
await page.click('#btn-mode-stages');
await page.waitForTimeout(200);
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(200);
await page.click('#btn-start-run');
await page.waitForTimeout(800);

// reset counters and sample over N frames
const sample = async (frames = 60) =>
  page.evaluate(
    (n) =>
      new Promise((res) => {
        const s = window.__gl;
        s.calls = 0;
        s.tris = 0;
        s.frames = 0;
        const start = performance.now();
        const tick = () => {
          s.frames += 1;
          if (s.frames >= n) {
            res({
              drawCallsPerFrame: +(s.calls / s.frames).toFixed(1),
              trianglesPerFrame: Math.round(s.tris / s.frames),
              fps: +((s.frames * 1000) / (performance.now() - start)).toFixed(1),
              msPerFrame: +((performance.now() - start) / s.frames).toFixed(2),
            });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );

const glInfo = await page.evaluate(() => window.__glInfo ?? null);
console.log('=== GL BACKEND ===', JSON.stringify(glInfo));

await page.keyboard.press('Space');
for (let i = 0; i < 8; i += 1) {
  await page.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
  await page.waitForTimeout(150);
  await page.keyboard.up(i % 2 ? 'KeyA' : 'KeyD');
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
}

console.log('=== IN-RUN ===', JSON.stringify(await sample(80)));
let d = await diag();
console.log('renderer mem:', JSON.stringify(d?.renderer));
console.log('canvas:', JSON.stringify(d?.canvas), 'mode:', d?.mode, 'score:', d?.score);

// Pause overlay (menu) — scene still renders behind
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('=== PAUSED ===', JSON.stringify(await sample(40)));
d = await diag();
console.log('renderer mem:', JSON.stringify(d?.renderer));

// Title
const quit = page.locator('#btn-quit-title');
if (await quit.isVisible().catch(() => false)) await quit.click();
await page.waitForTimeout(600);
console.log('=== TITLE ===', JSON.stringify(await sample(40)));
d = await diag();
console.log('renderer mem:', JSON.stringify(d?.renderer));

// Scene graph size
const graph = await page.evaluate(() => {
  // count scene objects by walking from any canvas-attached renderer is not exposed;
  // approximate via THREE object registry is unavailable -> count via DOM-free heuristic
  return null;
});
void graph;

console.log('=== ERRORS ===', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
