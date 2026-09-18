/**
 * Visual review capture.
 *
 * Walks the whole UI flow plus several in-run moments and writes PNGs to
 * artifacts/review/. The point is to have a human (or the agent) actually LOOK
 * at the frames — headless counters alone cannot prove the picture is right.
 *
 * Usage: node scripts/capture-review.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5188';
const outDir = 'artifacts/review';
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

const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);
const hooks = (fn) => page.evaluate(fn);

let n = 0;
const shot = async (name, note = '') => {
  n += 1;
  const file = `${outDir}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  const d = await diag();
  console.log(
    `${file}  mode=${d?.mode ?? '-'}  z=${d?.player?.position?.z?.toFixed(1) ?? '-'}  ` +
      `y=${d?.player?.position?.y?.toFixed(1) ?? '-'}  score=${d?.score ?? '-'}  ` +
      `lives=${d?.lives ?? '-'}  calls=${d?.renderer?.calls ?? '-'}  ${note}`,
  );
  return file;
};

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(900);
await hooks(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi(true));
await hooks(() => window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(false));

// ---------------------------------------------------------------- 1. title
await shot('title', 'title screen');

// ------------------------------------------------------------ 2. settings
await page.click('#btn-settings');
await page.waitForTimeout(350);
await shot('settings', 'settings panel');
await page.click('#btn-back-settings');
await page.waitForTimeout(350);

// -------------------------------------------------------- 3. stage select
await hooks(() => {
  const raw = localStorage.getItem('sky-isle-runner-save-v2');
  const data = raw ? JSON.parse(raw) : {};
  data.unlockedStage = 5;
  localStorage.setItem('sky-isle-runner-save-v2', JSON.stringify(data));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await hooks(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi(true));

await page.click('#btn-mode-stages');
await page.waitForTimeout(500);
await shot('stage-select', 'stage cards + previews');

// ------------------------------------------------------------- 4. loadout
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(400);
await shot('loadout', 'loadout panel');

// Turn infinite lives on so the run below cannot be cut short by a fall.
const infBtn = page.locator('#btn-infinite');
if ((await infBtn.getAttribute('aria-pressed')) !== 'true') {
  await infBtn.click();
  await page.waitForTimeout(200);
}
await shot('loadout-infinite', 'infinite lives enabled');

// ---------------------------------------------------------------- 5. run
await page.click('#btn-start-run');
await page.waitForTimeout(500);
await shot('run-start', 'first moments of the run');

const steer = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

for (let i = 1; i <= 6; i += 1) {
  await page.keyboard.press('Space');
  await steer(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', 180);
  await page.waitForTimeout(1600);
  await shot(`run-${i}`, `t≈${(i * 2).toFixed(0)}s`);
}

// -------------------------------------------------------------- 6. pause
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await shot('pause', 'pause panel');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ------------------------------------------------------------- 7. complete
await hooks(() => window.__THREE_GAME_TEST_HOOKS__?.setState('complete'));
await page.waitForTimeout(900);
await shot('complete', 'stage clear panel');

// ----------------------------------------------------------------- 8. fail
// The infinite-lives flag is persisted in the save, so a plain reload keeps it
// on and the fail state stays unreachable by design. Explicitly turn it back
// off before burning the three lives with no input.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await hooks(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi(true));
await page.click('#btn-mode-stages');
await page.waitForTimeout(300);
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(300);

const infOff = page.locator('#btn-infinite');
if ((await infOff.getAttribute('aria-pressed')) === 'true') {
  await infOff.click();
  await page.waitForTimeout(200);
  console.log('(turned infinite lives back off for the fail run)');
}

await page.click('#btn-start-run');
await page.waitForTimeout(400);

for (let i = 0; i < 60; i += 1) {
  const d = await diag();
  if (d?.mode === 'fail') break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(500);
await shot('fail', 'fail panel');

console.log('\n--- console problems ---');
if (problems.length === 0) console.log('none');
else for (const p of problems) console.log(p);

await browser.close();
