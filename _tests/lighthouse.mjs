#!/usr/bin/env node
// Lighthouse mobile (réseau 4G lent simulé) sur les pages clés, servies par serve.py avec les en-têtes de prod.
//   node _tests/lighthouse.mjs [--pages index,decollement-retine,pathologies,secheresse-oculaire]
// Seuils (échec) : performance ≥ 90, accessibilité = 100, bonnes pratiques = 100, SEO = 100,
// CLS ≤ 0,05, LCP ≤ 2,5 s. Avertissement (sans échec) : performance < 95.
// Rapports HTML + JSON dans _tests/reports/ (ignorés par git). Chrome doit être installé
// (CHROME_PATH pour un autre binaire). Code de sortie 1 si un seuil est franchi.
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { urlFor, startServer, TESTS_DIR } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const slugs = (args.pages || 'index,decollement-retine,pathologies,secheresse-oculaire').split(',');
const PORT = 8792;
const OUT = join(TESTS_DIR, 'reports'); mkdirSync(OUT, { recursive: true });
const MIN = { performance: 90, accessibility: 100, 'best-practices': 100, seo: 100 };

const stop = await startServer(PORT);
// Chrome installé (macOS, CI) ou, à défaut, le Chromium de Playwright ; CHROME_PATH force un binaire.
let chromePath = process.env.CHROME_PATH;
if (!chromePath) { try { const pw = await import('playwright'); const p = pw.chromium.executablePath(); if (existsSync(p) && !process.platform.startsWith('darwin') && !process.platform.startsWith('win')) chromePath = p; } catch {} }
const chrome = await launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const failures = [], warns = [];
try {
  for (const slug of slugs) {
    const name = slug === 'index' ? 'home' : slug;
    let r;
    for (let essai = 1; essai <= 3; essai++) {   // les erreurs de trace (NO_NAVSTART…) sont transitoires : jusqu'à 3 essais
      r = await lighthouse(urlFor(slug, PORT), { port: chrome.port, output: ['html', 'json'], logLevel: 'error',
        onlyCategories: Object.keys(MIN), formFactor: 'mobile', screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75 },
        throttlingMethod: 'simulate' });
      if (!r.lhr.runtimeError) break;
      console.log(`  ${name} : essai ${essai} — ${r.lhr.runtimeError.code}`);
    }
    const lhr = r.lhr;
    writeFileSync(join(OUT, `lh-${name}.html`), r.report[0]); writeFileSync(join(OUT, `lh-${name}.json`), r.report[1]);
    if (lhr.runtimeError) { failures.push(`${name} : ${lhr.runtimeError.message}`); continue; }
    const s = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
    const a = lhr.audits;
    const cls = a['cumulative-layout-shift'].numericValue, lcp = a['largest-contentful-paint'].numericValue / 1000;
    console.log(`  ${name.padEnd(22)} perf ${s.performance}  a11y ${s.accessibility}  bp ${s['best-practices']}  seo ${s.seo}  | FCP ${a['first-contentful-paint'].displayValue}  LCP ${a['largest-contentful-paint'].displayValue}  CLS ${cls.toFixed(3)}  TBT ${a['total-blocking-time'].displayValue}`);
    for (const [k, min] of Object.entries(MIN)) if (s[k] < min) failures.push(`${name} : ${k} ${s[k]} < ${min}`);
    if (s.performance < 95) warns.push(`${name} : performance ${s.performance} < 95`);
    if (cls > 0.05) failures.push(`${name} : CLS ${cls.toFixed(3)} > 0,05`);
    if (lcp > 2.5) failures.push(`${name} : LCP ${lcp.toFixed(2)} s > 2,5 s`);
  }
} finally { await chrome.kill(); stop(); }
for (const w of warns) console.log('  avertissement : ' + w);
for (const f of failures) console.log('  ÉCHEC : ' + f);
console.log(`lighthouse : ${slugs.length} pages, ${failures.length} échec(s), ${warns.length} avertissement(s) — rapports dans _tests/reports/`);
process.exit(failures.length ? 1 : 0);
