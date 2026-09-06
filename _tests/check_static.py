#!/usr/bin/env python3
"""Contrôles statiques du site docteurmajoulet.com — sans dépendance (python3 ≥ 3.8).

    python3 _tests/check_static.py            # depuis la racine du dépôt (_deploy-site)
    python3 _tests/check_static.py --root .   # ou en précisant la racine

Vérifie en quelques secondes ce qui casse silencieusement entre deux lots :
  - inventaire : pages HTML ↔ sitemap.xml (noindex exclus), robots.txt, manifest et favicons ;
  - par page : lang, charset, viewport, title unique, meta description (longueur), canonical = URL
    « propre », un seul H1, hiérarchie des titres sans saut, Open Graph + Twitter, JSON-LD valide (URLs internes existantes),
    images avec alt + width/height, ids uniques, liens internes résolus (fichier ET ancre #id),
    liens externes en target=_blank avec rel=noopener, aucune URL interne en .html ou en http:// ;
  - sécurité : un seul script inline (celui autorisé par la CSP), dont le hash sha256 est bien celui
    déclaré dans _headers ; aucun autre <script> inline ; nav.js et main.css référencés avec le même
    ?v= sur toutes les pages, fichiers présents ;
  - _redirects : cibles internes existantes, règles forcées (« ! ») quand le chemin existe ; sitemap : lastmod valides ; security.txt non expiré ;
  - dates : la date de révision affichée (en <time datetime>) = lastReviewed du JSON-LD, dateModified présent et
    postérieur ou égal, lastmod du sitemap postérieur ou égal ; nœuds Physician et MedicalClinic avec leur @id ;
  - règles éditoriales du Dr Majoulet : « baisse brutale » jamais seul (toujours « … de la vision »),
    jamais « OPTAM », jamais « 24/7 ».
Sortie : liste des erreurs (code 1) et des avertissements (code 0).
"""
import argparse, base64, datetime, glob, hashlib, html, json, os, re, sys
from html.parser import HTMLParser

DOMAIN = 'https://docteurmajoulet.com'
NOINDEX_OK_OUTSIDE_SITEMAP = True
DESC_MAX = 165


class Page:
    """Extraction légère (regex + HTMLParser) d'une page."""
    def __init__(self, path):
        self.path = path; self.name = os.path.basename(path); self.slug = self.name[:-5]
        self.txt = open(path, encoding='utf-8').read()
        self.ids, self.tags, self.headings, self.links, self.imgs, self.scripts = set(), [], [], [], [], []
        self.dup_ids = set()
        p = _Parser(self); p.feed(self.txt)

    def pretty_url(self):
        return DOMAIN + '/' if self.slug == 'index' else f'{DOMAIN}/{self.slug}'

    def meta(self, attr, value):
        m = re.search(r'<meta\s+[^>]*?' + attr + r'="' + re.escape(value) + r'"[^>]*?content="([^"]*)"', self.txt)
        if not m:
            m = re.search(r'<meta\s+[^>]*?content="([^"]*)"[^>]*?' + attr + r'="' + re.escape(value) + r'"', self.txt)
        return html.unescape(m.group(1)) if m else None


class _Parser(HTMLParser):
    def __init__(self, page):
        super().__init__(); self.pg = page; self._script = None; self._heading = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs); pg = self.pg
        if 'id' in a:
            if a['id'] in pg.ids: pg.dup_ids.add(a['id'])
            pg.ids.add(a['id'])
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self._heading = tag; pg.headings.append([tag, ''])
        if tag == 'a' and 'href' in a: pg.links.append(a)
        if tag == 'img': pg.imgs.append(a)
        if tag == 'script':
            self._script = {'attrs': a, 'text': ''}
        if tag == 'link' and a.get('rel') == 'stylesheet': pg.tags.append(('stylesheet', a.get('href', '')))
    def handle_endtag(self, tag):
        if tag == 'script' and self._script is not None:
            self.pg.scripts.append(self._script); self._script = None
        if tag == self._heading: self._heading = None
    def handle_data(self, data):
        if self._script is not None: self._script['text'] += data
        if self._heading and self.pg.headings: self.pg.headings[-1][1] += data


def text_only(t):
    t = re.sub(r'<script[^>]*>.*?</script>', ' ', t, flags=re.S)
    t = re.sub(r'<!--.*?-->', ' ', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t))


def check(root):
    errs, warns = [], []
    E = lambda s: errs.append(s); W = lambda s: warns.append(s)
    pages = {os.path.basename(p): Page(p) for p in sorted(glob.glob(os.path.join(root, '*.html')))}
    if not pages: return ['aucune page HTML dans ' + root], []
    exists = lambda rel: os.path.exists(os.path.join(root, rel.lstrip('/')))

    # ---- fichiers de découverte
    sitemap = open(os.path.join(root, 'sitemap.xml'), encoding='utf-8').read() if exists('sitemap.xml') else ''
    if not sitemap: E('sitemap.xml absent')
    locs = re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', sitemap)
    robots = open(os.path.join(root, 'robots.txt'), encoding='utf-8').read() if exists('robots.txt') else ''
    if 'Sitemap: ' + DOMAIN + '/sitemap.xml' not in robots: E('robots.txt : ligne Sitemap absente ou incorrecte')
    today = datetime.date.today().isoformat()
    for m in re.finditer(r'<lastmod>([^<]+)</lastmod>', sitemap):
        d = m.group(1).strip()
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) or d > today: E(f'sitemap : lastmod invalide ou futur « {d} »')
    if exists('site.webmanifest'):
        try:
            man = json.load(open(os.path.join(root, 'site.webmanifest'), encoding='utf-8'))
            for ic in man.get('icons', []):
                if not exists(ic['src']): E(f"site.webmanifest : icône absente {ic['src']}")
        except Exception as e: E(f'site.webmanifest illisible : {e}')
    else: W('site.webmanifest absent')

    # ---- security.txt (RFC 9116) : présent et non expiré
    if exists('.well-known/security.txt'):
        st = open(os.path.join(root, '.well-known/security.txt'), encoding='utf-8').read()
        m = re.search(r'^Expires:\s*(\d{4}-\d{2}-\d{2})', st, re.M)
        if not m: E('security.txt : champ Expires absent')
        else:
            exp = datetime.date.fromisoformat(m.group(1)); days = (exp - datetime.date.today()).days
            if days < 0: E(f'security.txt : expiré depuis le {m.group(1)}')
            elif days < 30: W(f'security.txt : expire dans {days} jours ({m.group(1)}) — repousser la date')
        if 'Contact:' not in st: E('security.txt : champ Contact absent')
    else: W('.well-known/security.txt absent')

    # ---- en-têtes / CSP
    headers = open(os.path.join(root, '_headers'), encoding='utf-8').read() if exists('_headers') else ''
    csp = re.search(r'^\s*Content-Security-Policy:\s*(.+)$', headers, re.M)
    csp_hashes = set(re.findall(r"'(sha256-[A-Za-z0-9+/=]+)'", csp.group(1))) if csp else set()
    if not csp: E('_headers : Content-Security-Policy absente')

    # ---- redirections
    if exists('_redirects'):
        for line in open(os.path.join(root, '_redirects'), encoding='utf-8'):
            line = line.split('#')[0].strip()
            if not line: continue
            parts = line.split()
            if len(parts) >= 2 and parts[1].startswith('/'):
                target = parts[1].split('#')[0].split('?')[0]
                if target != '/' and not (exists(target) or exists(target + '.html') or exists(target.rstrip('/') + '/index.html')):
                    E(f'_redirects : cible inexistante {parts[1]}')
            if len(parts) >= 2 and parts[0].startswith('/'):
                # Netlify sert un fichier existant AVANT d'appliquer une règle non forcée : une règle qui vise un
                # chemin présent dans le dépôt (/_tests/*, /x.html → /x) doit porter un « ! » sur le statut.
                status = parts[2] if len(parts) > 2 else '301'
                base = parts[0].split('*')[0].rstrip('/')
                if base and (exists(base) or exists(base + '/index.html')) and not status.endswith('!'):
                    E(f'_redirects : « {parts[0]} » vise un chemin présent dans le dépôt — Netlify servira le fichier et ignorera la règle (mettre {status}!)')

    css_versions, js_versions, inline_hashes = {}, {}, {}
    slugs = {p.slug for p in pages.values()}
    for name, pg in pages.items():
        t = pg.txt; is404 = name == '404.html'
        noindex = 'noindex' in (pg.meta('name', 'robots') or '')
        # --- squelette
        if '<html lang="fr">' not in t: E(f'{name} : <html lang="fr"> absent')
        if '<meta charset="UTF-8">' not in t and '<meta charset="utf-8">' not in t: E(f'{name} : charset absent')
        if 'name="viewport"' not in t: E(f'{name} : viewport absent')
        titles = re.findall(r'<title>(.*?)</title>', t, re.S)
        if len(titles) != 1: E(f'{name} : {len(titles)} <title>')
        elif len(titles[0]) > 70: W(f'{name} : title de {len(titles[0])} caractères (> 70)')
        desc = pg.meta('name', 'description')
        if not desc: E(f'{name} : meta description absente')
        elif len(desc) > DESC_MAX: W(f'{name} : meta description de {len(desc)} caractères (> {DESC_MAX})')
        canon = re.findall(r'<link rel="canonical" href="([^"]+)"', t)
        if not is404:
            if len(canon) != 1: E(f'{name} : {len(canon)} canonical')
            elif canon[0] != pg.pretty_url(): E(f'{name} : canonical « {canon[0]} » ≠ {pg.pretty_url()}')
        # --- titres
        h1 = [h for h in pg.headings if h[0] == 'h1']
        if len(h1) != 1: E(f'{name} : {len(h1)} <h1>')
        prev = 0
        for tag, _ in pg.headings:
            lvl = int(tag[1])
            if prev and lvl > prev + 1: E(f'{name} : saut de niveau de titre h{prev} → h{lvl}'); break
            prev = lvl
        # --- indexation
        in_sitemap = pg.pretty_url() in locs
        if noindex and in_sitemap: E(f'{name} : noindex mais présent dans le sitemap')
        if not noindex and not in_sitemap: E(f'{name} : indexable mais absent du sitemap')
        # --- réseaux sociaux
        if not noindex:
            for prop in ('og:title', 'og:description', 'og:image', 'og:url', 'og:type'):
                if pg.meta('property', prop) is None: E(f'{name} : {prop} absent')
            ogu = pg.meta('property', 'og:url')
            if ogu and ogu != pg.pretty_url(): E(f'{name} : og:url « {ogu} » ≠ canonical')
            ogi = pg.meta('property', 'og:image')
            if ogi and ogi.startswith(DOMAIN) and not exists(ogi[len(DOMAIN):]): E(f'{name} : og:image introuvable {ogi}')
            if pg.meta('name', 'twitter:card') is None: E(f'{name} : twitter:card absent')
        # --- JSON-LD (valide, typé, URLs internes existantes)
        for s in pg.scripts:
            if s['attrs'].get('type') == 'application/ld+json':
                try:
                    d = json.loads(s['text'])
                    if '@type' not in json.dumps(d): E(f'{name} : JSON-LD sans @type')
                except Exception as e: E(f'{name} : JSON-LD invalide ({str(e)[:60]})'); continue
                for u in set(re.findall(r'"' + re.escape(DOMAIN) + r'/([^"#?]*)"', s['text'])):
                    if u and not (exists(u) or exists(u + '.html') or exists(u.rstrip('/') + '/index.html')):
                        E(f'{name} : JSON-LD → URL interne inexistante /{u}')
        # --- scripts et CSP
        for s in pg.scripts:
            a = s['attrs']
            if a.get('type') == 'application/ld+json': continue
            if 'src' in a:
                src = a['src'].split('?')[0]
                if not exists(src): E(f"{name} : script introuvable {a['src']}")
                if src.endswith('nav.js'): js_versions.setdefault(a['src'], []).append(name)
                continue
            h = 'sha256-' + base64.b64encode(hashlib.sha256(s['text'].encode('utf-8')).digest()).decode()
            inline_hashes.setdefault(h, []).append(name)
            if h not in csp_hashes: E(f'{name} : script inline non autorisé par la CSP (hash {h[:20]}…)')
        # --- feuilles de style
        for kind, href in pg.tags:
            if not exists(href.split('?')[0]): E(f'{name} : feuille de style introuvable {href}')
            if href.split('?')[0] == '/main.css': css_versions.setdefault(href, []).append(name)
        # --- images
        for im in pg.imgs:
            if 'alt' not in im: E(f"{name} : <img> sans alt ({im.get('src', '')[:50]})")
            if 'width' not in im or 'height' not in im: E(f"{name} : <img> sans width/height ({im.get('src', '')[:50]})")
            src = im.get('src', '')
            if src.startswith('/') or not re.match(r'^(https?:|data:)', src):
                if not exists(src if src.startswith('/') else '/' + src): E(f'{name} : image introuvable {src}')
        # --- ids
        for i in sorted(pg.dup_ids): E(f'{name} : id dupliqué « {i} »')
        # --- liens
        for a in pg.links:
            href = a['href'].strip()
            if href.startswith('#'):
                if href != '#' and href[1:] not in pg.ids: E(f'{name} : ancre {href} introuvable dans la page')
                continue
            if href.startswith('mailto:') or href.startswith('tel:') or href.startswith('javascript:'): continue
            if href.startswith('http://' + DOMAIN[8:]) or href.startswith('http://www.' + DOMAIN[8:]): E(f'{name} : lien interne en http:// {href}')
            if href.startswith(DOMAIN): href = href[len(DOMAIN):] or '/'
            if href.startswith('http'):
                if a.get('target') == '_blank' and 'noopener' not in (a.get('rel') or ''): W(f'{name} : lien _blank sans rel=noopener ({href[:50]})')
                continue
            path, _, frag = href.partition('#')
            path = path.split('?')[0]
            if path.endswith('.html') and path != '/404.html': E(f'{name} : lien interne en .html {path} (URL propre attendue)')
            target_slug = pg.slug if path in ('', ) else ('index' if path == '/' else path.lstrip('/').replace('.html', ''))
            if path and target_slug not in slugs:
                if not (exists(path) or exists(path.rstrip('/') + '/index.html')): E(f'{name} : lien interne cassé {href}')
                continue
            if frag and target_slug in slugs:
                tp = pages[target_slug + '.html']
                if frag not in tp.ids: E(f'{name} : ancre #{frag} introuvable sur /{"" if target_slug == "index" else target_slug}')
        # --- dates et entités (TECH4B-2026-09-06) : la date de révision affichée aux patients, le JSON-LD et le sitemap
        #     racontent la même histoire ; les nœuds Physician / MedicalClinic portent leur @id (une seule entité pour Google)
        lds = []
        for s in pg.scripts:
            if s['attrs'].get('type') == 'application/ld+json':
                try: lds.append(json.loads(s['text']))
                except Exception: pass
        def _walk(d, out):
            if isinstance(d, dict):
                out.append(d)
                for v in d.values(): _walk(v, out)
            elif isinstance(d, list):
                for v in d: _walk(v, out)
        nodes = []
        for d in lds: _walk(d, nodes)
        for nd in nodes:
            if nd.get('@type') == 'Physician' and nd.get('@id') != DOMAIN + '/#physician': E(f'{name} : nœud Physician sans @id {DOMAIN}/#physician')
            if nd.get('@type') == 'MedicalClinic' and nd.get('@id') != DOMAIN + '/#cabinet': E(f'{name} : nœud MedicalClinic sans @id {DOMAIN}/#cabinet')
        pages_nodes = [nd for nd in nodes if isinstance(nd.get('@type'), str) and nd['@type'].endswith('Page') and ('lastReviewed' in nd or 'dateModified' in nd)]
        MOIS_FR = {'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12}
        vis = None
        mt = re.search(r'Dernière (?:révision|mise à jour)(?: |&nbsp;): <time datetime="(\d{4}-\d{2}-\d{2})">(1<sup>er</sup>|\d{1,2}) ([a-zéû]+) (\d{4})</time>', t)
        if mt:
            vis = mt.group(1); day = 1 if mt.group(2).startswith('1<') else int(mt.group(2))
            if mt.group(3) not in MOIS_FR or vis != f'{mt.group(4)}-{MOIS_FR[mt.group(3)]:02d}-{day:02d}': E(f'{name} : <time datetime="{vis}"> ≠ date écrite « {mt.group(2)} {mt.group(3)} {mt.group(4)} »')
        elif re.search(r'Dernière (?:révision|mise à jour)(?: |&nbsp;): (?:1<sup>er</sup>|\d{1,2}) [a-zéû]+ \d{4}', t): E(f'{name} : date de révision affichée sans <time datetime>')
        for nd in pages_nodes:
            lr, dm = nd.get('lastReviewed'), nd.get('dateModified')
            if lr and not dm: E(f'{name} : JSON-LD lastReviewed sans dateModified')
            if lr and dm and dm < lr: E(f'{name} : dateModified {dm} antérieur à lastReviewed {lr}')
            if lr and vis and vis != lr: E(f'{name} : date affichée {vis} ≠ lastReviewed {lr} (JSON-LD)')
            lm = re.search(r'<loc>\s*' + re.escape(pg.pretty_url()) + r'\s*</loc>\s*<lastmod>([^<]+)</lastmod>', sitemap)
            if dm and lm and lm.group(1).strip() < dm: E(f'{name} : lastmod du sitemap {lm.group(1).strip()} antérieur à dateModified {dm}')
        # --- règles éditoriales
        body = text_only(t)
        for m in re.finditer(r'baisse brutale', body, re.I):
            suite = body[m.end():m.end() + 80]
            suite = re.split(r'[.;!?]', suite)[0]          # même phrase seulement
            if not re.search(r'\bvision\b', suite, re.I):
                ctx = body[max(0, m.start() - 30):m.end() + 40]
                E(f'{name} : « baisse brutale » sans « … de la vision » dans la phrase → …{ctx}…')
        if re.search(r'\bOPTAM\b', body): E(f'{name} : mention de l’OPTAM (interdite sur le site)')
        if re.search(r'\b24\s*/\s*7\b', body): E(f'{name} : « 24/7 » (le cabinet n’est pas ouvert 24/7)')
    # ---- cohérence des versions
    if len(css_versions) != 1: E(f'main.css référencé avec {len(css_versions)} versions différentes : ' + ', '.join(f'{k} ×{len(v)}' for k, v in css_versions.items()))
    if len(js_versions) != 1: E(f'nav.js référencé avec {len(js_versions)} versions différentes : ' + ', '.join(f'{k} ×{len(v)}' for k, v in js_versions.items()))
    if len(inline_hashes) > 1: E(f'{len(inline_hashes)} scripts inline distincts (un seul est autorisé par la CSP)')
    for h in csp_hashes:
        if h not in inline_hashes: W(f'_headers : hash CSP {h[:24]}… sans script inline correspondant')
    return errs, warns


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--root', default=None); a = ap.parse_args()
    root = a.root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    errs, warns = check(root)
    n = len(glob.glob(os.path.join(root, '*.html')))
    for w in warns: print('  avertissement :', w)
    for e in errs: print('  ERREUR :', e)
    print(f'check_static : {n} pages, {len(errs)} erreur(s), {len(warns)} avertissement(s).')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
