// Le menu reste utilisable si son script échoue, sans changer après une autre ressource manquante.
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TESTS_DIR } from './lib.mjs';
import { startHttpsServer } from './https.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((x, i, a) => x.startsWith('--') ? [x.slice(2), a[i + 1]] : []).filter(x => x.length));
const engines = (args.browsers || 'chromium').split(',');
const modes = (args.modes || 'normal,nav-bloque,nav-404,image-bloquee').split(',');
const out = join(TESTS_DIR, 'reports');
mkdirSync(out, { recursive: true });
const results = [];
const server = await startHttpsServer(8796);
try {
  for (const engine of engines) {
    const browser = await ({ chromium, firefox, webkit }[engine]).launch();
    try {
      for (const slug of ['index', 'contact']) for (const width of [375, 1366]) for (const mode of modes) {
        if (slug === 'contact' && mode === 'image-bloquee') continue;
        const context = await browser.newContext({ viewport: { width, height: 812 }, locale: 'fr-FR', ignoreHTTPSErrors: true });
        context.setDefaultTimeout(3000);
        context.setDefaultNavigationTimeout(15000);
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let intercepted = 0;
        if (mode === 'nav-bloque' || mode === 'nav-404') {
          await page.route('**/nav.js?*', route => {
            intercepted++;
            return mode === 'nav-bloque' ? route.abort() : route.fulfill({ status: 404, contentType: 'application/javascript', body: '' });
          });
        } else if (mode === 'image-bloquee') {
          await page.route('**/*', route => {
            if (route.request().resourceType() === 'image') { intercepted++; return route.abort(); }
            return route.fallback();
          });
        }
        try {
          await page.goto(server.origin + (slug === 'index' ? '/' : '/' + slug), { waitUntil: 'networkidle' });
          const fallback = mode === 'nav-bloque' || mode === 'nav-404';
          if (mode !== 'normal') assert.ok(intercepted > 0, 'une ressource a réellement été bloquée');
          const trigger = page.locator('[data-megamenu] > .nav-link').first();
          const link = page.locator('[data-megamenu] .mega-panel a').first();
          if (fallback && width === 375) {
            assert.equal(await page.locator('.mobile-toggle').isVisible(), false, 'aucun bouton de menu inactif');
            assert.equal(await page.locator('nav.main-nav').isVisible(), true, 'menu de secours visible');
            await link.focus();
          } else {
            if (width === 375) await page.locator('.mobile-toggle').click();
            await trigger.focus();
            if (!fallback) await page.keyboard.press('Enter');
            await link.waitFor({ state: 'visible' });
            // Safari sur macOS parcourt les liens avec Option-Tab dans son réglage standard.
            await page.keyboard.press(engine === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
          }
          assert.equal(await link.isVisible(), true, 'page DMLA accessible dans le menu');
          assert.equal(await link.evaluate(el => el === document.activeElement), true, 'lien accessible au clavier');
          if (!fallback && width === 375) await page.keyboard.press('Escape');
          if (width === 375) {
            const rdv = page.locator('.sticky-doctolib');
            assert.ok(await rdv.evaluate(el => {
              const r = el.getBoundingClientRect();
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && (hit === el || el.contains(hit));
            }), 'rendez-vous toujours accessible au toucher');
          }
          if (slug === 'index') {
            assert.equal(await page.locator('.map-facade-btn').isVisible(), !fallback, 'la carte ne présente pas de bouton inactif');
            assert.equal(await page.locator('.cv12-map-note a').isVisible(), true, 'lien cartographique conservé');
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'aucun débordement horizontal');
          assert.deepEqual(errors, [], 'aucune exception JavaScript');
          // Suivre réellement le lien, y compris lorsque le script est toujours indisponible.
          if (!fallback && width === 375) {
            await page.locator('.mobile-toggle').click();
            await trigger.focus();
            await page.keyboard.press('Enter');
          }
          await link.waitFor({ state: 'visible' });
          await link.focus();
          await Promise.all([page.waitForURL('**/dmla'), page.keyboard.press('Enter')]);
          assert.equal(await page.locator('h1').isVisible(), true);
          results.push({ engine, slug, width, mode, ok: true });
        } catch (error) {
          results.push({ engine, slug, width, mode, ok: false, error: String(error) });
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await server.close();
  writeFileSync(join(out, 'nav-fallback-' + engines.join('-') + '.json'), JSON.stringify(results, null, 2));
}
const failures = results.filter(result => !result.ok);
for (const failure of failures) console.error(JSON.stringify(failure));
console.log(`navigation de secours : ${results.length} scénarios, ${failures.length} échec(s)`);
process.exitCode = failures.length ? 1 : 0;
