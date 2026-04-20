#!/usr/bin/env bash
# Fix overlap mega-panel mobile : grid-template-areas:none ne suffit pas
# quand les enfants ont grid-area: retine/cataracte/glaucome/... nominatifs.
# Switch vers display:flex column pour neutraliser completement le grid.
#
# Bug reproduit en sandbox Chrome :
# - En mobile, les 6 .mega-col-* etaient TOUS places au meme endroit
#   (top: 161, left: -70, w: 790, h: 254) -> chevauchement total
# - gridTemplateCols: "577.656px 0px 790.344px" (implicit tracks chaotiques)
# - Cause : grid-area: retine (etc.) sur les enfants ne match aucune area
#   quand grid-template-areas: none -> tous dans la cellule (1,1)
#
# Fix : display: flex + flex-direction: column neutralise le grid-area
# car flex ignore grid-area. Resultat : empilement lineaire propre.
#
# Test apres fix :
# - Retine top 149, Cataracte 386, Glaucome 586, Surface 749, Lasers 912, Associes 1142
# - Panel total : 1462px, scrollable dans le drawer qui fait 703px

set -euo pipefail
cd "$(dirname "$0")"

rm -f .git/index.lock
echo "=== Git status ==="
git status --short
echo
echo "=== Diff stat ==="
git diff --stat | tail -5

echo
read -p "Commit + push fix overlap mega-panel ? [o/N] " rep
if [[ "$rep" != "o" && "$rep" != "O" && "$rep" != "y" && "$rep" != "Y" ]]; then
  echo "Annule."
  exit 0
fi

git add -A
git commit -m "Fix C2 mobile : mega-panel chevauchement colonnes

Bug reproduit en sandbox Chrome headless mobile viewport :
- 6 .mega-col-* tous rendus au meme endroit (top 161, w 790, h 254)
- gridTemplateCols: '577.656px 0px 790.344px' (tracks incoherents)
- Cause racine : grid-area: retine/cataracte/glaucome/surface/lasers/associes
  nominatifs sur les enfants, mais grid-template-areas: none en mobile
  -> aucune area ne matche -> Chrome les place tous dans la cellule (1,1)

Fix : passer .mega-grid-pathos et .mega-grid-chir en display: flex;
flex-direction: column en mobile. Flex ignore grid-area donc aucun
conflit, les enfants s'empilent dans l'ordre DOM.

Meme fix pour .associes-sub-grid.

Test apres fix (sandbox) :
- Retine top 149 (h 226)
- Cataracte top 386 (h 188)
- Glaucome top 586 (h 151)
- Surface top 749 (h 151)
- Lasers top 912 (h 225)
- Associes top 1142 (h 436)
- Panel total 1462px, scrollable dans le drawer 703px

Impact : 68 fichiers (index.html + 67 pages secondaires).
Non concerne : 404.html, mockup-mega-menu.html."

git push origin HEAD
echo "=== Termine. Netlify va redeployer. ==="
