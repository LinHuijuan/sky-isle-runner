/**
 * Capture the fail panel.
 *
 * Reaching the fail state needs three lost lives, and a run that is played
 * "well" survives long enough to make that slow. This deliberately steers hard
 * off the path every couple of seconds to fall quickly, and gives up after
 * `budgetMs`. Infinite lives must be off — it is persisted in the save, so it
 * is explicitly cleared first.
 *
 * Usage: node scripts/capture-fail.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5188';
const outDir = 'artifacts/review';
const budgetMs = 150000;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--use-gl=angle', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push('CONSOLE ' + m.text());
});

const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi(true));

await page.click('#btn-mode-stages');
await page.waitForTimeout(300);
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(300);

const infBtn = page.locator('#btn-infinite');
if ((await infBtn.getAttribute('aria-pressed')) === 'true') {
  await infBtn.click();
  await page.waitForTimeout(200);
  console.log('infinite lives: turned off');
}

await page.click('#btn-start-run');
await page.waitForTimeout(400);

const started = Date.now();
let last = null;
let reached = false;
while (Date.now() - started < budgetMs) {
  const d = await diag();
  last = d;
  if (d?.mode === 'fail') {
    // The game auto-retries after AUTO_RETRY_DELAY (1s), so the panel is only
    // on screen briefly. Shoot immediately — no settling wait.
    reached = true;
    break;
  }
  // Steer hard to the side to run off an island and burn a life fast.
  const key = Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  await page.waitForTimeout(700);
  await page.keyboard.up(key);
  await page.waitForTimeout(300);
}

const file = `${outDir}/15-fail.png`;
await page.screenshot({ path: file });
console.log(
  `${file}  mode=${last?.mode}  lives=${last?.lives}  z=${last?.player?.position?.z?.toFixed(1)}  ` +
    `panelCaptured=${reached}`,
);
console.log('problems:', problems.length ? problems : 'none');

await browser.close();
