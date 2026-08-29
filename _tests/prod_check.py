#!/usr/bin/env python3
"""Veille de production — docteurmajoulet.com tel qu'il est servi (Netlify), sans dépendance.

    python3 _tests/prod_check.py [--no-external] [--site https://docteurmajoulet.com]

Lancé chaque lundi matin par GitHub Actions (.github/workflows/veille-prod.yml) et à la demande.
  - toutes les URL du sitemap répondent 200 en HTML, avec leur canonical et une revalidation du cache ;
  - en-têtes de sécurité de la home (HSTS, CSP identique à _headers, nosniff, X-Frame-Options,
    Referrer-Policy, Permissions-Policy, COOP, CORP) ;
  - redirections : http → https, www → domaine nu, docteur-majoulet.com (avec tiret) → docteurmajoulet.com ;
  - une URL inexistante répond 404 ; robots.txt, sitemap.xml, security.txt, main.css, nav.js, une police ;
  - certificat TLS valide encore ≥ 14 jours ;
  - fraîcheur : le ?v= de main.css servi en prod = celui du dépôt (sinon : déploiement en retard ou travail non poussé) ;
  - liens externes des 48 pages (DOI, PubMed, hôpitaux, sociétés savantes…) : 404/410 = erreur,
    délai dépassé ou 403 (anti-robot) = avertissement.
Sortie : erreurs (code 1) et avertissements (code 0).
"""
import argparse, concurrent.futures, datetime, glob, html, os, random, re, socket, ssl, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (compatible; veille-docteurmajoulet/1.0; +https://docteurmajoulet.com/.well-known/security.txt)'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


def fetch(url, follow=True, timeout=20, method='GET'):
    """→ (statut, en-têtes, corps[:200 Ko]) ; statut 0 = échec réseau (message dans le corps)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'identity'}, method=method)
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(200_000)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, b''
    except Exception as e:
        return 0, {}, str(e).encode()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--site', default='https://docteurmajoulet.com'); ap.add_argument('--no-external', action='store_true')
    a = ap.parse_args(); site = a.site.rstrip('/'); host = site.split('://')[1]
    errs, warns = [], []
    E = lambda s: errs.append(s); W = lambda s: warns.append(s)
    bust = lambda u: u + ('&' if '?' in u else '?') + f'v={random.randrange(10**9)}'

    # ---- TLS
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=15) as sock, ctx.wrap_socket(sock, server_hostname=host) as s:
            cert = s.getpeercert()
        exp = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z'); days = (exp - datetime.datetime.utcnow()).days
        if days < 14: E(f'certificat TLS : expire dans {days} jours ({exp:%d/%m/%Y})')
        else: print(f'  TLS : certificat valide jusqu\'au {exp:%d/%m/%Y} ({days} j)')
    except Exception as e: E(f'certificat TLS : vérification impossible ({str(e)[:80]})')

    # ---- home + en-têtes
    st, h, body = fetch(bust(site + '/'))
    if st != 200: E(f'home : statut {st}'); return finish(errs, warns)
    home = body.decode('utf-8', 'replace')
    expected_csp = None
    if os.path.exists(os.path.join(ROOT, '_headers')):
        m = re.search(r'^\s*Content-Security-Policy:\s*(.+)$', open(os.path.join(ROOT, '_headers'), encoding='utf-8').read(), re.M)
        expected_csp = m.group(1).strip() if m else None
    for name, test in [
        ('strict-transport-security', lambda v: 'max-age=' in v),
        ('content-security-policy', lambda v: (v.strip() == expected_csp) if expected_csp else ("script-src" in v)),
        ('x-content-type-options', lambda v: v.lower() == 'nosniff'),
        ('x-frame-options', lambda v: v.upper() in ('SAMEORIGIN', 'DENY')),
        ('referrer-policy', lambda v: bool(v)),
        ('permissions-policy', lambda v: bool(v)),
        ('cross-origin-opener-policy', lambda v: bool(v)),
        ('cross-origin-resource-policy', lambda v: bool(v)),
    ]:
        v = h.get(name)
        if v is None: E(f'home : en-tête {name} absent')
        elif not test(v): E(f'home : en-tête {name} inattendu' + (' (différent de _headers du dépôt — déploiement en retard ?)' if name == 'content-security-policy' else '') + f' → {v[:90]}')
    try:   # compression : requête séparée (la lecture du corps se fait sans compression ci-dessus)
        rq = urllib.request.Request(bust(site + '/'), headers={'User-Agent': UA, 'Accept-Encoding': 'br, gzip'})
        with urllib.request.urlopen(rq, timeout=20) as r: enc = r.headers.get('Content-Encoding', '')
        if 'br' not in enc and 'gzip' not in enc: W(f'home : pas de compression (content-encoding « {enc} »)')
    except Exception as e: W(f'home : test de compression impossible ({str(e)[:50]})')
    # fraîcheur
    mv = re.search(r'href="/main\.css\?v=([0-9a-z]+)"', home)
    prod_v = mv.group(1) if mv else None
    local_index = os.path.join(ROOT, 'index.html')
    if prod_v and os.path.exists(local_index):
        lv = re.search(r'href="/main\.css\?v=([0-9a-z]+)"', open(local_index, encoding='utf-8').read())
        if lv and lv.group(1) != prod_v: W(f'fraîcheur : main.css ?v={prod_v} en prod, ?v={lv.group(1)} dans le dépôt (déploiement en retard ou travail non poussé)')
    print(f'  home : 200, {len(body) // 1024} Ko, main.css ?v={prod_v}, en-têtes de sécurité vérifiés')

    # ---- fichiers de service
    for path, ctype in (('/robots.txt', 'text/plain'), ('/sitemap.xml', 'xml'), ('/.well-known/security.txt', 'text/plain'),
                        (f'/main.css?v={prod_v}', 'text/css'), ('/nav.js', 'javascript'), ('/fonts/montserrat-400.woff2', 'font/woff2'), ('/site.webmanifest', 'manifest')):
        st, hh, _ = fetch(bust(site + path))
        if st != 200: E(f'{path} : statut {st}')
        elif ctype not in hh.get('content-type', ''): W(f'{path} : content-type {hh.get("content-type")}')
        if path.startswith(('/main.css', '/nav.js', '/fonts/')) and st == 200 and 'immutable' not in hh.get('cache-control', ''): W(f'{path} : cache-control sans immutable ({hh.get("cache-control")})')
    st, _, _ = fetch(bust(site + f'/page-inexistante-{random.randrange(10**6)}'))
    if st != 404: E(f'page inexistante : statut {st} (attendu 404)')

    # ---- redirections
    for url, target in ((f'http://{host}/', f'{site}/'), (f'https://www.{host}/', f'{site}/'), (f'http://www.{host}/', None),
                        ('https://docteur-majoulet.com/', f'{site}/'), ('http://docteur-majoulet.com/', None), ('https://www.docteur-majoulet.com/', f'{site}/')):
        st, hh, body = fetch(url, follow=False, timeout=15)
        if st == 0: W(f'redirection {url} : injoignable ({body.decode()[:60]})')
        elif st not in (301, 308): E(f'redirection {url} : statut {st} (attendu 301)')
        elif target and hh.get('location', '').rstrip('/') + '/' != target: E(f'redirection {url} → {hh.get("location")} (attendu {target})')

    # ---- sitemap → toutes les pages
    st, _, sm = fetch(bust(site + '/sitemap.xml'))
    locs = re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', sm.decode('utf-8', 'replace')) if st == 200 else []
    if not locs: E('sitemap : aucune URL lue')
    ok = 0
    def check_page(u):
        st, hh, body = fetch(bust(u)); out = []
        if st != 200: out.append(f'{u} : statut {st}'); return out
        if 'text/html' not in hh.get('content-type', ''): out.append(f'{u} : content-type {hh.get("content-type")}')
        t = body.decode('utf-8', 'replace')
        if f'<link rel="canonical" href="{u}"' not in t: out.append(f'{u} : canonical absent ou différent')
        if 'must-revalidate' not in hh.get('cache-control', '') and 'max-age=0' not in hh.get('cache-control', ''): out.append(f'{u} : cache-control {hh.get("cache-control")}')
        return out
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for res in ex.map(check_page, locs):
            if res: errs.extend(res)
            else: ok += 1
    print(f'  sitemap : {ok}/{len(locs)} pages en 200 avec canonical')

    # ---- liens externes (depuis les pages du dépôt si présentes, sinon depuis la home)
    if not a.no_external:
        srcs = glob.glob(os.path.join(ROOT, '*.html')) or []
        corpus = ''.join(open(f, encoding='utf-8', errors='ignore').read() for f in srcs) if srcs else home
        ext = sorted({html.unescape(u).rstrip('.,;)') for u in re.findall(r'href="(https?://[^"\s]+)"', corpus) if host not in u and 'docteur-majoulet' not in u})
        def check_ext(u):
            st, hh, body = fetch(u, timeout=20)
            if st in (404, 410): return ('E', f'lien externe {st} : {u}')
            if st == 0: return ('W', f'lien externe injoignable : {u} ({body.decode()[:50]})')
            if st in (403, 429) or st >= 500: return ('W', f'lien externe {st} (anti-robot ou serveur) : {u}')
            return None
        n_ok = 0
        with concurrent.futures.ThreadPoolExecutor(8) as ex:
            for r in ex.map(check_ext, ext):
                if r is None: n_ok += 1
                elif r[0] == 'E': E(r[1])
                else: W(r[1])
        print(f'  liens externes : {n_ok}/{len(ext)} OK')
    return finish(errs, warns)


def finish(errs, warns):
    for w in warns: print('  avertissement :', w)
    for e in errs: print('  ERREUR :', e)
    print(f'prod_check : {len(errs)} erreur(s), {len(warns)} avertissement(s) — {datetime.datetime.now():%d/%m/%Y %H:%M}')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
