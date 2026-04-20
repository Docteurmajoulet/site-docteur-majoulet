#!/usr/bin/env bash
# Rollback C2 — Menu plein écran descendant (remplace drawer latéral bugué)
# Session 2026-04-20 (après constat visuel en prod)
#
# Stratégie :
# - Retour au pattern éprouvé pré-C2 : menu qui descend plein écran sous le header
# - CONSERVE toutes les améliorations UX de C2 :
#   * .menu-overlay (backdrop) + body.menu-open { overflow: hidden }
#   * JS enrichi : Escape, overlay click, clic-lien ferme menu, resize reset
#   * Breakpoints harmonisés 1024 / 768 / 480
#   * Sections critiques responsive (hero, grilles, footer)
# - Ajoute une animation navFadeIn 0.22s au lieu du slide-in latéral
#
# Impact : 68 fichiers (index.html + 67 pages secondaires)
# Exclues : 404.html (nav minimale), mockup-mega-menu.html (fichier interne noindex)
#
# Validation sandbox : 70/70 pages, 0 erreur HTML, 0 erreur JSON-LD, 0 résidu drawer

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Nettoyage index.lock résiduel ==="
rm -f .git/index.lock

echo
echo "=== État git avant commit ==="
git status --short

echo
echo "=== Résumé des changements ==="
git diff --stat | tail -5

echo
read -p "Valider le commit + push ROLLBACK drawer→fullscreen ? [o/N] " rep
if [[ "$rep" != "o" && "$rep" != "O" && "$rep" != "y" && "$rep" != "Y" ]]; then
  echo "Annulé."
  exit 0
fi

echo
echo "=== git add -A ==="
git add -A

echo
echo "=== git commit ==="
git commit -m "Fix C2 mobile : rollback drawer lateral -> menu plein ecran

Constat : le drawer lateral droit (width min 380px 88vw) ne s'affichait
pas correctement en production (visible seulement CHIRURGIE, backdrop
non applique, contenu de la page visible sous le drawer).

Rollback vers le pattern eprouve pre-C2 :
- body.menu-open nav.main-nav : position fixed top 76px left 0 right 0 bottom 0
- pleine largeur + hauteur restante sous le header sticky
- animation navFadeIn 0.22s (fade + slide-down de 8px)
- padding 20px 24px 60px (16px 20px 48px sur <480px, top 68px)

Conserve TOUTES les ameliorations UX de C2 :
- .menu-overlay backdrop + body.menu-open { overflow: hidden }
- JS enrichi : Escape, overlay click, clic-lien ferme menu, resize reset
- Breakpoints harmonises 1024/768/480 (tablette, mobile, petit mobile)
- Sections critiques responsive : .hero-content, .specialties-grid,
  .parcours-content, .contact-grid, .pathologies-grid, .chirurgies-grid,
  .conditions-grid, .author-block, .author-content, footer typography
- Accordion mega-panels inchange (max-height 0 -> 4000px sur .is-open)

Impact : 68 fichiers (index.html + 67 pages secondaires).
Non concerne : 404.html (nav simplifiee), mockup-mega-menu.html (noindex).

Validation sandbox : 70/70 pages OK, 0 erreur HTML, 0 erreur JSON-LD."

echo
echo "=== git push ==="
git push origin HEAD

echo
echo "=== Termine. Deploiement Netlify auto. ==="
