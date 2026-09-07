#!/usr/bin/env python3
"""FAQ structurée = FAQ visible (TECH6H-2026-09-07).

Le bloc JSON-LD « FAQPage » de chaque page est GÉNÉRÉ à partir des questions-réponses visibles
(`<div class="qr-block"><h3 class="q">…</h3><p class="r">…</p></div>`) : mêmes questions, mêmes réponses,
dans le même ordre. Une page sans FAQ visible n'a pas de FAQPage. C'est ce qu'exigent les consignes de
Google sur les données structurées (« ne balisez pas un contenu invisible ») et c'est la seule façon de
garantir que le contenu structuré est celui qui a été relu et validé médicalement.

    python3 _tests/faq_jsonld.py            # contrôle : liste les pages dont le JSON-LD diverge (code 1 si écart)
    python3 _tests/faq_jsonld.py --write    # régénère les blocs FAQPage (à lancer par tout lot qui modifie une FAQ)

Utilisable aussi comme module (check_static.py s'en sert) : visible_faq(html), faq_script(pairs), sync(html).
"""
import glob, html as htmlmod, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QR = re.compile(r'<div class="qr-block">\s*<(?:h3|p) class="q">(.*?)</(?:h3|p)>\s*<p class="r">(.*?)</p>\s*</div>', re.S)
SCRIPT = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def text_of(fragment):
    """Texte brut d'un fragment HTML : balises retirées, entités décodées, espaces repliés (l'insécable est conservée)."""
    s = re.sub(r'<[^>]+>', '', fragment)
    s = htmlmod.unescape(s)
    return re.sub(r'[ \t\r\n]+', ' ', s).strip()


def norm(s):
    """Forme de comparaison : toute espace (y compris insécable/fine) → espace simple."""
    return re.sub(r'[\s\u00a0\u202f]+', ' ', htmlmod.unescape(s)).strip()


def visible_faq(html):
    return [(text_of(q), text_of(r)) for q, r in QR.findall(html)]


def faq_script(pairs, indent='    '):
    data = {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs]}
    body = json.dumps(data, ensure_ascii=False, indent=4)
    body = '\n'.join(indent + l for l in body.split('\n'))
    return '<script type="application/ld+json">\n' + body + '\n' + indent + '</script>'


def find_faq_scripts(html):
    """Positions (start, end) des <script ld+json> dont le @type est FAQPage."""
    out = []
    for m in SCRIPT.finditer(html):
        try: d = json.loads(m.group(1))
        except Exception: continue
        if isinstance(d, dict) and d.get('@type') == 'FAQPage': out.append((m.start(), m.end(), d))
    return out


def structured_faq(html):
    pairs = []
    for _, _, d in find_faq_scripts(html):
        for q in d.get('mainEntity', []):
            pairs.append((q.get('name', ''), (q.get('acceptedAnswer') or {}).get('text', '')))
    return pairs


def diverges(html):
    """Liste des écarts entre la FAQ visible et la FAQ structurée (vide = conforme)."""
    vis, struct = visible_faq(html), structured_faq(html)
    scripts = find_faq_scripts(html)
    errs = []
    if not vis and scripts: errs.append('FAQPage présent sans FAQ visible')
    if vis and len(scripts) != 1: errs.append(f'{len(scripts)} blocs FAQPage pour une FAQ visible')
    if vis and scripts:
        if len(vis) != len(struct): errs.append(f'{len(struct)} questions structurées pour {len(vis)} visibles')
        for i, ((vq, va), (sq, sa)) in enumerate(zip(vis, struct), 1):
            if norm(vq) != norm(sq): errs.append(f'question {i} ≠ visible : « {sq[:60]} »')
            elif norm(va) != norm(re.sub(r'<[^>]+>', '', sa)): errs.append(f'réponse {i} ≠ visible : « {sa[:60]} »')
    for m in re.finditer(r'<p class="q">', html): errs.append('question de FAQ en <p> (attendu : <h3 class="q">)'); break
    return errs


def sync(html):
    """Renvoie le HTML avec un bloc FAQPage égal à la FAQ visible (ou sans FAQPage si pas de FAQ visible)."""
    pairs = visible_faq(html)
    scripts = find_faq_scripts(html)
    if not pairs:
        for s, e, _ in reversed(scripts):
            # retire aussi l'indentation qui précède et le saut de ligne qui suit
            ls = html.rfind('\n', 0, s) + 1
            if html[ls:s].strip() == '': s = ls
            if html[e:e + 1] == '\n': e += 1
            html = html[:s] + html[e:]
        return html
    new = faq_script(pairs)
    if scripts:
        s, e, _ = scripts[0]
        html = html[:s] + new + html[e:]
        for s2, e2, _ in reversed(scripts[1:]): html = html[:s2] + html[e2:]
    else:
        html = html.replace('</head>', '    ' + new + '\n</head>', 1)
    return html


def main():
    write = '--write' in sys.argv
    bad = 0
    for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        with open(p, encoding='utf-8', newline='') as f: t = f.read()
        errs = diverges(t)
        if errs:
            bad += 1
            name = os.path.basename(p)
            if write:
                new = sync(t)
                if new != t:
                    tmp = p + '.new'
                    with open(tmp, 'w', encoding='utf-8', newline='') as f: f.write(new)
                    os.replace(tmp, p)
                    print(f'{name} : FAQPage régénéré')
                rest = [e for e in diverges(new) if 'en <p>' not in e]
                if rest: print(f'{name} : reste → ' + ' ; '.join(rest))
            else:
                print(f'{name} : ' + ' ; '.join(errs))
    print(f'faq_jsonld : {bad} page(s) {"corrigée(s)" if write else "en écart"}.')
    sys.exit(0 if (write or not bad) else 1)


if __name__ == '__main__':
    main()
