#!/bin/bash
# =============================================================================
# Commit + push — Batch 6bis (2026-04-22)
# Rattrapage : 13 fiches où la racine avait du contenu plus récent non-pushé
# (ex : implants-toriques, migs, chirurgie-decollement-retine, ipl, ...)
# =============================================================================
# A lancer depuis /_deploy-site/
# =============================================================================
set -e
cd "$(dirname "$0")"

echo "=== État Git avant commit ==="
git status --short
echo ""
echo "Doit afficher 13 fichiers M (modified) — aucun nouveau fichier attendu"
echo ""

read -p "Continuer le commit ? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Annulé."; exit 1; }

git add -A

git commit -m "feat(content): batch 6bis — rattrapage 13 fiches racine → _deploy-site

Contenu rédactionnel enrichi (depuis racine, plus récent que deploy) :
- Schema.org MedicalWebPage + FAQPage étoffés (5 Q&A, dateModified 2026-04-21)
- Breadcrumb corrigés (chirurgie-cataracte au lieu de pathologies)
- Bloc « L'essentiel en 30 secondes »
- Sections complètes : indications, bilan pré-op, déroulé, suites, résultats
  attendus, complications, alternatives, sources & références (DOI cités)

Fiches synchronisées (13) :
- Implants (cataracte) : toriques, monofocaux, multifocaux
- Glaucome : iridotomie-laser-yag, migs, trabéculectomie, sclérectomie
- Rétine : chirurgie-decollement-retine, photocoagulation-laser
- Surface oculaire : chirurgie-surface-oculaire, bouchons-meatiques, ipl
- Paupières : incision-chalazion

Alignement template deploy-site (8 patches techniques réappliqués) :
- Phase 4.1 : favicons SVG/PNG + PWA manifest + theme-color
- Phase 4.2 : Montserrat self-hosted (RGPD, plus de transfert IP vers Google)
- og:image corrigé (/photo.jpg → /og-image.jpg)
- Footer canonique role=contentinfo + lien Urgences 24/7
- Bloc E-E-A-T canonique (Praticien Contractuel + ancien Assistant + ancien
  Interne + FEBO) avec société savante spécialisée par fiche :
  ESCRS (implants), EGS (glaucome), EURETINA (rétine),
  TFOS DEWS II (surface/IPL), Cornea Society (chalazion)
- Mega-menu v6 : grid-template-areas, associes-sub-grid (Dr Prudhomme +
  Dr Hage), Pédiatrie, mega-footer, 8 nouvelles fiches intégrées
- Menu-overlay + JS v6 (overlay click, escape, resize 1024px)
- CSS mobile v6 (breakpoints 1024/768/480 + .eeat-block strong/a)

aria-current=\"page\" appliqué sur chaque fiche pour signaler la page courante
dans le mega-menu.

Relecture médicale Dr Majoulet : contenu validé. Références SFO + société
savante spécialisée par domaine, DOI cités en fin de fiche."

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
