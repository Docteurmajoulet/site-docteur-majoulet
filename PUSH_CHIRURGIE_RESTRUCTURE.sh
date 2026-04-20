#!/usr/bin/env bash
# ==============================================================
# PUSH_CHIRURGIE_RESTRUCTURE.sh — 2026-04-20
# Dr Alexandre Majoulet — docteurmajoulet.com
# --------------------------------------------------------------
# Lot de modifications poussées en une seule release :
#   1. Mega menu "Chirurgie" restructuré (69 pages)
#        - Col Rétine détaillée (Vitrectomie 25G/27G, DR, Trou
#          maculaire, Membrane épirétinienne, Hémorragie IV)
#        - Nouvelle col "Lasers médicaux & IVT" séparée
#          (PPR, Laser focal, IVT, SLT, Iridotomie YAG, YAG cat. sec.)
#        - Col Surface : IPL seul (LipiFlow retiré)
#   2. Renommage ipl-lipiflow.html → ipl.html
#        + redirections 301 (Netlify _redirects, sitemap.xml)
#   3. Nettoyage site-wide des mentions LipiFlow (5 pages)
#        - chirurgie-surface-oculaire.html
#        - chirurgie-surface-paupieres.html
#        - blepharite.html
#        - secheresse-oculaire.html
#        - cornee-surface-paupieres.html
# --------------------------------------------------------------
# Le script se place automatiquement à la racine du dépôt git,
# que celui-ci soit à la racine du projet ou dans _deploy-site/.
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Détection automatique de la racine du repo (robuste au layout)
if ! REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "❌ Aucun dépôt git détecté depuis : $SCRIPT_DIR"
  echo "   Ce script doit tourner dans un sous-dossier d'un repo git."
  exit 1
fi

cd "$REPO_ROOT"
echo "▶ Racine du repo : $REPO_ROOT"

# Détecte la branche (ou prévient si HEAD détaché / repo vide)
BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo '(HEAD détaché ou repo vide)')"
echo "▶ Branche : $BRANCH"

if [ "$BRANCH" = "(HEAD détaché ou repo vide)" ]; then
  echo "❌ Impossible de déterminer la branche courante (HEAD détaché ou repo sans commit initial)."
  echo "   Corriger avant de relancer : git checkout main    (ou la branche voulue)"
  exit 1
fi

# Calcule le préfixe des fichiers HTML selon où est la racine git.
# - Si racine = _deploy-site (repo dédié) → préfixe vide
# - Si racine = dossier parent du projet  → préfixe "_deploy-site/"
if [ -f "_deploy-site/index.html" ]; then
  PREFIX="_deploy-site/"
elif [ -f "index.html" ]; then
  PREFIX=""
else
  echo "❌ index.html introuvable ni à la racine ni dans _deploy-site/."
  echo "   Abandon — vérifier manuellement la structure du repo."
  exit 1
fi
echo "▶ Préfixe des fichiers : '${PREFIX:-<racine>}'"

# --- Sécurité : s'assurer que l'ancienne page est bien supprimée ---
if [ -f "${PREFIX}ipl-lipiflow.html" ]; then
  echo "⚠️  ${PREFIX}ipl-lipiflow.html existe encore — suppression pour éviter la duplication."
  git rm -f "${PREFIX}ipl-lipiflow.html"
fi

# --- Stage global : toutes les pages HTML (mega menu propagé sur 69 pages) ---
git add "${PREFIX}"*.html "${PREFIX}_redirects" "${PREFIX}sitemap.xml"

echo
echo "▶ Aperçu des fichiers modifiés :"
git status --short
echo

read -r -p "Confirmer le commit + push sur '$BRANCH' ? [o/N] " CONFIRM
CONFIRM_LC="$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')"
if [ "$CONFIRM_LC" != "o" ] && [ "$CONFIRM_LC" != "oui" ]; then
  echo "✋ Abandon demandé — aucun commit."
  exit 0
fi

COMMIT_MSG="Restructuration mega menu Chirurgie + IPL : \
(1) col Rétine détaillée (vitrectomie 25G/27G, DR, trou maculaire, MEM, hémorragie IV) — \
(2) nouvelle col Lasers médicaux & IVT (PPR, laser focal, IVT, SLT, iridotomie YAG, YAG cat. sec.) — \
(3) renommage ipl-lipiflow → ipl (+ 301) — \
(4) nettoyage site-wide LipiFlow (5 fiches : chirurgie-surface-oculaire/paupieres, blepharite, secheresse-oculaire, cornee-surface-paupieres). \
Motif médical : LipiFlow non pratiqué au Cabinet Ophtalife."

git commit -m "$COMMIT_MSG"
git push origin "$BRANCH"

echo
echo "✅ Push terminé sur '$BRANCH'. Netlify va builder automatiquement."
echo "   Suivre le build : https://app.netlify.com/"
