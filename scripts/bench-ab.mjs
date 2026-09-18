/**
 * Deterministic A/B benchmark.
 * Freezes the scene via the test hooks so both builds render an identical frame.
 * Usage: node scripts/bench-ab.mjs <url> [label]
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5188';
const label = process.argv[3] ?? url;

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

await page.addInitScript(() => {
  const state = { calls: 0, tris: 0 };
  window.__gl = state;
  const patch = (Proto) => {
    if (!Proto) return;
    const de = Proto.drawElements;
    Proto.drawElements = function (m, c, ...r) {
      state.calls += 1;
      state.tris += c / 3;
      return de.call(this, m, c, ...r);
    };
    const da = Proto.drawArrays;
    Proto.drawArrays = function (m, f, c) {
      state.calls += 1;
      state.tris += c / 3;
      return da.call(this, m, f, c);
    };
    const dei = Proto.drawElementsInstanced;
    if (dei) {
      Proto.drawElementsInstanced = function (m, c, t, o, i) {
        state.calls += 1;
        state.tris += (c / 3) * i;
        return dei.call(this, m, c, t, o, i);
      };
    }
  };
  patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);

const sample = (frames) =>
  page.evaluate(
    (n) =>
      new Promise((res) => {
        const s = window.__gl;
        s.calls = 0;
        s.tris = 0;
        let f = 0;
        const start = performance.now();
        const tick = () => {
          f += 1;
          if (f >= n) {
            const ms = (performance.now() - start) / f;
            res({
              calls: +(s.calls / f).toFixed(1),
              tris: Math.round(s.tris / f),
              fps: +(1000 / ms).toFixed(1),
              ms: +ms.toFixed(2),
            });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );

const results = [];
for (let i = 0; i < 3; i += 1) {
  // Identical course (seed 42) + identical player position, then frozen.
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__.setState('active-play');
    window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
  });
  await page.waitForTimeout(400);
  results.push(await sample(70));
}

const med = (k) => {
  const v = results.map((r) => r[k]).sort((a, b) => a - b);
  return v[1];
};
const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);

console.log(`--- ${label} ---`);
console.log('samples :', JSON.stringify(results));
console.log(
  'median  : drawCalls=%s triangles=%s fps=%s msPerFrame=%s',
  med('calls'),
  med('tris'),
  med('fps'),
  med('ms'),
);
console.log('resources:', JSON.stringify(d?.renderer));
await browser.close();
