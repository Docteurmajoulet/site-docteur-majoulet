/* nav.js — docteurmajoulet.com — TECH61-2026-09-21 (v14)
   v14 : garder le rendez-vous accessible lorsque le bouton du hero passe derrière l’en-tête.
   v13 : décaler les ancres selon la hauteur réelle de l’en-tête, notamment avec texte agrandi.
   v12 : maintenir le défilement clavier des tableaux après un agrandissement du texte ou le chargement d’une police.
   v11 : après dix secondes sans réponse de la carte, signaler l’attente et laisser son lien externe disponible.
   v10 : tiroir ancré à la fenêtre, hauteur réelle à fort zoom et avec transparence réduite ;
   position mise à jour lorsque le bandeau change de hauteur ou que la page défile.
   v9 : état des sous-menus centralisé (délais de fermeture annulés à chaque bascule),
   focus clavier préservé au survol, au changement de format et au retour de Doctolib.
   Relecture du 14/09 (tour 14, lot AD) : (1) à la souris, quitter le panneau le referme
   même après un clic sur le bouton (un clic focalise le bouton dans Chrome et Firefox :
   le panneau restait ouvert jusqu'au clic suivant) — seul un focus clavier (:focus-visible)
   le garde ouvert ; (2) au changement de format, le focus à replacer est mémorisé au fil des
   focusin : le navigateur peut avoir déjà retiré le focus du menu masqué quand la bascule
   est détectée (activeElement = body → le focus était perdu une fois sur quatre).
   v8 : bascule bureau/mobile par matchMedia en em (suit la police système agrandie).
   v7 : état « Chargement de la carte… » pendant le chargement de l'iframe Google ;
   .table-scroll focalisable seulement quand le tableau déborde réellement.
   v6 : façade Google Maps de la home — l'iframe (adresse IP transmise à Google) n'est
   créée qu'au clic sur « Afficher la carte » (RGPD : consentement par l'action).
   v5 : plus de révélation des sections .fade-in (animation retirée : le filet
   CSS du lot CSP-2026-08-25 rendait tout visible à 2,5 s de toute façon, et
   moins de mouvement pour une audience de 55-85 ans) ; le reste est la v4
   (HARDEN3-2026-08-25).
   v4 : survol du méga-menu par événements pointer (souris/stylet seulement) et
   le clic qui suit une ouverture par survol ne referme plus le panneau
   (souris : survoler puis cliquer le libellé refermait le menu ; tactile
   ≥ 1025 px : un tap émettait mouseenter puis click puis mouseleave → panneau
   ouvert, refermé, jamais visible — critique n°5). Au toucher, seul le clic
   agit (bascule) ; à la souris, drapeau hoverOpened consommé par le 1er clic.
   CSP-2026-08-25 : Content-Security-Policy sans 'unsafe-inline' — ce fichier
   est le seul JavaScript du site avec le script inline html.js (haché).
   Méga-menu desktop (disclosure : bouton + aria-expanded + aria-controls),
   tiroir mobile (toggle + overlay + Échap + clic lien + resize),
   gestion du focus du tiroir (focus initial, boucle Tab, page inerte),
   dimensionnement du tiroir d'après l'en-tête réel (topbar sur 2 lignes),
   barre RDV fixe masquée tant que le bouton RDV du hero est visible. */
(function () {
    'use strict';
    var body = document.body;
    var desktopMedia = window.matchMedia('(min-width: 64.0625em)');
    var wasDesktop = desktopMedia.matches;
    var menus = Array.prototype.map.call(document.querySelectorAll('.nav-item[data-megamenu]'), function (item) {
        return { item: item, trigger: item.querySelector('.nav-link'), closeTimer: null, hoverOpened: false };
    });
    var toggle = document.querySelector('.mobile-toggle');
    var overlay = document.querySelector('.menu-overlay');
    var nav = document.querySelector('nav.main-nav');
    var header = document.querySelector('header.site-header');
    var heroCta = document.querySelector('.hero-buttons .btn-primary');
    var stickyRdv = document.querySelector('.sticky-rdv');
    var heroObserver = null;
    var heroMargin = '';
    var FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function isDesktop() { return desktopMedia.matches; } // Même seuil en em que main.css.
    /* TECH14AD-2026-09-14 : focus clavier dans l'entrée (Tab, Entrée) — un clic de souris focalise aussi le bouton
       (Chrome, Firefox) mais sans :focus-visible ; navigateur sans :focus-visible → on garde le panneau (prudence). */
    function keyboardFocusInside(item) {
        var a = document.activeElement;
        if (!a || !item.contains(a)) { return false; }
        try { return a.matches(':focus-visible'); } catch (err) { return true; }
    }
    function cancelClose(menu) {
        clearTimeout(menu.closeTimer);
        menu.closeTimer = null;
    }
    function setOpen(menu, open) {
        cancelClose(menu);
        menu.hoverOpened = false;
        menu.item.classList.toggle('is-open', open);
        if (menu.trigger) { menu.trigger.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    }
    function closeAll(except) {
        menus.forEach(function (menu) { if (menu !== except) { setOpen(menu, false); } });
    }
    function anyOpen() { return menus.some(function (menu) { return menu.item.classList.contains('is-open'); }); }

    menus.forEach(function (menu) {
        var item = menu.item;
        var trigger = menu.trigger;
        if (!trigger) { return; }
        function hoverPointer(e) { return e.pointerType === 'mouse' || e.pointerType === 'pen'; }
        /* Survol : événements pointer, souris/stylet seulement — un tap émet aussi mouseenter puis mouseleave
           (synthétiques), ce qui ouvrait puis refermait le panneau dans la même frame. Au toucher, seul le clic agit. */
        item.addEventListener('pointerenter', function (e) {
            if (!hoverPointer(e)) { return; }
            cancelClose(menu);
            if (isDesktop() && !item.classList.contains('is-open')) {
                closeAll(menu); setOpen(menu, true); menu.hoverOpened = true;
            }
        });
        item.addEventListener('pointerleave', function (e) {
            if (!hoverPointer(e)) { return; }
            menu.hoverOpened = false;
            cancelClose(menu);
            if (isDesktop()) {
                menu.closeTimer = setTimeout(function () {
                    // Le pointeur peut sortir alors que le patient parcourt encore les liens au clavier.
                    if (isDesktop() && !keyboardFocusInside(item)) { setOpen(menu, false); }
                }, 150);
            }
        });
        item.addEventListener('focusin', function () { cancelClose(menu); });
        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            cancelClose(menu);
            if (item.classList.contains('is-open') && menu.hoverOpened) {
                /* Le panneau vient d'être ouvert par le survol : ce clic le confirme au lieu de le refermer ;
                   le clic suivant le ferme. */
                menu.hoverOpened = false;
                return;
            }
            var willOpen = !item.classList.contains('is-open');
            closeAll(menu);
            setOpen(menu, willOpen);
        });
        /* Échap sur un panneau desktop : ferme le panneau et rend le focus au bouton.
           Dans le tiroir mobile, Échap ferme tout le tiroir (gestionnaire global). */
        item.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isDesktop() && item.classList.contains('is-open')) {
                e.stopPropagation();
                setOpen(menu, false);
                trigger.focus();
            }
        });
        /* Tab-out : le panneau se ferme quand le focus quitte l'entrée (desktop) */
        item.addEventListener('focusout', function (e) {
            if (!isDesktop()) { return; }
            var next = e.relatedTarget;
            if (next && item.contains(next)) { return; }
            setOpen(menu, false);
        });
    });

    /* Clic hors du menu (desktop) */
    document.addEventListener('click', function (e) {
        if (!isDesktop()) { return; }
        menus.forEach(function (menu) { if (!menu.item.contains(e.target)) { setOpen(menu, false); } });
    });

    /* ---------- Tiroir mobile ---------- */
    function inertTargets() {
        return Array.prototype.slice.call(document.querySelectorAll('main, footer, .sticky-rdv, .topbar'));
    }
    function sizeDrawer() {
        if (!nav || !header || !body.classList.contains('menu-open')) { return; }
        /* TECH32-2026-09-20 : le tiroir ouvert est ancré à la fenêtre, y compris lorsque
           le patient réduit la transparence. Il occupe seulement l’espace sous l’en-tête,
           sans hauteur minimale qui dépasserait de la fenêtre à fort zoom. */
        var r = header.getBoundingClientRect();
        var top = Math.max(0, Math.min(window.innerHeight, r.bottom));
        nav.style.top = top + 'px';
        nav.style.height = Math.max(0, window.innerHeight - top) + 'px';
    }
    function drawerFocusables() {
        var list = nav ? Array.prototype.slice.call(nav.querySelectorAll(FOCUSABLE)) : [];
        list = list.filter(function (el) {
            return el.getClientRects().length > 0 && window.getComputedStyle(el).visibility === 'visible';
        });
        if (toggle) { list.push(toggle); }
        return list;
    }
    function openMenu() {
        if (isDesktop()) { return; }
        if (header) {
            var headerRect = header.getBoundingClientRect();
            // À fort agrandissement, le bandeau peut occuper toute la place au-dessus
            // du menu. Le faire défiler avant de verrouiller la page libère le tiroir.
            if (headerRect.top > 0 && headerRect.bottom > window.innerHeight - 96) {
                window.scrollBy({ top: headerRect.top, behavior: 'instant' });
            }
        }
        body.classList.add('menu-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Fermer le menu'); }
        inertTargets().forEach(function (el) { el.setAttribute('inert', ''); });
        sizeDrawer();
        var first = drawerFocusables()[0];
        if (first) { first.focus({ preventScroll: true }); }
    }
    function closeMenu(restoreFocus) {
        body.classList.remove('menu-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Ouvrir le menu'); }
        inertTargets().forEach(function (el) { el.removeAttribute('inert'); });
        if (nav) { nav.style.top = ''; nav.style.height = ''; }
        closeAll(null);
        if (restoreFocus && toggle) { toggle.focus(); }
    }
    if (toggle) {
        toggle.addEventListener('click', function () {
            if (body.classList.contains('menu-open')) { closeMenu(true); } else { openMenu(); }
        });
    }
    if (overlay) { overlay.addEventListener('click', function () { closeMenu(true); }); }

    /* Boucle de focus dans le tiroir : Tab après le dernier élément → premier ; Maj+Tab avant le premier → bouton menu */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || !body.classList.contains('menu-open') || isDesktop()) { return; }
        var list = drawerFocusables();
        if (!list.length) { return; }
        var first = list[0], last = list[list.length - 1];
        var active = document.activeElement;
        var inside = list.indexOf(active) !== -1;
        if (!inside) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });

    /* Échap global : tiroir (mobile, un seul appui) ou panneau ouvert au survol (desktop) */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') { return; }
        if (body.classList.contains('menu-open')) {
            closeMenu(true);
        } else if (anyOpen()) {
            closeAll(null);
        }
    });

    Array.prototype.forEach.call(document.querySelectorAll('nav.main-nav a'), function (link) {
        link.addEventListener('click', function () {
            // Un lien vers un nouvel onglet doit laisser le focus sur un contrôle encore visible au retour.
            if (body.classList.contains('menu-open')) { closeMenu(true); }
        });
    });
    /* TECH14AD-2026-09-14 : dernier élément du menu focalisé — au changement de format, le navigateur peut avoir déjà
       retiré le focus du menu devenu masqué avant que la bascule ne soit détectée (activeElement = body). Oublié dès
       qu'un élément hors du menu reçoit le focus ou que le focus quitte un élément encore affiché (clic ailleurs). */
    var navFocus = null;
    function inMenu(el) { return !!el && (el === toggle || (nav && nav.contains(el))); }
    document.addEventListener('focusin', function (e) { navFocus = inMenu(e.target) ? e.target : null; });
    document.addEventListener('focusout', function (e) {
        if (e.relatedTarget) { return; }                                   // focusin qui suit décidera
        if (e.target === navFocus && e.target.getClientRects().length > 0) { navFocus = null; }   // vrai retrait du focus
    });
    function updateLayout() {
        if (header) {
            // Même marge de lecture de 19 px, y compris si le nom occupe plusieurs lignes.
            document.documentElement.style.setProperty('--header-scroll-space', Math.ceil(header.getBoundingClientRect().height) + 19 + 'px');
        }
        observeHeroCta();
        var desktop = isDesktop();
        if (desktop !== wasDesktop) {
            var active = document.activeElement;
            var moveFocus = body.classList.contains('menu-open') || inMenu(active) || navFocus !== null;
            wasDesktop = desktop;
            navFocus = null;
            closeMenu(false);
            if (moveFocus) {
                var target = desktop && nav ? nav.querySelector('.nav-list .nav-link') : toggle;
                if (target) { target.focus(); }
            }
        } else { sizeDrawer(); }
    }
    // La police système peut franchir le seuil CSS sans événement resize.
    if (desktopMedia.addEventListener) { desktopMedia.addEventListener('change', updateLayout); }
    else { desktopMedia.addListener(updateLayout); }
    window.addEventListener('resize', updateLayout);
    updateLayout();
    // Le focus peut faire défiler la page jusqu’à l’en-tête pendant l’ouverture.
    window.addEventListener('scroll', sizeDrawer, { passive: true });
    // Suit aussi l’en-tête et l’apparition du bouton mobile : certains changements de police
    // modifient le format CSS sans émettre change ni resize, et sans changer la hauteur de l’en-tête.
    if (header && 'ResizeObserver' in window) {
        var layoutObserver = new ResizeObserver(updateLayout);
        layoutObserver.observe(header);
        // Une police agrandie peut déplacer l’en-tête sans modifier sa propre hauteur.
        var topbar = document.querySelector('.topbar');
        if (topbar) { layoutObserver.observe(topbar); }
        if (toggle) { layoutObserver.observe(toggle); }
        if (stickyRdv) { layoutObserver.observe(stickyRdv); }
    }

    /* ---------- TECH4D-2026-09-06 : façade Google Maps (home) — l'iframe n'existe qu'après le clic ---------- */
    var mapFacade = document.getElementById('map-facade');
    var mapBtn = mapFacade ? mapFacade.querySelector('.map-facade-btn') : null;
    if (mapBtn) {
        mapBtn.addEventListener('click', function () {
            var f = document.createElement('iframe');
            f.src = mapBtn.getAttribute('data-map-src');
            f.title = mapBtn.getAttribute('data-map-title') || 'Carte Google Maps';
            f.setAttribute('allowfullscreen', '');
            f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
            f.setAttribute('tabindex', '-1');
            /* même hauteur que la façade (CSSOM, autorisé par la CSP) : aucun décalage au remplacement */
            f.style.minHeight = mapFacade.getBoundingClientRect().height + 'px';
            /* TECH5F-2026-09-06 : « Chargement de la carte… » tant que Google n'a pas répondu */
            var mapWrap = mapFacade.parentNode;
            var mapStatus = document.getElementById('map-status');
            mapWrap.classList.add('map-loading');
            // Une iframe bloquée ne déclenche pas toujours load ou error (Firefox, WebKit).
            // Le délai informe sans interrompre une carte qui pourrait encore finir de charger.
            var loadingTimer = setTimeout(function () {
                mapWrap.classList.remove('map-loading');
                if (mapStatus) {
                    mapStatus.textContent = 'La carte tarde à s’afficher.';
                    mapStatus.appendChild(document.createElement('br'));
                }
            }, 10000);
            f.addEventListener('load', function () {
                clearTimeout(loadingTimer);
                mapWrap.classList.remove('map-loading');
                if (mapStatus) { mapStatus.textContent = ''; }
            });
            mapWrap.replaceChild(f, mapFacade);
            f.focus();
        });
    }

    /* ---------- TECH5F-2026-09-06 : .table-scroll — focalisable et « défilement horizontal possible » seulement si le tableau déborde ---------- */
    var scrollers = Array.prototype.slice.call(document.querySelectorAll('.table-scroll'));
    function fitTables() {
        scrollers.forEach(function (ts) {
            if (ts.scrollWidth > ts.clientWidth + 1) {
                ts.setAttribute('tabindex', '0');
                ts.setAttribute('aria-label', 'Tableau (défilement horizontal possible)');
            } else {
                ts.removeAttribute('tabindex');
                ts.setAttribute('aria-label', 'Tableau');
            }
        });
    }
    if (scrollers.length) {
        fitTables();
        window.addEventListener('resize', fitTables);
        // Le texte peut grandir sans redimensionnement de la fenêtre. Le tableau et son
        // conteneur sont suivis séparément : l'un peut déborder sans élargir l'autre.
        if ('ResizeObserver' in window) {
            var tableObserver = new ResizeObserver(fitTables);
            scrollers.forEach(function (ts) {
                tableObserver.observe(ts);
                var table = ts.querySelector('table');
                if (table) { tableObserver.observe(table); }
            });
        }
    }

    /* ---------- TECH69M-2026-10-26 : /urgences, cabinet ouvert ou fermé à l’heure de Paris (CLAUDE.md §6, piste 5) ----------
       Horaires du cabinet : du lundi au jeudi 9 h-20 h ; vendredi et samedi 9 h-18 h ; fermé le dimanche (rappel du Dr Majoulet, 29/10).
       Le bouton d’appel reçoit un badge « Ouvert » ou « Fermé » et change d’apparence (plein ou contour) ; la consigne
       écrite sous le bouton (appeler, puis les urgences en l’absence de réponse) ne change pas.
       TECH69AI-2026-10-29 : cabinet fermé les 11 jours fériés légaux (Code du travail, art. L3133-1) ; Pâques par
       l’algorithme de Meeus, d’où le lundi de Pâques, l’Ascension (+ 39 j) et le lundi de Pentecôte (+ 50 j).
       hour12: false plutôt que hourCycle (inconnu avant Safari 13 : l’heure revenait sur 12 h) ; « 24 » ramené à 0 par % 24.
       Sans JavaScript ou sans Intl, le badge reste masqué (attribut hidden) et le bouton garde son apparence pleine. */
    var jourFerie = function (annee, mois, jour) {
        var a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4;
        var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        var paques = Date.UTC(annee, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
        var feries = ['1-1', '5-1', '5-8', '7-14', '8-15', '11-1', '11-11', '12-25'];
        [1, 39, 50].forEach(function (n) {
            var x = new Date(paques + n * 86400000);
            feries.push((x.getUTCMonth() + 1) + '-' + x.getUTCDate());
        });
        return feries.indexOf(mois + '-' + jour) !== -1;
    };
    var etatCabinetParis = function () {
        if (!window.Intl || !Intl.DateTimeFormat) { return null; }
        try {
            var heureParis = {};
            new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false })
                .formatToParts(new Date()).forEach(function (p) { heureParis[p.type] = p.value; });
            var fin = { Mon: 20, Tue: 20, Wed: 20, Thu: 20, Fri: 18, Sat: 18 }[heureParis.weekday];
            if (jourFerie(parseInt(heureParis.year, 10), parseInt(heureParis.month, 10), parseInt(heureParis.day, 10))) { fin = 0; }
            var h = parseInt(heureParis.hour, 10) % 24;
            return { ouvert: Boolean(fin && h >= 9 && h < fin), fin: fin || 0 };
        } catch (e) { return null; /* fuseau inconnu */ }
    };
    var etatCabinet = document.querySelector('[data-etat-cabinet]');
    var etatUrgences = etatCabinet ? etatCabinetParis() : null;
    if (etatCabinet && etatUrgences) {
        var boutonCabinet = etatCabinet.closest('.btn-etat-cabinet');
        etatCabinet.textContent = etatUrgences.ouvert ? 'Ouvert' : 'Fermé';
        if (boutonCabinet) { boutonCabinet.classList.add(etatUrgences.ouvert ? 'est-ouvert' : 'est-ferme'); }
        etatCabinet.hidden = false;
    }

    /* ---------- TECH69AH-2026-10-29 : barre fixe selon l’heure de Paris (demande du Dr Majoulet, 29/10) ----------
       Cabinet ouvert : « Appeler le cabinet » passe en bouton principal, le rendez-vous en ligne en second.
       Cabinet fermé : le bouton d’appel disparaît, seul reste le rendez-vous en ligne (décision du Dr Majoulet, 29/10).
       Sans JavaScript ou sans Intl : la barre d’origine (rendez-vous en ligne en principal, appel à côté).
       Recalculé au retour sur l’onglet et toutes les 5 minutes ; jours fériés fermés (TECH69AI). La barre de /urgences
       (appel et « Urgences 24h/24 », sans rendez-vous en ligne) n’est pas concernée. */
    if (stickyRdv && stickyRdv.querySelector('.sticky-doctolib')) {
        var lblTel = stickyRdv.querySelector('.sticky-tel .lbl');
        var lienRdv = stickyRdv.querySelector('.sticky-doctolib');
        var texteRdv = lienRdv && lienRdv.firstChild && lienRdv.firstChild.nodeType === 3 ? lienRdv.firstChild : null;
        var libellesOrigine = { tel: lblTel ? lblTel.textContent : '', rdv: texteRdv ? texteRdv.nodeValue : '' };
        var appliquerHoraires = function () {
            var etat = etatCabinetParis();
            var ouvert = Boolean(etat && etat.ouvert);
            body.classList.toggle('cabinet-ouvert', ouvert);
            body.classList.toggle('cabinet-ferme', Boolean(etat) && !ouvert);
            if (lblTel) { lblTel.textContent = ouvert ? 'Appeler le cabinet' : libellesOrigine.tel; }
            if (texteRdv) { texteRdv.nodeValue = ouvert ? 'Rendez-vous' : libellesOrigine.rdv; }
        };
        appliquerHoraires();
        window.setInterval(appliquerHoraires, 300000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { appliquerHoraires(); } });
    }

    /* ---------- TECH69W-2026-10-27 : frise du parcours opératoire, « Imprimer ce parcours » (CLAUDE.md §6, piste 4) ----------
       Le bouton reste masqué sans JavaScript. Au clic, html.imprimer-frise limite l’impression à la frise (main.css),
       puis la classe est retirée après l’impression. */
    var boutonsFrise = document.querySelectorAll('[data-imprimer-frise]');
    if (boutonsFrise.length && typeof window.print === 'function') {
        Array.prototype.forEach.call(boutonsFrise, function (bouton) {
            var parent = bouton.closest('.frise-imprimer');
            if (parent) { parent.hidden = false; }
            bouton.addEventListener('click', function () {
                document.documentElement.classList.add('imprimer-frise');
                window.print();
            });
        });
        window.addEventListener('afterprint', function () {
            document.documentElement.classList.remove('imprimer-frise');
        });
    }

    /* ---------- TECH69AG-2026-10-29 : questions fréquentes en volets (demande du Dr Majoulet, 29/10) ----------
       La question et la réponse restent dans le HTML : Google, les assistants, l’impression et la lecture sans
       JavaScript voient tout. Avec JavaScript, la question (h3.q) reçoit un bouton plein largeur (aria-expanded,
       aria-controls) qui ouvre ou ferme la réponse, regroupée dans div.qr-reponse ; les réponses partent fermées.
       Une ancre de l’adresse qui vise une réponse ouvre son volet. */
    var blocsQR = document.querySelectorAll('.qr-block');
    Array.prototype.forEach.call(blocsQR, function (bloc, i) {
        var question = bloc.querySelector('h3.q');
        if (!question || question.querySelector('.qr-bascule')) { return; }
        var suite = [];
        for (var n = question.nextElementSibling; n; n = n.nextElementSibling) { suite.push(n); }
        if (!suite.length) { return; }
        var reponse = document.createElement('div');
        reponse.className = 'qr-reponse';
        reponse.id = 'qr-reponse-' + (i + 1);
        suite.forEach(function (el) { reponse.appendChild(el); });
        bloc.appendChild(reponse);
        var bascule = document.createElement('button');
        bascule.type = 'button';
        bascule.className = 'qr-bascule';
        bascule.setAttribute('aria-expanded', 'false');
        bascule.setAttribute('aria-controls', reponse.id);
        while (question.firstChild) { bascule.appendChild(question.firstChild); }
        question.appendChild(bascule);
        reponse.hidden = true;
        bloc.classList.add('qr-volet');
        bascule.addEventListener('click', function () {
            var ouvert = bascule.getAttribute('aria-expanded') === 'true';
            bascule.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
            reponse.hidden = ouvert;
        });
    });
    var ouvrirVoletCible = function () {
        if (!location.hash) { return; }
        var cible = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        var volet = cible && cible.closest ? cible.closest('.qr-volet') : null;
        if (!volet) { return; }
        var b = volet.querySelector('.qr-bascule');
        var r = volet.querySelector('.qr-reponse');
        if (b && r) { b.setAttribute('aria-expanded', 'true'); r.hidden = false; }
    };
    ouvrirVoletCible();
    window.addEventListener('hashchange', ouvrirVoletCible);

    /* ---------- Barre RDV fixe : un bouton entièrement accessible dans la zone de lecture ---------- */
    function observeHeroCta() {
        if (!heroCta || !('IntersectionObserver' in window)) { return; }
        // L’observateur ne voit pas les éléments fixes qui recouvrent le bouton.
        // Réserver leurs hauteurs évite aussi de masquer/afficher la barre en boucle.
        var top = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        var bottom = stickyRdv && window.getComputedStyle(stickyRdv).display !== 'none'
            ? Math.ceil(stickyRdv.getBoundingClientRect().height) : 0;
        var margin = '-' + top + 'px 0px -' + bottom + 'px 0px';
        if (heroObserver && margin === heroMargin) { return; }
        heroMargin = margin;
        if (heroObserver) { heroObserver.disconnect(); }
        body.classList.remove('hero-cta-visible');
        heroObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                body.classList.toggle('hero-cta-visible', en.isIntersecting && en.intersectionRatio >= 1);
            });
        }, { threshold: 1, rootMargin: margin });
        heroObserver.observe(heroCta);
    }

    /* ---------- TECH69D-2026-10-25 : barre RDV fixe repliée pendant la lecture ----------
       Elle se retire quand on fait défiler vers le bas, revient dès qu'on remonte, en haut et en fin de page,
       et au clavier (Tab). Sans animation demandée par le système, elle reste fixe. */
    if (stickyRdv) {
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        var lastY = window.pageYOffset;
        var ticking = false;
        var updateFold = function () {
            ticking = false;
            var y = window.pageYOffset;
            if (reduceMotion.matches) { body.classList.remove('sticky-rdv-repli'); lastY = y; return; }
            var delta = y - lastY;
            var nearEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 160;
            if (y < 240 || nearEnd || delta < -12) {
                body.classList.remove('sticky-rdv-repli');
            } else if (delta > 12 && !body.classList.contains('menu-open')) {
                body.classList.add('sticky-rdv-repli');
            }
            if (Math.abs(delta) > 12) { lastY = y; }
        };
        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; window.requestAnimationFrame(updateFold); }
        }, { passive: true });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') { body.classList.remove('sticky-rdv-repli'); lastY = window.pageYOffset; }
        });
    }
})();
