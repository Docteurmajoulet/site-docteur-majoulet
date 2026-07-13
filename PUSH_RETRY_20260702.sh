#!/usr/bin/env bash
# ==============================================================
# PUSH_RETRY_20260702.sh — 2026-07-02
# Pousse le commit local déjà créé (metas + NAP + médias +
# nettoyage) vers origin/main. Aucun nouveau commit.
# Usage : bash PUSH_RETRY_20260702.sh
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")"

[ -d .git ] || { echo "ERREUR : pas de dépôt git ici." ; exit 1 ; }
branche=$(git branch --show-current)
[ "$branche" = "main" ] || { echo "ERREUR : branche '$branche' ≠ main." ; exit 1 ; }

echo "── Commit(s) en attente d'envoi ──"
git log origin/main..main --oneline
echo ""

git push origin main

echo ""
echo "✓ Poussé. Netlify déploie automatiquement (2-3 min)."
