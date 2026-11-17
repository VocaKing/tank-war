import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
await page.goto(process.argv[2]);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
const r = await page.evaluate((code) => eval(code), process.argv[3]);
console.log(JSON.stringify(r, null, 0));
await browser.close();
