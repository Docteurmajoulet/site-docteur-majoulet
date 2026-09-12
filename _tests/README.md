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

Depuis le tour 11 (TECH11X-2026-09-12), `browser.mjs` passe aussi toutes les pages sur deux profils tactiles réels — iPhone SE
(375 × 667, 2×) et iPhone en paysage (844 × 390, 3×) — : débordement, chrome tronqué, barre fixe (masquée en paysage bas), console.

Depuis le tour 12 (TECH12Y-2026-09-12), Montserrat est une seule police variable (`fonts/montserrat-wght-N.woff2`, axe wght 300-700) :
`check_static.py` exige une seule `@font-face` Montserrat (variable, fichier présent), un préchargement par page vers ce fichier, aucune
référence aux anciens fichiers statiques ni fichier orphelin dans `fonts/` ; `browser.mjs` vérifie à l'usage une seule requête de police,
une FontFace « 300 700 » chargée et l'axe wght effectif (largeurs croissantes de 300 à 700).

Depuis le tour 12 (TECH12Z-2026-09-12), les pages internes sont préchargées au survol (en-tête `Speculation-Rules` → `/speculationrules.json`,
prefetch « moderate », Chrome/Edge) : `check_static.py` vérifie le JSON, l'en-tête et le Content-Type dans `_headers`, l'absence de script
inline ; `browser.mjs` vérifie à 1 366 px que les règles se chargent, qu'un survol déclenche une requête `Sec-Purpose: prefetch` et que le
clic est servi par ce préchargement ; `prod_check.py` contrôle l'en-tête sur la home et le fichier en production.

**lighthouse.mjs** — mobile, réseau 4G lent simulé, sur `/`, `/decollement-retine`, `/pathologies`,
`/secheresse-oculaire`. Échec si performance < 90, accessibilité / bonnes pratiques / SEO < 100,
CLS > 0,05 ou LCP > 2,5 s ; avertissement si performance < 95. Les seuils sont en tête du fichier.

## Vocabulaire schema.org

`check_static.py` confronte chaque bloc JSON-LD au vocabulaire schema.org (`_tests/schemaorg_vocab.json` : types, propriétés
avec héritage, membres des énumérations) : `@type` inconnu, propriété hors du domaine de son type, énumération inexistante
(ex. `https://schema.org/Ophthalmologic`, qui n'existe pas) sont des erreurs (TECH9S-2026-09-12). Le fichier est généré par
`_tests/schemaorg_vocab.py` depuis le paquet npm `schema-dts` (voir son en-tête pour le régénérer).

## FAQ structurée

Le bloc JSON-LD `FAQPage` de chaque page est généré à partir des questions-réponses visibles (`.qr-block`) :

    python3 _tests/faq_jsonld.py            # contrôle (aussi fait par check_static)
    python3 _tests/faq_jsonld.py --write    # régénère les blocs après avoir modifié une FAQ visible

Une page sans FAQ visible n'a pas de `FAQPage` ; les questions sont des `<h3 class="q">`.

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
