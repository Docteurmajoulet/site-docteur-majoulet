#!/usr/bin/env python3
"""IndexNow — signale aux moteurs qui l'utilisent (Bing, Yandex, Naver, Seznam, Yep… ; pas Google) les pages modifiées par un push.

    python3 _tests/indexnow_submit.py --before <sha> --after <sha>     # pages HTML modifiées entre deux commits (workflow GitHub)
    python3 _tests/indexnow_submit.py --all                            # toutes les URL du sitemap (workflow_dispatch, ou après un
                                                                       #   changement de clé)
    options : --dry-run (affiche la requête sans l'envoyer) · --no-wait (ne pas attendre que Netlify serve la nouvelle version)
              --site https://docteurmajoulet.com

Règles (TECH20BC-2026-09-16) :
  - seules les URL présentes dans sitemap.xml sont soumises (pages noindex, 404, fichiers de service exclus) ;
  - la clé est le nom du fichier <clé>.txt à la racine du site (32 caractères hexadécimaux), dont le contenu est la clé
    (protocole IndexNow : https://www.indexnow.org/documentation) ;
  - avant l'envoi, on attend (≤ 6 min) que la production serve la nouvelle version de la première page modifiée (mêmes octets
    que le dépôt), sinon les moteurs recrawleraient l'ancienne ;
  - TECH22BI-2026-09-17 — pushs en rafale : quand plusieurs pushs se suivent (cinq lots en dix secondes le 16/09), Netlify ne sert
    jamais un commit intermédiaire ; l'attente accepte donc aussi la version la plus récente de la page sur origin/main (relue à
    chaque essai par git fetch + git show), et n'attend pas si un push suivant a supprimé la page ;
  - réponses acceptées : 200 (OK) et 202 (clé en cours de validation) ; toute autre réponse fait échouer le job.
Aucune dépendance. Code de sortie 1 en cas d'échec, 0 sinon (y compris « rien à soumettre »).
"""
import argparse, glob, hashlib, json, os, re, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINT = 'https://api.indexnow.org/indexnow'
UA = 'Mozilla/5.0 (compatible; indexnow-docteurmajoulet/1.0; +https://docteurmajoulet.com/.well-known/security.txt)'


def key_and_file():
    files = [f for f in glob.glob(os.path.join(ROOT, '*.txt')) if re.fullmatch(r'[0-9a-f]{32}\.txt', os.path.basename(f))]
    if len(files) != 1: sys.exit(f'IndexNow : {len(files)} fichier(s) de clé <32 hex>.txt à la racine (un seul attendu)')
    key = os.path.basename(files[0])[:-4]
    with open(files[0], encoding='utf-8') as f: content = f.read().strip()
    if content != key: sys.exit(f'IndexNow : le contenu de {os.path.basename(files[0])} ne reprend pas la clé')
    return key, os.path.basename(files[0])


def sitemap_urls():
    with open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8') as f:
        return re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', f.read())


def url_of(site, html_name):
    stem = html_name[:-5]
    return site + '/' if stem == 'index' else f'{site}/{stem}'


def changed_html(before, after):
    """Pages HTML ajoutées ou modifiées entre deux commits — hors changement du seul jeton de cache (?v=) de main.css / nav.js,
    qui accompagne chaque lot CSS/JS sans toucher au contenu."""
    r = subprocess.run(['git', 'diff', '--name-only', '--diff-filter=AM', before, after, '--', '*.html'], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0: sys.exit('IndexNow : git diff a échoué — ' + r.stderr.strip()[:200])
    names = [l.strip() for l in r.stdout.splitlines() if l.strip().endswith('.html') and '/' not in l.strip()]
    norm = lambda t: re.sub(r'\?v=\d{8}[a-z]"', '?v="', t)
    out = []
    for n in names:
        old = subprocess.run(['git', 'show', f'{before}:{n}'], cwd=ROOT, capture_output=True, text=True)
        new = subprocess.run(['git', 'show', f'{after}:{n}'], cwd=ROOT, capture_output=True, text=True)
        if old.returncode == 0 and new.returncode == 0 and norm(old.stdout) == norm(new.stdout): continue   # seul le ?v= a changé
        out.append(n)
    return out


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.status, r.read()


def latest_blob(html_name, remote='origin', branch='main'):
    """TECH22BI-2026-09-17 — empreinte de la page telle que la branche distante la porte à cet instant (git fetch puis git show) :
    c'est cette version que Netlify finit par servir quand plusieurs pushs se suivent. None si la page n'y est plus (supprimée
    par un push suivant) ; '' si la branche distante est inconnue (dépôt sans remote : on ne compare qu'au commit signalé)."""
    subprocess.run(['git', 'fetch', '-q', remote, branch], cwd=ROOT, capture_output=True)
    r = subprocess.run(['git', 'show', f'{remote}/{branch}:' + html_name], cwd=ROOT, capture_output=True)
    if r.returncode == 0: return hashlib.sha256(r.stdout).hexdigest()
    err = r.stderr.decode('utf-8', 'replace')
    return '' if 'invalid object name' in err or 'unknown revision' in err or 'bad revision' in err else None


def wait_for_prod(site, html_name, minutes=6):
    """Attend que la production serve la page telle qu'elle est dans le dépôt (Netlify déploie après le push) — au commit signalé
    ou, pushs en rafale obligent, dans sa version la plus récente sur origin/main (TECH22BI-2026-09-17)."""
    with open(os.path.join(ROOT, html_name), 'rb') as f: local = hashlib.sha256(f.read()).hexdigest()
    url = url_of(site, html_name); deadline = time.time() + minutes * 60; last = ''
    while time.time() < deadline:
        latest = latest_blob(html_name)
        if latest is None: print(f'  {html_name} n’est plus sur origin/main (retirée par un push suivant) — pas d’attente'); return True
        want = {local} | ({latest} if latest else set())
        try:
            st, body = fetch(url + ('&' if '?' in url else '?') + 'indexnow=' + str(int(time.time())))
            got = hashlib.sha256(body).hexdigest()
            if st == 200 and got in want:
                print(f'  production à jour : {url}' + (' (version du dernier push, plus récente que le commit signalé)' if got != local else '')); return True
            last = f'statut {st}, empreinte {got[:12]} ∉ {{' + ', '.join(w[:12] for w in sorted(want)) + '}'
        except Exception as e: last = str(e)[:100]
        time.sleep(20)
    print(f'  production PAS à jour après {minutes} min ({last}) — envoi annulé'); return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--before'); ap.add_argument('--after'); ap.add_argument('--all', action='store_true')
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--no-wait', action='store_true')
    ap.add_argument('--site', default='https://docteurmajoulet.com')
    a = ap.parse_args(); site = a.site.rstrip('/'); host = site.split('://')[1]
    key, key_file = key_and_file()
    allowed = sitemap_urls()
    if a.all: urls = allowed; first = None
    else:
        if not (a.before and a.after): sys.exit('IndexNow : --before et --after (ou --all) requis')
        pages = changed_html(a.before, a.after)
        urls = [u for u in (url_of(site, p) for p in pages) if u in allowed]
        skipped = [p for p in pages if url_of(site, p) not in allowed]
        if skipped: print('  ignorées (hors sitemap) : ' + ', '.join(skipped))
        first = next((p for p in pages if url_of(site, p) in allowed), None)
    if not urls: print('IndexNow : aucune page du sitemap modifiée — rien à soumettre.'); return 0
    print(f'IndexNow : {len(urls)} URL à soumettre' + (' (toutes celles du sitemap)' if a.all else '') + ' : ' + ', '.join(u.replace(site, '') or '/' for u in urls[:12]) + (' …' if len(urls) > 12 else ''))
    if first and not a.no_wait and not a.dry_run and not wait_for_prod(site, first): return 1
    payload = {'host': host, 'key': key, 'keyLocation': f'{site}/{key_file}', 'urlList': urls}
    if a.dry_run: print(json.dumps(payload, indent=2)); return 0
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode('utf-8'), method='POST',
                                 headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: st = r.status
    except urllib.error.HTTPError as e: st = e.code
    except Exception as e: print(f'IndexNow : envoi impossible ({str(e)[:120]})'); return 1
    labels = {200: 'OK', 202: 'accepté (clé en cours de validation)', 400: 'requête invalide', 403: 'clé refusée (fichier de clé absent ou différent en production)', 422: 'URL hors du domaine', 429: 'trop de requêtes'}
    print(f'IndexNow : réponse {st} — {labels.get(st, "inattendue")}')
    return 0 if st in (200, 202) else 1


if __name__ == '__main__':
    sys.exit(main())
