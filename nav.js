/* nav.js — docteurmajoulet.com — HARDEN2-2026-08-24 (v2)
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
        item.addEventListener('mouseenter', function () {
            clearTimeout(tid);
            if (isDesktop()) { closeAll(item); setOpen(item, true); }
        });
        item.addEventListener('mouseleave', function () {
            if (isDesktop()) { tid = setTimeout(function () { setOpen(item, false); }, 150); }
        });
        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            clearTimeout(tid);
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
