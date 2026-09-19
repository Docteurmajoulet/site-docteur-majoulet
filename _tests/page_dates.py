"""Vérifie les dates visibles sans confondre actualisation et relecture médicale."""
import datetime
import html
import re

MONTHS = dict(zip(
    'janvier février mars avril mai juin juillet août septembre octobre novembre décembre'.split(),
    range(1, 13),
))
LABEL = r'(Dernière révision|Dernière mise à jour|Informations pratiques mises à jour|Page actualisée le)'
TIME = re.compile(LABEL + r'\s*:?\s*<time\b[^>]*\bdatetime=([\"\'])([^\"\']+)\2[^>]*>(.*?)</time>', re.S)
BARE = re.compile(LABEL + r'\s*:?\s*\d{1,2}(?:<sup>er</sup>)?\s+[a-zéû]+\s+\d{4}')


def check_visible_dates(source, node):
    """Retourne les erreurs du libellé, du texte humain et du champ JSON-LD associé."""
    source = re.sub(r'<!--.*?-->|<script\b[^>]*>.*?</script>', '', source, flags=re.S)
    source = html.unescape(source)
    errors = []
    for match in BARE.finditer(source):
        errors.append(f'{match.group(1)} : date affichée sans <time datetime>')
    for match in TIME.finditer(source):
        label, _, iso, written = match.groups()
        written = re.sub(r'<[^>]*>', '', written)
        written = re.sub(r'\s+', ' ', written).strip()
        parts = re.fullmatch(r'(\d{1,2})(?:er)? ([a-zéû]+) (\d{4})', written)
        try:
            valid_iso = datetime.date.fromisoformat(iso).isoformat()
            if not parts:
                raise ValueError('texte de date non reconnu')
            day, month, year = parts.groups()
            displayed = datetime.date(int(year), MONTHS[month], int(day)).isoformat()
            if valid_iso != displayed:
                raise ValueError('dates différentes')
        except (ValueError, KeyError):
            errors.append(f'<time datetime="{iso}"> ≠ date écrite « {written} »')
        field = 'lastReviewed' if label == 'Dernière révision' else 'dateModified'
        expected = node.get(field)
        if expected and iso != expected:
            errors.append(f'{label} affichée {iso} ≠ {field} {expected} (JSON-LD)')
    return errors
