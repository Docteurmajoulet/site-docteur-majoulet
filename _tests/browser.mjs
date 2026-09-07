#!/usr/bin/env node
// Tests navigateur — toutes les pages × 4 largeurs, sous la CSP de production (servie par serve.py).
//   node _tests/browser.mjs [--widths 320,390,768,1366] [--pages a,b,c] [--axe-widths 390,1366]
// Par page et largeur : aucune erreur console, aucune exception, aucune violation CSP, aucune requête
// interne en échec, aucun débordement horizontal ; axe-core (WCAG 2.x A/AA + bonnes pratiques) : 0 violation.
// Les requêtes externes (Doctolib, Google Maps…) sont bloquées pour rester hermétique. Code de sortie 1 si échec.
// Puis, aux largeurs axe, la même page avec l'espacement du texte WCAG 1.4.12 : aucun texte tronqué (TECH4A-2026-09-06).
// À 390 px : zone de toucher des numéros de téléphone ≥ 44 px, lien d'évitement → focus sur <main> (TECH6I-2026-09-07).
// Puis police du navigateur à 32 px : aucun débordement, chrome (bandeau, en-tête, menu, barre fixe) jamais tronqué (TECH7K-2026-09-07).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pages, urlFor, startServer } from './lib.mjs';

const require = createRequire(import.meta.url);
const AXE_SRC = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const WIDTHS = (args.widths || '320,390,768,1366').split(',').map(Number);
const AXE_WIDTHS = (args['axe-widths'] || '390,1366').split(',').map(Number);
const PORT = 8791;
const slugs = args.pages ? args.pages.split(',') : pages();

const stop = await startServer(PORT);
const browser = await chromium.launch();
const failures = [];
let loads = 0, axeRuns = 0;
try {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.addInitScript(() => {
      window.__cspv = [];
      document.addEventListener('securitypolicyviolation', e => window.__cspv.push(`${e.violatedDirective} ← ${e.blockedURI || 'inline'} (${e.sourceFile || ''}:${e.lineNumber || ''})`));
    });
    for (const slug of slugs) {
      const page = await ctx.newPage();
      const problems = [];
      page.on('console', m => { if (m.type() === 'error') problems.push('console : ' + m.text().slice(0, 160)); });
      page.on('pageerror', e => problems.push('exception : ' + String(e).slice(0, 160)));
      page.on('requestfailed', r => { if (r.url().startsWith('http://127.0.0.1')) problems.push('requête échouée : ' + r.url().slice(0, 120)); });
      page.on('response', r => { if (r.url().startsWith('http://127.0.0.1') && r.status() >= 400 && !r.url().includes('404.html')) problems.push(`HTTP ${r.status()} : ${r.url().slice(0, 120)}`); });
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        loads++;
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 0) problems.push(`débordement horizontal de ${over}px`);
        if (slug === 'index') {   // TECH4D-2026-09-06 : la façade Google Maps crée l'iframe au clic (et pas avant)
          if (await page.locator('iframe[src*="google.com/maps"]').count()) problems.push('carte : iframe Google Maps présente avant tout clic');
          const btn = page.locator('.map-facade-btn');
          if (await btn.count() !== 1) problems.push('carte : bouton « Afficher la carte » absent');
          else {
            await btn.click();
            if (await page.locator('iframe[src*="google.com/maps/embed"]').count() !== 1) problems.push('carte : iframe non créée après le clic');
            if (await page.locator('#map-facade').count()) problems.push('carte : façade toujours présente après le clic');
          }
        }
        // TECH5E-2026-09-06 : (a) aucun bouton dont le texte direct (item flex anonyme) se replie sur ≥ 2 lignes
        // — c'est ce qui donnait « PRENDRE  SUR / RENDEZ-VOUS  DOCTOLIB » ; (b) barre fixe : ses deux boutons sur une ligne.
        const grid = await page.evaluate(() => {
          const out = [];
          const linesOf = node => { const r = document.createRange(); r.selectNodeContents(node); return new Set(Array.from(r.getClientRects()).filter(x => x.width > 2 && x.height > 4).map(x => Math.round(x.top / 4))).size; };
          for (const el of document.querySelectorAll('a, button')) {
            const cs = getComputedStyle(el);
            if (!cs.display.includes('flex') || cs.display === 'none' || el.getClientRects().length === 0) continue;
            // boutons et pills seulement (rangée flex, coins ≥ 20 px ou classe btn-*) — pas les cartes-liens en colonne
            if (cs.flexDirection !== 'row' || !(parseFloat(cs.borderTopLeftRadius) >= 20 || /(^|\s)btn-/.test(el.className))) continue;
            let multi = 0;   // items flex (texte direct ou enfant visible) qui occupent chacun ≥ 2 lignes : ≥ 2 = grille
            for (const node of el.childNodes) {
              if (node.nodeType === 3) { if (node.textContent.trim() && linesOf(node) >= 2) multi++; continue; }
              if (node.nodeType !== 1 || node.tagName === 'svg' || node.classList.contains('sr-only') || node.getAttribute('aria-hidden') === 'true') continue;
              if (getComputedStyle(node).display === 'none') continue;
              if (node.textContent.trim() && linesOf(node) >= 2) multi++;
            }
            if (multi >= 2) out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} « ${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)} » : libellé en colonnes`);
          }
          const bar = document.querySelector('.sticky-rdv');
          if (bar && getComputedStyle(bar).display !== 'none') {
            for (const a of bar.querySelectorAll('a')) {   // lignes du texte visible (les spans .sr-only sont hors écran : ignorés)
              const tops = new Set();
              const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, { acceptNode: t => (t.textContent.trim() && !t.parentElement.closest('.sr-only')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
              let t; while ((t = walker.nextNode())) { const r = document.createRange(); r.selectNodeContents(t); for (const x of r.getClientRects()) if (x.width > 2) tops.add(Math.round(x.top / 6)); }
              if (tops.size >= 2 || a.scrollWidth > a.clientWidth + 1) out.push(`barre fixe : « ${a.textContent.trim().slice(0, 30)} » sur ${tops.size} lignes ou tronqué`);
            }
            if (bar.scrollWidth > bar.clientWidth + 1) out.push('barre fixe : débordement horizontal');
          }
          return out;
        });
        for (const g of grid) problems.push('bouton : ' + g);
        // TECH5G-2026-09-06 : corps de fiche — la colonne de texte ne doit pas redevenir trop large pour son corps
        // (largeur / taille de police > 42 em ≈ plus de 90 caractères par ligne ; 680/15,36 = 44,3 avant le lot, 660/16,8 = 39,3 après).
        if (w >= 1024) {
          const wide = await page.evaluate(() => {
            const out = [];
            for (const p of document.querySelectorAll('article.pathology-content > p:not([class]), article.pathology-content > .page-section > p:not([class])')) {
              const r = p.getBoundingClientRect(); if (r.width < 200 || r.height === 0) continue;
              const em = r.width / parseFloat(getComputedStyle(p).fontSize);
              if (em > 42) { out.push(`${Math.round(r.width)} px pour ${getComputedStyle(p).fontSize} (${em.toFixed(1)} em)`); break; }
            }
            return out;
          });
          for (const x of wide) problems.push('corps de fiche : colonne trop large — ' + x);
        }
        // TECH6I-2026-09-07 : (a) à 390 px, chaque numéro de téléphone visible offre ≥ 44 px de hauteur tactile (28 px au pied de
        // page), mesurée par elementFromPoint (les pseudo-éléments comptent) ; (b) le lien d'évitement donne le focus à <main>.
        if (w === 390) {
          const tel = await page.evaluate(async () => {
            const out = [];
            const links = Array.from(document.querySelectorAll('a[href^="tel:"]')).filter(a => a.getClientRects().length && getComputedStyle(a).visibility !== 'hidden' && !a.closest('.sticky-rdv'));   // la barre fixe (48 px, animée) a son propre contrôle
            for (const a of links) {
              a.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 20));
              const r = a.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
              const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === a || a.contains(e)); };
              let top = cy, bot = cy;
              while (top > cy - 40 && hit(cx, top - 1)) top--;
              while (bot < cy + 40 && hit(cx, bot + 1)) bot++;
              const h = bot - top + 1, min = a.closest('footer') ? 28 : 44;
              if (h < min - 2) out.push(`« ${a.textContent.trim().replace(/\s+/g, ' ').slice(0, 22)} » (${(a.className || '').toString().split(' ')[0] || a.parentElement.tagName.toLowerCase()}) : ${h} px < ${min}`);
            }
            window.scrollTo(0, 0);
            return out;
          });
          for (const x of tel) problems.push('téléphone : zone de toucher ' + x);
          await page.focus('.skip-link'); await page.keyboard.press('Enter'); await page.waitForTimeout(50);
          const act = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
          if (act !== 'MAIN') problems.push(`lien d'évitement : le focus est sur ${act} au lieu de MAIN`);
        }
        const cspv = await page.evaluate(() => window.__cspv);
        for (const v of cspv) problems.push('CSP : ' + v);
        if (AXE_WIDTHS.includes(w)) {
          await page.evaluate(AXE_SRC);
          const res = await page.evaluate(async () => {
            const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
            return r.violations.map(v => `${v.id} (${v.impact}) ×${v.nodes.length} — ${v.nodes[0].target[0]}`);
          });
          axeRuns++;
          for (const v of res) problems.push('axe : ' + v);
        }
      } catch (e) { problems.push('chargement : ' + String(e).slice(0, 160)); }
      for (const p of problems) failures.push(`${slug} @${w} — ${p}`);
      await page.close();
    }
    await ctx.close();
  }
  // TECH4A-2026-09-06 — espacement du texte (WCAG 1.4.12) : interlignage 1,5, paragraphes 2 em, lettres 0,12 em,
  // mots 0,16 em ; aucun texte ne doit être tronqué (ellipse / nowrap + overflow hidden) ni déborder. Contexte sans CSP
  // (la feuille de test est injectée). Trouvé le 06/09/2026 : bandeau urgence coupé à toutes les largeurs ≥ 431 px.
  const SPACING = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
  for (const w of AXE_WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR', bypassCSP: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        await page.addStyleTag({ content: SPACING });
        await page.waitForTimeout(100);
        const res = await page.evaluate(() => {
          const out = [];
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (over > 0) out.push(`débordement horizontal de ${over}px`);
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || (el.className || '').toString().includes('sr-only')) continue;
            const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
            if (clipX && (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim())
              out.push(`texte tronqué : ${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} « ${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)} » (${el.scrollWidth} > ${el.clientWidth}px)`);
          }
          return out.slice(0, 5);
        });
        for (const r of res) failures.push(`${slug} @${w} espacé — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} espacé — chargement : ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH7K-2026-09-07 — police système agrandie : taille par défaut du navigateur à 32 px (CDP Page.setFontSizes, comme le
  // réglage d'accessibilité d'un malvoyant). Aucun débordement horizontal ; bandeau, en-tête, menu, barre fixe et fil d'Ariane
  // jamais tronqués. Trouvé le 07/09/2026 : les 48 pages cassaient à 1366 px (points de rupture en px).
  for (const w of AXE_WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      try {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Page.enable');
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = [];
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (over > 0) out.push(`débordement horizontal de ${over}px`);
          for (const el of document.querySelectorAll('.topbar *, header.site-header *, nav.main-nav *, .sticky-rdv *, .breadcrumb-mini *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.sr-only') || el.classList.contains('sr-only') || el.getClientRects().length === 0) continue;
            if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim())
              out.push(`texte tronqué : ${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} « ${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)} »`);
          }
          return out.slice(0, 5);
        });
        for (const r of res) failures.push(`${slug} @${w} police 32 px — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} police 32 px — chargement : ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
} finally { await browser.close(); stop(); }

for (const f of failures) console.log('  ÉCHEC : ' + f);
console.log(`browser : ${slugs.length} pages × ${WIDTHS.length} largeurs (${loads} chargements, ${axeRuns} passes axe), ${failures.length} échec(s).`);
process.exit(failures.length ? 1 : 0);
