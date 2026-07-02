#!/usr/bin/env bash
# ==============================================================
# PUSH_METAS_NAP_MEDIAS_20260702.sh — 2026-07-02
# Dr Alexandre Majoulet — docteurmajoulet.com
# --------------------------------------------------------------
# Lot poussé en une seule release (les fichiers étant partagés
# entre les sessions, un découpage en commits séparés est
# impossible proprement) :
#
#   A. Reliquat session précédente (non poussé depuis le 7 mai) :
#      1. Fix méga-menu : lien "Hémorragie intravitréenne"
#         pointait vers /chirurgie-retine → /hemorragie-intravitreenne
#      2. Title home raccourci (≤ 60 caractères)
#      3. Icônes home : fallback PNG → WebP
#
#   B. Session du 2 juillet 2026 :
#      1. SEO — 72 meta descriptions réécrites à 150-160 caractères
#         (mot-clé en tête + localisation + action), og:description
#         alignées quand identiques (24 pages)
#      2. NAP — adresse corrigée sur 9 pages :
#         "4 avenue du Général Leclerc" → "37 rue d'Aguesseau"
#      3. Contenu — bloc "Médias et vulgarisation" sur
#         le-dr-majoulet.html + ancre #presse sur publications.html
#      4. Date de révision visible ajoutée sur
#         suivi-corrections-optiques.html
#      5. Conformité — mentions OPTAM retirées (non adhérent) :
#         llms.txt, llms-full.txt → "honoraires libres"
#      6. Nettoyage — 19 images orphelines supprimées (~700 Ko)
#         + chirurgie-surface-paupieres.html (301 déjà en place)
#      7. sitemap.xml : lastmod 2026-07-02 sur les 74 URLs,
#         llms.txt / llms-full.txt datés
#
# Usage :  cd _deploy-site && bash PUSH_METAS_NAP_MEDIAS_20260702.sh
# ==============================================================
set -euo pipefail

cd "$(dirname "$0")"

# Garde-fous
[ -d .git ] || { echo "ERREUR : pas de dépôt git ici." ; exit 1 ; }
branche=$(git branch --show-current)
[ "$branche" = "main" ] || { echo "ERREUR : branche '$branche' ≠ main." ; exit 1 ; }

echo "── État avant commit ──"
git status --short | head -20
echo "   ($(git status --short | wc -l | tr -d ' ') fichiers au total)"
echo ""
read -r -p "Committer et pousser sur origin/main ? [o/N] " rep
[ "$rep" = "o" ] || [ "$rep" = "O" ] || { echo "Abandon." ; exit 0 ; }

git add -A

git commit -m "seo: metas 150-160 car. (72 p.), NAP, bloc médias, nettoyage" -m "
- fix(menu): lien hémorragie intravitréenne → /hemorragie-intravitreenne (reliquat 7 mai)
- seo(home): title ≤ 60 car. ; icônes fallback WebP (reliquat 7 mai)
- seo(metas): 72 descriptions réécrites 150-160 car., og alignées (24 p.), zéro doublon
- fix(nap): 37 rue d'Aguesseau sur 9 pages (ex-Général Leclerc)
- content(bio): section Médias et vulgarisation + ancre #presse publications
- content(fiche): date de révision visible sur suivi-corrections-optiques
- fix(conformité): retrait OPTAM (non adhérent) — llms.txt, llms-full.txt
- chore: suppression 19 images orphelines + chirurgie-surface-paupieres.html (301 en place)
- seo(sitemap): lastmod 2026-07-02 sur 74 URLs
"

git push origin main

echo ""
echo "✓ Poussé. Netlify va déployer automatiquement."
echo "  Post-déploiement recommandé :"
echo "  1. Vérifier https://docteurmajoulet.com (home + /dmla + /le-dr-majoulet)"
echo "  2. GSC : demander l'indexation des pages clés (metas modifiées)"
echo "  3. Contrôler que /chirurgie-surface-paupieres redirige bien en 301"
