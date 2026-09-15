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
    npm run test:navigation  # interactions du menu : souris, clavier, tiroir et changement de format
    npm run test:lh          # Lighthouse mobile sur 4 pages clés, rapports dans _tests/reports/
    npm run serve            # le site sur http://127.0.0.1:8765/ avec les en-têtes de production (CSP incluse)

## Ce qui est vérifié

**navigation.mjs** — scénarios d’interaction sous la CSP du site : survol puis clic, fermeture au départ de la souris,
maintien du panneau tant qu’un lien garde le focus clavier, Échap et boucle Tab du tiroir, passage ordinateur/mobile,
changement de police système sans redimensionnement, retour de Doctolib avec un focus visible. Les services externes
sont bloqués. Ces contrôles font partie de `npm test` et du workflow GitHub.

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

Depuis le tour 12 (TECH12AA-2026-09-12), la carte du site dans `llms.txt` est générée par `_tests/llms_pages.py` (un lien Markdown
par page : H1, URL canonique, meta description, groupés comme le menu) ; `check_static.py` vérifie le format llmstxt.org (H1, citation,
liens Markdown, aucune URL nue). Depuis le tour 16 (TECH16AK-2026-09-14), `llms.txt` est généré EN ENTIER : identité, coordonnées,
horaires, fonctions et lieux, formation, sociétés, domaines d'expertise, actes et fiches officielles viennent du JSON-LD de la home
(nœuds Physician et MedicalClinic), les publications de la page /publications, la carte des pages du dépôt — plus aucune phrase rédigée
à part. `python3 _tests/llms_pages.py --write` est à relancer par tout lot qui ajoute, retire ou renomme une page, change un H1 ou une
description, le JSON-LD de la home ou la page /publications ; `check_static.py` refuse un fichier qui ne correspond plus au dépôt.

Depuis le tour 13 (TECH13AB-2026-09-12), chaque page porte un nœud Physician complet (telephone, address, image, url, priceRange…)
identique à celui de la home : `check_static.py` compare les deux et refuse un « about » écrit en chaîne JSON.

Depuis le tour 15 (TECH15AE-2026-09-14), `llms-full.txt` est le texte intégral des pages, généré par `_tests/llms_full.py` (par page :
H1, URL canonique, description, date de relecture, puis le contenu de `<main>` en Markdown — rien n'est rédigé à part) : `check_static.py`
refuse un fichier qui ne correspond plus aux pages ; tout lot qui modifie le texte d'une page relance `python3 _tests/llms_full.py --write`
(comme `faq_jsonld.py` et `llms_pages.py`) ; `prod_check.py` contrôle `/llms-full.txt` en production.

Depuis le tour 15 (TECH15AF-2026-09-14), le titre des fiches suit la largeur du téléphone (24 px à 320 px, 35 px dès 768 px) et les
paragraphes de l'alerte du hub sont limités à 62ch : `check_static.py` exige les deux règles dans `main.css`, `browser.mjs` mesure le titre
(≤ 25 px et ≤ 5 lignes à 320 px, ≤ 27 px à 390 px) et l'alerte (≤ 44 em à 1 366 px).

Depuis le tour 15 (TECH15AG-2026-09-14), le worksFor du nœud Physician (le cabinet, sur chaque page) est un extrait exact du nœud
MedicalClinic complet de la home (name, image, url, telephone, priceRange, address) : `check_static.py` compare les deux, clé par clé, et
exige l'adresse de la Clinique Jouvenet.

Depuis le tour 15 (TECH15AH-2026-09-14), le nœud Physician porte les horaires du praticien (ceux de sa fiche Google Business, à mettre à jour
ici si la fiche change), hasMap et l'identifiant GooglePlaceID de sa fiche, identiques sur toutes les pages ; le MedicalClinic garde les horaires
d'ouverture du cabinet, sans le place_id du praticien : `check_static.py` vérifie les deux.

Depuis le tour 15 (TECH15AI-2026-09-14), tout nœud JSON-LD portant l'@id du cabinet (worksFor, about, occupationLocation…) doit reprendre
les name / url / telephone / address du nœud MedicalClinic de la home : `check_static.py` le vérifie sur toutes les pages.

Depuis le tour 16 (TECH16AL-2026-09-14), le `lastmod` du sitemap est la date de mise à jour de la page (dateModified du JSON-LD, celle
affichée aux patients) — plus une troisième date tenue à la main : `python3 _tests/sitemap_dates.py --write` réécrit les lastmod, à lancer par
tout lot qui change la date d'une page ; `check_static.py` exige l'égalité.

Depuis le tour 17 (TECH17AM-2026-09-15), le site reste utilisable en mode « contraste élevé » (thèmes de contraste de Windows,
`forced-colors: active`) : le navigateur y efface les fonds, et tout ce qui était dessiné par un fond disparaissait — barres du bouton
de menu (plus aucun accès au menu sous 64 em ni au zoom 400 %), bordure du CTA « Prendre rendez-vous », puces, flèches en masque SVG.
Le bloc `@media (forced-colors: active)` de `main.css` (FORCED-2026-08-31, étendu) les repeint en couleurs système ; `check_static.py` exige ce bloc et ses
règles, `browser.mjs` charge quatre pages à 390 px et la home à 1 366 px dans les deux palettes (sombre et claire) et vérifie que ces
éléments restent peints.

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

Depuis le tour 17 (TECH17AN-2026-09-15), le dépôt porte un `favicon.ico` (16, 32 et 48 px, mêmes dessins que les PNG ; il répondait 404
aux outils qui le demandent à l'aveugle), `Permissions-Policy` refuse `browsing-topics` (API Topics de Chrome) et le PDF de la grille
d'Amsler déclare sa page `/grille-amsler` comme canonique (en-tête `Link`) : `check_static.py` vérifie le fichier ICO, la politique et
les deux blocs de `_headers` ; `prod_check.py` contrôle `/favicon.ico`, la politique servie et l'en-tête `Link` du PDF en production.

Depuis le tour 18 (TECH18AO-2026-09-15), `browser.mjs` force `:focus-visible` (CDP) sur chaque élément focalisable visible — toutes les
pages à 1 366 px, quatre pages à 390 px — et compare deux captures de la zone : quelque chose doit changer, et un contour déclaré doit
contraster à 3:1 au moins avec les pixels qui l'entourent (WCAG 2.2, 1.4.11). Le CTA « Prendre rendez-vous » des fiches était
invisible au focus (contour ardoise sur bloc ardoise) ; `check_static.py` exige le bloc TECH18AO de `main.css` et qu'aucune règle
postérieure ne redonne au CTA un contour d'une autre couleur.

Depuis le tour 18 (TECH18AP-2026-09-15), le bouton de la rubrique courante du menu (DMLA, Chirurgies, Autres pathologies) porte
`aria-current="true"` et l'apparence des onglets « À propos » / « Contact » sur leur page : `check_static.py` vérifie qu'il y en a un
seul, sur le bouton du panneau qui contient le lien `aria-current="page"` (aucun quand la page n'est dans aucun panneau), et que
l'icône du CTA du hero est `aria-hidden` ; `browser.mjs` contrôle l'apparence (ardoise, graisse 600) sur /dmla, /vitrectomie et
/le-dr-majoulet à 1 366 et 390 px (tiroir ouvert).
