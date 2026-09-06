/* nav.js — docteurmajoulet.com — TECH5F-2026-09-06 (v7)
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
    var MOBILE_BP = 1024;
    var body = document.body;
    var html = document.documentElement;
    var items = Array.prototype.slice.call(document.querySelectorAll('.nav-item[data-megamenu]'));
    var toggle = document.querySelector('.mobile-toggle');
    var overlay = document.querySelector('.menu-overlay');
    var nav = document.querySelector('nav.main-nav');
    var header = document.querySelector('header.site-header');
    var FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function isDesktop() { return window.innerWidth > MOBILE_BP; }
    function setOpen(item, open) {
        var t = item.querySelector('.nav-link');
        if (open) { item.classList.add('is-open'); } else { item.classList.remove('is-open'); }
        if (t) { t.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    }
    function closeAll(except) {
        items.forEach(function (it) { if (it !== except) { setOpen(it, false); } });
    }
    function anyOpen() { return items.some(function (it) { return it.classList.contains('is-open'); }); }

    items.forEach(function (item) {
        var trigger = item.querySelector('.nav-link');
        if (!trigger) { return; }
        var tid = null;
        var hoverOpened = false;
        function hoverPointer(e) { return e.pointerType === 'mouse' || e.pointerType === 'pen'; }
        /* Survol : événements pointer, souris/stylet seulement — un tap émet aussi mouseenter puis mouseleave
           (synthétiques), ce qui ouvrait puis refermait le panneau dans la même frame. Au toucher, seul le clic agit. */
        item.addEventListener('pointerenter', function (e) {
            if (!hoverPointer(e)) { return; }
            clearTimeout(tid);
            if (isDesktop() && !item.classList.contains('is-open')) {
                closeAll(item); setOpen(item, true); hoverOpened = true;
            }
        });
        item.addEventListener('pointerleave', function (e) {
            if (!hoverPointer(e)) { return; }
            hoverOpened = false;
            if (isDesktop()) { tid = setTimeout(function () { setOpen(item, false); }, 150); }
        });
        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            clearTimeout(tid);
            if (item.classList.contains('is-open') && hoverOpened) {
                /* Le panneau vient d'être ouvert par le survol : ce clic le confirme au lieu de le refermer ;
                   le clic suivant le ferme. */
                hoverOpened = false;
                return;
            }
            hoverOpened = false;
            var willOpen = !item.classList.contains('is-open');
            closeAll(item);
            setOpen(item, willOpen);
        });
        /* Échap sur un panneau desktop : ferme le panneau et rend le focus au bouton.
           Dans le tiroir mobile, Échap ferme tout le tiroir (gestionnaire global). */
        item.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isDesktop() && item.classList.contains('is-open')) {
                e.stopPropagation();
                setOpen(item, false);
                trigger.focus();
            }
        });
        /* Tab-out : le panneau se ferme quand le focus quitte l'entrée (desktop) */
        item.addEventListener('focusout', function (e) {
            if (!isDesktop()) { return; }
            var next = e.relatedTarget;
            if (next && item.contains(next)) { return; }
            setOpen(item, false);
        });
    });

    /* Clic hors du menu (desktop) */
    document.addEventListener('click', function (e) {
        if (!isDesktop()) { return; }
        items.forEach(function (item) { if (!item.contains(e.target)) { setOpen(item, false); } });
    });

    /* ---------- Tiroir mobile ---------- */
    function inertTargets() {
        return Array.prototype.slice.call(document.querySelectorAll('main, footer, .sticky-rdv, .topbar'));
    }
    function sizeDrawer() {
        if (!nav || !header || !body.classList.contains('menu-open')) { return; }
        /* Le tiroir est en position:fixed dans le bloc conteneur de l'en-tête (backdrop-filter) :
           top = hauteur de l'en-tête, hauteur = ce qui reste sous l'en-tête dans la fenêtre. */
        var r = header.getBoundingClientRect();
        nav.style.top = Math.round(r.height) + 'px';
        nav.style.height = Math.max(200, Math.round(window.innerHeight - r.bottom)) + 'px';
    }
    function drawerFocusables() {
        var list = nav ? Array.prototype.slice.call(nav.querySelectorAll(FOCUSABLE)) : [];
        list = list.filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
        if (toggle) { list.push(toggle); }
        return list;
    }
    function openMenu() {
        body.classList.add('menu-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Fermer le menu'); }
        inertTargets().forEach(function (el) { el.setAttribute('inert', ''); });
        sizeDrawer();
        var first = nav ? nav.querySelector(FOCUSABLE) : null;
        if (first) { first.focus(); }
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
        link.addEventListener('click', function () { if (!isDesktop()) { closeMenu(false); } });
    });
    window.addEventListener('resize', function () {
        if (isDesktop() && body.classList.contains('menu-open')) { closeMenu(false); }
        else { sizeDrawer(); }
    });

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
            mapWrap.classList.add('map-loading');
            f.addEventListener('load', function () { mapWrap.classList.remove('map-loading'); });
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
    if (scrollers.length) { fitTables(); window.addEventListener('resize', fitTables); }

    /* ---------- Barre RDV fixe : masquée tant que le bouton RDV du hero est à l'écran ---------- */
    var heroCta = document.querySelector('.hero-buttons .btn-primary');
    if (heroCta && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { body.classList.add('hero-cta-visible'); }
                else { body.classList.remove('hero-cta-visible'); }
            });
        }, { threshold: 0.6 });
        io.observe(heroCta);
    }
})();
