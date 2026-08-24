/* nav.js — docteurmajoulet.com — HARDEN-2026-08-24
   Méga-menu desktop (disclosure : bouton + aria-expanded + aria-controls),
   tiroir mobile (toggle + overlay + Échap + clic lien + resize).
   Un seul fichier pour les 48 pages (remplace trois variantes inline).
   Nouveautés 24/08 : fermeture du panneau quand le focus le quitte (Tab),
   Échap global au survol, seuil mobile unique 1024 px (= CSS). */
(function () {
    'use strict';
    var MOBILE_BP = 1024;
    var body = document.body;
    var items = Array.prototype.slice.call(document.querySelectorAll('.nav-item[data-megamenu]'));
    var toggle = document.querySelector('.mobile-toggle');
    var overlay = document.querySelector('.menu-overlay');

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
        item.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && item.classList.contains('is-open')) {
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

    /* Tiroir mobile */
    function openMenu() {
        body.classList.add('menu-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Fermer le menu'); }
    }
    function closeMenu() {
        body.classList.remove('menu-open');
        if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Ouvrir le menu'); }
        closeAll(null);
    }
    if (toggle) {
        toggle.addEventListener('click', function () {
            if (body.classList.contains('menu-open')) { closeMenu(); } else { openMenu(); }
        });
    }
    if (overlay) { overlay.addEventListener('click', closeMenu); }

    /* Échap global : tiroir (mobile) ou panneau ouvert au survol (desktop) */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') { return; }
        if (body.classList.contains('menu-open')) {
            closeMenu();
            if (toggle) { toggle.focus(); }
        } else if (anyOpen()) {
            closeAll(null);
        }
    });

    Array.prototype.forEach.call(document.querySelectorAll('nav.main-nav a'), function (link) {
        link.addEventListener('click', function () { if (!isDesktop()) { closeMenu(); } });
    });
    window.addEventListener('resize', function () {
        if (isDesktop() && body.classList.contains('menu-open')) { closeMenu(); }
    });
})();
