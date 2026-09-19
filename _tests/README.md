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
    npm run test:html        # validation HTML W3C de toutes les pages (Java ≥ 11 requis ; sinon sautée — GitHub la fait)
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

Depuis le tour 25 (19/09/2026), la mention « Relu le » utilise exclusivement `lastReviewed`.
Une modification de présentation ou de coordonnées (`dateModified`) ne devient pas une nouvelle
relecture médicale. Sans date de relecture explicite, cette mention est omise. Deux régressions
dans `test_llms_full.py` sont vérifiées par `npm run test:static` et le workflow GitHub.

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

Depuis le tour 19 (TECH19AR-2026-09-15), la CSP impose les Trusted Types (`require-trusted-types-for 'script'`, `trusted-types 'none'`) : le
navigateur refuse toute chaîne brute confiée à un puits d'exécution (innerHTML, insertAdjacentHTML, eval, document.write, script.src…) —
défense en profondeur contre les XSS par le DOM, sans effet sur le site (nav.js n'écrit jamais de HTML). `check_static.py` exige les deux
directives et refuse tout puits dans `nav.js` ; `browser.mjs` vérifie sur la home que l'interdiction s'applique (innerHTML → TypeError) ;
`prod_check.py` compare déjà la CSP servie à `_headers`. Tout futur script qui devrait écrire du HTML passera par `textContent`/`createElement`.

**lighthouse.mjs** — mobile, réseau 4G lent simulé, sur `/`, `/decollement-retine`, `/pathologies`,
`/secheresse-oculaire`. Échec si performance < 90, accessibilité / bonnes pratiques / SEO < 100,
CLS > 0,05 ou LCP > 2,5 s ; avertissement si performance < 95. Les seuils sont en tête du fichier.

Depuis le tour 19 (TECH19AS-2026-09-15), toute `<section>` porte un titre ou un nom (`aria-label`) — les chapôs sans titre sont des
`<div>` — et tout `<svg>` en ligne est décoratif (`aria-hidden="true"`) ou nommé (`role="img"`) : `check_static.py` le vérifie. Les titres de
références en anglais sont balisés `<em lang="en">` (WCAG 3.1.2).
Les chapôs en `<div>` des familles m2/m3 gardent le `padding: 60px 0` sous 30 em de leurs anciennes `<section>` (règle en fin de `main.css`, exigée par
`check_static.py`) : rendu identique au pixel (captures 390/1366 comparées).

## Vocabulaire schema.org

`check_static.py` confronte chaque bloc JSON-LD au vocabulaire schema.org (`_tests/schemaorg_vocab.json` : types, propriétés
avec héritage, membres des énumérations) : `@type` inconnu, propriété hors du domaine de son type, énumération inexistante
(ex. `https://schema.org/Ophthalmologic`, qui n'existe pas) sont des erreurs (TECH9S-2026-09-12). Le fichier est généré par
`_tests/schemaorg_vocab.py` depuis le paquet npm `schema-dts` (voir son en-tête pour le régénérer).

## Validation HTML W3C

Depuis le tour 19 (TECH19AT-2026-09-15), `html_validate.mjs` passe toutes les pages au Nu Html Checker (le validateur de validator.w3.org,
`vnu.jar` fourni par le paquet npm `vnu-jar`, version figée et empreinte dans `package-lock.json`) : toute erreur ET tout avertissement
est un échec, sauf deux avertissements assumés — `role="list"` sur `<ul>` (Safari/VoiceOver retire la sémantique de liste quand
`list-style: none`) et `role="contentinfo"` sur `<footer>` (redondant, sans effet). Java ≥ 11 est requis ; absent, le contrôle est sauté
avec un message — GitHub le fait à chaque push (job « Validation HTML W3C »). `_tests/.npmrc` (`ignore-scripts`) empêche `vnu-jar` de
télécharger un Java à l'installation.

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

Depuis le tour 23 (19/09/2026), les captures attendent le décodage de toutes les images,
y compris celles chargées normalement au défilement. Une image en erreur fait échouer
la capture. Cette anticipation ne s'applique pas aux tests de performance Lighthouse.

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

Depuis le tour 20 (TECH20AU-2026-09-16), tout texte de lecture est limité à 42 em de large — la « règle des 60 caractères » de
DESIGN.md, jusque-là appliquée au seul corps des fiches — y compris sous-titres d'en-tête, blocs « À propos de cette fiche », intros
du hub, chapôs des pages piliers, résumés de /publications, travaux du service, pages légales et ligne des associés du menu :
`browser.mjs` compte les caractères de chaque ligne rendue (Range, texte sr-only exclu) sur toutes les pages à 1 366 et 1 920 px et
refuse toute ligne de plus de 90 caractères, espaces compris (pied de page et menus hors champ) ; `check_static.py` exige le bloc
TECH20AU de `main.css` et sa règle `max-width: 42em`.

Depuis le tour 20 (TECH20AV-2026-09-16), plus aucun encadré ne porte de liseré gauche épais (DESIGN.md « Shapes » : bordures fines
1 px, le signal vient du fond) — les cinq derniers (liste « Parcours patient » des pages piliers, encadré « Expertise », encadré
d'information de /myopie, introduction et cartes presse de /publications) sont passés à `border: 1px solid var(--border)` :
`browser.mjs` refuse toute bordure gauche pleine ≥ 3 px sur les 48 pages à 1 366 px (tableaux exclus) ; `check_static.py` exige le
bloc TECH20AV de `main.css`.

Depuis le tour 20 (TECH20AW-2026-09-16), aucune transition n'anime une propriété de mise en page (le glissement des liens du
méga-menu et de la flèche des liens « En savoir plus » / « Lire la fiche » se fait par `transform`, composé sans reflow) :
`browser.mjs` lit le `transition-property` calculé de tous les éléments de 4 pages à 1 366 et 390 px (seule exception : `max-height`
des panneaux d'accordéon du tiroir mobile) ; `check_static.py` refuse `transition: gap` et `padding-left 0.15s` dans `main.css`.

Depuis le tour 20 (TECH20AX-2026-09-16), la colonne de lecture des fiches sur téléphone s'élargit : sous 37,5 em le pictogramme
d'alerte passe au-dessus du texte et les encadrés prennent 18 px de marge intérieure, sous 30 em les gouttières (conteneur, carte
blanche) passent à 16 px et les sections du hub à 20 px (au lieu de 60) — l'alerte de /dmla passe de 26 à 36 caractères par ligne
à 390 px : `browser.mjs` exige, à 390 et 320 px sur 4 fiches, une largeur utile ≥ largeur d'écran − 120 px pour l'alerte, les
`.forme-box`, les réponses de FAQ et le bloc « À propos », et ≤ 100 px entre le dernier symptôme et « DMLA » sur le hub ;
`check_static.py` exige le bloc TECH20AX de `main.css` et ses trois règles clés.

Depuis le tour 20 (TECH20AZ-2026-09-16), la barre fixe « Appeler / Prendre rendez-vous » précède `<main>` dans le DOM (elle était
après le pied de page : au clavier ou au lecteur d'écran sur téléphone, le premier lien Doctolib d'une fiche venait après 1 700 mots)
et, sur la home, elle devient `visibility: hidden` quand elle glisse hors écran (elle restait focalisable à l'aveugle) :
`check_static.py` vérifie la position sur toute page qui a une barre et la règle CSS ; `browser.mjs` tabule depuis le bouton de menu
à 390 px sur /dmla (« Appeler » → « Prendre rendez-vous » → contenu) et sur la home (barre non focalisable en haut de page, visible
en bas).

Depuis le tour 20 (TECH20BC-2026-09-16), le site signale ses pages modifiées par **IndexNow** (protocole ouvert de Bing, Yandex,
Naver, Seznam ; Bing alimente aussi Copilot, ChatGPT Search, DuckDuckGo, Ecosia et Qwant ; Google ne l'utilise pas) : un fichier
de clé public `/<clé>.txt` (32 caractères hexadécimaux, contenu = la clé) et le workflow `.github/workflows/indexnow.yml`, qui lance
`_tests/indexnow_submit.py` à chaque push sur `main` touchant une page — pages HTML modifiées entre les deux commits (un simple
changement du jeton `?v=` ne compte pas), filtrées par `sitemap.xml` (donc jamais une page noindex), attente ≤ 6 min que Netlify
serve la nouvelle version, puis POST vers `api.indexnow.org` (200 ou 202 attendu). À la main : `python3 _tests/indexnow_submit.py
--all --dry-run` (affiche la requête sans l'envoyer) ; le lancement manuel du workflow (onglet Actions → IndexNow → Run workflow)
soumet toutes les URL du sitemap, utile après un changement de clé. `check_static.py` vérifie le fichier de clé (unique, contenu =
nom, hors sitemap), le script et le workflow ; `prod_check.py` vérifie que la clé est servie en production.

Depuis le tour 20 (TECH20BA-2026-09-16), sur le hub /pathologies le titre « Commencer par vos symptômes » a le style des autres
rubriques (1,6 rem, filet sable — il était en libellé de 0,8 rem) et les quatre cartes DMLA sont en deux colonnes (≥ 400 px) :
`browser.mjs` le vérifie à 1 366 px ; `check_static.py` exige le bloc TECH20BA de `main.css`.

Depuis le tour 21 (TECH21BD-2026-09-16), tout encadré d'alerte qui prescrit une consultation rapide (« en urgence », « sous 24-48 h »,
« sans délai »…) offre un moyen d'agir : un lien `tel:` dans le texte ou le bloc `p.alert-actions` du hub (« Appeler le cabinet — 01 84 19 11 66 » +
« Urgences : conduite à tenir »), ajouté sur neuf fiches (cataracte, chirurgie-retine, dmla, dmla-seche, grille-amsler, hemorragie-intravitreenne,
myopie-forte, neovaisseaux-choroidiens-myope-fort, secheresse-oculaire). `check_static.py` le vérifie sur toutes les pages (heuristique : le texte de
l'encadré contient « consult » et un mot d'urgence) ; `browser.mjs` contrôle sur trois fiches × 390/1 366 px que les deux boutons sont visibles,
hauts d'au moins 44 px et contenus dans l'encadré. Les encadrés d'information (positionnement, gaz, dépistage annuel…) ne sont pas concernés.

Depuis le tour 21 (TECH21BE-2026-09-16), le portrait du hero de la home est servi par plage d'écran : trois `<source media="(max-width: 860px)">`
(AVIF, WebP, JPEG ; candidats 400 et 800 px) réservent le 800 px aux téléphones, même 3× (46 Ko AVIF au lieu de 93 Ko pour une fenêtre de 390 px —
l'image LCP), et les écrans plus larges gardent 400/800/1 080 px ; le préchargement `<link rel="preload" as="image">` est scindé de la même façon
(`media`). `check_static.py` vérifie les trois sources, les fichiers et l'égalité préchargement ↔ sources ; `browser.mjs` vérifie le `currentSrc`
sur quatre profils (390×3, 412×2,625, 375×2 → 800 ; 1 366×2 → 1 080) et qu'un seul fichier du portrait est demandé par chargement.

Depuis le tour 21 (TECH21BF-2026-09-16, lot AQ du tour 18 rebasé), les titres `h1`-`h4` sont composés en `text-wrap: balance` (mots répartis sur
les lignes du titre, plus de dernier mot seul) et les `p`, `li`, `dd` de `<main>` en `text-wrap: pretty` (pas de mot orphelin en fin de paragraphe) —
amélioration progressive, sans ligne ajoutée (mesuré au tour 18 : 0 hauteur changée sur 48 pages × 390/1 366 px). `check_static.py` exige les deux
règles ; `browser.mjs` vérifie les styles calculés sur 3 pages × 2 largeurs et qu'aucun bloc n'est plus haut qu'avec `text-wrap: wrap` forcé.

Depuis le tour 21 (TECH21BG-2026-09-16), le complément « sur Doctolib » des boutons de fin de fiche (`span.btn-more`) commence par un vrai espace
(46 occurrences) et sa marge CSS est annulée : l'arbre d'accessibilité lisait « PRENDRE RENDEZ-VOUSSUR DOCTOLIB » / « CRÉNEAU URGENCESUR DOCTOLIB »
(l'espace n'était qu'une marge). `check_static.py` refuse tout `span.btn-more` sans espace en tête et exige la règle ; `browser.mjs` lit les noms
accessibles des liens Doctolib dans l'arbre CDP sur /dmla, /decollement-retine et /pathologies à 1 366 px (aucun « …VOUSSUR… », « … SUR DOCTOLIB » présent).

Depuis le tour 21 (TECH21BH-2026-09-16), un `.key-facts` sans tuile `.key-fact` (dix-sept blocs de sept pages : « titre + paragraphe » de
/le-dr-majoulet, /contact et /ophtalmologue-boulogne-billancourt, « L'essentiel en 30 secondes » des fiches implants et de /photocoagulation-laser, écrits
dans la grille des chiffres clés) est rendu en flux normal (`:not(:has(.key-fact))`, `display: block`, p et li limités à 42 em) : la grille à trois colonnes
plaçait le titre en colonne 1 et le texte sur 231 px en colonne 2. Sur /le-dr-majoulet, l'entrée de sommaire « … Paris 16e »
enveloppe son libellé dans un `<span>` (le lien est un conteneur flex : un `<sup>` nu devenait un item isolé à droite). `check_static.py` exige les trois règles et
refuse tout lien de sommaire contenant un élément en ligne hors `<span>` englobant ; `browser.mjs` mesure à 1 366 px, sur quatre pages, le flux
normal des blocs (paragraphes ≥ 600 px, icônes 18 px) et l'écart sup ↔ texte (≤ 3 px).

Depuis le tour 22 (TECH22BI-2026-09-17), l'attente IndexNow (« la production sert-elle la nouvelle version de la première page
modifiée ? ») accepte aussi la version **la plus récente** de la page sur `origin/main`, relue à chaque essai (`git fetch` + `git show
origin/main:<page>`), et n'attend pas si un push suivant a retiré la page : quand plusieurs lots sont poussés en rafale (cinq en dix
secondes le 16/09), Netlify ne déploie que le dernier et ne sert jamais un commit intermédiaire — les runs IndexNow #2 (lot BD) et #5
(lot BG) avaient échoué après 6 min, 43 URL non signalées. Les URL soumises restent celles du diff `before..after`. `check_static.py`
exige la fonction `latest_blob` et l'acceptation des deux empreintes. Rattrapage fait le jour du lot : `indexnow_submit.py --all`.

Depuis le tour 22 (TECH22BJ-2026-09-17), les sections de contenu des familles m2/m3 (dix pages : /le-dr-majoulet, /contact,
/ophtalmologue-boulogne-billancourt, /chirurgie-cataracte, /chirurgie-retine, /suivi-corrections-optiques, les trois fiches implants,
/photocoagulation-laser) n'ont plus de padding de 60px 0 sur téléphone (≤ 480 px) : les règles « :where(body.m2) section » et
« :where(body.m3) section » — et leur reprise TECH19AS pour les chapôs en `<div class="page-section">` — donnaient 182 px entre deux
sections et jusqu'à 184 px sous l'en-tête, contre 48 et 76 px sur tablette et sur les fiches m1 ; une règle explicite en fin de feuille
fixe ce padding à 0. `check_static.py` refuse le retour des anciennes règles et exige la nouvelle (elle remplace la garde TECH19AS) ;
`browser.mjs` mesure à 390 px, sur quatre pages, le padding nul des blocs, ≤ 100 px avant chaque h2 de l'article et ≥ 40 px sous l'en-tête.

Depuis le tour 22 (TECH22BK-2026-09-17), /chirurgie-cataracte n'annonce plus trois « fiches à venir » pour les implants (monofocal,
torique, multifocal & EDOF) : ces cartes sont des liens vers /implants-monofocaux, /implants-toriques et /implants-multifocaux (en ligne
depuis avril), les règles `.pillar-card.soft` (carte inerte) sont retirées de la feuille, et le nœud page de /chirurgie-cataracte,
/chirurgie-retine et /suivi-corrections-optiques porte `inLanguage` « fr-FR » comme les autres. `check_static.py` refuse toute mention
« fiche à venir » / « Bientôt en ligne », toute `.pillar-card` qui ne serait pas un lien vers une page existante, le retour de
`.pillar-card.soft`, et exige `inLanguage: fr-FR` sur chaque page ; `browser.mjs` vérifie sur /chirurgie-cataracte (1 366 et 390 px) les
cinq cartes-liens cliquables avec leur flèche.

Depuis le tour 22 (TECH22BL-2026-09-17), les cartes pilier `a.pillar-card` de /chirurgie-retine et /chirurgie-cataracte ne sont plus
soulignées sur toute leur surface (titre et description) par la règle générale des liens `:where(body.v6) a` : une règle en fin de feuille
(`:where(body.v9) a.pillar-card { text-decoration: none }`) la neutralise — la décoration d'un lien se propage à son contenu, le `none`
de `.read-more` seul était sans effet. `check_static.py` exige la règle ; `browser.mjs` lit le style calculé des cartes sur les deux pages
à 1 366 et 390 px.

Depuis le tour 22 (TECH22BM-2026-09-17), la règle « paysage bas » (largeur ≤ 64 em, hauteur ≤ 30 em, paysage : barre fixe masquée et
`scroll-padding-bottom` à 0, tour 9) ne s'applique qu'aux écrans tactiles (`and (pointer: coarse)`) : un ordinateur zoomé à 200 %
(fenêtre 683 × 450, WCAG 1.4.4) n'avait plus aucun « Prendre rendez-vous » à l'écran, le CTA d'en-tête étant masqué sous 1 024 px ; il
garde désormais sa barre de 48 px, un téléphone en paysage garde l'écran entier. `check_static.py` vérifie les trois media queries
(deux en pointer: coarse, une en pointer: fine) ; `browser.mjs` charge /cataracte et / à 683 × 450 sans tactile (barre affichée, dans
l'écran, hauteur réservée) et à 844 × 390 tactile (barre masquée).

Depuis le tour 22 (TECH22BN-2026-09-17), la fiche /cataracte renvoie dans son corps vers la page de l'opération (/chirurgie-cataracte)
et vers /cataracte-secondaire-laser-yag (les deux mentions « laser YAG » sont des liens ; le bloc de fin, retitré « Pages associées »,
remplace « Trou maculaire » et « Membrane épirétinienne » par ces deux pages) : elle ne liait aucune des deux hors menu. `check_static.py`
exige les deux liens dans `<main>`.

Depuis le tour 24 (TECH24BO-2026-09-19), la home porte la facture « cadre double » validée sur maquette (19/09/2026) : le bloc
TECH24BO de `main.css` est le socle commun des lots BO-BS (cadre double en `box-shadow`, pastilles, boutons à icône imbriquée,
en-têtes de section, accès rapide, cartes, barre des points clés). `check_static.py` refuse dans ce bloc tout `!important`, toute
`font-family`, toute transition de mise en page et tout cuivre hors `.hv-btn--rdv`, et vérifie la structure des boutons à pastille
(libellé unique + pastille décorative `aria-hidden`, `.btn-primary` conservé dans `.hero-buttons` pour nav.js) ; `browser.mjs`
mesure ces boutons à 1 366, 390 et 320 px (pastille de 38 px dans le bouton, libellé sur une ligne, barre fixe masquée tant que le
CTA du hero est à l'écran).

Depuis le tour 24 (TECH24BP-2026-09-19), l'accès rapide de la home est une grille 7/5 de deux tuiles-liens suivie de la bande
« Urgence rétinienne » en pleine largeur (titre-lien vers la conduite à tenir, bouton d'appel ardoise à pastille — jamais cuivre) ;
`check_static.py` en vérifie la structure ; les textes sont ceux de l'ancienne rangée de trois cartes, mot pour mot.

Depuis le tour 24 (TECH24BQ-2026-09-19), les six cartes de spécialités de la home sont des cartes-liens à cadre double, en grille
régulière 3 × 2 (2 colonnes sur tablette, 1 sur téléphone), avec les pictogrammes du graphiste. **La photo du microscope reste une
section à part, juste après, telle quelle** (décision d'Alexandre du 19/09/2026 : une première maquette l'avait placée dans la carte
« Chirurgie de la rétine ») : `check_static.py` refuse toute photo dans une carte, tout SVG à la place d'un pictogramme, et exige
`.section-espace` hors de `#specialites` ; `browser.mjs` contrôle colonnes, hauteurs égales, pictogrammes et photo à 1 366, 768 et 390 px.

Depuis le tour 24 (TECH24BR-2026-09-19), les quatre points clés de la home tiennent dans une seule barre à cadre double
(`ul.hv-ledger-bar`, quatre cellules séparées par des filets ; 2 × 2 sur tablette, empilées sur téléphone) ; textes inchangés.

Depuis le tour 24 (TECH24BS-2026-09-19), les trois sections titrées de la home (spécialités, parcours, informations pratiques)
ont un en-tête éditorial — étiquette `.hv-eyebrow` (0,8 rem, jamais moins) + h2 à gauche, chapô à droite, filet — et la classe
`.hv-section` (112 px sur écran large, 72 puis 64 px en dessous), qui active le chapô du récit du parcours et les cadres doubles de la
carte « Postes & diplômes », de la fiche de contact et de la façade de carte. Aucun texte retiré ; trois étiquettes ajoutées
(« Consultation & chirurgie », « Parcours », « Le cabinet »). `check_static.py` vérifie les trois en-têtes et le récit continu.

Depuis le tour 23 (19/09/2026), le contrôle de longueur de ligne utilise `reading.mjs` : les espaces HTML fusionnées
sont comptées une seule fois, même entre éléments en ligne. L'ancien compteur attribuait à chaque espace d'indentation
le rectangle du même espace affiché (reproduction sur /cataracte : 95 caractères annoncés, 82 au maximum une fois
l'indentation neutralisée, pour un texte et une hauteur strictement identiques). Le seuil reste 90 caractères.
Sept cas de régression vérifient les variantes indentées, les éléments en ligne, les espaces insécables ou préservées,
les sauts de ligne et le texte masqué. Ils sont exécutés par `browser.mjs`. Pour rejouer seulement ce contrôle sur
toutes les pages à 1 366 et 1 920 px : `node _tests/reading-check.mjs`.

Depuis l’intégration du tour 23 au tour 24 (TECH24BT-2026-09-19), le nouveau design de la home reste la référence :
les six cartes à cadre double, les pictogrammes de 40 px, l’accès rapide, la barre des points clés et les en-têtes éditoriaux
sont conservés. Les descriptions des cartes passent à 1 rem ; le récit du parcours et les textes des pages piliers concernés
à 1,05 rem, en conservant le premier paragraphe en chapô de 1,12 rem. Les boutons à pastille du hero précèdent la présentation
dans le HTML ; le lien secondaire annonce « Les spécialités » et les qualifications répétées en pastilles sont retirées.
Les trois pages piliers présentent leurs fiches liées en lignes, empilées sur téléphone. La note d’urgence garde son nouveau cadre.
Les gardes du tour 24 continuent de vérifier les boutons, les cartes et les pictogrammes ; les corrections du compteur de
lisibilité et du décodage des images dans les captures sont intégrées sans supprimer ces gardes.
