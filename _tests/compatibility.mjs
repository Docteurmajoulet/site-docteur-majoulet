// TECH48-2026-09-20 : parcours essentiels sur Firefox et WebKit, sous la CSP réelle.
// Les services tiers sont interceptés ; aucun rendez-vous n’est créé.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firefox, webkit } from 'playwright';
import { startServer, TESTS_DIR } from './lib.mjs';

const reportDir = join(TESTS_DIR, 'reports');
const results = [];
let stop, proxy;
const axe = await readFile(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const temporary = await mkdtemp(join(tmpdir(), 'majoulet-compatibility-'));
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', join(temporary, 'key.pem'),
    '-out', join(temporary, 'cert.pem')], { stdio: 'ignore', timeout: 15000 });
  stop = await startServer(8797);
  proxy = createServer({ key: await readFile(join(temporary, 'key.pem')),
    cert: await readFile(join(temporary, 'cert.pem')) }, async (request, response) => {
    try {
      // fetch décompresse automatiquement : demander identity garde corps et en-têtes cohérents.
      const upstream = await fetch(`http://127.0.0.1:8797${request.url}`, {
        headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(10000),
      });
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { response.writeHead(502); response.end(); }
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  const origin = `https://127.0.0.1:${proxy.address().port}`;
  for (const [name, engine] of Object.entries({ firefox, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of [375, 1366]) {
        const context = await browser.newContext({ viewport: { width, height: 900 },
          ignoreHTTPSErrors: true, reducedMotion: 'reduce', locale: 'fr-FR' });
        context.setDefaultTimeout(10000);
        context.setDefaultNavigationTimeout(15000);
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
          if (route.request().url().startsWith('https://www.doctolib.fr/')) {
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Contrôle local du lien de rendez-vous</title>' });
          }
          return route.abort();
        });
        await context.addInitScript(() => {
          window.__cspViolations = [];
          document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push(e.violatedDirective));
        });
        for (const slug of ['index', 'contact', 'vitrectomie']) {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          try {
            const response = await page.goto(`${origin}/${slug === 'index' ? '' : slug}`, { waitUntil: 'networkidle' });
            assert.equal(response.status(), 200);
            assert.match(response.headers()['content-security-policy'], /upgrade-insecure-requests/);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'aucun débordement horizontal');
            await page.evaluate(axe);
            const violations = await page.evaluate(async () => (await axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
            })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
            assert.deepEqual(violations, [], 'accessibilité automatisée');
            if (width === 375) {
              const toggle = page.locator('.mobile-toggle');
              await toggle.click();
              assert.equal(await page.locator('main').evaluate(e => e.inert), true);
              await page.waitForFunction(() => {
                const nav = document.querySelector('nav.main-nav').getBoundingClientRect();
                const header = document.querySelector('header.site-header').getBoundingClientRect();
                return Math.abs(nav.top - header.bottom) <= 1 && Math.abs(nav.bottom - innerHeight) <= 1;
              });
              await page.keyboard.press('Tab');
              await page.locator('.drawer-rdv').focus();
              const popupPromise = context.waitForEvent('page');
              await page.keyboard.press('Enter');
              const popup = await popupPromise;
              try {
                await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });
                const destination = new URL(popup.url());
                assert.equal(destination.hostname, 'www.doctolib.fr');
                assert.equal(destination.pathname, '/ophtalmologue/boulogne-billancourt/alexandre-majoulet-paris');
              } finally { await popup.close(); }
              assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
              assert.equal(await page.locator('main').evaluate(e => e.inert), false);
              assert.equal(await toggle.evaluate(e => document.activeElement === e), true, 'focus visible au retour');
            } else {
              const trigger = page.locator('[data-megamenu] > .nav-link').first();
              await trigger.hover();
              assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
              await page.keyboard.press('Escape');
              assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
            }
            if (slug === 'index') {
              // TECH55 : Google est bloqué par le test. L’attente doit laisser place au lien utile.
              const mapButton = page.locator('.map-facade-btn');
              await mapButton.scrollIntoViewIfNeeded();
              await mapButton.focus();
              await page.keyboard.press('Enter');
              await page.waitForFunction(() =>
                document.getElementById('map-status').textContent.includes('La carte tarde') &&
                !document.querySelector('.contact-map').classList.contains('map-loading'),
                undefined, { timeout: 12000 });
              const mapLink = page.locator('.cv12-map-note a');
              await mapLink.focus();
              assert.equal(await mapLink.evaluate(e => document.activeElement === e), true,
                'le lien Google Maps reste accessible au clavier lorsque la carte est bloquée');
            }
            assert.deepEqual(errors, [], 'exceptions JavaScript');
            assert.deepEqual(await page.evaluate(() => window.__cspViolations), [], 'CSP');
            results.push({ browser: name, version: browser.version(), width, page: slug, ok: true });
          } catch (error) {
            results.push({ browser: name, width, page: slug, ok: false, error: String(error) });
          } finally { await page.close(); }
        }
        await context.close();
      }
    } finally { await browser.close(); }
    console.log(`${name} : ${results.filter(r => r.browser === name && r.ok).length}/6 parcours réussis`);
  }
} finally {
  if (proxy?.listening) {
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
  }
  stop?.();
  await rm(temporary, { recursive: true, force: true });
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, 'compatibility.json'), JSON.stringify(results, null, 2));
}
const failures = results.filter(r => !r.ok);
if (failures.length) console.error(JSON.stringify(failures, null, 2));
process.exitCode = results.length !== 12 || failures.length ? 1 : 0;
