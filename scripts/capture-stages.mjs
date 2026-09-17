/** Capture stage-select UI with previews. */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5188';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--use-gl=angle', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(400);
await page.click('#btn-mode-stages');
await page.waitForTimeout(400);
// Unlock all for visual
await page.evaluate(() => {
  const raw = localStorage.getItem('sky-isle-runner-save-v2');
  const data = raw ? JSON.parse(raw) : {};
  data.unlockedStage = 5;
  localStorage.setItem('sky-isle-runner-save-v2', JSON.stringify(data));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.click('#btn-mode-stages');
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/pass-1/stage-select.png' });
console.log('stage-select captured');
await browser.close();
