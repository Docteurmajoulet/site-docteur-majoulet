#!/usr/bin/env python3
"""Vocabulaire schema.org pour check_static (TECH9S-2026-09-12) : types, propriétés par type (avec héritage) et membres
des énumérations, extraits des déclarations TypeScript du paquet npm `schema-dts` (Google), qui suit les versions de schema.org.

    _tests/schemaorg_vocab.json            ← fichier utilisé par check_static.py (ne pas éditer à la main)

Régénérer (une fois par an, ou quand un nouveau type schema.org est utilisé sur le site) :

    cd /tmp && npm pack schema-dts@latest && tar xzf schema-dts-*.tgz
    python3 _tests/schemaorg_vocab.py /tmp/package/dist/schema.d.ts        # réécrit _tests/schemaorg_vocab.json

Le module expose aussi `check(nodes)` : liste des écarts (type inconnu, propriété hors domaine, énumération inconnue) pour une
liste de nœuds JSON-LD (dictionnaires), utilisée par check_static.py.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
VOCAB_PATH = os.path.join(HERE, 'schemaorg_vocab.json')


def build(dts_path):
    d = open(dts_path, encoding='utf-8').read()
    types = {}
    for m in re.finditer(r'interface (\w+)(Base|Leaf)(?: extends ([\w, <>]+))? \{(.*?)\n\}', d, re.S):
        name, kind, ext, body = m.group(1), m.group(2), m.group(3), m.group(4)
        props = sorted(set(re.findall(r'"(\w+)"\?:', body))) if kind == 'Base' else []
        parents = [p.strip().replace('Base', '') for p in (ext or '').split(',') if p.strip() and '<' not in p]
        if kind == 'Leaf' and name in types: continue          # la « Base » porte déjà les propriétés
        types[name] = {'p': parents, 'o': props}
    enums = {}
    for m in re.finditer(r'export type (\w+) = ((?:"https://schema\.org/\w+" \| "\w+"(?: \| )?)+)', d):
        enums[m.group(1)] = re.findall(r'"https://schema\.org/(\w+)"', m.group(2))
    ver = re.search(r'"version":\s*"([^"]+)"', open(os.path.join(os.path.dirname(os.path.dirname(dts_path)), 'package.json'), encoding='utf-8').read()) if os.path.exists(os.path.join(os.path.dirname(os.path.dirname(dts_path)), 'package.json')) else None
    return {'_source': f'schema-dts {ver.group(1) if ver else "?"} (npm) — types, propriétés (héritage) et énumérations schema.org ; régénérer avec _tests/schemaorg_vocab.py',
            'types': types, 'enumerations': enums}


_V = None
def vocab():
    global _V
    if _V is None: _V = json.load(open(VOCAB_PATH, encoding='utf-8'))
    return _V


def props_of(t, _seen=None):
    """Propriétés admises pour un type, héritage compris (vide si le type est inconnu)."""
    v = vocab()['types']; _seen = _seen or set()
    if t in _seen or t not in v: return set()
    _seen.add(t); out = set(v[t]['o'])
    for p in v[t]['p']: out |= props_of(p, _seen)
    return out


def check(nodes):
    """Écarts d'une liste de nœuds JSON-LD (dict) : chaînes « type inconnu », « propriété hors domaine », « énumération inconnue »."""
    v = vocab(); types = v['types']; members = {m for ms in v['enumerations'].values() for m in ms}
    out = []
    for nd in nodes:
        t = nd.get('@type'); ts = t if isinstance(t, list) else ([t] if t else [])
        for tt in ts:
            if tt not in types: out.append(f'@type inconnu « {tt} »')
        allowed = set()
        for tt in ts: allowed |= props_of(tt)
        for k, val in nd.items():
            if k.startswith('@'): continue
            if ts and all(tt in types for tt in ts) and k not in allowed: out.append(f'propriété « {k} » hors domaine de {"/".join(ts)}')
            if isinstance(val, str) and val.startswith('https://schema.org/'):
                e = val.rsplit('/', 1)[1]
                if e not in members and e not in types: out.append(f'énumération inconnue « {val} » (propriété {k})')
                elif e not in members: out.append(f'« {val} » est un type, pas un membre d\'énumération (propriété {k}) — utiliser "@type": "{e}"')
    return out


if __name__ == '__main__':
    if len(sys.argv) != 2: print(__doc__); sys.exit(2)
    data = build(sys.argv[1])
    tmp = VOCAB_PATH + '.new'
    with open(tmp, 'w', encoding='utf-8') as f: f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    os.replace(tmp, VOCAB_PATH)
    print(f'{len(data["types"])} types, {len(data["enumerations"])} énumérations → {VOCAB_PATH}')
