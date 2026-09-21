# Navigation lorsque le script est indisponible

Le petit script commun des 48 pages active le fonctionnement habituel et écoute l’événement de ressource `error` en capture. Si la ressource concernée est exactement `/nav.js` (avec ou sans paramètres), il retire la classe `js`. Les règles CSS de secours déjà présentes rendent alors les pages accessibles et masquent le bouton de carte inactif. Une image manquante ne déclenche pas ce changement.

Ce gestionnaire reste dans le HTML pour fonctionner lorsque le fichier externe ne se charge pas. Il ne télécharge aucune autre ressource et n’ajoute aucun contenu HTML. Son empreinte SHA-256 doit rester identique à celle autorisée par `_headers` : `check_static.py` le vérifie sur toutes les pages. Aucune autorisation `unsafe-inline` n’est nécessaire.

## Vérification

Depuis `_tests` :

```sh
npm run test:nav-fallback
node nav-fallback.mjs --browsers firefox,webkit
```

Chaque moteur couvre 14 scénarios sur l’accueil et Contact, à 375 et 1366 pixels : fonctionnement normal, requête interrompue, réponse HTTP 404 et image manquante sur l’accueil. Le test suit réellement un lien du menu au clavier et contrôle aussi la présence du rendez-vous mobile et du lien cartographique.

Le parcours clavier attend que le sous-menu soit visible avant Tab. Sur WebKit/macOS, il utilise Option-Tab, qui inclut les liens avec le réglage standard de Safari ; les autres moteurs utilisent Tab. Cette différence ne change pas le code du site.

Les rapports `nav-fallback-*.json` sont conservés avec les autres rapports GitHub, y compris après un échec de test. Les services externes sont bloqués : aucune prise de rendez-vous n’est effectuée.

Références : [événement de chargement `error`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/error_event), [empreintes CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src), [raccourcis clavier Safari](https://support.apple.com/guide/safari/cpsh003/mac).
