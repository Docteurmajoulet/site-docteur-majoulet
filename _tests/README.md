# Contrôles automatiques du site

Ce dossier contient les tests du site `docteurmajoulet.com`. Ils tournent automatiquement sur GitHub
à chaque push (`.github/workflows/checks.yml`) et peuvent être lancés à la main avant de pousser un lot.
Rien ici n'est publié sur le site (`_redirects` renvoie 404 pour `/_tests/*` et `/.github/*`).

## Lancer en local

Sans rien installer (Python 3 seulement), depuis la racine du dépôt (`_deploy-site`) :

    python3 _tests/check_static.py

Pour tout le reste (navigateur, Lighthouse, captures), une fois : `cd _tests && npm install && npx playwright install chromium`, puis :

    cd _tests
    npm test                 # statique + navigateur + Lighthouse (≈ 6 min)
    npm run test:browser     # 48 pages × 320/390/768/1366 : console, CSP, débordements, axe (≈ 4 min)
    npm run test:lh          # Lighthouse mobile sur 4 pages clés, rapports dans _tests/reports/
    npm run serve            # le site sur http://127.0.0.1:8765/ avec les en-têtes de production (CSP incluse)

## Ce qui est vérifié

**check_static.py** (quelques secondes, aucune dépendance) — pages ↔ sitemap (noindex exclus), robots,
manifest et favicons ; par page : lang, charset, viewport, title unique, meta description, canonical = URL
propre, un seul H1, hiérarchie des titres, Open Graph et Twitter, JSON-LD valide, images avec alt et
dimensions, ids uniques, liens internes résolus (fichier et ancre), liens `_blank` avec `noopener`, aucune
URL interne en `.html` ou en `http://` ; un seul script inline, dont le hash sha256 est celui de la CSP
dans `_headers` ; `main.css` et `nav.js` référencés avec le même `?v=` partout ; cibles de `_redirects`
existantes ; règles éditoriales (« baisse brutale » toujours suivi de « … de la vision » dans la phrase,
jamais « OPTAM », jamais « 24/7 »).

**browser.mjs** — chaque page à 320, 390, 768 et 1366 px, sous la CSP de production : aucune erreur
console, aucune exception, aucune violation CSP, aucune requête interne en échec, aucun débordement
horizontal ; axe-core (WCAG 2.x A/AA + bonnes pratiques) à 390 et 1366 : 0 violation. Les requêtes
externes (Doctolib, Google Maps…) sont bloquées.

**lighthouse.mjs** — mobile, réseau 4G lent simulé, sur `/`, `/decollement-retine`, `/pathologies`,
`/secheresse-oculaire`. Échec si performance < 90, accessibilité / bonnes pratiques / SEO < 100,
CLS > 0,05 ou LCP > 2,5 s ; avertissement si performance < 95. Les seuils sont en tête du fichier.

## Régression visuelle d'un lot

    node shots.mjs avant            # captures pleine page de toutes les pages (390 et 1366) → _tests/shots/avant/
    … appliquer le lot …
    node shots.mjs apres
    node shots.mjs --compare avant apres   # % de pixels différents par page, images de diff dans _tests/shots/diff-avant-apres/

`_tests/shots/`, `_tests/reports/` et `node_modules/` ne sont pas versionnés.

## Quand un contrôle échoue

- *script inline non autorisé par la CSP* : le script inline des pages a changé (ou un second a été ajouté) —
  recalculer le hash et le reporter dans `_headers`, ou revenir au script d'origine.
- *main.css référencé avec 2 versions* : un lot a oublié de bumper `?v=` sur toutes les pages.
- *CLS > 0,05* : un élément apparaît après le premier rendu (police non préchargée, image sans dimensions,
  bandeau inséré) — ouvrir `_tests/reports/lh-<page>.html`, section « Layout shifts ».
- *axe* : le message donne la règle et le premier sélecteur fautif ; détails sur https://dequeuniversity.com/rules/axe/.

## Veille de la production

`prod_check.py` (Python seul) contrôle le site **tel qu'il est servi** : pages du sitemap en 200 avec leur
canonical, en-têtes de sécurité (CSP identique à `_headers`), redirections (http, www, domaine avec tiret),
404 réelle, fichiers de service, certificat TLS (≥ 14 jours), fraîcheur (`?v=` de main.css en prod = dépôt)
et liens externes (404/410 = erreur ; délai ou anti-robot = avertissement). GitHub le lance chaque lundi
(`.github/workflows/veille-prod.yml`, mail en cas d'échec) ; à la main :

    python3 _tests/prod_check.py                # depuis le dépôt (compare aussi ?v= et lit les liens externes des pages)
    python3 _tests/prod_check.py --no-external  # sans les liens externes (≈ 20 s)
