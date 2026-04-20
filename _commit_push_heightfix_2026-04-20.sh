#!/usr/bin/env bash
# Fix height menu mobile : bottom:0 -> height: calc(100vh - 76px)
# Session 2026-04-20
#
# Bug identifie par reproduction sandbox (Chrome headless, viewport 1440x779
# avec CSS mobile force) :
# - nav.main-nav a flex: 1 1 0% herite du desktop layout
# - Meme en position:fixed + top:76px + bottom:0, Chrome calcule la "used height"
#   a partir du flex-basis: 0% + contenu intrinseque (= 80px)
# - Le bottom:0 n'a alors aucun effet visuel
# - Resultat observe par l'utilisateur : seul CHIRURGIE visible en prod mobile
#
# Fix : height explicite calc(100vh - 76px), qui contourne le conflit flex.
# Sur <480px : height: calc(100vh - 68px) (header plus compact).
#
# Tests sandbox (Claude in Chrome headless) :
# - Avant : nav.offsetHeight = 80, seul Chirurgie visible
# - Apres : nav.offsetHeight = 703, 4 items visibles (Chirurgie/Pathologies/A propos/Contact)

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Nettoyage index.lock ==="
rm -f .git/index.lock

echo
echo "=== État git ==="
git status --short

echo
echo "=== Résumé ==="
git diff --stat | tail -5

echo
read -p "Commit + push fix height menu mobile ? [o/N] " rep
if [[ "$rep" != "o" && "$rep" != "O" && "$rep" != "y" && "$rep" != "Y" ]]; then
  echo "Annulé."
  exit 0
fi

echo
echo "=== git add -A ==="
git add -A

echo
echo "=== git commit ==="
git commit -m "Fix C2 mobile : height explicite au lieu de bottom:0

Bug identifie par debug en sandbox Chrome :
- nav.main-nav conserve flex: 1 1 0% herite du desktop layout
- Meme en position:fixed, Chrome calcule la used height a partir
  du flex-basis: 0% + contenu intrinseque (80px)
- top:76px + bottom:0 n'etend PAS l'element a la viewport
- Resultat visuel : seul le premier item visible (Chirurgie),
  les 3 autres (Pathologies, A propos, Contact) sont hors ecran

Fix : remplace bottom:0 par height: calc(100vh - 76px) explicite.
- body.menu-open nav.main-nav : height: calc(100vh - 76px)
- @media max-width:480px : height: calc(100vh - 68px) (header compact)

Test sandbox :
- Avant : nav.offsetHeight = 80
- Apres : nav.offsetHeight = 703
- Items visibles : 4/4 (tous)

Impact : 68 fichiers (index.html + 67 pages secondaires).
Non concerne : 404.html (nav minimale), mockup-mega-menu.html (noindex)."

echo
echo "=== git push ==="
git push origin HEAD

echo
echo "=== Termine. Netlify va redeployer. ==="
