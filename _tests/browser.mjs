#!/usr/bin/env node
// Tests navigateur — toutes les pages × 4 largeurs, sous la CSP de production (servie par serve.py).
//   node _tests/browser.mjs [--widths 320,390,768,1366] [--pages a,b,c] [--axe-widths 390,1366]
// Par page et largeur : aucune erreur console, aucune exception, aucune violation CSP, aucune requête
// interne en échec, aucun débordement horizontal ; axe-core (WCAG 2.x A/AA + bonnes pratiques) : 0 violation.
// Les requêtes externes (Doctolib, Google Maps…) sont bloquées pour rester hermétique. Code de sortie 1 si échec.
// Puis, aux largeurs axe, la même page avec l'espacement du texte WCAG 1.4.12 : aucun texte tronqué (TECH4A-2026-09-06).
// À 390 px : zone de toucher des numéros de téléphone ≥ 44 px, lien d'évitement → focus sur <main> (TECH6I-2026-09-07).
// Puis police du navigateur à 32 px : aucun débordement, chrome (bandeau, en-tête, menu, barre fixe) jamais tronqué (TECH7K-2026-09-07).
// Puis sans JavaScript à 390 px : menu complet visible, aucun débordement, rien d'invisible dans <main> (TECH8N-2026-09-07).
// Puis lisibilité à 390 et 1366 px : aucun texte sous 12,8 px hors exposants, texte de lecture ≥ 7:1 (TECH8O-2026-09-07).
// Puis survol : aucun état :hover après un tap (tactile), survol intact à la souris (TECH8P-2026-09-07).
// Puis portrait du hero (home) rendu entier, à son ratio, à 1 024, 1 366 et 1 920 px (TECH9Q-2026-09-12) ; à la mesure du texte (TECH10U-2026-09-12) ; visage à hauteur du titre (TECH11W-2026-09-12).
// Puis focus jamais masqué : Tab et Maj+Tab sur 3 pages à 390 et 1 366 px, rien sous l'en-tête ni la barre fixe (TECH9R-2026-09-12).
// Puis matrice tactile : iPhone SE 375 × 667 et iPhone en paysage 844 × 390, toutes les pages (TECH11X-2026-09-12).
// Puis anticipation du clic : règles chargées, survol → prefetch, clic servi par le préchargement (TECH12Z-2026-09-12).
// Puis police variable : une requête, une FontFace 300-700, axe wght effectif, 3 pages à 1 366 px (TECH12Y-2026-09-12).
// Puis Trusted Types : sur la home à 1 366 px, une chaîne confiée à innerHTML est refusée (TypeError + violation require-trusted-types-for) (TECH19AR-2026-09-15).
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
        // TECH15AF-2026-09-14 : le titre des fiches (header.page-header h1) reste à l'échelle du téléphone — au plus 25 px à 320 px
        // et 27 px à 390 px (clamp(1.5rem, 1rem + 2.5vw, 2.2rem) = 24 / 25,75 px), au plus 5 lignes (/grille-amsler faisait 6 lignes
        // de 29 px à 320 px) ; à 1 366 px, aucun paragraphe de l'alerte du hub /pathologies au-delà de 44 em (62ch = 42,6 em à 16 px, ≈ 80 caractères).
        if (w === 320 || w === 390) {
          const h1 = await page.evaluate(() => { const h = document.querySelector('header.page-header h1'); if (!h) return null; const cs = getComputedStyle(h); const r = h.getBoundingClientRect(); return { fs: parseFloat(cs.fontSize), lines: Math.round(r.height / parseFloat(cs.lineHeight)) }; });
          if (h1) {
            const max = w === 320 ? 25 : 27;
            if (h1.fs > max) problems.push(`titre de page : ${h1.fs} px à ${w} px (attendu ≤ ${max})`);
            if (h1.lines > 5) problems.push(`titre de page : ${h1.lines} lignes à ${w} px (attendu ≤ 5)`);
          }
        }
        if (w >= 1024 && slug === 'pathologies') {
          const wide = await page.evaluate(() => Array.from(document.querySelectorAll('.hub-alert p')).map(p => p.getBoundingClientRect().width / parseFloat(getComputedStyle(p).fontSize)).filter(em => em > 44).map(em => em.toFixed(1) + ' em'));
          for (const x of wide) problems.push('alerte du hub : paragraphe trop large — ' + x);
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
  // TECH8N-2026-09-07 — sans JavaScript (script bloqué, lecteur, navigateur restreint) : à 390 px, le menu et tous ses liens
  // restent visibles, aucun débordement horizontal, le H1 est visible, aucun élément de <main> ne reste invisible (opacité 0)
  // une fois l'entrée du hero jouée.
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1500);
        const res = await page.evaluate(() => {
          const out = [];
          const vis = el => { if (!el) return false; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
          const links = [...document.querySelectorAll('nav.main-nav a')];
          const shown = links.filter(a => vis(a) && a.getBoundingClientRect().right <= innerWidth + 1 && a.getBoundingClientRect().left >= -1);
          if (!links.length || shown.length < links.length) out.push(`menu sans JS : ${shown.length}/${links.length} liens visibles`);
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (over > 0) out.push(`débordement horizontal de ${over}px sans JS`);
          if (!vis(document.querySelector('h1'))) out.push('H1 invisible sans JS');
          const ghosts = [...document.querySelectorAll('main *')].filter(el => getComputedStyle(el).opacity === '0' && el.getBoundingClientRect().height > 0 && !el.closest('.sr-only'));
          if (ghosts.length) out.push(`${ghosts.length} élément(s) de <main> à opacité 0 sans JS : ${ghosts.slice(0, 3).map(e => e.tagName.toLowerCase() + '.' + (e.className || '').toString().split(' ')[0]).join(', ')}`);
          return out;
        });
        for (const r of res) failures.push(`${slug} @390 sans JS — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @390 sans JS — chargement : ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH8O-2026-09-07 — plancher typographique et contraste AAA : à 390 et 1366 px, aucun texte visible sous 12,8 px (hors
  // exposants), et le texte de lecture (paragraphes, listes, tableaux, définitions, réponses de FAQ, libellés, méta) à 7:1 au
  // moins (4,5:1 pour les grands corps), arrière-plans semi-transparents composés. Hors hero (fond en dégradé) et boutons,
  // pastilles et accents de marque (cuivre, sable), qui restent au niveau AA contrôlé par axe.
  for (const w of AXE_WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        const res = await page.evaluate(() => {
          const out = [];
          const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
          const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
          const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
          const bgOf = el => { let acc = null; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a === 0) continue; acc = acc ? over(acc, c) : c; if (acc.a >= 1 && c.a >= 1) return acc; } return acc ? over(acc, { r: 255, g: 255, b: 255, a: 1 }) : { r: 255, g: 255, b: 255, a: 1 }; };
          const SKIP = '.hero-v3, [class*="btn"], .button, .badge, .chip, .hero-tag, .tagline, .h1-city, .sticky-rdv, .topbar, header.site-header, nav.main-nav, footer, .map-facade, .pub-year, .pub-role, .urgence-badge, .table-scroll caption';
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node; const seen = new Set();
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim()) continue; const el = node.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
            if (el.closest('script, style, .sr-only, [hidden], sup, sub')) continue;
            const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const box = el.getBoundingClientRect(); if (!box.width || !box.height) continue;
            const key = el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0];
            const fs = parseFloat(cs.fontSize);
            if (fs < 12.8) out.push(`texte de ${fs.toFixed(1)} px : ${key} « ${node.textContent.trim().slice(0, 30)} »`);
            if (el.closest(SKIP) || !el.closest('main')) continue;
            if (!el.closest('p, li, dd, dt, td, th, figcaption, blockquote, .r, .key-fact-label, .meta, .tc-text, .tc-title, .read-more, .ic-more, .breadcrumb-mini, h1, h2, h3, h4')) continue;
            const fg0 = parse(cs.color); const bg = bgOf(el); const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
            const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            const large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
            if (ratio < (large ? 4.5 : 7) - 0.005) out.push(`contraste ${ratio.toFixed(2)}:1 (${cs.color} sur rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}), ${fs.toFixed(0)} px) : ${key} « ${node.textContent.trim().slice(0, 30)} »`);
          }
          return [...new Set(out)].slice(0, 6);
        });
        for (const r of res) failures.push(`${slug} @${w} lisibilité — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} lisibilité — chargement : ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH8P-2026-09-07 — survol collant au toucher : en contexte tactile (hover: none), un tap sur une entrée du sommaire ne la
  // souligne pas ; en contexte souris, le survol la souligne toujours (les règles :hover sont sous @media (hover: hover)).
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    try {
      await page.goto(urlFor('decollement-retine', PORT), { waitUntil: 'networkidle', timeout: 30000 });
      const hoverMedia = await page.evaluate(() => matchMedia('(hover: hover)').matches);
      if (hoverMedia) failures.push('decollement-retine @390 tactile — le contexte tactile annonce (hover: hover)');
      await page.tap('.toc-list a'); await page.waitForTimeout(500);
      const td = await page.$eval('.toc-list a', a => getComputedStyle(a).textDecorationLine);
      if (td.includes('underline')) failures.push('decollement-retine @390 tactile — après un tap, le lien du sommaire reste en état :hover (souligné)');
      loads++;
    } catch (e) { failures.push(`decollement-retine @390 tactile — ${String(e).slice(0, 160)}`); }
    await page.close(); await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
    await ctx2.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(urlFor('decollement-retine', PORT), { waitUntil: 'networkidle', timeout: 30000 });
      await page2.hover('.toc-list a'); await page2.waitForTimeout(300);
      const td = await page2.$eval('.toc-list a', a => getComputedStyle(a).textDecorationLine);
      if (!td.includes('underline')) failures.push('decollement-retine @1366 souris — le survol du sommaire ne souligne plus le lien');
      loads++;
    } catch (e) { failures.push(`decollement-retine @1366 souris — ${String(e).slice(0, 160)}`); }
    await page2.close(); await ctx2.close();
  }
  // TECH9Q-2026-09-12 — portrait du hero (home) entier sur écran large : à 1 024, 1 366 et 1 920 px, l'image est rendue à son
  // ratio naturel (± 1 %, donc sans recadrage) ; à 390 px rien ne change (recadrage autorisé). TECH10U-2026-09-12 : il déborde
  // de sa colonne vers la droite (≤ 12 % hors écran), aussi large qu'elle au moins, ≥ 60 % de sa hauteur dès 1 366 px, masqué en fondu.
  // Trouvé le 12/09/2026 : la colonne de 993 px de haut étirait le portrait, 44 % de sa largeur (et la moitié du visage) perdus.
  if (slugs.includes('index')) {
    for (const w of [1024, 1366, 1920]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'reduce' });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor('index', PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = [];
          const img = document.querySelector('.hero-v3 .hero-photo img'); const col = document.querySelector('.hero-v3 .hero-visual');
          if (!img || !col) return ['portrait du hero introuvable'];
          const r = img.getBoundingClientRect(), c = col.getBoundingClientRect();
          const natural = parseInt(img.getAttribute('width'), 10) / parseInt(img.getAttribute('height'), 10);
          const shown = r.width / r.height;
          if (Math.abs(shown / natural - 1) > 0.01) out.push(`portrait recadré : boîte ${Math.round(r.width)}×${Math.round(r.height)} (ratio ${shown.toFixed(3)}) pour une image de ratio ${natural.toFixed(3)}`);
          // TECH10U-2026-09-12 : le portrait déborde de sa colonne vers la droite (au plus 12 % hors écran), jamais vers le haut,
          // le bas ni la gauche ; au moins aussi large que sa colonne ; dès 1 366 px, au moins 60 % de la hauteur de la colonne ;
          // masque elliptique présent (fondu dans l'ardoise).
          // TECH11W-2026-09-12 : le haut de l'image (fond masqué) peut dépasser la colonne de 25 % de sa hauteur au plus ; la ligne
          // des cheveux (haut + 16,9 %) est 82 px sous le haut du titre (± 16 px) — l'entre-deux demandé par Alexandre.
          if (r.left < c.left - 1 || r.top < c.top - 0.25 * r.height || r.bottom > c.bottom + 1) out.push('portrait hors de sa colonne (haut, bas ou gauche)');
          const h1 = document.querySelector('.hero-v3 h1').getBoundingClientRect();
          if (Math.abs((r.top + 0.169 * r.height) - (h1.top + 82)) > 16) out.push(`visage mal placé par rapport au titre (cheveux à ${Math.round(r.top + 0.169 * r.height - h1.top)} px du haut du h1, attendu 82 ± 16)`);
          if (r.right - innerWidth > 0.12 * r.width) out.push(`portrait trop hors écran à droite (${Math.round(r.right - innerWidth)} px sur ${Math.round(r.width)})`);
          if (r.width < 0.95 * c.width) out.push(`portrait plus étroit que sa colonne (${Math.round(r.width)} px pour ${Math.round(c.width)})`);
          if (innerWidth >= 1366 && r.height < 0.6 * c.height) out.push(`portrait trop petit pour le texte (${Math.round(r.height)} px pour une colonne de ${Math.round(c.height)})`);
          const pic = img.closest('picture'); const pcs = pic && getComputedStyle(pic);
          if (!pcs || ((pcs.maskImage === 'none' || !pcs.maskImage) && (pcs.webkitMaskImage === 'none' || !pcs.webkitMaskImage))) out.push('portrait sans masque de fondu');
          return out;
        });
        for (const r of res) failures.push(`index @${w} portrait — ${r}`);
        loads++;
      } catch (e) { failures.push(`index @${w} portrait — chargement : ${String(e).slice(0, 160)}`); }
      await page.close(); await ctx.close();
    }
  }
  // TECH9R-2026-09-12 — focus jamais masqué (WCAG 2.2, 2.4.11) : en tabulant (Tab, puis Maj+Tab depuis le bas) sur trois pages
  // à 390 et 1 366 px, aucun élément focalisé n'est recouvert à plus de 25 % par le chrome fixe (en-tête sticky, barre fixe)
  // ni hors de l'écran. Trouvé le 12/09/2026 : 6-7 éléments par page sous la barre fixe à 390 px, liens sous l'en-tête en remontant.
  for (const w of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 700 : 800 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['index', 'decollement-retine', 'pathologies'].filter(s => slugs.includes(s))) {
      for (const dir of ['Tab', 'Shift+Tab']) {
        const page = await ctx.newPage();
        try {
          await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
          if (dir === 'Shift+Tab') { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(100); }
          const hidden = []; let prev = null, steps = 0;
          while (steps < 200) {
            await page.keyboard.press(dir); steps++;
            const info = await page.evaluate(() => {
              const a = document.activeElement; if (!a || a === document.body) return null;
              const b = a.getBoundingClientRect(); if (!b.width) return { key: 'zero' + Math.random() };
              const key = a.tagName + '|' + (a.getAttribute('href') || '') + '|' + a.textContent.trim().slice(0, 30);
              if (a.classList.contains('skip-link')) return { key, covered: 0, outside: 0 };   // lien d'évitement : glisse depuis le haut (transition)
              const pts = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) pts.push([b.left + b.width * (i / 4 + 0.01) - (i === 4 ? 2 : 0), b.top + b.height * (j / 4 + 0.01) - (j === 4 ? 2 : 0)]);
              let covered = 0, outside = 0;
              for (const [x, y] of pts) {
                if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) { outside++; continue; }
                const e = document.elementFromPoint(x, y);
                if (e && e !== a && !a.contains(e) && !e.contains(a)) { let p = e, fixed = false; while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.position === 'fixed' || cs.position === 'sticky') { fixed = true; break; } p = p.parentElement; } if (fixed) covered++; }
              }
              return { key, covered: covered / pts.length, outside: outside / pts.length, txt: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 28), tag: a.tagName.toLowerCase(), cls: (a.className || '').toString().split(' ')[0] };
            });
            if (!info) break; if (info.key === prev) break; prev = info.key;
            if (info.covered > 0.25 || info.outside > 0.5) hidden.push(`${info.tag}.${info.cls} « ${info.txt} » recouvert ${Math.round(info.covered * 100)} %, hors écran ${Math.round(info.outside * 100)} %`);
          }
          for (const h of hidden.slice(0, 4)) failures.push(`${slug} @${w} focus ${dir} — ${h}`);
          loads++;
        } catch (e) { failures.push(`${slug} @${w} focus ${dir} — ${String(e).slice(0, 160)}`); }
        await page.close();
      }
    }
    await ctx.close();
  }
  // TECH11X-2026-09-12 — matrice tactile : iPhone SE (375 × 667, 2×) et iPhone en paysage (844 × 390, 3×), tactiles, sur toutes
  // les pages : aucun débordement, chrome (bandeau, en-tête, barre fixe, fil d'Ariane) jamais tronqué, barre fixe masquée en
  // paysage bas, aucune erreur console. Diagnostic du 12/09/2026 sur 9 profils réels × 45 pages : 0 problème — garde-fou.
  for (const pr of [{ name: 'iPhone SE 375', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 }, { name: 'iPhone paysage 844x390', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 }]) {
    const ctx = await browser.newContext({ viewport: pr.viewport, deviceScaleFactor: pr.deviceScaleFactor, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      const problems = [];
      page.on('console', m => { if (m.type() === 'error') problems.push('console : ' + m.text().slice(0, 160)); });
      page.on('pageerror', e => problems.push('exception : ' + String(e).slice(0, 160)));
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = [];
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (over > 0) out.push(`débordement horizontal de ${over}px`);
          for (const el of document.querySelectorAll('.topbar *, header.site-header *, .sticky-rdv *, .breadcrumb-mini *')) {
            const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('.sr-only') || el.getClientRects().length === 0) continue;
            if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) { out.push(`texte tronqué : ${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} « ${el.textContent.trim().slice(0, 30)} »`); break; }
          }
          const bar = document.querySelector('.sticky-rdv');
          if (bar) {
            const cs = getComputedStyle(bar);
            if (innerHeight <= 480 && innerWidth > innerHeight && cs.display !== 'none') out.push('barre fixe visible en paysage bas');
            else if (cs.display !== 'none' && !document.body.classList.contains('hero-cta-visible')) { const r = bar.getBoundingClientRect(); if (r.bottom > innerHeight + 1) out.push(`barre fixe sous le bas de l'écran (${Math.round(r.bottom - innerHeight)} px)`); }
          }
          return out;
        });
        problems.push(...res);
        loads++;
      } catch (e) { problems.push('chargement : ' + String(e).slice(0, 160)); }
      for (const p of problems) failures.push(`${slug} @${pr.name} — ${p}`);
      await page.close();
    }
    await ctx.close();
  }
  // TECH12Y-2026-09-12 — police variable : sur 3 pages à 1 366 px, une seule requête /fonts/ (la police variable déclarée),
  // une seule FontFace Montserrat (« 300 700 ») chargée, graisses 300 à 700 disponibles, et l'axe wght effectif : le même
  // texte est plus large en 700 qu'en 400 qu'en 300 (sinon graisse synthétisée ou police de secours).
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['index', 'dmla', 'contact']) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(async () => {
          await document.fonts.ready;
          const out = [];
          const reqs = performance.getEntriesByType('resource').map(e => new URL(e.name).pathname).filter(p => p.startsWith('/fonts/'));
          if (reqs.length !== 1 || !/^\/fonts\/montserrat-wght-\d+\.woff2$/.test(reqs[0])) out.push(`requêtes de police ${JSON.stringify(reqs)} (attendu : la seule police variable)`);
          const faces = [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Montserrat');
          if (faces.length !== 1 || faces[0].status !== 'loaded' || faces[0].weight !== '300 700') out.push(`document.fonts : ${faces.length} face(s) Montserrat (${faces.map(f => f.weight + ' ' + f.status).join(', ')}), attendu une seule « 300 700 » chargée`);
          for (const w of [300, 400, 500, 600, 700]) if (!document.fonts.check(`${w} 16px Montserrat`)) out.push(`graisse ${w} indisponible (document.fonts.check)`);
          const probe = document.createElement('span'); probe.textContent = 'Ophtalmologue et rétinologue à Boulogne-Billancourt';
          Object.assign(probe.style, { fontFamily: 'Montserrat', fontSize: '32px', position: 'absolute', whiteSpace: 'nowrap', visibility: 'hidden' });
          document.body.appendChild(probe);
          const w = {}; for (const k of [300, 400, 700]) { probe.style.fontWeight = String(k); w[k] = probe.getBoundingClientRect().width; }
          probe.remove();
          if (!(w[300] < w[400] && w[400] < w[700])) out.push(`axe wght inopérant : largeurs 300 / 400 / 700 = ${w[300].toFixed(1)} / ${w[400].toFixed(1)} / ${w[700].toFixed(1)} px`);
          return out;
        });
        for (const p of res) failures.push(`${slug} @1366 — police : ${p}`);
        loads++;
      } catch (e) { failures.push(`${slug} @1366 — police : chargement ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH12Z-2026-09-12 — anticipation du clic : à 1 366 px sur la home, les règles (/speculationrules.json) sont chargées ;
  // le survol du premier lien interne visible déclenche une requête « Sec-Purpose: prefetch » vers lui ; le clic est servi par
  // ce préchargement (Navigation Timing deliveryType « navigational-prefetch »).
  {
    // Pas de ctx.route ici : l'interception des requêtes par Playwright annule les préchargements spéculatifs de Chromium.
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const prefetched = [];
    page.on('request', r => { if ((r.headers()['sec-purpose'] || '').includes('prefetch')) prefetched.push(new URL(r.url()).pathname); });
    try {
      await page.goto(urlFor('index', PORT), { waitUntil: 'networkidle', timeout: 30000 });
      const rulesLoaded = await page.evaluate(() => performance.getEntriesByType('resource').some(e => new URL(e.name).pathname === '/speculationrules.json'));
      if (!rulesLoaded) failures.push('index @1366 — anticipation : /speculationrules.json non chargé (en-tête Speculation-Rules absent ou type incorrect)');
      const link = page.locator('main a[href^="/"]:not([href$=".pdf"]):visible').first();
      const href = new URL(await link.getAttribute('href'), 'http://127.0.0.1/').pathname;
      await link.hover();
      const t0 = Date.now(); while (!prefetched.includes(href) && Date.now() - t0 < 3000) await page.waitForTimeout(100);
      if (!prefetched.includes(href)) failures.push(`index @1366 — anticipation : aucune requête Sec-Purpose: prefetch vers ${href} après survol (reçues : ${JSON.stringify(prefetched)})`);
      else {
        await link.click();
        await page.waitForLoadState('load');
        const nav = await page.evaluate(() => { const e = performance.getEntriesByType('navigation')[0]; return { path: location.pathname, delivery: e && e.deliveryType }; });
        if (nav.path !== href || nav.delivery !== 'navigational-prefetch') failures.push(`index @1366 — anticipation : navigation vers ${nav.path} servie « ${nav.delivery} » (attendu navigational-prefetch vers ${href})`);
      }
      loads += 2;
    } catch (e) { failures.push('index @1366 — anticipation : ' + String(e).slice(0, 160)); }
    await page.close(); await ctx.close();
  }
  // TECH19AR-2026-09-15 — Trusted Types : la CSP servie (require-trusted-types-for 'script') doit être appliquée par le navigateur :
  // une chaîne brute confiée à innerHTML lève TypeError et déclenche une violation « require-trusted-types-for » ; la page elle-même
  // (nav.js, script inline) n'en déclenche aucune — c'est le contrôle CSP de chaque chargement ci-dessus qui le garantit.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    try {
      await page.goto(urlFor('index', PORT), { waitUntil: 'load', timeout: 30000 });
      const res = await page.evaluate(() => new Promise(resolve => {
        const violations = [];
        document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
        let threw = 'aucune';
        try { document.createElement('div').innerHTML = '<b>x</b>'; } catch (e) { threw = e.name; }
        setTimeout(() => resolve({ threw, violations, api: typeof window.trustedTypes }), 100);
      }));
      if (res.api !== 'object') failures.push(`index @1366 — Trusted Types : API absente du navigateur de test (${res.api})`);
      else if (res.threw !== 'TypeError' || !res.violations.includes('require-trusted-types-for')) failures.push(`index @1366 — Trusted Types non appliqués : innerHTML → ${res.threw}, violations ${JSON.stringify(res.violations)} (attendu TypeError + require-trusted-types-for)`);
      loads++;
    } catch (e) { failures.push('index @1366 — Trusted Types : ' + String(e).slice(0, 160)); }
    await page.close(); await ctx.close();
  }
  // TECH17AM-2026-09-15 — mode « contraste élevé » (forced-colors, palettes sombre et claire) : ce que le navigateur efface
  // (fonds) doit rester dessiné — à 390 px, les barres du bouton de menu, la bordure du CTA « Prendre rendez-vous », les puces du
  // sommaire et des listes « en bref » / « travaux » ; à 1 366 px, la flèche des titres du méga-menu. Une couleur « peinte » est
  // une couleur opaque différente du fond de la page (Canvas).
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'fr-FR', forcedColors: 'active', colorScheme: scheme });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const label = `contraste élevé (${scheme === 'dark' ? 'sombre' : 'clair'})`;
    for (const slug of ['index', 'dmla', 'glaucome', 'secheresse-oculaire']) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'load', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = [];
          if (!matchMedia('(forced-colors: active)').matches) { out.push('émulation forced-colors inactive'); return out; }
          const canvas = getComputedStyle(document.body).backgroundColor;
          const painted = c => c && c !== canvas && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c);
          const bar = document.querySelector('header.site-header .mobile-toggle span');
          if (!bar) out.push('bouton de menu introuvable');
          else if (!painted(getComputedStyle(bar).backgroundColor)) out.push(`barres du bouton de menu effacées (fond ${getComputedStyle(bar).backgroundColor} sur ${canvas})`);
          const rdv = document.querySelector('a.btn-rdv');
          if (rdv) { const cs = getComputedStyle(rdv); if (!(parseFloat(cs.borderTopWidth) >= 2 && cs.borderTopStyle === 'solid' && painted(cs.borderTopColor))) out.push(`CTA .btn-rdv sans bordure visible (${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor})`); }
          for (const [sel, what] of [['.toc-list a', 'puce du sommaire'], ['article.pathology-content .enbref li', 'puce « en bref »'], ['article.pathology-content .travaux-list li', 'tiret « travaux »']]) {
            const el = document.querySelector(sel); if (!el) continue;
            const bg = getComputedStyle(el, '::before').backgroundColor;
            if (!painted(bg)) out.push(`${what} effacée (fond ${bg})`);
          }
          return out;
        });
        for (const r of res) failures.push(`${slug} @390 ${label} — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @390 ${label} — chargement : ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    const page = await ctx.newPage();
    try {
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.goto(urlFor('index', PORT), { waitUntil: 'load', timeout: 30000 });
      await page.hover('nav.main-nav button'); await page.waitForTimeout(600);
      const res = await page.evaluate(() => {
        const out = [];
        const canvas = getComputedStyle(document.body).backgroundColor;
        const a = document.querySelector('.mega-col .mega-title a');
        if (!a) out.push('titre de colonne du méga-menu introuvable');
        else { const bg = getComputedStyle(a, '::after').backgroundColor; if (!bg || bg === canvas || /rgba\(\d+, \d+, \d+, 0\)/.test(bg)) out.push(`flèche du titre du méga-menu effacée (fond ${bg})`); }
        return out;
      });
      for (const r of res) failures.push(`index @1366 ${label} — ${r}`);
      loads++;
    } catch (e) { failures.push(`index @1366 ${label} — chargement : ${String(e).slice(0, 160)}`); }
    await page.close();
    await ctx.close();
  }
  // TECH18AO-2026-09-15 — anneau de focus visible (WCAG 2.2, 1.4.11 : indicateur de focus à 3:1 avec ce qui l'entoure) : pour chaque
  // élément focalisable visible (une fois par signature tag.classes@ancêtre-coloré), :focus-visible forcé par CDP, capture de la zone :
  // quelque chose doit changer, et si un contour (outline) est déclaré, il contraste à 3:1 au moins avec les pixels juste au-delà sur
  // un côté au moins. Toutes les pages à 1 366 px ; home, fiche, hub et publications à 390 px. Hors lien d'évitement (c'est son
  // apparition qui signale le focus), menu principal (panneaux masqués) et liens sur plusieurs lignes (pixels voisins = texte).
  // Trouvé le 15/09/2026 : CTA « Prendre rendez-vous » des fiches invisible au focus (ardoise sur ardoise), section Contact à 1,2:1.
  {
    const { PNG } = await import('pngjs');
    const lum = rgb => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const px = (png, x, y) => { x = Math.max(0, Math.min(png.width - 1, Math.round(x))); y = Math.max(0, Math.min(png.height - 1, Math.round(y))); const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    const seen = new Set();
    for (const [w, list] of [[1366, slugs], [390, slugs.filter(s => ['index', 'dmla', 'pathologies', 'publications'].includes(s))]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR', bypassCSP: true, ...(w === 390 ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
      for (const slug of list) {
        const page = await ctx.newPage();
        try {
          await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
          await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
          const docRoot = (await cdp.send('DOM.getDocument', { depth: -1 })).root.nodeId;
          const els = await page.$$('a[href], button, summary, [role="button"], [tabindex]:not([tabindex="-1"])');
          for (const el of els) {
            const info = await el.evaluate(e => {
              const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
              const vis = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
              let p = e.parentElement, bgSel = '';
              while (p) { const c = getComputedStyle(p).backgroundColor; if (c && !c.startsWith('rgba(0, 0, 0, 0)') && c !== 'transparent') { bgSel = p.tagName.toLowerCase() + (p.className ? '.' + String(p.className).trim().split(/\s+/).slice(0, 2).join('.') : ''); break; } p = p.parentElement; }
              const sig = e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).trim().split(/\s+/).slice(0, 3).join('.') : '') + '@' + bgSel;
              return { vis, sig, text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36), skip: !!e.closest('nav.main-nav') || e.classList.contains('skip-link') || e.getClientRects().length > 1 };
            });
            if (!info.vis || info.skip) continue;
            const key = w + '|' + info.sig; if (seen.has(key)) continue; seen.add(key);
            await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'nearest' })); await page.waitForTimeout(60);
            const box = await el.boundingBox(); if (!box) continue;
            await el.evaluate(e => e.setAttribute('data-focus-test', '1'));
            const nid = (await cdp.send('DOM.querySelector', { nodeId: docRoot, selector: '[data-focus-test="1"]' })).nodeId;
            await el.evaluate(e => e.removeAttribute('data-focus-test'));
            if (!nid) continue;
            const m = 14;
            const clip = { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: Math.min(w - Math.max(0, box.x - m), box.width + 2 * m), height: Math.min(900 - Math.max(0, box.y - m), box.height + 2 * m) };
            if (clip.width < 4 || clip.height < 4) continue;
            let rest, foc, style;
            try {
              rest = PNG.sync.read(await page.screenshot({ clip, scale: 'css' }));
              await cdp.send('CSS.forcePseudoState', { nodeId: nid, forcedPseudoClasses: ['focus', 'focus-visible'] });
              style = await el.evaluate(e => { const cs = getComputedStyle(e); return { ow: parseFloat(cs.outlineWidth), os: cs.outlineStyle, oo: parseFloat(cs.outlineOffset) }; });
              foc = PNG.sync.read(await page.screenshot({ clip, scale: 'css' }));
            } finally { await cdp.send('CSS.forcePseudoState', { nodeId: nid, forcedPseudoClasses: [] }); }
            let diff = 0; for (let i = 0; i < foc.data.length; i += 4) if (Math.abs(foc.data[i] - rest.data[i]) + Math.abs(foc.data[i + 1] - rest.data[i + 1]) + Math.abs(foc.data[i + 2] - rest.data[i + 2]) > 30) diff++;
            if (diff < 20) { failures.push(`${slug} @${w} focus visible — ${info.sig} « ${info.text} » : aucun changement visible au focus`); continue; }
            if (!(style.os !== 'none' && style.ow > 0)) continue;   // pas de contour : l'indicateur est ailleurs (fond, soulignement), déjà jugé visible
            const ox = box.x - clip.x, oy = box.y - clip.y, ring = style.oo + style.ow / 2, beyond = style.oo + style.ow + 2;
            let best = 0;
            for (const [rx, ry, bx, by] of [[ox + box.width / 2, oy - ring, ox + box.width / 2, oy - beyond], [ox + box.width / 2, oy + box.height + ring, ox + box.width / 2, oy + box.height + beyond], [ox - ring, oy + box.height / 2, ox - beyond, oy + box.height / 2], [ox + box.width + ring, oy + box.height / 2, ox + box.width + beyond, oy + box.height / 2]]) best = Math.max(best, contrast(px(foc, rx, ry), px(foc, bx, by)));
            if (best < 3) failures.push(`${slug} @${w} focus visible — ${info.sig} « ${info.text} » : contour à ${best.toFixed(1)}:1 au mieux avec ce qui l'entoure (attendu ≥ 3:1)`);
          }
          loads++;
        } catch (e) { failures.push(`${slug} @${w} focus visible — ${String(e).slice(0, 160)}`); }
        await page.close();
      }
      await ctx.close();
    }
  }
  // TECH18AP-2026-09-15 — rubrique courante dans le menu : sur /dmla (rubrique DMLA) et /vitrectomie (Chirurgies) à 1 366 px, le bouton
  // aria-current="true" est celui de la rubrique, en ardoise et graisse 600 comme l'onglet « À propos » sur /le-dr-majoulet ; les autres
  // boutons restent en graisse 500. À 390 px (tiroir ouvert), le même bouton garde cette apparence.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const expect = { dmla: 'mega-dmla', vitrectomie: 'mega-chirurgies', 'le-dr-majoulet': null };
    for (const slug of Object.keys(expect).filter(s => slugs.includes(s))) {
      for (const w of [1366, 390]) {
        const page = await ctx.newPage();
        try {
          await page.setViewportSize({ width: w, height: 900 });
          await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
          if (w === 390) { await page.click('.mobile-toggle'); await page.waitForTimeout(400); }
          const res = await page.evaluate((panel) => {
            const out = [];
            const links = [...document.querySelectorAll('nav.main-nav .nav-link')];
            const cur = links.filter(l => l.getAttribute('aria-current'));
            if (cur.length !== 1) { out.push(`${cur.length} onglet(s) marqués aria-current (attendu 1)`); return out; }
            const c = cur[0], cs = getComputedStyle(c);
            if (panel && (c.tagName !== 'BUTTON' || c.getAttribute('aria-controls') !== panel || c.getAttribute('aria-current') !== 'true')) out.push(`onglet marqué « ${c.textContent.trim().slice(0, 20)} » (attendu le bouton de ${panel} avec aria-current="true")`);
            if (!panel && c.getAttribute('aria-current') !== 'page') out.push(`onglet marqué avec aria-current="${c.getAttribute('aria-current')}" (attendu "page")`);
            if (parseInt(cs.fontWeight, 10) < 600) out.push(`onglet courant en graisse ${cs.fontWeight} (attendu 600)`);
            const other = links.find(l => l !== c);
            if (other && getComputedStyle(other).color === cs.color) out.push('onglet courant de la même couleur que les autres');
            if (other && parseInt(getComputedStyle(other).fontWeight, 10) >= 600) out.push(`onglet non courant en graisse ${getComputedStyle(other).fontWeight}`);
            return out;
          }, expect[slug]);
          for (const r of res) failures.push(`${slug} @${w} rubrique courante — ${r}`);
          loads++;
        } catch (e) { failures.push(`${slug} @${w} rubrique courante — ${String(e).slice(0, 160)}`); }
        await page.close();
      }
    }
    await ctx.close();
  }
  // TECH20AU-2026-09-16 — longueur de ligne (Impeccable « line-length », WCAG 1.4.8) : sur toutes les pages à 1 366 et 1 920 px, aucun
  // bloc de texte de lecture (p, li, dd, dt, td, th, figcaption, blockquote, .travaux-ref ; ≥ 60 caractères ; hors pied de page, menus,
  // sr-only) n'a de ligne rendue de plus de 90 caractères, espaces compris (comptage caractère par caractère via Range, seulement pour
  // les blocs de plus de 30 em de large). Avant le lot : 250 blocs au-dessus de 90, jusqu'à 137 (/pathologies, /publications, « À propos »).
  for (const w of [1366, 1920]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const long = await page.evaluate(async () => {
          await document.fonts.ready;
          const out = [];
          const sel = (el) => { const parts = []; let e = el; while (e && e !== document.body && parts.length < 3) { let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; else if (e.classList.length) s += '.' + [...e.classList].slice(0, 2).join('.'); parts.unshift(s); e = e.parentElement; } return parts.join(' > '); };
          for (const el of document.querySelectorAll('p, li, dd, dt, td, th, figcaption, blockquote, .travaux-ref')) {
            if (el.closest('footer, nav, [aria-hidden="true"], .sr-only')) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (txt.length < 60) continue;
            const rect = el.getBoundingClientRect(); if (rect.width < 100 || rect.height === 0) continue;
            if (rect.width / parseFloat(cs.fontSize) <= 30) continue;   // un bloc de moins de 30 em ne peut pas dépasser 90 caractères
            const lines = new Map(); const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
            while ((node = walker.nextNode())) {
              const t = node.textContent; if (!t.trim() || node.parentElement.closest('.sr-only')) continue;
              const range = document.createRange();
              for (let i = 0; i < t.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); const rr = range.getBoundingClientRect(); if (!rr.width) continue; const k = Math.round(rr.top / 6); lines.set(k, (lines.get(k) || 0) + 1); }
            }
            const max = Math.max(0, ...lines.values());
            if (max > 90) out.push(`${sel(el)} : ${max} caractères sur une ligne (${Math.round(rect.width)} px pour ${cs.fontSize}) « ${txt.slice(0, 40)} »`);
          }
          return out;
        });
        for (const x of long.slice(0, 5)) failures.push(`${slug} @${w} longueur de ligne — ${x}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} longueur de ligne — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH20AV-2026-09-16 — encadrés sans liseré gauche épais (DESIGN.md « Shapes », Impeccable « side-tab ») : sur toutes les pages à
  // 1 366 px, aucun élément visible n'a de bordure gauche pleine de 3 px ou plus (tableaux exclus). Avant le lot : .parcours-list ×3,
  // .expert-highlight ×2, .info-box, .intro-block et .press-card ×3.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const thick = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('body *')) {
            if (el.closest('table')) continue;
            const cs = getComputedStyle(el);
            if (parseFloat(cs.borderLeftWidth) >= 3 && cs.borderLeftStyle !== 'none' && cs.borderLeftStyle !== 'hidden' && el.getBoundingClientRect().width > 0 && cs.visibility !== 'hidden')
              out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')} : bordure gauche ${cs.borderLeftWidth} ${cs.borderLeftColor}`);
          }
          return out;
        });
        for (const x of thick.slice(0, 5)) failures.push(`${slug} @1366 liseré gauche — ${x}`);
        loads++;
      } catch (e) { failures.push(`${slug} @1366 liseré gauche — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH20AW-2026-09-16 — transitions sans propriété de mise en page : sur /, /dmla, /pathologies et /publications à 1 366 et 390 px,
  // aucun élément n'a de propriété de mise en page (width, height, min/max-*, padding*, margin*, gap, top/left/right/bottom, inset,
  // flex-basis, font-size, letter-spacing, line-height, border-*-width) dans son transition-property calculé — sauf les panneaux
  // d'accordéon du tiroir mobile (.mega-panel : max-height, exception assumée). Avant le lot : padding-left sur 52 liens du méga-menu
  // par page, gap sur les liens fléchés de la home et du hub.
  {
    const LAYOUT = /^(width|height|min-width|min-height|max-width|max-height|padding(-[a-z]+)?|margin(-[a-z]+)?|gap|row-gap|column-gap|top|left|right|bottom|inset(-[a-z-]+)?|flex-basis|font-size|letter-spacing|line-height|border(-[a-z]+)?-width)$/;
    for (const w of [1366, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
      for (const slug of ['index', 'dmla', 'pathologies', 'publications'].filter(s => slugs.includes(s))) {
        const page = await ctx.newPage();
        try {
          await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
          const bad = await page.evaluate((src) => {
            const LAYOUT = new RegExp(src);
            const out = new Map();
            for (const el of document.querySelectorAll('body *')) {
              const props = getComputedStyle(el).transitionProperty.split(',').map(s => s.trim()).filter(p => LAYOUT.test(p));
              if (!props.length) continue;
              if (el.matches('.mega-panel, .mega-panel--compact') && props.every(p => p === 'max-height')) continue;   // accordéon du tiroir mobile (exception assumée)
              const key = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')} : ${props.join(', ')}`;
              out.set(key, (out.get(key) || 0) + 1);
            }
            return [...out].map(([k, n]) => `${k} (×${n})`);
          }, LAYOUT.source);
          for (const x of bad.slice(0, 5)) failures.push(`${slug} @${w} transition de mise en page — ${x}`);
          loads++;
        } catch (e) { failures.push(`${slug} @${w} transition de mise en page — ${String(e).slice(0, 160)}`); }
        await page.close();
      }
      await ctx.close();
    }
  }
  // TECH20AX-2026-09-16 — colonne de lecture des fiches sur téléphone : à 390 et 320 px, sur 4 fiches, la largeur utile (contenu) de
  // l'alerte d'urgence, des .forme-box, des réponses de FAQ et du bloc « À propos » vaut au moins largeur d'écran − 120 px (390 : 270 ;
  // avant le lot : 214-244) ; sur le hub à 390 px, au plus 100 px entre le dernier symptôme et le titre « DMLA » (avant : 164).
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['dmla', 'secheresse-oculaire', 'chirurgie-retine', 'decollement-retine', 'pathologies'].filter(s => slugs.includes(s))) {
      if (slug === 'pathologies' && w !== 390) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate((min) => {
          const out = [];
          if (document.body.classList.contains('page-pathologies')) {
            const li = [...document.querySelectorAll('.hub-symptoms li')].pop(); const h2 = document.querySelector('.hub-group h2');
            if (li && h2) { const gap = h2.getBoundingClientRect().top - li.getBoundingClientRect().bottom; if (gap > 100) out.push(`hub : ${Math.round(gap)} px entre le dernier symptôme et le titre « ${h2.textContent.trim()} » (attendu ≤ 100)`); }
            return out;
          }
          for (const s of ['article.pathology-content .alert-urgence', 'article.pathology-content .forme-box', 'article.pathology-content .qr-block .r', 'article.pathology-content .eeat-block']) {
            const el = document.querySelector(s); if (!el) continue;
            const cs = getComputedStyle(el); const cw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (cw < min) out.push(`${s} : ${Math.round(cw)} px de texte utile (attendu ≥ ${min})`);
          }
          return out;
        }, w - 120);
        for (const x of res) failures.push(`${slug} @${w} colonne mobile — ${x}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} colonne mobile — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH20AZ-2026-09-16 — barre fixe avant le contenu : à 390 px, sur /dmla, Tab depuis le bouton de menu donne « Appeler » puis
  // « Prendre rendez-vous » puis un élément de <main> ; sur la home en haut de page (CTA du hero visible), la barre est visibility:
  // hidden et n'est pas focalisable, puis redevient visible en bas de page.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['dmla', 'index'].filter(s => slugs.includes(s))) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(900);   // l'IntersectionObserver du hero pose body.hero-cta-visible et la barre finit de glisser
        const order = await page.evaluate(() => { const bar = document.querySelector('.sticky-rdv'), main = document.querySelector('main'); return bar && main && !!(bar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING); });
        if (!order) failures.push(`${slug} @390 barre fixe — nav.sticky-rdv n'est pas avant <main> dans le DOM`);
        await page.focus('.mobile-toggle');
        const seq = [];
        for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const a = document.activeElement; return (a.className || '').toString().split(' ')[0] || a.tagName + (a.closest('main') ? ' (main)' : ''); })); }
        const inBar = await page.evaluate(() => { const a = document.activeElement; return !!a.closest('.sticky-rdv'); });
        if (slug === 'dmla') {
          if (seq[0] !== 'sticky-tel' || seq[1] !== 'sticky-doctolib') failures.push(`${slug} @390 barre fixe — après le bouton de menu, Tab donne ${seq.slice(0, 2).join(' → ')} (attendu sticky-tel → sticky-doctolib)`);
          const third = await page.evaluate(() => !!document.activeElement.closest('main'));
          if (!third) failures.push(`${slug} @390 barre fixe — le 3e Tab après le menu n'est pas dans <main> (${seq[2]})`);
        } else {
          const st = await page.evaluate(() => ({ cls: document.body.classList.contains('hero-cta-visible'), vis: getComputedStyle(document.querySelector('.sticky-rdv')).visibility }));
          if (!st.cls) failures.push(`${slug} @390 barre fixe — body.hero-cta-visible absent en haut de page (CTA du hero à l'écran)`);
          else if (st.vis !== 'hidden') failures.push(`${slug} @390 barre fixe — barre hors écran mais visibility ${st.vis} (focalisable à l'aveugle)`);
          if (seq.some(s => s.startsWith('sticky-'))) failures.push(`${slug} @390 barre fixe — la barre hors écran reçoit le focus (${seq.join(' → ')})`);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(700);
          const vis = await page.evaluate(() => getComputedStyle(document.querySelector('.sticky-rdv')).visibility);
          if (vis !== 'visible') failures.push(`${slug} @390 barre fixe — barre toujours ${vis} en bas de page`);
        }
        loads++;
      } catch (e) { failures.push(`${slug} @390 barre fixe — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH20BA-2026-09-16 — hub : à 1 366 px, le titre « Commencer par vos symptômes » a le corps des autres H2 du hub (1,6 rem) et
  // son filet sable ; les cartes DMLA font au moins 400 px de large (deux colonnes).
  if (slugs.includes('pathologies')) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    try {
      await page.goto(urlFor('pathologies', PORT), { waitUntil: 'networkidle', timeout: 30000 });
      const res = await page.evaluate(() => {
        const out = [];
        const t = document.querySelector('.hub-sym-title'), g = document.querySelector('.hub-group > h2');
        if (!t || !g) return ['titre des symptômes ou titre de groupe introuvable'];
        const ct = getComputedStyle(t), cg = getComputedStyle(g), after = getComputedStyle(t, '::after');
        if (ct.fontSize !== cg.fontSize || ct.textTransform !== cg.textTransform) out.push(`titre des symptômes ${ct.fontSize} ${ct.textTransform} ≠ titres de groupe ${cg.fontSize} ${cg.textTransform}`);
        if (parseFloat(after.height) < 2 || after.backgroundColor === 'rgba(0, 0, 0, 0)') out.push('filet sable du titre des symptômes absent');
        const cards = [...document.querySelectorAll('.hub-grid--4 .hub-card')];
        const narrow = cards.filter(c => c.getBoundingClientRect().width < 400);
        if (!cards.length || narrow.length) out.push(`cartes DMLA : ${narrow.length}/${cards.length} de moins de 400 px`);
        return out;
      });
      for (const r of res) failures.push(`pathologies @1366 entrée par symptômes — ${r}`);
      loads++;
    } catch (e) { failures.push(`pathologies @1366 entrée par symptômes — ${String(e).slice(0, 160)}`); }
    await page.close();
    await ctx.close();
  }
  // TECH21BD-2026-09-16 — actions dans les encadrés d'alerte des fiches : sur /dmla, /cataracte et /grille-amsler à 390 (tactile) et 1 366 px,
  // l'encadré .alert-urgence contient deux boutons (tel: du cabinet, /urgences-ophtalmologiques), visibles, hauts d'au moins 44 px et
  // contenus dans l'encadré ; le libellé du téléphone porte le numéro.
  for (const w of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: w === 390 ? 3 : 1, locale: 'fr-FR', ...(w === 390 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['dmla', 'cataracte', 'grille-amsler']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = []; const box = document.querySelector('article .alert-urgence');
          if (!box) return ['aucun .alert-urgence'];
          const b = box.getBoundingClientRect(); const links = [...box.querySelectorAll('.alert-actions a')];
          if (links.length !== 2) out.push(`${links.length} bouton(s) dans .alert-actions (2 attendus)`);
          for (const a of links) {
            const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
            if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) out.push(`${a.className} invisible`);
            if (r.height < 44) out.push(`${a.className} : ${Math.round(r.height)} px de haut (< 44)`);
            if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) out.push(`${a.className} déborde de l'encadré`);
          }
          const tel = box.querySelector('.btn-alert-tel');
          if (tel && !/tel:\+33184191166$/.test(tel.href)) out.push(`téléphone inattendu ${tel.href}`);
          if (tel && !/01.84.19.11.66/.test(tel.textContent.replace(/ /g, ' '))) out.push('numéro absent du libellé « Appeler le cabinet »');
          const rdv = box.querySelector('.btn-alert-rdv');
          if (rdv && !/\/urgences-ophtalmologiques$/.test(rdv.getAttribute('href'))) out.push(`cible inattendue ${rdv.getAttribute('href')}`);
          return out;
        });
        for (const r of res) failures.push(`${slug} @${w} actions d'alerte — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} actions d'alerte — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH21BE-2026-09-16 — portrait du hero par plage d'écran : sur la home, le candidat affiché (currentSrc) est le 800 px à 390×3, 412×2,625 et
  // 375×2 (téléphones), le 1 080 px à 1 366×2 (écran large dense) ; et une seule requête du portrait par chargement (préchargement = image).
  if (slugs.includes('index')) {
    for (const pr of [{ w: 390, h: 844, d: 3, mob: true, want: '-800.' }, { w: 412, h: 915, d: 2.625, mob: true, want: '-800.' }, { w: 375, h: 667, d: 2, mob: true, want: '-800.' }, { w: 1366, h: 900, d: 2, mob: false, want: '-1080.' }]) {
      const ctx = await browser.newContext({ viewport: { width: pr.w, height: pr.h }, deviceScaleFactor: pr.d, locale: 'fr-FR', ...(pr.mob ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
      const page = await ctx.newPage(); const hero = [];
      page.on('request', r => { if (/\/img\/dr-majoulet-hero3-/.test(r.url())) hero.push(r.url()); });
      try {
        await page.goto(urlFor('index', PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const cur = await page.evaluate(async () => { const img = document.querySelector('.hero-photo img'); if (img && !img.complete) await new Promise(r => img.addEventListener('load', r, { once: true })); return img ? img.currentSrc : ''; });
        if (!cur.includes(pr.want)) failures.push(`index @${pr.w}×${pr.d} portrait — currentSrc ${cur.split('/').pop()} (attendu …${pr.want}…)`);
        if (!cur.endsWith('.avif')) failures.push(`index @${pr.w}×${pr.d} portrait — format ${cur.split('.').pop()} (AVIF attendu)`);
        const uniq = [...new Set(hero)];
        if (uniq.length !== 1) failures.push(`index @${pr.w}×${pr.d} portrait — ${uniq.length} fichiers demandés (${uniq.map(u => u.split('/').pop()).join(', ')}) : le préchargement ne correspond pas à l'image`);
        loads++;
      } catch (e) { failures.push(`index @${pr.w}×${pr.d} portrait — ${String(e).slice(0, 160)}`); }
      await page.close(); await ctx.close();
    }
  }
  // TECH21BF-2026-09-16 — text-wrap : sur /, /dmla et /pathologies à 390 et 1 366 px, les titres h1-h4 calculent balance et les p/li/dd de
  // <main> calculent pretty (ou balance : sous-titres d'en-tête du tour 20) ; et aucun de ces blocs n'est plus haut qu'avec text-wrap: wrap forcé (balance et pretty n'ajoutent pas de ligne).
  for (const w of [390, 1366]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR', bypassCSP: true, ...(w === 390 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['index', 'dmla', 'pathologies']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const measure = () => page.evaluate(async () => {
          await document.fonts.ready;
          const style = el => { const cs = getComputedStyle(el); return cs.textWrapStyle || cs.textWrap || ''; };
          const out = { h: [], p: [] };
          for (const el of document.querySelectorAll('h1, h2, h3, h4')) { const r = el.getBoundingClientRect(); if (r.width && r.height) out.h.push([style(el), Math.round(r.height), el.textContent.trim().slice(0, 30)]); }
          for (const el of document.querySelectorAll('main p, main li, main dd')) { const r = el.getBoundingClientRect(); if (r.width && r.height) out.p.push([style(el), Math.round(r.height), el.textContent.trim().slice(0, 30)]); }
          return out;
        });
        const after = await measure();
        const badH = after.h.filter(x => !/balance/.test(x[0])).length, badP = after.p.filter(x => !/pretty|balance/.test(x[0])).length;
        if (badH) failures.push(`${slug} @${w} text-wrap — ${badH} titre(s) sans balance (ex. « ${after.h.find(x => !/balance/.test(x[0]))[2]} »)`);
        if (badP) failures.push(`${slug} @${w} text-wrap — ${badP} bloc(s) de <main> sans pretty ni balance (ex. « ${after.p.find(x => !/pretty|balance/.test(x[0]))[2]} »)`);
        await page.addStyleTag({ content: 'h1, h2, h3, h4, main p, main li, main dd { text-wrap: wrap !important; }' });
        const before = await measure();
        const taller = [];
        for (const k of ['h', 'p']) for (let i = 0; i < Math.min(after[k].length, before[k].length); i++) if (after[k][i][1] > before[k][i][1]) taller.push(`« ${after[k][i][2]} » ${before[k][i][1]} → ${after[k][i][1]} px`);
        for (const t of taller.slice(0, 3)) failures.push(`${slug} @${w} text-wrap — bloc plus haut qu'en wrap : ${t}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} text-wrap — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH21BG-2026-09-16 — nom accessible des boutons Doctolib : sur /dmla, /decollement-retine et /pathologies à 1 366 px (span « sur Doctolib » affiché),
  // l'arbre d'accessibilité (CDP) ne contient aucun lien nommé « …VOUSSUR… » ou « …URGENCESUR… », et contient « RENDEZ-VOUS SUR DOCTOLIB » /
  // « URGENCE SUR DOCTOLIB ».
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['dmla', 'decollement-retine', 'pathologies']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const cdp = await ctx.newCDPSession(page);
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        await cdp.detach();
        const names = nodes.filter(n => n.role && n.role.value === 'link' && n.name && /doctolib/i.test(n.name.value)).map(n => n.name.value.replace(/\s+/g, ' ').toUpperCase());
        const glued = names.filter(x => /VOUSSUR|URGENCESUR/.test(x));
        for (const g of [...new Set(glued)]) failures.push(`${slug} @1366 nom accessible — « ${g} » (mots collés)`);
        if (!names.some(x => /RENDEZ-VOUS SUR DOCTOLIB|URGENCE SUR DOCTOLIB/.test(x))) failures.push(`${slug} @1366 nom accessible — aucun lien « … sur Doctolib » lu dans l'arbre (${names.length} liens Doctolib)`);
        loads++;
      } catch (e) { failures.push(`${slug} @1366 nom accessible — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH21BH-2026-09-16 — blocs h3 + p hors de la grille : sur /le-dr-majoulet, /contact, /ophtalmologue-boulogne-billancourt et /implants-toriques à 1 366 px,
  // tout .key-facts sans .key-fact est en flux normal (display block), ses paragraphes font ≥ 600 px, ses icônes de titre 18 px ; et le <sup> du sommaire
  // de /le-dr-majoulet suit son texte (≤ 3 px d'écart).
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['le-dr-majoulet', 'contact', 'ophtalmologue-boulogne-billancourt', 'implants-toriques']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(async () => {
          await document.fonts.ready; const out = []; let n = 0;
          for (const kf of document.querySelectorAll('.key-facts')) {
            if (kf.querySelector('.key-fact')) continue; n++;
            if (getComputedStyle(kf).display !== 'block') out.push(`.key-facts sans tuile en ${getComputedStyle(kf).display} (« ${kf.textContent.trim().slice(0, 25)} »)`);
            for (const p of kf.querySelectorAll('p')) { const w = p.getBoundingClientRect().width; if (w < 600) out.push(`paragraphe de ${Math.round(w)} px (« ${p.textContent.trim().slice(0, 25)} »)`); }
            for (const ico of kf.querySelectorAll('h3 .ico')) { const r = ico.getBoundingClientRect(); if (Math.round(r.width) !== 18 || Math.round(r.height) !== 18) out.push(`icône de titre ${Math.round(r.width)}×${Math.round(r.height)} px`); }
          }
          if (!n) out.push('aucun .key-facts sans tuile trouvé (page changée ?)');
          for (const sup of document.querySelectorAll('.toc-list a sup')) {
            const prev = sup.previousSibling; if (!prev || prev.nodeType !== 3) { out.push('sup du sommaire sans texte devant'); continue; }
            const rg = document.createRange(); rg.selectNodeContents(prev); const gap = sup.getBoundingClientRect().left - rg.getBoundingClientRect().right;
            if (gap > 3) out.push(`sup du sommaire détaché de son texte (${Math.round(gap)} px)`);
          }
          return out;
        });
        for (const r of res) failures.push(`${slug} @1366 blocs hors grille — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @1366 blocs hors grille — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH22BJ-2026-09-17 — rythme vertical mobile des familles m2/m3 : à 390 px sur /le-dr-majoulet, /implants-toriques, /chirurgie-cataracte
  // et /contact, les blocs de contenu de l'article (section.page-section, section sans classe, div.page-section) ont un padding vertical nul,
  // chaque h2 de l'article est à 100 px au plus du texte qui le précède (182 px avant le lot), et le premier texte est à 40 px au moins
  // sous l'en-tête de page (jamais collé).
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['le-dr-majoulet', 'implants-toriques', 'chirurgie-cataracte', 'contact']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(async () => {
          await document.fonts.ready; const out = [];
          const art = document.querySelector('article.pathology-content'); if (!art) return ['article.pathology-content absent'];
          const blocks = [...art.querySelectorAll(':scope > section.page-section, :scope > section:not([class]), :scope > div.page-section')];
          if (!blocks.length) out.push('aucun bloc de contenu (section.page-section / div.page-section) trouvé — page changée ?');
          for (const b of blocks) { const cs = getComputedStyle(b); if (cs.paddingTop !== '0px' || cs.paddingBottom !== '0px') out.push(`${b.tagName.toLowerCase()}.${b.className || '(sans classe)'} : padding ${cs.paddingTop} / ${cs.paddingBottom} (attendu 0)`); }
          const visible = e => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('.sr-only'); };
          // rectangles des nœuds texte visibles de l'article (le texte réellement dessiné, quel que soit le balisage)
          const rects = []; const tw = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
          for (let tn = tw.nextNode(); tn; tn = tw.nextNode()) { if (!tn.textContent.trim() || !visible(tn.parentElement)) continue; const rg = document.createRange(); rg.selectNodeContents(tn); const r = rg.getBoundingClientRect(); if (r.height > 0) rects.push({ node: tn, top: r.top, bottom: r.bottom }); }
          for (const h of art.querySelectorAll('h2')) {
            if (!visible(h)) continue;
            const top = h.getBoundingClientRect().top;
            let prev = -Infinity; for (const r of rects) { if (!h.contains(r.node) && r.bottom <= top + 0.5 && r.bottom > prev) prev = r.bottom; }
            if (prev > -Infinity && top - prev > 100) out.push(`${Math.round(top - prev)} px de vide avant le h2 « ${h.textContent.trim().slice(0, 30)} » (attendu ≤ 100)`);
          }
          const hdr = document.querySelector('header.page-header'); const first = rects.length ? Math.min(...rects.map(r => r.top)) : null;
          if (hdr && first !== null) { const gap = first - hdr.getBoundingClientRect().bottom; if (gap < 40) out.push(`premier texte à ${Math.round(gap)} px sous l'en-tête (attendu ≥ 40)`); }
          return out;
        });
        for (const r of res) failures.push(`${slug} @390 rythme vertical — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @390 rythme vertical — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH22BK-2026-09-17 — /chirurgie-cataracte à 1 366 et 390 px : les cinq cartes de « Pathologies et interventions » sont des liens
  // (href interne), toutes cliquables (pointer-events, cursor pointer), avec la flèche dessinée après « En savoir plus » (::after ≥ 8 px),
  // et aucune n'affiche « fiche à venir » ni « Bientôt en ligne ».
  for (const w of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const slug = 'chirurgie-cataracte';
    if (slugs.includes(slug)) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = []; const cards = [...document.querySelectorAll('.pillar-cards .pillar-card')];
          if (cards.length !== 5) out.push(`${cards.length} cartes (5 attendues)`);
          for (const c of cards) {
            const t = c.querySelector('h3')?.textContent.trim().slice(0, 25) || '?';
            if (c.tagName !== 'A' || !c.getAttribute('href')?.startsWith('/')) out.push(`carte « ${t} » sans lien interne`);
            if (/fiche à venir|bientôt en ligne/i.test(c.textContent)) out.push(`carte « ${t} » encore annoncée « à venir »`);
            const rm = c.querySelector('.read-more');
            if (!rm) { out.push(`carte « ${t} » sans « En savoir plus »`); continue; }
            const cs = getComputedStyle(rm), ps = getComputedStyle(rm, '::after');
            if (cs.pointerEvents === 'none' || getComputedStyle(c).cursor !== 'pointer') out.push(`carte « ${t} » inerte (pointer-events ${cs.pointerEvents}, cursor ${getComputedStyle(c).cursor})`);
            if (parseFloat(ps.width) < 8) out.push(`carte « ${t} » : flèche absente (${ps.width})`);
          }
          return out;
        });
        for (const r of res) failures.push(`${slug} @${w} cartes implants — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} cartes implants — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH22BL-2026-09-17 — cartes pilier sans soulignement : sur /chirurgie-retine et /chirurgie-cataracte à 1 366 et 390 px, aucune
  // a.pillar-card n'a de soulignement calculé (text-decoration-line), et il y a bien des cartes à mesurer.
  for (const w of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['chirurgie-retine', 'chirurgie-cataracte']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate(() => {
          const out = []; const cards = [...document.querySelectorAll('a.pillar-card')];
          if (!cards.length) out.push('aucune a.pillar-card trouvée (page changée ?)');
          for (const c of cards) { const tdl = getComputedStyle(c).textDecorationLine; if (tdl !== 'none') out.push(`carte « ${c.querySelector('h3')?.textContent.trim().slice(0, 25)} » soulignée (${tdl})`); }
          return out;
        });
        for (const r of res) failures.push(`${slug} @${w} cartes pilier — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${w} cartes pilier — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH22BM-2026-09-17 — barre fixe à 200 % de zoom sur ordinateur : à 683 × 450 sans tactile (pointeur fin), en bas de page sur
  // /cataracte et /, la barre fixe est affichée et entièrement dans l'écran, et le corps réserve sa hauteur (padding-bottom > 0) ; à
  // 844 × 390 tactile (téléphone en paysage), elle reste masquée.
  for (const pr of [{ name: '683x450 souris', viewport: { width: 683, height: 450 }, touch: false, expect: 'visible' }, { name: '844x390 tactile', viewport: { width: 844, height: 390 }, touch: true, expect: 'masquée' }]) {
    const ctx = await browser.newContext({ viewport: pr.viewport, deviceScaleFactor: 1, hasTouch: pr.touch, isMobile: pr.touch, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of ['cataracte', 'index']) {
      if (!slugs.includes(slug)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(400);
        const res = await page.evaluate(expect => {
          const out = []; const bar = document.querySelector('nav.sticky-rdv'); if (!bar) return ['barre fixe absente'];
          const cs = getComputedStyle(bar); const r = bar.getBoundingClientRect();
          const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0;
          if (expect === 'visible') {
            if (!shown) out.push(`barre fixe masquée (display ${cs.display}, visibility ${cs.visibility})`);
            else if (r.bottom > innerHeight + 1 || r.top < 0) out.push(`barre fixe hors écran (${Math.round(r.top)}..${Math.round(r.bottom)} pour ${innerHeight})`);
            if (parseFloat(getComputedStyle(document.body).paddingBottom) <= 0) out.push('corps sans réserve de hauteur pour la barre (padding-bottom 0)');
          } else if (shown) out.push('barre fixe visible en paysage bas tactile');
          return out;
        }, pr.expect);
        for (const r of res) failures.push(`${slug} @${pr.name} barre fixe zoom — ${r}`);
        loads++;
      } catch (e) { failures.push(`${slug} @${pr.name} barre fixe zoom — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
  // TECH24BO-2026-09-19 — home à 1 366, 390 et 320 px : boutons à pastille (hero ×2, bloc contact) — pastille ronde de 38 px entièrement
  // dans le bouton, libellé sur une seule ligne à 1 366 et 390 px, bouton ≥ 48 px de haut, nom accessible inchangé ; à 390 px la barre
  // fixe reste masquée tant que le CTA du hero est à l'écran (nav.js observe .hero-buttons .btn-primary).
  for (const w of [1366, 390, 320]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, locale: 'fr-FR', isMobile: w < 500, hasTouch: w < 500 });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    if (slugs.includes('index')) {
      const page = await ctx.newPage();
      try {
        await page.goto(urlFor('index', PORT), { waitUntil: 'networkidle', timeout: 30000 });
        const res = await page.evaluate((w) => {
          const out = []; const btns = [...document.querySelectorAll('main a.hv-btn')].filter(b => !b.classList.contains('hv-call'));
          if (btns.length !== 3) out.push(`${btns.length} boutons à pastille hors accès rapide (3 attendus)`);
          for (const b of btns) {
            const t = b.textContent.trim().slice(0, 22), rb = b.getBoundingClientRect(), ico = b.querySelector('.hv-btn-ico'), lab = b.querySelector('.hv-btn-label');
            if (!ico || !lab) { out.push(`« ${t} » : structure incomplète`); continue; }
            const ri = ico.getBoundingClientRect();
            if (Math.abs(ri.width - 38) > 1 || Math.abs(ri.height - 38) > 1) out.push(`« ${t} » : pastille ${Math.round(ri.width)}×${Math.round(ri.height)} (38 attendu)`);
            if (ri.left < rb.left || ri.right > rb.right + 0.5 || ri.top < rb.top || ri.bottom > rb.bottom + 0.5) out.push(`« ${t} » : pastille hors du bouton`);
            if (rb.height < 48) out.push(`« ${t} » : bouton de ${Math.round(rb.height)} px de haut (48 attendus)`);
            if (w >= 390) { const lines = new Set(); const tw = document.createTreeWalker(lab, NodeFilter.SHOW_TEXT); for (let nd = tw.nextNode(); nd; nd = tw.nextNode()) { if (nd.parentElement.closest('.sr-only') || !nd.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(nd); for (const q of r.getClientRects()) if (q.width > 1) lines.add(Math.round(q.top)); } if (lines.size > 1) out.push(`« ${t} » : libellé sur ${lines.size} lignes`); }
          }
          const cta = document.querySelector('.hero-buttons .btn-primary.hv-btn--rdv');
          if (!cta) out.push('CTA du hero sans .btn-primary (la barre fixe ne se masquerait plus)');
          return out;
        }, w);
        for (const r of res) failures.push(`index @${w} boutons à pastille — ${r}`);
        if (w === 390) {
          await page.evaluate(() => document.querySelector('.hero-buttons .btn-primary').scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(400);
          const vis = await page.evaluate(() => document.body.classList.contains('hero-cta-visible'));
          if (!vis) failures.push('index @390 boutons à pastille — CTA du hero à l’écran mais body sans .hero-cta-visible (barre fixe en double)');
        }
        loads++;
      } catch (e) { failures.push(`index @${w} boutons à pastille — ${String(e).slice(0, 160)}`); }
      await page.close();
    }
    await ctx.close();
  }
} finally { await browser.close(); stop(); }

for (const f of failures) console.log('  ÉCHEC : ' + f);
console.log(`browser : ${slugs.length} pages × ${WIDTHS.length} largeurs (${loads} chargements, ${axeRuns} passes axe), ${failures.length} échec(s).`);
process.exit(failures.length ? 1 : 0);
