/**
 * Deterministic frozen-frame capture, for before/after visual comparison.
 *
 * seed(42) + setState('active-play') + setPausedForScreenshot(true) freezes the
 * simulation on an exact, reproducible frame, so two builds can be compared
 * pixel for pixel without worrying about timing jitter.
 *
 * Usage: node scripts/capture-frozen.mjs <label> [url]
 *   -> artifacts/ab/<label>.png
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const label = process.argv[2];
const url = process.argv[3] ?? 'http://127.0.0.1:5188';
if (!label) {
  console.error('usage: node scripts/capture-frozen.mjs <label> [url]');
  process.exit(2);
}

const outDir = 'artifacts/ab';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--use-gl=angle', '--enable-webgl'],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
const problems = [];
page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push('CONSOLE ' + m.text());
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(900);

const frozen = await page.evaluate(() => {
  const h = window.__THREE_GAME_TEST_HOOKS__;
  if (!h) return { ok: false, why: 'no hooks' };
  h.hideDebugUi(true);
  h.setReducedMotion(false);
  h.seed(42);
  h.setState('active-play');
  h.setPausedForScreenshot(true);
  return { ok: true };
});
if (!frozen.ok) {
  console.error('hooks unavailable:', frozen.why);
  process.exit(1);
}

// Let the frozen frame settle (one render pass after the pause flag).
await page.waitForTimeout(1500);

const file = `${outDir}/${label}.png`;
await page.screenshot({ path: file });

const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);
console.log(
  `${file}  mode=${d?.mode}  frame=${d?.frame}  ` +
    `geom=${d?.renderer?.geometries}  tex=${d?.renderer?.textures}  ` +
    `pos=(${d?.player?.position?.x?.toFixed(2)},${d?.player?.position?.y?.toFixed(2)},${d?.player?.position?.z?.toFixed(2)})`,
);
console.log('problems:', problems.length ? problems : 'none');

await browser.close();
