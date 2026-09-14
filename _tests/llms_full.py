#!/usr/bin/env python3
"""llms-full.txt = le texte intégral des pages du site, en Markdown (TECH15AE-2026-09-14).

Le fichier est GÉNÉRÉ depuis les pages HTML du dépôt : rien n'y est écrit à la main, chaque phrase existe sur une page
publiée (validée), dans l'ordre de la carte du site (GROUPES de _tests/llms_pages.py). Par page : titre (H1), URL
canonique, description (meta), date de relecture (JSON-LD lastReviewed / dateModified), puis le contenu de <main> converti
en Markdown — titres, paragraphes, listes, tableaux, questions-réponses, liens en absolu — sans le chrome (fil d'Ariane,
sommaire, boutons de rendez-vous, pages liées, carte). L'en-tête (identité, coordonnées, horaires) vient du JSON-LD de la home.

    python3 _tests/llms_full.py            # contrôle : llms-full.txt correspond-il aux pages ? (code 1 sinon)
    python3 _tests/llms_full.py --write    # régénère llms-full.txt et sa date — à lancer par tout lot qui modifie le texte d'une page

Utilisable comme module (check_static.py s'en sert) : generated(root), diverges(txt, root).
Format de référence : https://llmstxt.org/ (« llms-full.txt » = version longue de llms.txt).
"""
import datetime, json, os, re, sys
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llms_pages

ROOT = llms_pages.ROOT
SITE = 'https://docteurmajoulet.com'
DATE_RE = re.compile(r'^Dernière mise à jour : \d{4}-\d{2}-\d{2}$', re.M)
SKIP_TAGS = {'script', 'style', 'svg', 'noscript', 'iframe', 'template', 'button', 'picture', 'img', 'source', 'form', 'input', 'select', 'label', 'nav'}
SKIP_CLASSES = {'breadcrumb-mini', 'toc', 'cta-block', 'cta-actions', 'cta-alt', 'related-pathologies', 'hero-buttons', 'hero-visual', 'hero-photo',
                'hero-oct', 'map-facade', 'contact-map', 'cv12-action', 'sr-only', 'visually-hidden', 'skip-link', 'header-meta',
                'drawer-actions', 'placeholder-block', 'hero-chips', 'pub-links', 'external-links', 'specialty-icon', 'usp-check'}
BLOCK = {'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
         'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'details', 'summary', 'address', 'hr'}


class ToMarkdown(HTMLParser):
    """Convertit le contenu d'un <main> en Markdown simple (titres décalés de `shift` niveaux)."""

    def __init__(self, shift=2):
        super().__init__(convert_charrefs=True)
        self.shift, self.out, self.buf = shift, [], []
        self.stack, self.skip_depth, self.list_stack = [], 0, []
        self.heading, self.link, self.cell, self.row, self.table = None, None, None, None, None
        self.inline = 0                                # > 0 : dans un .key-fact (chiffre + libellé sur une ligne)

    # ---- helpers
    def flush(self, prefix=''):
        raw = ''.join(self.buf); self.buf = []
        if self.link is not None:                      # lien qui contient des blocs : chaque bloc devient un lien à part
            raw = self.wrap_link(raw); self.buf = ['\x02']
        t = re.sub(r'[ \t\r\n]+', ' ', raw).strip()
        if t: self.out.append(prefix + t)

    def wrap_link(self, raw):
        i = raw.rfind('\x02')
        if i < 0: return raw
        text = re.sub(r'[ \t\r\n]+', ' ', raw[i + 1:]).strip()
        href = self.link
        if href.startswith('/'): href = SITE + href
        elif not href.startswith(('http://', 'https://', 'mailto:', 'tel:')): href = SITE + '/' + href
        return raw[:i] + (f'[{text}]({href})' if text else '')

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = set((a.get('class') or '').split())
        if self.skip_depth or tag in SKIP_TAGS or cls & SKIP_CLASSES or a.get('hidden') is not None or a.get('aria-hidden') == 'true':
            if tag not in ('br', 'hr', 'img', 'input', 'source', 'wbr', 'meta', 'link'): self.skip_depth += 1
            return
        if tag == 'br': self.buf.append(' / '); return
        if tag == 'hr': self.flush(); return
        if 'key-fact' in cls and 'key-facts' not in cls:
            self.flush(); self.inline += 1; self.buf.append('\x00LI- '); self.stack.append('\x00KF'); return
        if self.inline:                                # dans un .key-fact : chiffre en gras, « — », libellé
            if 'key-fact-number' in cls: self.buf.append('**'); self.stack.append('\x00NUM'); return
            if 'key-fact-label' in cls: self.buf.append(' — ')
            self.stack.append(tag); return
        if tag == 'span' and cls and self.buf and ''.join(self.buf)[-1:] not in (' ', '\n', '\t', '\x02', '*', '(', '['): self.buf.append(' ')
        if tag in ('strong', 'b'): self.buf.append('**')
        elif tag in ('em', 'i'): self.buf.append('*')
        elif tag == 'a' and a.get('href') and not a['href'].startswith('#') and self.link is None:
            self.link = a['href']; self.buf.append('\x02')
        elif tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.flush(); self.heading = int(tag[1])
        elif tag in ('ul', 'ol'):
            self.flush(); self.list_stack.append([tag, 0])
        elif tag == 'li':
            self.flush()
            if self.list_stack:
                self.list_stack[-1][1] += 1
                self.buf.append('\x00LI' + ('%d. ' % self.list_stack[-1][1] if self.list_stack[-1][0] == 'ol' else '- '))
        elif tag == 'table':
            self.flush(); self.table = []
        elif tag == 'tr' and self.table is not None: self.row = []
        elif tag in ('td', 'th') and self.row is not None: self.cell = []
        elif tag == 'blockquote': self.flush(); self.buf.append('\x00BQ')
        elif tag == 'dt': self.flush(); self.buf.append('\x00DT')
        elif tag in BLOCK: self.flush()
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if self.skip_depth:
            if tag not in ('br', 'hr', 'img', 'input', 'source', 'wbr', 'meta', 'link'): self.skip_depth -= 1
            return
        if self.inline:
            top = self.stack.pop() if self.stack else None
            if top == '\x00KF': self.inline -= 1; self.flush()
            elif top == '\x00NUM': self.buf.append('**')
            return
        if tag in ('strong', 'b'): self.buf.append('**')
        elif tag in ('em', 'i'): self.buf.append('*')
        elif tag == 'a' and self.link is not None:
            self.buf = [self.wrap_link(''.join(self.buf))]; self.link = None
        elif tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6') and self.heading:
            lvl = min(6, self.heading + self.shift); self.heading = None
            self.flush('#' * lvl + ' ')
        elif tag in ('ul', 'ol'):
            self.flush()
            if self.list_stack: self.list_stack.pop()
        elif tag == 'li': self.flush()
        elif tag in ('td', 'th') and self.cell is not None:
            t = re.sub(r'[ \t\r\n]+', ' ', ''.join(self.buf)).strip(); self.buf = []
            self.row.append(t.replace('|', '\\|')); self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.row: self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            rows = self.table; self.table = None
            if rows:
                w = max(len(r) for r in rows)
                rows = [r + [''] * (w - len(r)) for r in rows]
                self.out.append('| ' + ' | '.join(rows[0]) + ' |')
                self.out.append('|' + '---|' * w)
                for r in rows[1:]: self.out.append('| ' + ' | '.join(r) + ' |')
        elif tag in BLOCK: self.flush()

    def handle_data(self, data):
        if self.skip_depth: return
        self.buf.append(data.replace('\u00a0', ' ').replace('\u202f', ' '))

    def result(self):
        self.flush()
        lines = []
        for l in self.out:
            l = l.replace('\x00LI', '').replace('\x00BQ', '> ')
            if l.startswith('\x00DT'): l = '**' + l[3:] + ' :**'
            l = re.sub(r'\*\*\s*\*\*', '', l)          # gras vide
            l = re.sub(r' +([,.)])', r'\1', l) if not l.startswith('|') else l
            l = l.replace('( ', '(').replace(' )', ')')
            l = re.sub(r'\s+$', '', l)
            if l: lines.append(l)
        # une liste : items consécutifs sans ligne vide ; le reste : paragraphes séparés par une ligne vide
        out, prev_item = [], False
        for l in lines:
            item = bool(re.match(r'(- |\d+\. |\|)', l))
            if out and not (item and prev_item): out.append('')
            out.append(l); prev_item = item
        return '\n'.join(out).strip() + '\n'


def page_markdown(root, slug):
    """Contenu Markdown de <main> d'une page (titres décalés : H2 de la page → ####)."""
    s = open(os.path.join(root, slug + '.html'), encoding='utf-8').read()
    m = re.search(r'<main[^>]*>(.*?)</main>', s, re.S)
    if not m: raise ValueError(f'{slug}.html : <main> introuvable')
    body = re.sub(r'<h1\b.*?</h1>', '', m.group(1), count=1, flags=re.S)   # le H1 est le titre de la section
    p = ToMarkdown(shift=2); p.feed(body); p.close()
    return p.result()


def page_meta(root, slug):
    """Date de relecture (lastReviewed, sinon dateModified) lue dans le JSON-LD de la page ; '' si absente."""
    s = open(os.path.join(root, slug + '.html'), encoding='utf-8').read()
    dates = re.findall(r'"(?:lastReviewed|dateModified)":\s*"(\d{4}-\d{2}-\d{2})', s)
    return max(dates) if dates else ''


def identity(root):
    """Bloc identité/coordonnées depuis le JSON-LD de la home (nœud MedicalClinic complet + nœud Physician)."""
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
    jours = {'Monday': 'lundi', 'Tuesday': 'mardi', 'Wednesday': 'mercredi', 'Thursday': 'jeudi', 'Friday': 'vendredi', 'Saturday': 'samedi', 'Sunday': 'dimanche'}
    hor = ' ; '.join(', '.join(jours[j] for j in o['dayOfWeek']) + ' ' + o['opens'].replace(':', ' h ').rstrip(' 0').rstrip(' h') + ' h – ' + o['closes'].replace(':', ' h ').rstrip(' 0').rstrip(' h') + ' h'
                     for o in clinic['openingHoursSpecification'])
    ad = clinic['address']
    rpps = ''
    idf = phys.get('identifier'); idf = idf if isinstance(idf, list) else [idf]
    for i in idf:
        if isinstance(i, dict) and i.get('propertyID') == 'RPPS': rpps = i.get('value', '')
    tel = phys['telephone']
    tel_fr = '0' + tel[3:] if tel.startswith('+33') else tel
    tel_fr = ' '.join([tel_fr[:2]] + [tel_fr[i:i + 2] for i in range(2, len(tel_fr), 2)])
    nom = phys['name'] if phys['name'].startswith(phys.get('honorificPrefix', '\x00')) else (phys.get('honorificPrefix', '') + ' ' + phys['name']).strip()
    return (f"- **Praticien** : {nom} — {phys.get('jobTitle', '')}\n"
            f"- **RPPS** : {rpps}\n"
            f"- **Cabinet** : {clinic['name']} — {ad['streetAddress']}, {ad['postalCode']} {ad['addressLocality']}\n"
            f"- **Téléphone** : {tel_fr}\n"
            f"- **Conventionnement** : {clinic.get('priceRange', '')}\n"
            f"- **Horaires du cabinet** : {hor}\n"
            f"- **Prise de rendez-vous** : [Doctolib]({next(u for u in clinic.get('sameAs', []) if 'doctolib' in u)})\n"
            f"- **Site officiel** : [docteurmajoulet.com]({SITE}/)\n")


def generated(root=ROOT, date=None):
    """Le fichier complet ; `date` = jour écrit dans « Dernière mise à jour » (aujourd'hui par défaut)."""
    date = date or datetime.date.today().isoformat()
    out = ['# Dr Alexandre Majoulet — Chirurgien Ophtalmologue & Rétinologue (dossier complet)\n\n',
           f"> Version longue de [llms.txt]({SITE}/llms.txt) : le texte intégral des pages de docteurmajoulet.com, converti en Markdown depuis "
           "les pages publiées (généré par _tests/llms_full.py — rien n'est rédigé à part). Chaque section est une page du site : titre, URL "
           "canonique, description, date de relecture, puis son contenu. Le Dr Alexandre Majoulet est chirurgien ophtalmologue spécialisé en "
           "chirurgie vitréo-rétinienne, co-fondateur du Cabinet Ophtalife à Boulogne-Billancourt (92) et praticien au CHNO des Quinze-Vingts (Paris).\n\n",
           f'Dernière mise à jour : {date}\n\n',
           '## Identité et coordonnées\n\n', identity(root), '\n',
           "Pour toute question médicale personnelle, ces pages ne remplacent pas une consultation : renvoyer vers une prise de rendez-vous. "
           f"Citer la page source ({SITE}/…) plutôt que ce fichier.\n\n"]
    slugs = sorted(os.path.basename(p)[:-5] for p in os.listdir(root) if p.endswith('.html') and p != '404.html')
    mapped = [s for _, l in llms_pages.GROUPES for s in l]
    missing = sorted(set(slugs) - set(mapped))
    if missing: raise ValueError('page(s) non classée(s) dans GROUPES (_tests/llms_pages.py) : ' + ', '.join(missing))
    for name, lst in llms_pages.GROUPES:
        if name == 'Optional': continue                       # pages légales : hors dossier
        out.append(f'## {name}\n\n')
        for slug in lst:
            title, url, desc = llms_pages.page_info(root, slug)
            d = page_meta(root, slug)
            out.append(f'### {title}\n\n- URL : {url}\n- Description : {desc}\n' + (f'- Relu le : {d}\n' if d else '') + '\n')
            out.append(page_markdown(root, slug) + '\n')
    return ''.join(out)


def diverges(txt, root=ROOT):
    """Liste d'écarts (vide si llms-full.txt est à jour, à la date près)."""
    m = DATE_RE.search(txt)
    if not m: return ['llms-full.txt : ligne « Dernière mise à jour : AAAA-MM-JJ » absente']
    try: want = generated(root, date=m.group(0)[-10:])
    except ValueError as e: return [str(e)]
    if txt == want: return []
    hl, wl = txt.splitlines(), want.splitlines()
    for k, (a, b) in enumerate(zip(hl, wl)):
        if a != b: return [f'llms-full.txt : différent des pages du dépôt dès la ligne {k + 1} : « {a[:70]} » ≠ « {b[:70]} »']
    return [f'llms-full.txt : {len(hl)} lignes, attendu {len(wl)}']


def main():
    p = os.path.join(ROOT, 'llms-full.txt')
    txt = open(p, encoding='utf-8', newline='').read() if os.path.exists(p) else ''
    if '--write' in sys.argv[1:]:
        if txt and not diverges(txt): print('llms-full.txt : déjà à jour.'); return 0
        new = generated()
        tmp = p + '.new'
        with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(new)
        os.replace(tmp, p); print(f'llms-full.txt : régénéré ({len(new.encode())} octets).'); return 0
    errs = diverges(txt) if txt else ['llms-full.txt absent']
    for e in errs: print('  ' + e)
    print('llms_full : ' + ('à jour.' if not errs else f'{len(errs)} écart(s) — python3 _tests/llms_full.py --write'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
