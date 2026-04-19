# Paquet de déploiement — docteurmajoulet.com

**Date de génération :** 19 avril 2026
**Version :** v5.5 (header simplifié : logo gauche « Dr Majoulet — Rétinologue » + spacer + Chirurgie · Pathologies · À propos · Contact + bouton Doctolib ; homepage restaurée depuis backup avec nouveau header)

Ce dossier contient **tout ce qu'il faut uploader sur GitHub** pour mettre en
ligne la nouvelle version du site via Netlify. Rien d'autre. Aucun fichier de
travail (générateurs Python, backups, audits, brouillons) n'y figure.

---

## Contenu du paquet (95 fichiers, ~8,2 Mo)

### Pages HTML (68)

- **Accueil & pages transverses (7) :** index.html, pathologies.html, publications.html, le-dr-majoulet.html (bio), contact.html, mentions-legales.html, confidentialite.html
- **Pillars Pathologies (5) :** retine.html, cataracte-cristallin.html, glaucome-pression-oculaire.html, cornee-surface-paupieres.html, suivi-corrections-optiques.html
- **Pillars Chirurgies (4) :** chirurgie-retine.html, chirurgie-cataracte.html, chirurgie-glaucome.html, chirurgie-surface-paupieres.html
- **Fiches pathologies (22) :** dmla, decollement-retine, trou-maculaire, membrane-epiretinienne, retinopathie-diabetique, cataracte, occlusions-veineuses, dechirure-retine-corps-flottants, chorioretinopathie-sereuse-centrale, glaucome, myopie-forte, secheresse-oculaire, uveites, vitrectomie, injection-intravitreenne, keratocone, decollement-posterieur-vitre, retinite-pigmentaire, cataracte-secondaire-laser-yag, hypertension-oculaire, chalazion, blepharite
- **Fiches suivi & corrections optiques (8) :** bilan-ophtalmologique, myopie, hypermetropie, astigmatisme, presbytie, lunettes-prescription, lentilles-de-contact, suivi-diabete-hta
- **Fiches Urgences ophtalmologiques + Pédiatrie (8 — Batch 4) :** urgences-ophtalmologiques (hub), occlusion-artere-centrale-retine, baisse-brutale-vision, flashs-phosphenes-myodesopsies, amblyopie, strabisme-enfant, depistage-visuel-enfant, myopie-enfant-freination
- **Fiches transition — Batch 5 (14) :** implants-monofocaux, implants-toriques, implants-multifocaux, laser-slt, iridotomie-laser-yag, migs, trabeculectomie, sclerectomie-profonde-non-perforante, chirurgie-decollement-retine, photocoagulation-laser, chirurgie-surface-oculaire, ipl-lipiflow, incision-chalazion, bouchons-meatiques. *Ces 14 pages ont un contenu court de transition (intro factuelle + bandeau « fiche détaillée en préparation » + CTA Doctolib). Elles seront enrichies en sessions ultérieures après validation médicale.*

### Configuration Netlify (6)

- `_headers` — en-têtes HTTP (CSP, HSTS, cache)
- `_redirects` — 73 redirections 301 (docteur-majoulet.com → docteurmajoulet.com, pretty URLs)
- `sitemap.xml` — 68 URLs pour Google Search Console
- `robots.txt` — autorisation de crawl + référence au sitemap
- `llms.txt` — brief pour les LLM (ChatGPT, Perplexity, Claude…)
- `llms-full.txt` — version détaillée pour les LLM

### Images (20)

photo.jpg (portrait Dr Majoulet — utilisé en OpenGraph) ; Ophtalife-logo-blanc.png, Ophtalife-logo-fond-bleu.jpg (logos) ; 17 illustrations thématiques (Cataracte.png, Chirurgie-Retine.png, DMLA.png, Glaucome.png, etc.).

---

## Procédure d'upload sur GitHub → Netlify

### Option A : le dépôt GitHub existe déjà et est connecté à Netlify

1. Cloner le dépôt localement : `git clone https://github.com/<user>/<repo>.git`
2. Dans la copie locale, **supprimer tous les anciens fichiers** sauf `.git`, `.gitignore`, `README.md`.
3. Copier tout le contenu de `_deploy-site/` à la racine du dépôt.
4. Commit + push :

   ```bash
   git add -A
   git commit -m "v5.2 : Batch 5 — 16 fiches transition (bio, contact, 14 chirurgies) (19 avril 2026)"
   git push origin main
   ```

5. Netlify détecte le push et déploie automatiquement en 30 à 60 secondes.

### Option B : créer un nouveau dépôt GitHub

1. Sur github.com → « New repository » → nom : `docteurmajoulet` (privé ou public).
2. Dans le terminal, à la racine de `_deploy-site/` :

   ```bash
   git init
   git add -A
   git commit -m "Initial commit — site v5"
   git branch -M main
   git remote add origin https://github.com/<user>/docteurmajoulet.git
   git push -u origin main
   ```

3. Dans Netlify → « Add new site » → « Import an existing project » → sélectionner le dépôt.
4. Build settings : **aucun build command** (site statique), **publish directory** : `.` (racine).
5. Configurer le domaine : Settings → Domain management → Add custom domain `docteurmajoulet.com` + `docteur-majoulet.com` en alias.

### Option C : upload manuel sur Netlify (sans GitHub)

1. Se connecter à app.netlify.com → Sites → glisser-déposer le dossier `_deploy-site/` sur la zone « Drag and drop ».
2. Netlify déploie immédiatement et fournit une URL de prévisualisation.
3. Option plus rapide mais ne garde pas l'historique des versions.

---

## Vérifications post-déploiement

Après mise en ligne, vérifier dans l'ordre :

1. **Page d'accueil** : https://docteurmajoulet.com/ — mega menu fonctionnel (survol + clic).
2. **Pretty URLs** : https://docteurmajoulet.com/retine (sans `.html`) doit répondre 200.
3. **Redirection 301** : https://docteurmajoulet.com/retine.html doit renvoyer sur /retine (code 301).
4. **Redirection domaine** : http://docteur-majoulet.com/ → https://docteurmajoulet.com/ (301).
5. **Sitemap** : https://docteurmajoulet.com/sitemap.xml doit afficher 68 URLs en XML.
6. **robots.txt** : https://docteurmajoulet.com/robots.txt doit référencer le sitemap.
7. **Console développeur** : aucune erreur 404 sur les images/polices.
8. **Mobile** : tester le burger menu sur smartphone.
9. **Google Search Console** : soumettre le nouveau sitemap et demander une indexation.

---

## Points d'attention

- **404.html absent :** Netlify sert sa page 404 par défaut. Créer `404.html`
  (copie du modèle avec message « Page introuvable ») est recommandé.
- **Mega menu — liens 404 : résolu ✅** Les 16 pages référencées dans le mega
  menu qui produisaient des 404 sont maintenant présentes (Batch 5). Les 14
  fiches chirurgicales sont des **pages de transition** : structure SEO
  complète (title, meta, JSON-LD MedicalWebPage + FAQPage, mega menu, CTA
  Doctolib) mais corps court (intro factuelle + bandeau « fiche détaillée
  en préparation »). Objectif : éviter les 404 et tenir le signal SEO le
  temps d'enrichir chaque fiche avec validation médicale du Dr Majoulet.
- **Images lourdes :** Chirurgie.png = 1,8 Mo, photo.jpg = 2 Mo. Optimiser
  en WebP (objectif < 500 Ko) améliorerait les scores Lighthouse.
- **Domain alias :** vérifier dans Netlify que `docteur-majoulet.com` est bien
  défini comme « Domain alias » et `docteurmajoulet.com` comme « Primary domain »
  pour que la redirection 301 fonctionne.

---

## Structure de fichiers

```
_deploy-site/
├── README_UPLOAD.md          (ce fichier)
├── _headers                  (en-têtes HTTP Netlify)
├── _redirects                (redirections 301)
├── robots.txt
├── sitemap.xml
├── llms.txt
├── llms-full.txt
├── index.html
├── pathologies.html
├── publications.html
├── mentions-legales.html
├── confidentialite.html
├── retine.html, cataracte-cristallin.html, ...         (9 pillars)
├── dmla.html, glaucome.html, cataracte.html, ...       (20 fiches pathologies)
├── bilan-ophtalmologique.html, myopie.html, ...        (8 fiches optiques)
├── urgences-ophtalmologiques.html, amblyopie.html, ... (8 fiches Batch 4 — urgences + pédiatrie)
├── le-dr-majoulet.html, contact.html                   (2 pages Batch 5 — bio + contact)
├── implants-monofocaux.html, laser-slt.html, migs.html,
│   trabeculectomie.html, chirurgie-decollement-retine.html, ...
│                                                       (14 fiches transition Batch 5)
├── photo.jpg, Ophtalife-logo-*.{png,jpg}               (images principales)
└── Cataracte.png, Glaucome.png, DMLA.png, ...          (17 illustrations)
```
