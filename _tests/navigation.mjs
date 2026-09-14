#!/usr/bin/env node
// Régressions de navigation : souris + clavier, tiroir tactile et changement de format.
// Chaque scénario ouvre une page neuve, sous la CSP du site, sans accès aux services externes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer, urlFor } from './lib.mjs';

const PORT = 8794;
const stop = await startServer(PORT);
let browser;
let checks = 0;
const failures = [];

async function scenario(name, width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR' });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(urlFor('index', PORT), { waitUntil: 'networkidle' });
    await run(page, context);
    assert.deepEqual(errors, [], 'aucune exception JavaScript');
    checks++;
    console.log('  OK : ' + name);
  } catch (error) {
    const state = await page.evaluate(() => ({
      focus: document.activeElement.outerHTML.slice(0, 220),
      bureau: matchMedia('(min-width: 64.0625em)').matches,
      classes: document.body.className,
      menus: Array.from(document.querySelectorAll('[data-megamenu] > .nav-link')).map(element => element.getAttribute('aria-expanded')),
    }));
    failures.push(name + ' — ' + error.stack + '\n  État : ' + JSON.stringify(state));
  } finally {
    await context.close();
  }
}

const trigger = page => page.locator('[data-megamenu] > .nav-link').first();
const firstLink = page => page.locator('[data-megamenu] .mega-panel a').first();
const focused = locator => locator.evaluate(element => document.activeElement === element);
const expanded = async (page, value) => assert.equal(await trigger(page).getAttribute('aria-expanded'), String(value));

try {
  browser = await chromium.launch();

  await scenario('le survol puis le clic confirment le menu ; le second clic le ferme', 1366, async page => {
    await trigger(page).hover();
    await expanded(page, true);
    await trigger(page).click();
    await expanded(page, true);
    await trigger(page).click();
    await expanded(page, false);
  });

  await scenario('le panneau reste ouvert lorsque la souris sort pendant une lecture au clavier', 1366, async page => {
    // TECH14AD-2026-09-14 : ouverture et parcours au clavier (Entrée puis Tab : focus visible), la souris passe puis s'en va.
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expanded(page, true);
    await firstLink(page).waitFor({ state: 'visible' });
    await page.keyboard.press('Tab');
    assert.equal(await focused(firstLink(page)), true, 'Tab entre dans le panneau');
    await trigger(page).hover();
    await page.mouse.move(1, 700);
    await page.waitForTimeout(220); // Dépasse le délai de fermeture de 150 ms.
    await expanded(page, true);
    assert.equal(await firstLink(page).isVisible(), true, 'le lien focalisé reste visible');
    assert.equal(await focused(firstLink(page)), true, 'focus conservé sur le lien après le départ de la souris');
    await page.keyboard.press('Escape');
    await expanded(page, false);
    assert.equal(await focused(trigger(page)), true, 'Échap rend le focus au bouton');
  });

  await scenario('après un clic à la souris sur le bouton, sortir la souris referme le menu', 1366, async page => {
    // TECH14AD-2026-09-14 : Chrome et Firefox focalisent le bouton au clic ; sans :focus-visible, le panneau ne doit pas rester collé.
    await trigger(page).click();
    await expanded(page, true);
    assert.equal(await focused(trigger(page)), true, 'le clic focalise le bouton (Chromium)');
    await page.mouse.move(1, 700);
    await page.waitForTimeout(220);
    await expanded(page, false);
  });

  await scenario('sans focus dans le panneau, sortir la souris ferme le menu', 1366, async page => {
    await trigger(page).hover();
    await page.mouse.move(1, 700);
    await page.waitForTimeout(220);
    await expanded(page, false);
  });

  await scenario('le passage ordinateur → mobile ferme les sous-menus et garde un focus visible', 1366, async page => {
    await trigger(page).click();
    await firstLink(page).waitFor({ state: 'visible' });
    await firstLink(page).focus();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(100);
    await expanded(page, false);
    assert.equal(await focused(page.locator('.mobile-toggle')), true, 'focus sur le bouton mobile');
    await page.locator('.mobile-toggle').click();
    await expanded(page, false);
  });

  await scenario('le tiroir contient le focus et Échap réactive la page', 375, async page => {
    await page.locator('.mobile-toggle').click();
    assert.equal(await page.locator('main').evaluate(element => element.inert), true);
    const first = page.locator('.drawer-tel');
    assert.equal(await focused(first), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focused(page.locator('.mobile-toggle')), true);
    await page.keyboard.press('Tab');
    assert.equal(await focused(first), true);
    await trigger(page).click();
    await expanded(page, true);
    await page.keyboard.press('Escape');
    await expanded(page, false);
    assert.equal(await page.locator('main').evaluate(element => element.inert), false);
    assert.equal(await focused(page.locator('.mobile-toggle')), true);
  });

  await scenario('une police système modifiée referme le tiroir même sans redimensionner la fenêtre', 1366, async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    await page.locator('.mobile-toggle').click();
    assert.equal(await page.locator('main').evaluate(element => element.inert), true);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('menu-open')), false);
    assert.equal(await page.locator('main').evaluate(element => element.inert), false);
    assert.equal(await page.locator('nav.main-nav').evaluate(element => element.style.height), '');
    assert.equal(await focused(trigger(page)), true, 'le premier bouton visible du menu bureau reçoit le focus');
  });

  await scenario('ouvrir Doctolib depuis le tiroir laisse un focus visible au retour', 375, async (page, context) => {
    await page.locator('.mobile-toggle').click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('.drawer-rdv').click();
    const popup = await popupPromise;
    await popup.close();
    assert.equal(await page.locator('main').evaluate(element => element.inert), false);
    assert.equal(await focused(page.locator('.mobile-toggle')), true, 'focus hors du tiroir fermé');
  });
} finally {
  if (browser) await browser.close();
  stop();
}

for (const failure of failures) console.error('  ÉCHEC : ' + failure);
console.log(`navigation : ${checks} scénario(s) réussi(s), ${failures.length} échec(s).`);
process.exitCode = failures.length ? 1 : 0;
