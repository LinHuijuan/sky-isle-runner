/** Leak probe: rebuild course repeatedly, watch geometry/texture/heap counts. */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--use-gl=angle', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5188', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const mem = () =>
  page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    const m = performance.memory;
    return {
      geo: d?.renderer?.geometries,
      tex: d?.renderer?.textures,
      prog: d?.renderer?.programs,
      heap: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null,
    };
  });

console.log('initial   ', JSON.stringify(await mem()));
for (let i = 0; i < 8; i += 1) {
  await page.evaluate((n) => window.__THREE_GAME_TEST_HOOKS__.seed(n * 1234 + 7), i);
  await page.waitForTimeout(400);
  console.log('rebuild#' + (i + 1), JSON.stringify(await mem()));
}
for (const s of ['pyro', 'cryo', 'electro', 'jade', 'pyro', 'jade']) {
  await page.evaluate((id) => {
    document.querySelector(`.skin-swatch[data-skin="${id}"]`)?.click();
  }, s);
  await page.waitForTimeout(200);
}
console.log('skins     ', JSON.stringify(await mem()));
await browser.close();
