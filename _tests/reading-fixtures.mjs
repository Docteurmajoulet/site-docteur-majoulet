import assert from 'node:assert/strict';
import { readingLines } from './reading.mjs';

// Même texte visible, même mesure quelle que soit la mise en forme du fichier HTML.
export async function assertReadingFixtures(browser) {
  const page = await browser.newPage();
  const measure = async (html, css = '') => {
    await page.setContent(`<style>p{font:20px/30px monospace;width:240px;margin:0}strong{font-weight:inherit}${css}</style><p>${html}</p>`);
    const [result] = await page.evaluate(readingLines, { minimumText: 0, minimumEm: 0, limit: 0 });
    return { lines: result.lines, text: await page.locator('p').innerText(), height: await page.locator('p').evaluate(el => el.clientHeight) };
  };
  try {
    const plain = await measure('Alpha beta gamma delta epsilon zeta eta theta');
    const indented = await measure('\n                Alpha beta gamma\n                delta epsilon zeta\n                eta theta\n              ');
    assert.deepEqual(indented, plain, 'L’indentation source ne doit pas modifier la mesure du texte affiché');
    assert.deepEqual((await measure('Alpha beta')).lines, [10]);
    assert.deepEqual((await measure('Alpha \n <strong> beta</strong>')).lines, [10], 'Les espaces fusionnent aussi entre nœuds en ligne');
    assert.deepEqual((await measure('Alpha&nbsp;beta')).lines, [10], 'L’espace insécable est comptée');
    assert.deepEqual((await measure('Alpha<br>beta')).lines, [5, 4]);
    assert.deepEqual((await measure('Alpha    beta', 'p{white-space:pre-wrap}')).lines, [13], 'Les espaces préservées sont toutes comptées');
    assert.deepEqual((await measure('Alpha<span hidden> invisible</span> beta')).lines, [10]);
    console.log('Lisibilité : 7 cas de régression réussis.');
  } finally { await page.close(); }
}
