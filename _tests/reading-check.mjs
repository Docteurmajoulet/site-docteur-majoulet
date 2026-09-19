// Rejoue uniquement le contrôle de longueur de ligne et ses cas de régression.
import { chromium } from 'playwright';
import { pages, urlFor, startServer } from './lib.mjs';
import { readingLines } from './reading.mjs';
import { assertReadingFixtures } from './reading-fixtures.mjs';

const stop = await startServer(8797);
const browser = await chromium.launch();
let loads = 0;
const failures = [];
try {
  await assertReadingFixtures(browser);
  for (const width of [1366, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    for (const slug of pages()) {
      await page.goto(urlFor(slug, 8797), { waitUntil: 'networkidle' });
      const long = await page.evaluate(readingLines);
      failures.push(...long.map(result => ({ slug, width, ...result })));
      loads++;
    }
    await ctx.close();
  }
  console.log(JSON.stringify({ loads, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally { await browser.close(); stop(); }
