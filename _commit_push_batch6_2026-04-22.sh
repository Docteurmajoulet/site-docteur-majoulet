#!/bin/bash
# =============================================================================
# Commit + push — Batch 6 (2026-04-22)
# 8 nouvelles fiches pathologies + harmonisation E-E-A-T + corrections médicales
# =============================================================================
# A lancer depuis /_deploy-site/ (qui contient le .git)
# Prérequis : `git status` ne doit montrer QUE les modifications attendues
# =============================================================================
set -e

cd "$(dirname "$0")"

echo "=== État Git avant commit ==="
git status --short | head -10
echo "..."
git status --short | wc -l
echo "fichiers impactés"
echo ""

read -p "Continuer le commit ? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Annulé."; exit 1; }

git add -A

git commit -m "feat(content): batch 6 — 8 nouvelles fiches pathologies + harmonisation E-E-A-T

Rétine (+3) :
- Œdème maculaire cystoïde
- Hémorragie intravitréenne
- Néovaisseaux choroïdiens du myope fort

Cornée & surface (+5) :
- Kératite infectieuse
- Photokératite (UV)
- Conjonctivite
- Ptérygion
- Dystrophie de Fuchs

Alignement template deploy-site :
- Phase 4.1 : favicons SVG/PNG + PWA manifest + theme-color
- Phase 4.2 : Montserrat self-hosted (RGPD, plus de Google Fonts IP)
- og-image.jpg (remplacement /photo.jpg)

Navigation & SEO :
- Intégration mega-menu (77 fichiers HTML)
- pathologies.html : cross-links contextuels (OMC dans OVR, NVC dans myopie forte,
  fiche dédiée HIV)
- retine.html : +3 pillar-cards (14 pathologies rétiniennes suivies)
- cornee-surface-paupieres.html : +5 pillar-cards
- sitemap.xml : +8 URLs (priority 0.8–0.85)
- _redirects : +8 règles pretty URLs 301

Corrections E-E-A-T et médicales :
- Harmonisation bloc Auteur canonique sur 15 fiches
  (Praticien Contractuel + ancien Assistant + ancien Interne + FEBO)
- Suppression LipiFlow (non proposé au cabinet) → renommage ipl-lipiflow.html → ipl.html
- Fix menu mobile (CSS grid-area + flex bug)
- laser-slt.html : date révision mise à jour (22 avril 2026)
- chirurgie-retine.html : pillar-intro mise à jour (titres hospitaliers canoniques)

Relecture médicale Dr Majoulet : 15 fiches validées (rétine + cornée + chirurgie +
laser). Références SFO / EURETINA / EGS / AAO / Cornea Society."

echo ""
echo "=== Commit effectué ==="
git log --oneline -1
echo ""

read -p "Pousser vers origin/main ? [y/N] " push
if [[ "$push" == "y" || "$push" == "Y" ]]; then
    git push origin main
    echo "=== Push terminé — Netlify va rebuild automatiquement ==="
else
    echo "Push annulé. Pour pousser plus tard : git push origin main"
fi
