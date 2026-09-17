/** Verify infinite lives toggle and HUD infinity pip. */
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

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(400);

// Go stages → stage 1 → loadout → enable infinite → start
await page.click('#btn-mode-stages');
await page.waitForTimeout(150);
await page.locator('.stage-item:not(.locked)').first().click();
await page.waitForTimeout(150);
const inf = page.locator('#btn-infinite');
await inf.click();
await page.waitForTimeout(100);
const pressed = await inf.getAttribute('aria-pressed');
console.log('infinite pressed', pressed);
await page.click('#btn-start-run');
await page.waitForTimeout(500);

// Run until likely fall several times
await page.waitForTimeout(8000);
const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);
console.log('after 8s mode', d?.mode, 'lives', d?.lives, 'z', d?.player?.position?.z?.toFixed(1));

const livesText = await page.locator('#lives-value').innerText().catch(() => '');
console.log('lives HUD', livesText.trim());

// Toggle off via save and reload check persistence
const saved = await page.evaluate(() => localStorage.getItem('sky-isle-runner-save-v2'));
console.log('save has infinite', saved?.includes('"infiniteLives":true'));

console.log('errors', errors.length ? errors : 'none');
await browser.close();
