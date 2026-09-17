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
const scoreBefore = d?.score ?? 0;

// Pause then quit to title (saves mid-run)
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.click('#btn-quit-title');
await page.waitForTimeout(250);

const contVisible = await page.locator('#btn-continue').isVisible().catch(() => false);
console.log('continue button visible', contVisible);
const saveRaw = await page.evaluate(() => localStorage.getItem('sky-isle-runner-save-v2'));
console.log('has midRun', saveRaw?.includes('"midRun"') && !saveRaw.includes('"midRun":null'));

// Continue
if (contVisible) {
  await page.click('#btn-continue');
  await page.waitForTimeout(500);
  d = await diag();
  console.log('after continue', d?.mode, 'z', d?.player?.position?.z?.toFixed(1), 'score', d?.score);
  const zAfter = d?.player?.position?.z ?? 0;
  console.log('z restored near', Math.abs(zAfter - zBefore) < 15, 'score restored', d?.score === scoreBefore);
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
