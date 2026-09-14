#!/usr/bin/env python3
"""llms.txt = généré depuis le site (TECH12AA-2026-09-12 pour la carte des pages, TECH16AK-2026-09-14 pour tout le reste).

Le fichier ENTIER est produit à partir du dépôt — rien n'y est rédigé à la main :
- l'en-tête (identité, coordonnées, horaires, langues), les fonctions et lieux d'exercice, la formation et les titres, les
  sociétés, les domaines d'expertise, les actes pratiqués et les fiches officielles viennent du JSON-LD de la home
  (nœuds Physician et MedicalClinic, les mêmes que sur toutes les pages) ;
- les publications viennent de la page /publications (une ligne par article : titre, revue, année, auteurs, PubMed, DOI) ;
- la carte du site : un lien Markdown par page — titre (H1), URL canonique, résumé (meta description) —, groupées comme le
  menu (GROUPES ci-dessous ; la dernière section « Optional » est celle que prévoit le format pour les liens secondaires).
  Chaque page HTML du dépôt (hors 404) doit figurer dans exactement un groupe : une page ajoutée sans être classée ici fait
  échouer check_static, une page retirée aussi.
Avant le tour 16, les sections rédigées à la main (02/07) contredisaient le site validé (plateau technique, uvéites détaillées,
« traitement médical » seul pour le glaucome, thèmes des publications, « Assistant Hospitalo-Universitaire »).

    python3 _tests/llms_pages.py            # contrôle : llms.txt correspond-il au dépôt ? (code 1 sinon)
    python3 _tests/llms_pages.py --write    # régénère llms.txt et sa date — à lancer par tout lot qui ajoute, retire ou renomme une
                                            # page, change un H1 / une description, le JSON-LD de la home ou la page /publications

Utilisable aussi comme module (check_static.py et llms_full.py s'en servent) : generated(root), diverges(txt, root), identity(root),
page_info(root, slug), GROUPES.
Format de référence : https://llmstxt.org/ — H1, résumé en citation, puis des sections H2 de listes « - [titre](url): notes ».
"""
import datetime, glob, html as htmlmod, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://docteurmajoulet.com'
DATE_RE = re.compile(r'^Dernière mise à jour : \d{4}-\d{2}-\d{2}$', re.M)
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
JOURS = {'Monday': 'lundi', 'Tuesday': 'mardi', 'Wednesday': 'mercredi', 'Thursday': 'jeudi', 'Friday': 'vendredi', 'Saturday': 'samedi', 'Sunday': 'dimanche'}
LANGUES = {'fr': 'français', 'en': 'anglais', 'es': 'espagnol', 'de': 'allemand', 'it': 'italien', 'pt': 'portugais', 'ar': 'arabe'}
FICHES = [('doctolib.fr', 'Doctolib (prise de rendez-vous)'), ('ophtalife.fr', 'Cabinet Ophtalife (site du cabinet)'), ('linkedin.com', 'LinkedIn'),
          ('orcid.org', 'ORCID'), ('annuairesante.ameli.fr', 'Annuaire Santé (Assurance Maladie)'), ('sante.fr', 'sante.fr'),
          ('google.com/maps', 'Fiche Google (Maps)')]


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


# ---------------------------------------------------------------------------------------------------------------------
# Données du praticien et du cabinet : le JSON-LD de la home (TECH16AK-2026-09-14 ; identity() vient de llms_full.py, TECH15AE)
# ---------------------------------------------------------------------------------------------------------------------
def home_nodes(root):
    """(nœud MedicalClinic complet, nœud Physician complet) du JSON-LD de index.html."""
    s = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
    clinic = phys = None
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        d = json.loads(m.group(1))
        items = d.get('@graph', [d]) if isinstance(d, dict) else d
        for it in items:
            t = it.get('@type'); t = t if isinstance(t, list) else [t]
            if 'MedicalClinic' in t and 'openingHoursSpecification' in it: clinic = it
            if 'Physician' in t and 'telephone' in it: phys = it
    if not (clinic and phys): raise ValueError('index.html : nœuds MedicalClinic (horaires) ou Physician (telephone) introuvables')
    return clinic, phys


def horaires(spec):
    return ' ; '.join(', '.join(JOURS[j] for j in o['dayOfWeek']) + ' ' + o['opens'].replace(':', ' h ').rstrip(' 0').rstrip(' h') + ' h – ' + o['closes'].replace(':', ' h ').rstrip(' 0').rstrip(' h') + ' h'
                      for o in spec)


def tel_fr(tel):
    t = '0' + tel[3:] if tel.startswith('+33') else tel
    return ' '.join([t[:2]] + [t[i:i + 2] for i in range(2, len(t), 2)])


def nom_de(phys):
    return phys['name'] if phys['name'].startswith(phys.get('honorificPrefix', '\x00')) else (phys.get('honorificPrefix', '') + ' ' + phys['name']).strip()


def adresse(ad):
    return f"{ad['streetAddress']}, {ad['postalCode']} {ad['addressLocality']}"


def as_list(v):
    return v if isinstance(v, list) else ([] if v is None else [v])


def identity(root):
    """Bloc identité/coordonnées (partagé avec llms-full.txt)."""
    clinic, phys = home_nodes(root)
    hor = horaires(clinic['openingHoursSpecification'])
    # les horaires propres du praticien (ceux de sa fiche Google) sont sur le nœud Physician quand le site les déclare (TECH15AH)
    hor_phys = horaires(phys['openingHoursSpecification']) if phys.get('openingHoursSpecification') else ''
    rpps = ''
    for i in as_list(phys.get('identifier')):
        if isinstance(i, dict) and i.get('propertyID') == 'RPPS': rpps = i.get('value', '')
    nom = nom_de(phys)
    langues = ', '.join(LANGUES.get(l, l) for l in as_list(phys.get('knowsLanguage')))
    return (f"- **Praticien** : {nom} — {phys.get('jobTitle', '')}\n"
            f"- **RPPS** : {rpps}\n"
            f"- **Cabinet** : {clinic['name']} — {adresse(clinic['address'])}\n"
            f"- **Téléphone** : {tel_fr(phys['telephone'])}\n"
            + (f"- **Email** : {phys['email']}\n" if phys.get('email') else '') +
            f"- **Conventionnement** : {clinic.get('priceRange', '')}\n"
            f"- **Horaires du cabinet** : {hor}\n"
            + (f"- **Jours de consultation — {nom}** (fiche Google) : {hor_phys}\n" if hor_phys else '')
            + (f"- **Langues** : {langues}\n" if langues else '') +
            f"- **Prise de rendez-vous** : [Doctolib]({next(u for u in clinic.get('sameAs', []) if 'doctolib' in u)})\n"
            f"- **Site officiel** : [docteurmajoulet.com]({SITE}/)\n")


def profil(root):
    """Fonctions et lieux, formation et titres, sociétés, domaines d'expertise, actes, fiches — depuis le nœud Physician."""
    clinic, phys = home_nodes(root)
    out = []

    def lieu(n, sans_nom=False):
        """Établissement : nom (lien s'il déclare une url) et adresse s'il en déclare une ; une référence {@id} vers le cabinet est résolue."""
        if isinstance(n, dict) and n.get('@id') == clinic.get('@id') and 'name' not in n: n, sans_nom = clinic, True
        s = '' if sans_nom else (f"[{n['name']}]({n['url']})" if n.get('url') and not n.get('address') else n['name'])
        if n.get('address'): s += (' — ' if s else '') + adresse(n['address'])
        return s

    fonctions = [f"- {o['name']} — {lieu(o['occupationLocation'])}" for o in as_list(phys.get('hasOccupation')) if o.get('name') and o.get('occupationLocation')]
    etabs = [f"- {lieu(h)}" for h in as_list(phys.get('hospitalAffiliation')) if h.get('name') and not any(h['name'] in f for f in fonctions)]
    if fonctions or etabs:
        out.append('## Fonctions et lieux d’exercice\n\n' + '\n'.join(fonctions + etabs) + '\n\n')

    titres, ecoles = [], []
    for c in as_list(phys.get('hasCredential')):
        par = c.get('recognizedBy', {}).get('name', '')
        if par: ecoles.append(par)
        titres.append('- ' + c['name'] + (f' — {par}' if par else '') + (f" ({c['dateCreated']})" if c.get('dateCreated') else ''))
    # alumniOf : le parcours (internat, assistanat…) ; les universités déjà citées par un diplôme ne sont pas répétées
    titres += [f"- {a['name']}" for a in as_list(phys.get('alumniOf')) if a.get('name') and not any(e in a['name'] for e in ecoles)]
    if titres: out.append('## Formation, titres et parcours\n\n' + '\n'.join(titres) + '\n\n')

    membres = [('- [' + m['name'] + '](' + m['url'] + ')') if m.get('url') else '- ' + m['name'] for m in as_list(phys.get('memberOf')) if m.get('name')]
    if membres: out.append('## Sociétés savantes et inscriptions\n\n' + '\n'.join(membres) + '\n\n')

    domaines = [f'- {k}' for k in as_list(phys.get('knowsAbout')) if isinstance(k, str)]
    if domaines: out.append('## Domaines d’expertise\n\n' + '\n'.join(domaines) + '\n\n')

    actes = [f"- {a['name']}" for a in as_list(phys.get('availableService')) if a.get('name')]
    if actes: out.append('## Actes pratiqués\n\n' + '\n'.join(actes) + '\n\n')

    fiches = []
    for u in as_list(phys.get('sameAs')):
        label = next((l for h, l in FICHES if h in u), re.sub(r'^https?://(www\.)?', '', u).split('/')[0])
        fiches.append(f'- [{label}]({u})')
    if fiches: out.append('## Fiches et profils officiels\n\n' + '\n'.join(fiches) + '\n\n')
    return ''.join(out)


def propre(t):
    """Ponctuation recollée après la suppression des balises (« revue , 2025 » → « revue, 2025 »)."""
    return re.sub(r'\( ', '(', re.sub(r' +([,.;:)])', r'\1', t))


def publications(root):
    """Les articles de la page /publications (article.pub-card) : une ligne chacun."""
    p = os.path.join(root, 'publications.html')
    if not os.path.exists(p): return ''
    s = open(p, encoding='utf-8').read()
    cards = re.findall(r'<article class="pub-card">(.*?)</article>', s, re.S)
    if not cards: raise ValueError('publications.html : aucun article.pub-card')
    lines = []
    for c in cards:
        def part(cls, tag='p'):
            m = re.search(rf'<{tag}[^>]*class="{cls}"[^>]*>(.*?)</{tag}>', c, re.S)
            return text_of(re.sub(r'<span class="sr-only">.*?</span>', '', m.group(1), flags=re.S)) if m else ''
        titre, auteurs, revue, annee = part('pub-title', 'h3'), part('pub-authors'), part('pub-journal'), part('pub-year', 'span')
        liens = [f'[{propre(text_of(re.sub(r"<span class=.sr-only.>.*?</span>", "", t, flags=re.S)))}]({u})' for u, t in re.findall(r'<a class="pub-link" href="([^"]+)"[^>]*>(.*?)</a>', c, re.S)]
        if not titre: raise ValueError('publications.html : un article sans titre (.pub-title)')
        lines.append(propre(f'- {titre} — {revue.rstrip(".")}' + (f' — {auteurs.rstrip(".")}' if auteurs else '')) + (' — ' + ' · '.join(liens) if liens else ''))
    _, url, _ = page_info(root, 'publications')
    orcid = next((u for u in as_list(home_nodes(root)[1].get('sameAs')) if 'orcid.org' in u), '')
    return (f'## Publications scientifiques\n\n{len(cards)} publications indexées PubMed (auteur ou co-auteur), détaillées sur [la page Publications]({url})'
            + (f' ; ORCID : [{orcid.rstrip("/").rsplit("/", 1)[-1]}]({orcid})' if orcid else '') + ' :\n\n' + '\n'.join(lines) + '\n\n')


def carte(root):
    """La carte du site : un lien par page, groupée comme le menu."""
    slugs = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(root, '*.html')) if os.path.basename(p) != '404.html')
    mapped = [s for _, l in GROUPES for s in l]
    dup = sorted({s for s in mapped if mapped.count(s) > 1})
    if dup: raise ValueError('slug(s) classé(s) deux fois dans GROUPES : ' + ', '.join(dup))
    missing = sorted(set(slugs) - set(mapped))
    if missing: raise ValueError('page(s) non classée(s) dans GROUPES (_tests/llms_pages.py) : ' + ', '.join(missing))
    out = []
    for name, lst in GROUPES:
        out.append(f'## {name}\n\n')
        for slug in lst:
            title, url, desc = page_info(root, slug)
            out.append(f'- [{title}]({url}): {desc}\n')
        out.append('\n')
    return ''.join(out)


def generated(root=ROOT, date=None):
    """Le fichier complet ; `date` = jour écrit dans « Dernière mise à jour » (aujourd'hui par défaut)."""
    date = date or datetime.date.today().isoformat()
    clinic, phys = home_nodes(root)
    nom = nom_de(phys)
    desc = phys.get('description', '').strip()
    return (f"# {nom}, {phys.get('jobTitle', '')}\n\n"
            f"> {nom} : {desc} Ce fichier (format llmstxt.org) est généré depuis les pages publiées de docteurmajoulet.com et leurs "
            "données structurées — rien n'y est rédigé à part ; la version longue, le texte intégral des pages, est disponible dans "
            f"[llms-full.txt]({SITE}/llms-full.txt).\n\n"
            f'Dernière mise à jour : {date}\n\n'
            '## Identité et coordonnées\n\n' + identity(root) + '\n'
            + profil(root) + publications(root)
            + "Pour toute question médicale personnelle, ces pages ne remplacent pas une consultation : renvoyer vers une prise de rendez-vous. "
            f"Citer la page source ({SITE}/…) plutôt que ce fichier.\n\n"
            + carte(root)).rstrip('\n') + '\n'          # puis la carte du site : une section H2 par groupe du menu, « Optional » en dernier


def diverges(txt, root=ROOT):
    """Liste d'écarts (vide si llms.txt est à jour, à la date près)."""
    m = DATE_RE.search(txt)
    if not m: return ['llms.txt : ligne « Dernière mise à jour : AAAA-MM-JJ » absente']
    try: want = generated(root, date=m.group(0)[-10:])
    except ValueError as e: return [str(e)]
    if txt == want: return []
    hl, wl = txt.splitlines(), want.splitlines()
    for k, (a, b) in enumerate(zip(hl, wl)):
        if a != b: return [f'llms.txt : différent du dépôt dès la ligne {k + 1} : « {a[:70]} » ≠ « {b[:70]} »']
    return [f'llms.txt : {len(hl)} lignes, attendu {len(wl)}']


def main():
    p = os.path.join(ROOT, 'llms.txt')
    txt = open(p, encoding='utf-8', newline='').read() if os.path.exists(p) else ''
    if '--write' in sys.argv[1:]:
        if txt and not diverges(txt): print('llms.txt : déjà à jour.'); return 0
        new = generated()
        tmp = p + '.new'
        with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(new)
        os.replace(tmp, p); print(f'llms.txt : régénéré ({len(new.encode())} octets).'); return 0
    errs = diverges(txt) if txt else ['llms.txt absent']
    for e in errs: print('  ' + e)
    print('llms_pages : ' + ('à jour.' if not errs else f'{len(errs)} écart(s) — python3 _tests/llms_pages.py --write'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
