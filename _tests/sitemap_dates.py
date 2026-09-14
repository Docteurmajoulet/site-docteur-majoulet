#!/usr/bin/env python3
"""lastmod du sitemap = date de mise à jour de la page (TECH16AL-2026-09-14).

Chaque page indexable affiche sa date de mise à jour (« Dernière mise à jour : <time datetime> »), reprise dans son JSON-LD
(lastReviewed / dateModified — check_static vérifie l'égalité depuis le tour 4). Le sitemap portait une troisième date, tenue
à la main et bumpée par des lots techniques (31 pages sur 45 en écart le 14/09 : ex. /retinopathie-diabetique affichée
« 20 avril 2026 », lastmod 2026-08-21, alors qu'aucun lot n'avait bumpé le sitemap depuis les nœuds JSON-LD de septembre) :
Google ne se sert de lastmod que s'il est cohérent avec les autres dates de la page, sinon il l'ignore.
Désormais lastmod = dateModified du JSON-LD de la page (la date validée, la même que celle affichée) — une seule date par page.

    python3 _tests/sitemap_dates.py            # contrôle : liste les écarts (code 1 s'il y en a)
    python3 _tests/sitemap_dates.py --write    # réécrit les lastmod (à lancer par tout lot qui change la date d'une page)

Utilisable comme module (check_static.py s'en sert) : diverges(root), sync(xml, root).
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://docteurmajoulet.com'
ENTRY = re.compile(r'(<loc>\s*' + re.escape(SITE) + r'/([^<\s]*)\s*</loc>\s*<lastmod>)(\d{4}-\d{2}-\d{2})(</lastmod>)')


def page_date(root, slug):
    """dateModified (la plus récente) du JSON-LD de la page ; '' si absente."""
    p = os.path.join(root, (slug or 'index') + '.html')
    if not os.path.exists(p): raise ValueError(f'{slug or "index"}.html : page du sitemap absente du dépôt')
    s = open(p, encoding='utf-8').read()
    d = re.findall(r'"dateModified":\s*"(\d{4}-\d{2}-\d{2})', s)
    return max(d) if d else ''


def diverges(root=ROOT, xml=None):
    """Liste d'écarts (vide si chaque lastmod = dateModified de sa page)."""
    if xml is None:
        p = os.path.join(root, 'sitemap.xml')
        if not os.path.exists(p): return ['sitemap.xml absent']
        xml = open(p, encoding='utf-8').read()
    out = []
    for m in ENTRY.finditer(xml):
        slug, lm = m.group(2), m.group(3)
        try: dm = page_date(root, slug)
        except ValueError as e: out.append(str(e)); continue
        if dm and lm != dm: out.append(f'sitemap : /{slug} lastmod {lm} ≠ dateModified {dm} de la page')
    return out


def sync(xml, root=ROOT):
    """Le sitemap avec chaque lastmod aligné sur la page."""
    def fix(m):
        dm = page_date(root, m.group(2))
        return m.group(1) + (dm or m.group(3)) + m.group(4)
    return ENTRY.sub(fix, xml)


def main():
    p = os.path.join(ROOT, 'sitemap.xml')
    xml = open(p, encoding='utf-8', newline='').read()
    if '--write' in sys.argv[1:]:
        new = sync(xml)
        if new == xml: print('sitemap.xml : déjà à jour.'); return 0
        tmp = p + '.new'
        with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(new)
        os.replace(tmp, p); print(f'sitemap.xml : {len(diverges(xml=xml))} lastmod réécrit(s).'); return 0
    errs = diverges(xml=xml)
    for e in errs: print('  ' + e)
    print('sitemap_dates : ' + ('à jour.' if not errs else f'{len(errs)} écart(s) — python3 _tests/sitemap_dates.py --write'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
