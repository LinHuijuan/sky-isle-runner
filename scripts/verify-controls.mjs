/**
 * Verify P1 screen-space controls: A → world +X (screen left), D → world -X (screen right).
 */
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
await page.waitForTimeout(800);

await page.evaluate(() => {
  window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(false);
  window.__THREE_GAME_TEST_HOOKS__?.setState('active-play');
  window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(false);
});
await page.waitForTimeout(300);

const x0 = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.x);

await page.keyboard.down('KeyA');
await page.waitForTimeout(500);
await page.keyboard.up('KeyA');
await page.waitForTimeout(80);
const xLeft = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.x);

await page.keyboard.down('KeyD');
await page.waitForTimeout(800);
await page.keyboard.up('KeyD');
await page.waitForTimeout(80);
const xRight = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.x);

console.log(
  JSON.stringify(
    {
      x0,
      xLeft,
      xRight,
      leftDelta: xLeft - x0,
      rightDelta: xRight - xLeft,
      expectLeftDeltaPositive: xLeft - x0 > 0.2,
      expectRightGoesBackNegative: xRight - xLeft < -0.2,
      diag: await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__),
    },
    null,
    2,
  ),
);

await browser.close();
