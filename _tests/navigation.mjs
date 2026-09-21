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

async function scenario(name, width, run, slug = 'index') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR' });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle' });
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
      boites: ['header.site-header', 'nav.main-nav'].map(selector => { const element = document.querySelector(selector), rect = element.getBoundingClientRect(); return { selector, top: rect.top, bottom: rect.bottom, style: element.getAttribute('style'), filtre: getComputedStyle(element).backdropFilter, transformation: getComputedStyle(element).transform }; }),
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

  // TECH32-2026-09-20 : le menu respecte l’espace visible, avec fort zoom et transparence réduite.
  for (const profile of [
    { width: 320, height: 256, transparency: false, font: 16 },
    { width: 320, height: 256, transparency: false, font: 32 },
    { width: 375, height: 667, transparency: true, font: 16 },
    { width: 375, height: 667, transparency: false, font: 16 },
    { width: 683, height: 450, transparency: true, font: 32 },
  ]) {
    await scenario(`tiroir ${profile.width}×${profile.height}, police ${profile.font}, transparence réduite ${profile.transparency}`, profile.width, async (page, context) => {
      await page.setViewportSize({ width: profile.width, height: profile.height });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-reduced-transparency', value: profile.transparency ? 'reduce' : 'no-preference' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ] });
      if (profile.font !== 16) await cdp.send('Page.setFontSizes', { fontSizes: { standard: profile.font, fixed: 26 } });
      await page.locator('.mobile-toggle').focus();
      await page.keyboard.press('Enter');
      // Le focus initial peut faire défiler le bandeau supérieur : attendre son nouvel alignement.
      const fits = () => {
        const header = document.querySelector('header.site-header').getBoundingClientRect();
        const panel = document.querySelector('nav.main-nav').getBoundingClientRect();
        return Math.abs(panel.top - header.bottom) <= 1 && Math.abs(panel.bottom - innerHeight) <= 1;
      };
      await page.waitForFunction(fits, undefined, { timeout: 2000 });
      const closeReachable = await page.locator('.mobile-toggle').evaluate(button => {
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (button === hit || button.contains(hit));
      });
      assert.equal(closeReachable, true, 'le panneau ne recouvre pas le bouton de fermeture');
      assert.equal(await page.locator('main').evaluate(element => element.inert), true);
      await trigger(page).focus();
      await page.keyboard.press('Enter');
      await firstLink(page).waitFor({ state: 'visible' });
      await page.keyboard.press('Tab');
      assert.equal(await focused(firstLink(page)), true, 'le clavier entre dans les liens de la rubrique');
      await page.waitForFunction(fits, undefined, { timeout: 2000 });
      await page.keyboard.press('Escape');
      assert.equal(await focused(page.locator('.mobile-toggle')), true);
      assert.equal(await page.locator('main').evaluate(element => element.inert), false);
    });
  }
  // TECH59-2026-09-20 : le nom agrandi reste dans l'en-tête et les ancres arrivent en dessous.
  for (const width of [320, 375, 683]) {
    await scenario(`en-tête et sommaire à ${width} px avec texte agrandi`, width, async (page, context) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
      await page.waitForFunction(() => {
        const header = document.querySelector('.site-header').getBoundingClientRect();
        const name = document.querySelector('.site-logo').getBoundingClientRect();
        return name.top >= header.top && name.bottom <= header.bottom;
      }, undefined, { timeout: 2000 });
      await page.locator('.toc a').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => {
        const target = document.querySelector(location.hash);
        return target && target.getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom + 8;
      }, undefined, { timeout: 2000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }, 'amblyopie');
  }

  // TECH58-2026-09-20 : agrandir le texte après chargement, sans redimensionner la fenêtre.
  for (const profile of [{ slug: 'amblyopie', width: 375 }, { slug: 'myopie', width: 683 }]) {
    await scenario(`tableau ${profile.slug} : texte agrandi puis rétabli`, profile.width, async (page, context) => {
      const table = page.locator('.table-scroll').first();
      const cdp = await context.newCDPSession(page);
      assert.equal(await table.getAttribute('tabindex'), null, 'le tableau tient initialement sans arrêt clavier supplémentaire');
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
      await page.waitForFunction(() => {
        const element = document.querySelector('.table-scroll');
        return element.scrollWidth > element.clientWidth + 1 && element.getAttribute('tabindex') === '0';
      }, undefined, { timeout: 2000 });
      assert.match(await table.getAttribute('aria-label'), /défilement horizontal possible/);
      await table.focus();
      assert.equal(await focused(table), true, 'le tableau reçoit le focus');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.table-scroll').scrollLeft > 0, undefined, { timeout: 2000 });
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
      await page.waitForFunction(() => {
        const element = document.querySelector('.table-scroll');
        return element.scrollWidth <= element.clientWidth + 1 && !element.hasAttribute('tabindex');
      }, undefined, { timeout: 2000 });
      assert.equal(await table.getAttribute('aria-label'), 'Tableau');
      await page.keyboard.press('Tab');
      assert.equal(await focused(table), false, 'Tab permet de poursuivre la lecture');
    }, profile.slug);
  }
  // TECH61-2026-09-21 : l’en-tête ne doit pas masquer le seul bouton de rendez-vous disponible.
  for (const width of [375, 683]) {
    await scenario(`rendez-vous accessible aux limites de l’écran à ${width} px`, width, async (page, context) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const cdp = await context.newCDPSession(page);
      for (const font of [16, 32]) {
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: font, fixed: font === 32 ? 26 : 13 } });
        await page.waitForFunction(font => getComputedStyle(document.documentElement).fontSize === font + 'px', font, { timeout: 2000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        for (const position of ['bas', 'centre', 'derriere-entete']) {
          await page.evaluate(position => {
            const button = document.querySelector('.hero-buttons .btn-primary').getBoundingClientRect();
            const header = document.querySelector('.site-header').getBoundingClientRect();
            const top = position === 'bas' ? innerHeight - 2 : position === 'centre' ? innerHeight / 2 : header.height - button.height - 2;
            window.scrollTo({ top: scrollY + button.top - top, behavior: 'instant' });
          }, position);
          await page.waitForFunction(hidden => document.body.classList.contains('hero-cta-visible') === hidden, position === 'centre', { timeout: 2000 });
          const selector = position === 'centre' ? '.hero-buttons .btn-primary' : '.sticky-doctolib';
          await page.waitForFunction(selector => {
            const button = document.querySelector(selector), r = button.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && (hit === button || button.contains(hit));
          }, selector, { timeout: 2000 });
        }
      }
    });
  }
} finally {
  if (browser) await browser.close();
  stop();
}

for (const failure of failures) console.error('  ÉCHEC : ' + failure);
console.log(`navigation : ${checks} scénario(s) réussi(s), ${failures.length} échec(s).`);
process.exitCode = failures.length ? 1 : 0;
