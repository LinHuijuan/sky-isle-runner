/** Test mid-run save: play, pause+quit, continue from title. */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5188';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--use-gl=angle', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(500);
const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);

// Start stage 1
await page.click('#btn-mode-stages');
await page.waitForTimeout(150);
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(150);
await page.click('#btn-start-run');
await page.waitForTimeout(400);

// Run forward
for (let i = 0; i < 12; i += 1) {
  await page.keyboard.down(i % 2 ? 'KeyD' : 'KeyA');
  await page.waitForTimeout(100);
  await page.keyboard.up(i % 2 ? 'KeyD' : 'KeyA');
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
}
let d = await diag();
console.log('before pause', d?.mode, 'z', d?.player?.position?.z?.toFixed(1), 'score', d?.score);
const zBefore = d?.player?.position?.z ?? 0;

// Pause, THEN read the score the save will actually capture.
//
// Reading it before the pause (as this script used to) races with the ~150ms of
// live play between the read and the pause taking effect: the runner advances
// on its own and can pick up a crystal in that window, so an exact-equality
// assertion on the score fails for a reason that has nothing to do with
// save/restore. Faster rendering just widens the window and makes it flakier.
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const paused = await diag();
const scoreSaved = paused?.score ?? 0;
const zSaved = paused?.player?.position?.z ?? zBefore;
console.log('at pause', paused?.mode, 'z', zSaved?.toFixed(1), 'score', scoreSaved);

// Quit to title (saves mid-run)
await page.click('#btn-quit-title');
await page.waitForTimeout(250);

const contVisible = await page.locator('#btn-continue').isVisible().catch(() => false);
console.log('continue button visible', contVisible);
const saveRaw = await page.evaluate(() => localStorage.getItem('sky-isle-runner-save-v2'));
console.log('has midRun', saveRaw?.includes('"midRun"') && !saveRaw.includes('"midRun":null'));

// Continue
if (contVisible) {
  await page.click('#btn-continue');
  // Poll for the run to come back rather than sleeping a fixed 500ms: every
  // millisecond spent waiting is more live play, and the runner collects
  // crystals on its own.
  await page.waitForFunction(
    () => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'playing',
    null,
    { timeout: 5000 },
  ).catch(() => {});
  d = await diag();
  console.log('after continue', d?.mode, 'z', d?.player?.position?.z?.toFixed(1), 'score', d?.score);
  const zAfter = d?.player?.position?.z ?? 0;
  const grew = (d?.score ?? 0) - scoreSaved;
  // The invariant is "continuing does not lose progress", not "the score is
  // frozen". The run is live the moment it resumes, so the score can legitimately
  // tick up before this line reads it — an exact-equality check here is flaky by
  // construction. Progress must never go backwards, and must not jump so far
  // that we are clearly looking at a different run.
  console.log(
    'z restored near', Math.abs(zAfter - zSaved) < 15,
    'score restored', d?.score >= scoreSaved && grew < 15,
    `(saved ${scoreSaved}, got ${d?.score}, +${grew})`,
  );
} else {
  console.log('FAIL continue button not visible');
}

// New run should clear mid-run
await page.keyboard.press('Escape');
await page.waitForTimeout(120);
if (await page.locator('#btn-quit-title').isVisible().catch(() => false)) {
  await page.click('#btn-quit-title');
  await page.waitForTimeout(200);
}
// Start new
await page.click('#btn-mode-stages');
await page.waitForTimeout(120);
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(120);
await page.click('#btn-start-run');
await page.waitForTimeout(300);
const save2 = await page.evaluate(() => localStorage.getItem('sky-isle-runner-save-v2'));
console.log('midRun cleared after new start', save2?.includes('"midRun":null'));

console.log('errors', errors.length ? errors : 'none');
await browser.close();
