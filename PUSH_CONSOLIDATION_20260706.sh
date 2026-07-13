#!/usr/bin/env bash
# ==============================================================
# PUSH_CONSOLIDATION_20260706.sh — 2026-07-06
# Pousse les 5 commits de la consolidation SEO (74 → 45 pages,
# fusion de 29 fiches en piliers + 301) vers origin/main.
# Déclenche le déploiement Netlify automatique.
# Usage : bash PUSH_CONSOLIDATION_20260706.sh
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")"

[ -d .git ] || { echo "ERREUR : pas de dépôt git ici." ; exit 1 ; }
branche=$(git branch --show-current)
[ "$branche" = "main" ] || { echo "ERREUR : branche '$branche' ≠ main." ; exit 1 ; }

echo "── Commit(s) en attente d'envoi ──"
git log origin/main..main --oneline
echo ""
echo "── Push vers origin/main ──"
git push origin main
echo ""
echo "OK. Netlify va déployer automatiquement (1-2 min)."
echo "Vérifier ensuite : https://docteurmajoulet.com/laser-slt doit rediriger vers /glaucome#slt"
