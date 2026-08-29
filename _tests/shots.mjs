#!/usr/bin/env node
// Captures pleine page pour la régression visuelle d'un lot (avant / après).
//   node _tests/shots.mjs avant                 → _tests/shots/avant/<page>-<largeur>.png (toutes les pages × 390 et 1366)
//   node _tests/shots.mjs apres
//   node _tests/shots.mjs --compare avant apres → % de pixels différents par capture, diffs dans _tests/shots/diff-avant-apres/
// Options : --widths 390,1366  --pages a,b,c. Les captures ne sont pas versionnées (_tests/shots/ ignoré par git).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { pages, urlFor, startServer, TESTS_DIR } from './lib.mjs';

const argv = process.argv.slice(2);
const opts = {}; const pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--') && argv[i] !== '--compare') opts[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]); }
const WIDTHS = (opts.widths || '390,1366').split(',').map(Number);
const SHOTS = join(TESTS_DIR, 'shots');

if (pos[0] === '--compare') {
  const [a, b] = pos.slice(1); const da = join(SHOTS, a), db = join(SHOTS, b), dd = join(SHOTS, `diff-${a}-${b}`);
  mkdirSync(dd, { recursive: true });
  let changed = 0, total = 0;
  for (const f of readdirSync(da).filter(f => f.endsWith('.png')).sort()) {
    if (!existsSync(join(db, f))) { console.log(`  ${f} : absent de ${b}`); continue; }
    const A = PNG.sync.read(readFileSync(join(da, f))), B = PNG.sync.read(readFileSync(join(db, f)));
    total++;
    if (A.width !== B.width || A.height !== B.height) { changed++; console.log(`  ${f} : taille ${A.width}×${A.height} → ${B.width}×${B.height}`); continue; }
    const diff = new PNG({ width: A.width, height: A.height });
    const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.1 });
    const pct = 100 * n / (A.width * A.height);
    if (pct > 0.05) { changed++; writeFileSync(join(dd, f), PNG.sync.write(diff)); console.log(`  ${f} : ${pct.toFixed(2)} % de pixels différents`); }
  }
  console.log(`shots : ${changed}/${total} captures différentes (diffs dans ${dd})`);
  process.exit(0);
}

const label = pos[0]; if (!label) { console.error('usage : node shots.mjs <étiquette> | --compare <a> <b>'); process.exit(2); }
const OUT = join(SHOTS, label); mkdirSync(OUT, { recursive: true });
const PORT = 8793; const stop = await startServer(PORT);
const browser = await chromium.launch();
const slugs = opts.pages ? opts.pages.split(',') : pages();
try {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'reduce' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    for (const slug of slugs) {
      const page = await ctx.newPage();
      await page.goto(urlFor(slug, PORT), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(OUT, `${slug}-${w}.png`), fullPage: true, animations: 'disabled' });
      await page.close();
    }
    await ctx.close();
  }
} finally { await browser.close(); stop(); }
console.log(`shots : ${slugs.length * WIDTHS.length} captures dans ${OUT}`);
