#!/usr/bin/env bash
# Commit + push C2 — Refonte CSS responsive mobile/tablette
# Session 2026-04-20 (suite)
#
# Contenu :
# - Drawer latéral droit (width: min(380px, 88vw)) au lieu de menu plein écran
# - Overlay backdrop semi-transparent rgba(40,51,57,0.5)
# - Breakpoints harmonisés : 1024px (tablette), 768px (mobile), 480px (petit mobile)
# - JS enrichi : Escape key, clic overlay, clic sur lien ferme, resize reset
# - Scroll body bloqué quand menu ouvert
#
# Validation : 69/70 pages — 0 erreur HTML, 0 erreur JSON-LD, drawer complet
# Exclues : 404.html (pas de nav), mockup-mega-menu.html (fichier interne noindex)

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Nettoyage index.lock résiduel ==="
rm -f .git/index.lock

echo
echo "=== État git avant commit ==="
git status --short

echo
echo "=== Résumé des changements ==="
git diff --stat | tail -3

echo
read -p "Valider le commit + push C2 ? [o/N] " rep
if [[ "$rep" != "o" && "$rep" != "O" && "$rep" != "y" && "$rep" != "Y" ]]; then
  echo "Annulé."
  exit 0
fi

echo
echo "=== git add -A ==="
git add -A

echo
echo "=== git commit ==="
git commit -m "C2 CSS mobile : drawer lateral + breakpoints 1024/768/480

Transformation du menu mobile :
- Drawer lateral droit (width: min(380px, 88vw)) au lieu de menu plein ecran
- Overlay backdrop semi-transparent (rgba(40,51,57,0.5))
- Animation translate + fade 0.25s ease
- Scroll body bloque quand menu ouvert (overflow: hidden)

Breakpoints harmonises :
- @media (max-width: 1024px) : tablette + drawer + grilles 2 col
- @media (max-width: 768px) : mobile standard + grilles 1 col
- @media (max-width: 480px) : petit mobile (iPhone SE) + drawer plein ecran

Enrichissements JS (accessibilite) :
- Escape key ferme le menu
- Clic sur overlay ferme le menu
- Clic sur un lien interne ferme le menu (evite menu reste ouvert au changement de page)
- Resize desktop reset automatique
- aria-expanded / aria-label synchronises

Sections critiques responsive :
- .hero-content, .specialties-grid, .parcours-content, .contact-grid
- .pathologies-grid, .chirurgies-grid, .conditions-grid
- .author-block, .author-content
- footer typo reduite <480px

Impact : 69 fichiers (index.html + 68 pages secondaires + mockup interne).
Non concerne : 404.html (nav simplifiee), mockup-mega-menu.html (noindex).

Validation : 0 erreur HTML (balance tags), 0 erreur JSON-LD (3 blocs/page en moyenne)."

echo
echo "=== git push ==="
git push origin HEAD

echo
echo "=== Termine. Deploiement Netlify auto. ==="
