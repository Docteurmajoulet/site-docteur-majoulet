#!/bin/bash
# ============================================================================
# PUSH AUDIT — Corrections bloquants du 22/04/2026
# ============================================================================
# 2 commits à pousser vers origin/main :
#   1. fix(deonto) : retrait OPTAM, widget avis Google, purge LipiFlow
#      - index.html (OPTAM + widget avis Google)
#      - chirurgie-surface-oculaire.html (purge LipiFlow complète)
#      - ipl.html (LipiFlow → "autres dispositifs")
#      - bouchons-meatiques.html (lien IPL/LipiFlow → IPL)
#   2. fix(ui) : correction 6 liens cassés related-pathologies laser-slt.html
#
# Déploiement Netlify automatique sur push main.
# ============================================================================

set -e

cd "$(dirname "$0")"

echo "📂 Répertoire : $(pwd)"
echo ""
echo "🔍 État local :"
git log --oneline -3
echo ""

echo "🚀 Push vers origin/main..."
git push origin main

echo ""
echo "✅ Push terminé. Netlify déploie dans ~1-2 min."
echo "   Vérifier : https://app.netlify.com/"
echo ""
echo "🧪 Spot-check post-déploiement recommandé :"
echo "   curl -s https://docteurmajoulet.com/ | grep -c 'OPTAM'  # attendu 0"
echo "   curl -s https://docteurmajoulet.com/ | grep -c 'google-reviews-card'  # attendu 0"
echo "   curl -s https://docteurmajoulet.com/chirurgie-surface-oculaire | grep -c 'LipiFlow'  # attendu 0"
echo "   curl -s https://docteurmajoulet.com/laser-slt | grep -c 'Pathologie :'  # attendu 0"
