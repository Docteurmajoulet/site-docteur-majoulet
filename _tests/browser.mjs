#!/usr/bin/env node
// Tests navigateur — toutes les pages × 4 largeurs, sous la CSP de production (servie par serve.py).
//   node _tests/browser.mjs [--widths 320,390,768,1366] [--pages a,b,c] [--axe-widths 390,1366]
// Par page et largeur : aucune erreur console, aucune exception, aucune violation CSP, aucune requête
// interne en échec, aucun débordement horizontal ; axe-core (WCAG 2.x A/AA + bonnes pratiques) : 0 violation.
// Les requêtes externes (Doctolib, Google Maps…) sont bloquées pour rester hermétique. Code de sortie 1 si échec.
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
} finally { await browser.close(); stop(); }

for (const f of failures) console.log('  ÉCHEC : ' + f);
console.log(`browser : ${slugs.length} pages × ${WIDTHS.length} largeurs (${loads} chargements, ${axeRuns} passes axe), ${failures.length} échec(s).`);
process.exit(failures.length ? 1 : 0);
