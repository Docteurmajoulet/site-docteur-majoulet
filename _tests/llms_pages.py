#!/usr/bin/env python3
"""Carte du site dans llms.txt = les pages réelles (TECH12AA-2026-09-12).

Le bloc de llms.txt compris entre les repères « <!-- pages:début --> » et « <!-- pages:fin --> » est GÉNÉRÉ à partir des
pages du dépôt : un lien Markdown par page — titre (H1 de la page), URL canonique, résumé (meta description) —, groupées
comme le menu du site (GROUPES ci-dessous ; la dernière section « Optional » est celle que prévoit le format llms.txt
pour les liens secondaires). Chaque page HTML du dépôt (hors 404) doit figurer dans exactement un groupe : une page
ajoutée sans être classée ici fait échouer check_static, une page retirée aussi.

    python3 _tests/llms_pages.py            # contrôle : liste les écarts (code 1 s'il y en a)
    python3 _tests/llms_pages.py --write    # régénère le bloc et la date « Dernière mise à jour » (à lancer par tout lot
                                            # qui ajoute, retire ou renomme une page, ou change un H1 / une description)

Utilisable aussi comme module (check_static.py s'en sert) : generated(root), diverges(txt, root), sync(txt, root).
Format de référence : https://llmstxt.org/ — H1, résumé en citation, puis des sections H2 de listes « - [titre](url): notes ».
"""
import datetime, glob, html as htmlmod, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START, END = '<!-- pages:début — bloc généré par _tests/llms_pages.py, ne pas éditer à la main -->\n', '<!-- pages:fin -->\n'
GROUPES = [
    ('Cabinet, prise de rendez-vous et urgences', ['index', 'le-dr-majoulet', 'contact', 'ophtalmologue-boulogne-billancourt', 'urgences-ophtalmologiques', 'publications', 'pathologies']),
    ('DMLA', ['dmla', 'dmla-seche', 'injection-intravitreenne', 'grille-amsler']),
    ('Chirurgie de la rétine', ['chirurgie-retine', 'vitrectomie', 'decollement-retine', 'membrane-epiretinienne', 'trou-maculaire', 'hemorragie-intravitreenne', 'luxation-cristallin-implant']),
    ('Signes d’alerte — le jour même ou sous 24-48 h', ['dechirure-retine-corps-flottants', 'flashs-phosphenes-myodesopsies', 'decollement-posterieur-vitre', 'baisse-brutale-vision']),
    ('Cataracte et implants', ['chirurgie-cataracte', 'cataracte', 'implants-monofocaux', 'implants-toriques', 'implants-multifocaux', 'cataracte-secondaire-laser-yag']),
    ('Lasers', ['photocoagulation-laser']),
    ('Rétine médicale', ['retinopathie-diabetique', 'occlusions-veineuses', 'occlusion-artere-centrale-retine', 'oedeme-maculaire-cystoide', 'chorioretinopathie-sereuse-centrale', 'myopie-forte', 'neovaisseaux-choroidiens-myope-fort', 'retinite-pigmentaire', 'suivi-diabete-hta']),
    ('Glaucome', ['glaucome']),
    ('Surface oculaire', ['secheresse-oculaire']),
    ('Vue et corrections optiques', ['suivi-corrections-optiques', 'myopie', 'hypermetropie']),
    ('Enfant', ['depistage-visuel-enfant', 'amblyopie']),
    ('Optional', ['mentions-legales', 'confidentialite']),
]


def text_of(fragment):
    s = re.sub(r'<[^>]+>', ' ', fragment)
    s = htmlmod.unescape(s)
    return re.sub(r'[ \t\r\n]+', ' ', s).strip()


def page_info(root, slug):
    """(titre H1, URL canonique, meta description) d'une page ; ValueError si l'un manque."""
    p = os.path.join(root, slug + '.html')
    if not os.path.exists(p): raise ValueError(f'{slug}.html : page absente du dépôt (retirer le slug de GROUPES dans _tests/llms_pages.py)')
    s = open(p, encoding='utf-8').read()
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', s)
    desc = re.search(r'<meta name="description" content="([^"]*)"', s)
    if not (h1 and canon and desc): raise ValueError(f'{slug}.html : H1, canonical ou meta description introuvable')
    title = text_of(h1.group(1)).replace('[', '(').replace(']', ')')
    return title, canon.group(1), text_of(htmlmod.unescape(desc.group(1)))


def generated(root=ROOT):
    """Le bloc complet (repères compris)."""
    slugs = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(root, '*.html')) if os.path.basename(p) != '404.html')
    mapped = [s for _, l in GROUPES for s in l]
    dup = sorted({s for s in mapped if mapped.count(s) > 1})
    if dup: raise ValueError('slug(s) classé(s) deux fois dans GROUPES : ' + ', '.join(dup))
    missing = sorted(set(slugs) - set(mapped))
    if missing: raise ValueError('page(s) non classée(s) dans GROUPES (_tests/llms_pages.py) : ' + ', '.join(missing))
    out = [START, '\n']
    for name, lst in GROUPES:
        out.append(f'## {name}\n\n')
        for slug in lst:
            title, url, desc = page_info(root, slug)
            out.append(f'- [{title}]({url}): {desc}\n')
        out.append('\n')
    out.append(END)
    return ''.join(out)


def current_block(txt):
    i, j = txt.find(START), txt.find(END)
    if i < 0 or j < 0 or j < i: return None
    return txt[i:j + len(END)]


def diverges(txt, root=ROOT):
    """Liste d'écarts (vide si llms.txt est à jour)."""
    try: want = generated(root)
    except ValueError as e: return [str(e)]
    have = current_block(txt)
    if have is None: return ['llms.txt : repères « pages:début » / « pages:fin » introuvables']
    if have == want:
        return []
    hl, wl = have.splitlines(), want.splitlines()
    for k, (a, b) in enumerate(zip(hl, wl)):
        if a != b: return [f'llms.txt : bloc des pages différent des pages du dépôt dès la ligne {k + 1} du bloc : « {a[:70]} » ≠ « {b[:70]} »']
    return [f'llms.txt : bloc des pages de {len(hl)} lignes, attendu {len(wl)}']


def sync(txt, root=ROOT):
    """llms.txt avec le bloc régénéré et la date du jour."""
    have = current_block(txt)
    if have is None: raise ValueError('llms.txt : repères « pages:début » / « pages:fin » introuvables')
    out = txt.replace(have, generated(root))
    if out != txt:
        out = re.sub(r'^Dernière mise à jour : \d{4}-\d{2}-\d{2}$', 'Dernière mise à jour : ' + datetime.date.today().isoformat(), out, count=1, flags=re.M)
    return out


def main():
    p = os.path.join(ROOT, 'llms.txt')
    txt = open(p, encoding='utf-8', newline='').read()
    if '--write' in sys.argv[1:]:
        new = sync(txt)
        if new == txt: print('llms.txt : déjà à jour.'); return 0
        tmp = p + '.new'
        with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(new)
        os.replace(tmp, p); print('llms.txt : bloc des pages régénéré.'); return 0
    errs = diverges(txt)
    for e in errs: print('  ' + e)
    print('llms_pages : ' + ('à jour.' if not errs else f'{len(errs)} écart(s) — python3 _tests/llms_pages.py --write'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
