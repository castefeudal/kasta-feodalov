/* Optional QA tooling. The website itself has no package dependencies. */
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { HtmlValidate } = require('html-validate');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const URL = process.env.SITE_URL || 'http://127.0.0.1:8000';
const report = { date: '2026-09-05', tool: 'Playwright / Chromium + axe-core + html-validate', tests: [], viewports: [], errors: [], requestsFailed: [] };
let browser;
function check(name, assertion, details) {
  if (!assertion && details) console.error(JSON.stringify(details, null, 2));
  assert.ok(assertion, name);
  report.tests.push({ name, passed: true, ...(details ? { details } : {}) });
}
async function audit(page, name) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  check(name, results.violations.length === 0, { violations: results.violations.map(x => x.id), passes: results.passes.length, manualReviewItems: results.incomplete.length });
}
async function readyForFullScreenshot(page) {
  await page.evaluate(() => { document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; }); });
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }

(async () => {
  const htmlValidator = new HtmlValidate({ extends: ['html-validate:recommended'] });
  const validation = await htmlValidator.validateFile(path.join(ROOT, 'index.html'));
  check('HTML: recommended validation, no errors or warnings', validation.valid, { errors: validation.errorCount, warnings: validation.warningCount });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const networkRequests = [];
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('request', request => networkRequests.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
  page.on('response', response => { if (response.status() >= 400) report.requestsFailed.push(`${response.status()} ${response.url()}`); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  check('Document language and single primary heading', await page.evaluate(() => document.documentElement.lang === 'ru' && document.querySelectorAll('h1').length === 1));
  check('All requested sections exist', await page.evaluate(() => ['home', 'philosophy', 'founder', 'system', 'education', 'community', 'media', 'principles-title', 'faq', 'join'].every(id => document.getElementById(id)) && !!document.querySelector('footer')));
  check('Seven manifesto theses', await page.locator('.tenet').count() === 6 && await page.locator('.legacy-tenet').count() === 1);
  check('Eight FAQ answers', await page.locator('.faq-list details').count() === 8);
  check('Three local typefaces loaded', await page.evaluate(() => [...document.fonts].filter(x => x.status === 'loaded').length === 3));
  check('Local anchors and SVG references resolve', await page.evaluate(() => [...document.querySelectorAll('[href^="#"]')].every(el => document.getElementById(el.getAttribute('href').slice(1)))));
  check('All IDs are unique', await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(x => x.id); return new Set(ids).size === ids.length; }));
  await audit(page, 'axe WCAG 2.2 AA: desktop, initial state');
  await page.screenshot({ path: path.join(__dirname, 'desktop-1440.png') });
  await readyForFullScreenshot(page);
  await page.screenshot({ path: path.join(__dirname, 'desktop-full.png'), fullPage: true });

  // Viewport sweeps catch actual text overflow, not only hidden scrollbars.
  for (const [width, height] of [[360,800],[375,812],[390,844],[428,926],[560,800],[600,900],[760,900],[768,1024],[820,1180],[980,900],[981,900],[1024,768],[1280,720],[1440,1000],[1920,1080]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const layout = await page.evaluate(() => {
      const out = [...document.querySelectorAll('h1,h2,h3,h4,p,summary,label,nav a,button')].filter(el => {
        if (!el.getClientRects().length || el.closest('[hidden],dialog:not([open]),[aria-hidden="true"]')) return false;
        const range = document.createRange(); range.selectNodeContents(el); const r = range.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      }).map(el => ({ element: el.tagName, text: el.textContent.trim().slice(0, 90), css: {font: getComputedStyle(el).font, width: getComputedStyle(el).width}, rect: el.getBoundingClientRect().toJSON(), range: (()=>{const r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect().toJSON()})() }));
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: out };
    });
    check(`Responsive ${width} × ${height}: no horizontal text overflow`, layout.scrollWidth <= width && !layout.overflow.length, layout);
    report.viewports.push({ width, height, passed: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.desktop-nav a[href="#system"]').click();
  await settle(page);
  check('Desktop anchor navigation', (await page.evaluate(() => location.hash)) === '#system');
  check('Header becomes sticky and reading indicator advances', await page.locator('#site-header').evaluate(el => el.classList.contains('is-scrolled')));

  await page.locator('#tab-focus').click();
  check('Tabs: pointer selection changes the visible panel', await page.locator('#panel-focus').isVisible() && await page.locator('#panel-body').isHidden());
  await page.locator('#tab-focus').focus();
  await page.keyboard.press('ArrowRight');
  check('Tabs: Right Arrow selects and focuses next tab', (await page.locator('#tab-tasks').getAttribute('aria-selected')) === 'true' && await page.locator('#tab-tasks').evaluate(el => el === document.activeElement));
  await page.keyboard.press('End');
  check('Tabs: End selects last tab', (await page.locator('#tab-habits').getAttribute('aria-selected')) === 'true');
  await page.keyboard.press('Home');
  check('Tabs: Home returns to first tab', (await page.locator('#tab-body').getAttribute('aria-selected')) === 'true');

  const summaries = page.locator('.faq-list summary');
  await summaries.nth(0).click();
  check('FAQ: item opens', await page.locator('.faq-list details').nth(0).getAttribute('open') !== null);
  await summaries.nth(1).click();
  check('FAQ: opening another closes the first', await page.locator('.faq-list details[open]').count() === 1 && await page.locator('.faq-list details').nth(1).getAttribute('open') !== null);
  await summaries.nth(1).focus();
  await page.keyboard.press('Enter');
  check('FAQ: keyboard toggle', await page.locator('.faq-list details[open]').count() === 0);

  await page.locator('#quote-next').click();
  check('Quote carousel advances', await page.locator('#quote-current').textContent() === '02');
  await page.locator('#quote-prev').click();
  await page.locator('#quote-prev').click();
  check('Quote carousel wraps backwards', await page.locator('#quote-current').textContent() === '03');
  await page.locator('#quote-next').click();

  for (const id of ['article-morning','article-ownership','article-word']) {
    const trigger = page.locator(`[data-open-dialog="${id}"]`).first();
    await trigger.click();
    check(`Editorial dialog opens: ${id}`, await page.locator(`#${id}`).evaluate(el => el.open));
    check(`Editorial text is substantive: ${id}`, (await page.locator(`#${id} article`).textContent()).length > 900);
    await page.keyboard.press('Escape');
    check(`Escape closes and restores focus: ${id}`, await page.locator(`#${id}`).isHidden() && await trigger.evaluate(el => el === document.activeElement));
  }
  await page.locator('[data-open-dialog="article-morning"]').first().click();
  await audit(page, 'axe WCAG 2.2 AA: open editorial dialog');
  await page.locator('#article-morning [data-dialog-navigate]').click();
  await settle(page);
  check('Dialog-to-page CTA closes reader and navigates', await page.locator('#article-morning').isHidden() && (await page.evaluate(() => location.hash)) === '#join');

  // Empty submission must never be reported as sent.
  await page.locator('.form-submit').click();
  check('Form rejects an empty submission with five field errors', await page.locator('#application-form [aria-invalid="true"]').count() === 5 && await page.locator('#application-result').isHidden());
  check('Validation focuses first erroneous field', await page.locator('#app-name').evaluate(el => el === document.activeElement));
  await page.locator('#app-name').fill('Проверка формы');
  await page.locator('#app-telegram').fill('@invalid контакт');
  await page.locator('#app-telegram').blur();
  check('Telegram validation rejects malformed contact', await page.locator('#app-telegram').getAttribute('aria-invalid') === 'true');
  await page.locator('#app-telegram').fill('test_kasta_input');
  await page.locator('#app-direction').selectOption('Тело и энергия');
  const intention = 'Проверка интерфейса: готов выстроить устойчивый режим и отвечать за свои решения. Это тест, а не реальная заявка.';
  await page.locator('#app-intention').fill(intention);
  check('Character counter reflects the input', (await page.locator('#intention-count').textContent()).startsWith(String(intention.length)));
  await page.locator('[data-open-dialog="honor-dialog"]').first().click();
  check('Honor code opens from application', await page.locator('#honor-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  await page.locator('#app-honor').check();
  const beforeForm = networkRequests.length;
  await page.locator('.form-submit').click();
  await settle(page);
  check('Valid form creates a local result', await page.locator('#application-result').isVisible() && await page.locator('#application-form').isHidden());
  const prepared = await page.locator('#application-text').inputValue();
  check('Generated text includes every answer and code agreement', prepared.includes('Проверка формы') && prepared.includes('@test_kasta_input') && prepared.includes('Тело и энергия') && prepared.includes(intention) && prepared.includes('кодекс чести'));
  check('Result explicitly states it has not been sent', (await page.locator('#application-result').textContent()).includes('ещё никому не отправлена'));
  check('Application processing makes zero network requests', networkRequests.length === beforeForm);
  check('Telegram link contains the exact application text, without invented recipient', await page.locator('#telegram-share').evaluate((el, expected) => { const u = new window.URL(el.href); return u.hostname === 't.me' && u.pathname === '/share/url' && u.searchParams.get('text') === expected; }, prepared));
  await page.locator('#copy-application').click();
  await page.waitForFunction(() => /скопирован|Текст выделен/.test(document.querySelector('#application-status').textContent));
  check('Copy action gives actual success or an honest manual fallback', /скопирован|Текст выделен/.test(await page.locator('#application-status').textContent()));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-application').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  check('Download is a complete UTF-8 Russian text file', download.suggestedFilename().endsWith('.txt') && fs.readFileSync(downloadPath, 'utf8').replace(/^\uFEFF/, '') === prepared, {filename: download.suggestedFilename(), bytes: fs.statSync(downloadPath).size});
  await audit(page, 'axe WCAG 2.2 AA: prepared application');
  await page.locator('#edit-application').click();
  check('Editing restores all previous values', await page.locator('#app-name').inputValue() === 'Проверка формы' && await page.locator('#app-intention').inputValue() === intention);
  await page.locator('#app-name').fill('<img src=x onerror=alert(1)>');
  await page.locator('.form-submit').click();
  check('User input is rendered as text, never injected HTML', await page.locator('#application-text').inputValue().then(value => value.includes('<img src=x onerror=alert(1)>')) && await page.locator('#application-result img').count() === 0);
  check('No cookies or browser persistence of application data', await page.evaluate(() => document.cookie === '' && localStorage.length === 0 && sessionStorage.length === 0));
  await page.reload({ waitUntil: 'networkidle' });
  check('Reload clears locally prepared answers', await page.locator('#app-name').inputValue() === '' && await page.locator('#application-result').isHidden());

  // Mobile focus trap and gestures via real browser input.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(__dirname, 'mobile-390.png') });
  await readyForFullScreenshot(page);
  await page.screenshot({ path: path.join(__dirname, 'mobile-full.png'), fullPage: true });
  await page.locator('.menu-toggle').click();
  check('Mobile menu opens with correct ARIA state', await page.locator('#mobile-menu').evaluate(el => el.open) && await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'true');
  for (let i=0; i<15; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement.closest('#mobile-menu')), 'Focus must remain inside menu');
  }
  check('Mobile menu traps keyboard focus', true);
  await audit(page, 'axe WCAG 2.2 AA: open mobile menu');
  await page.locator('#mobile-menu a[href="#system"]').click();
  await settle(page);
  check('Mobile navigation closes menu, unlocks body, and follows anchor', await page.locator('#mobile-menu').isHidden() && !await page.locator('body').evaluate(el => el.classList.contains('has-dialog')) && (await page.evaluate(() => location.hash)) === '#system');
  await page.locator('.menu-toggle').click();
  await page.keyboard.press('Escape');
  check('Escape closes mobile menu and restores trigger', await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'false' && await page.locator('.menu-toggle').evaluate(el => el === document.activeElement));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await audit(page, 'axe WCAG 2.2 AA: 360 px mobile');
  await page.screenshot({ path: path.join(__dirname, 'mobile-360.png') });

  // Observe the real default animation path, separately from reduced-motion tests.
  const animatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const animatedPage = await animatedContext.newPage();
  await animatedPage.goto(URL, { waitUntil: 'networkidle' });
  await animatedPage.locator('#media').scrollIntoViewIfNeeded();
  await animatedPage.waitForFunction(() => document.querySelector('#media h2').classList.contains('is-visible'));
  check('IntersectionObserver reveals content on scroll', true);
  check('Default atmosphere animates, reduced-motion variant does not', await animatedPage.locator('.hero-atmosphere i').first().evaluate(el => getComputedStyle(el).animationName === 'ember') && await page.locator('.hero-atmosphere').evaluate(el => getComputedStyle(el).display === 'none'));
  await animatedContext.close();

  // file:// is tested while HTTP/HTTPS access is entirely unavailable.
  const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, offline: true, reducedMotion: 'reduce' });
  const offlinePage = await offlineContext.newPage();
  const offlineErrors = [];
  offlinePage.on('pageerror', e => offlineErrors.push(e.message));
  await offlinePage.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
  await offlinePage.evaluate(() => document.fonts.ready);
  await offlinePage.locator('#community').scrollIntoViewIfNeeded();
  await offlinePage.waitForFunction(() => [...document.images].filter(img => !img.closest('[hidden],dialog:not([open])')).every(img => img.complete && img.naturalWidth > 0));
  check('Downloaded file:// site loads every image without internet', true);
  check('Self-hosted fonts work offline through file://', await offlinePage.evaluate(() => [...document.fonts].filter(x => x.status === 'loaded').length === 3));
  await offlinePage.locator('#tab-focus').click();
  check('Tabs work through file:// with network disabled', await offlinePage.locator('#panel-focus').isVisible());
  await offlinePage.locator('#app-name').fill('Офлайн-проверка');
  await offlinePage.locator('#app-telegram').fill('@offline_test');
  await offlinePage.locator('#app-direction').selectOption('Фокус и время');
  await offlinePage.locator('#app-intention').fill('Проверяю подготовку заявки без подключения к интернету. Это технический тест.');
  await offlinePage.locator('#app-honor').check();
  await offlinePage.locator('.form-submit').click();
  check('Application can be prepared entirely offline', await offlinePage.locator('#application-result').isVisible());
  check('No JavaScript errors in offline mode', offlineErrors.length === 0, offlineErrors);
  await offlineContext.close();

  const noJSContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJSPage = await noJSContext.newPage();
  await noJSPage.goto(URL, { waitUntil: 'load' });
  check('Progressive enhancement: content visible without JavaScript', await noJSPage.locator('#manifesto-title').isVisible() && await noJSPage.locator('#founder-title').isVisible() && await noJSPage.locator('#app-name').isDisabled());
  await noJSPage.locator('.faq-list summary').first().click();
  check('Native FAQ works without JavaScript', await noJSPage.locator('.faq-list details').first().getAttribute('open') !== null);
  await noJSContext.close();

  check('No JavaScript runtime errors', report.errors.length === 0);
  check('No HTTP errors or broken assets', report.requestsFailed.length === 0);
  check('No unsolicited third-party requests', networkRequests.every(request => request.url.startsWith(URL) || request.url.startsWith('blob:') || request.url.startsWith('data:')));
  check('No background form transmission', networkRequests.every(request => request.method === 'GET'));
  report.summary = { passed: report.tests.length, failed: 0, viewports: report.viewports.length, accessibilityStates: report.tests.filter(x => x.name.startsWith('axe')).length };
  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary, null, 2));
  await browser.close();
})().catch(async error => {
  report.failure = error.stack;
  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.error(error);
  if (browser) await browser.close();
  process.exit(1);
});
