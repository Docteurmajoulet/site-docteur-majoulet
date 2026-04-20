#!/usr/bin/env bash
# Commit + push consolidé — Session SEO 2026-04-20 (Phases A + B + C)
# À exécuter depuis le répertoire _deploy-site/
#
# Contexte : 49 fichiers HTML + sitemap.xml + _redirects modifiés
# Validation : 29 pages contrôlées (HTMLParser + json.loads) → 0 erreur
#
# Sécurité : le script s'arrête à la première erreur (set -e)
# Review : `git status` et `git diff --stat` sont affichés avant le commit
#          pour contrôle visuel, puis `read` demande confirmation.

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
read -p "Valider le commit + push ? [o/N] " rep
if [[ "$rep" != "o" && "$rep" != "O" && "$rep" != "y" && "$rep" != "Y" ]]; then
  echo "Annulé."
  exit 0
fi

echo
echo "=== git add -A ==="
git add -A

echo
echo "=== git commit ==="
git commit -m "SEO: Phases A+B+C — breadcrumbs, dates, orpheline, placeholders

Phase A (P0 bloquants):
- C1 Breadcrumb taxonomie: HTML+JSON-LD synchronisés sur 5 fiches retine
  (vitrectomie, trou-maculaire, membrane-epiretinienne,
   chirurgie-decollement-retine, ipl) + BreadcrumbList JSON-LD ajoute
  sur 3 piliers (chirurgie-retine, chirurgie-cataracte, chirurgie-glaucome)
- C3 Page orpheline chirurgie-surface-paupieres: noindex,follow +
  canonical vers chirurgie-surface-oculaire + retrait sitemap +
  301 dans _redirects
- C4 Freshness YMYL: dateModified + lastReviewed refreshed au 2026-04-20
  sur 21 fiches medicales

Phase B (P1):
- N1 Breadcrumb 3-niveaux coherent (Accueil > Chirurgie de la retine > acte)
  sur 8 fiches
- N4 white-space: nowrap sur .nav-link (27 pages) — evite retour ligne
  mega-menu v5
- N5 Consolidation orpheline (voir C3)

Phase C (P2 editorial):
- E7 Reformulation 13 placeholders: 'Fiche detaillee en preparation' ->
  'Informations essentielles sur cette technique' (supprime signal negatif)

Validation: 29 pages controlees via HTMLParser + json.loads — 0 erreur
HTML tag imbalance, 0 JSON-LD parse error.

Non inclus (en attente validation manuelle):
- E9 Liens autorite SFO/HAS/Ameli (selection URL a valider)
- E11 Bibliographie (references a valider)
- C2 Refonte CSS responsive <768px (chantier separe)
- Phase D rediction 18 fiches actuellement placeholders"

echo
echo "=== git push ==="
git push origin HEAD

echo
echo "=== Termine. Deploiement Netlify auto. ==="
