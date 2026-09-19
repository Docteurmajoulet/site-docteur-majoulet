// À exécuter dans la page : compte les caractères affichés, sans compter l'indentation HTML.
export async function readingLines(options = {}) {
  await document.fonts.ready;
  const { selector = 'p, li, dd, dt, td, th, figcaption, blockquote, .travaux-ref', minimumText = 60, minimumEm = 30, limit = 90 } = options;
  const out = [];
  const path = el => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += '#' + e.id;
      else if (e.classList.length) s += '.' + [...e.classList].slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('footer, nav, [aria-hidden="true"], .sr-only')) continue;
    const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < minimumText || rect.width < 100 || rect.height === 0 || rect.width / parseFloat(cs.fontSize) <= minimumEm) continue;
    const lines = new Map(), spaces = new Set();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('.sr-only, [aria-hidden="true"]')) continue;
      const style = getComputedStyle(node.parentElement);
      if (style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
      const preserve = ['pre', 'pre-wrap', 'break-spaces'].includes(style.whiteSpace);
      // Range peut renvoyer le même rectangle pour chacun des espaces source fusionnés.
      // Un groupe d'espaces HTML compte donc une seule fois ; une espace insécable reste un caractère.
      const tokens = node.textContent.matchAll(preserve ? /[^]/gu : /[^\t\n\r\f ]|[\t\n\r\f ]+/gu);
      const range = document.createRange();
      for (const token of tokens) {
        range.setStart(node, token.index);
        range.setEnd(node, token.index + token[0].length);
        const collapsedSpace = !preserve && /^[\t\n\r\f ]+$/.test(token[0]);
        // Chromium peut conserver un résidu d'arrondi de 1/64 px pour une espace supprimée en fin de ligne.
        const rr = [...range.getClientRects()].find(r => r.width > (collapsedSpace ? 0.5 : 0) && r.height > 0);
        if (!rr) continue;
        if (collapsedSpace) {
          const key = [rr.left, rr.top, rr.width, rr.height].map(v => v.toFixed(2)).join(':');
          if (spaces.has(key)) continue;
          spaces.add(key);
        }
        const line = Math.round(rr.top / 6);
        lines.set(line, (lines.get(line) || 0) + 1);
      }
    }
    const max = Math.max(0, ...lines.values());
    if (max > limit) out.push({ selector: path(el), max, lines: [...lines.values()], width: Math.round(rect.width), fontSize: cs.fontSize, text });
  }
  return out;
}
