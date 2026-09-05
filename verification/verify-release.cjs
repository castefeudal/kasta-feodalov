/* Verifies the actual standalone deliverable, including a scripts-only iframe. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const standalonePath = path.join(ROOT, '..', 'kasta-feodalov.html');
const reportPath = path.join(__dirname, 'report.json');
const distribution = { tests: [], errors: [] };
let browser;
function check(name, value) {
  distribution.tests.push({ name, passed: Boolean(value) });
  assert.ok(value, name);
}
function save() {
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : {};
  report.distribution = distribution;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}
(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, offline: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => distribution.errors.push(e.message));
  await page.goto(pathToFileURL(standalonePath).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  check('Standalone: three local typefaces available with internet disabled', await page.evaluate(() => [...document.fonts].filter(x => x.status === 'loaded').length === 3));
  check('Standalone: images, CSS and scripts are embedded', await page.evaluate(() => [...document.images].every(i => i.src.startsWith('data:')) && document.querySelectorAll('script[src],link[rel="stylesheet"]').length === 0));
  await page.locator('.hero-actions a[href="#join"]').click();
  check('Standalone: local section navigation works', await page.evaluate(() => location.hash === '#join' && scrollY > 1000));
  const framePage = await context.newPage();
  framePage.on('pageerror', e => distribution.errors.push(e.message));
  await framePage.setContent('<html><body style="margin:0"><iframe id="preview" sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe></body></html>');
  await framePage.locator('iframe').evaluate((el, content) => { el.srcdoc = content; }, fs.readFileSync(standalonePath, 'utf8'));
  const frame = framePage.frameLocator('#preview');
  await frame.locator('#hero-title').waitFor();
  await frame.locator('.hero-actions a[href="#join"]').click();
  check('Scripts-only sandbox: anchors scroll locally rather than making a blocked navigation', await frame.locator('body').evaluate(() => window.scrollY > 1000));
  await frame.locator('#app-name').fill('Проверка просмотрщика');
  await frame.locator('#app-telegram').fill('@viewer_test');
  await frame.locator('#app-direction').selectOption('Фокус и время');
  await frame.locator('#app-intention').fill('Проверяю автономную версию в изолированном просмотрщике. Технический тест.');
  await frame.locator('#app-honor').check();
  await frame.locator('.form-submit').click();
  check('Scripts-only sandbox: the form really prepares the application', await frame.locator('#application-result').isVisible());
  await frame.locator('#edit-application').click();
  await frame.locator('#app-name').press('Enter');
  check('Scripts-only sandbox: keyboard Enter also prepares the application', await frame.locator('#application-result').isVisible());
  check('No uncaught JavaScript errors in the distribution', distribution.errors.length === 0);
  distribution.summary = { passed: distribution.tests.length, failed: 0 };
  save();
  console.log(JSON.stringify(distribution.summary, null, 2));
  await browser.close();
})().catch(async error => {
  distribution.failure = error.stack;
  save();
  console.error(error);
  if (browser) await browser.close();
  process.exit(1);
});
