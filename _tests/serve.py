#!/usr/bin/env python3
"""Serveur local qui imite Netlify pour tester le site tel qu'il est servi en production.

    python3 _tests/serve.py [port]        (défaut : 8765 ; racine = dossier parent de _tests)

- URL « propres » : /decollement-retine → decollement-retine.html ; / → index.html ;
- 404 réelle (statut 404 + page 404.html) ;
- en-têtes de _headers appliqués (dont la Content-Security-Policy : les violations CSP
  sont donc visibles dans la console du navigateur, comme en production) ;
- compression gzip des textes ; Content-Type corrects (woff2, avif, webmanifest, xml).
Aucune dépendance. Ctrl-C pour arrêter.
"""
import gzip, http.server, mimetypes, os, re, socketserver, sys, fnmatch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
for ext, ct in (('.woff2', 'font/woff2'), ('.avif', 'image/avif'), ('.webmanifest', 'application/manifest+json'),
                ('.webp', 'image/webp'), ('.svg', 'image/svg+xml'), ('.xml', 'application/xml'), ('.js', 'application/javascript')):
    mimetypes.add_type(ct, ext)


def parse_headers(path):
    """_headers de Netlify → liste (motif, [(nom, valeur)]) ; toutes les règles qui matchent s'appliquent."""
    rules, cur = [], None
    if not os.path.exists(path): return rules
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if not line.strip() or line.strip().startswith('#'): continue
        if not line.startswith((' ', '\t')):
            cur = (line.strip(), []); rules.append(cur)
        elif cur is not None and ':' in line:
            k, v = line.strip().split(':', 1); cur[1].append((k.strip(), v.strip()))
    return rules


RULES = parse_headers(os.path.join(ROOT, '_headers'))


def headers_for(url_path):
    out = {}
    for pat, hs in RULES:
        rx = '^' + re.escape(pat).replace(r'\*', '.*') + '$'
        if re.match(rx, url_path):
            for k, v in hs: out[k] = v
    return out


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass

    def do_GET(self):
        p = self.path.split('?')[0].split('#')[0]
        f = 'index.html' if p == '/' else p.lstrip('/')
        fp = os.path.join(ROOT, f)
        if os.path.isdir(fp): fp = os.path.join(fp, 'index.html')
        if not os.path.isfile(fp) and os.path.isfile(fp + '.html'): fp += '.html'
        code = 200
        if not os.path.isfile(fp) or '/_tests/' in p or p.startswith('/.'):
            fp, code = os.path.join(ROOT, '404.html'), 404
        data = open(fp, 'rb').read()
        ct = mimetypes.guess_type(fp)[0] or 'application/octet-stream'
        if ct.startswith('text/') or ct in ('application/javascript', 'application/json', 'image/svg+xml', 'application/xml', 'application/manifest+json'):
            ct += '; charset=utf-8'
        enc = None
        if 'gzip' in self.headers.get('Accept-Encoding', '') and (ct.startswith('text/') or 'javascript' in ct or 'svg' in ct or 'json' in ct or 'xml' in ct):
            data, enc = gzip.compress(data, 6), 'gzip'
        self.send_response(code)
        self.send_header('Content-Type', ct); self.send_header('Content-Length', str(len(data)))
        if enc: self.send_header('Content-Encoding', enc); self.send_header('Vary', 'Accept-Encoding')
        for k, v in headers_for(p if code == 200 else '/404.html').items():
            if k.lower() != 'content-type': self.send_header(k, v)
        self.end_headers(); self.wfile.write(data)

    def do_HEAD(self):
        self.do_GET()


if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), H) as s:
        print(f'Site servi sur http://127.0.0.1:{PORT}/ (racine {ROOT}, {len(RULES)} règles _headers) — Ctrl-C pour arrêter', flush=True)
        try: s.serve_forever()
        except KeyboardInterrupt: pass
