/* app.js (v3.9) — starts the app: loads data (including My Fixes, hidden rows, custom columns,
   and a one-time migrate of old hand-added Inventory items), two tabs (Reference sheet +
   Settings / Data), the classic / ☰ menu, theme and row size, search index, autosave, and
   the service worker (works offline). */
(function () {
  'use strict';
  const { $ } = U;
  const TABS = ['reference', 'data'];
  let tab = 'reference';
  function show(t) {
    if (tab !== t) window.scrollTo(0, 0); tab = t; TABS.forEach(x => { $('#tab-' + x).hidden = x !== t; $('#btn-' + x).classList.toggle('active', x === t); });
    if (t === 'reference') SheetUI.render(); else { DataUI.renderFiles(); DataUI.renderPrefs(); }
  }
  function applyPrefs() {
    const p = Store.prefs, th = p.theme || (p.dark === false ? 'light' : 'dark');
    document.body.classList.toggle('light', th === 'light'); document.body.classList.toggle('alt', th === 'alt');
    document.body.classList.toggle('big', p.rowSize === 'big'); document.body.classList.toggle('compact', p.rowSize !== 'big');
    document.documentElement.style.fontSize = '18px';
    $('meta[name=theme-color]').content = th === 'light' ? '#ffffff' : '#000000';
  }
  const rebuild = U.debounce(() => { Lookup.rebuild(Store.st); if (tab === 'reference') SheetUI.render(); }, 250);
  async function boot() {
    try { await Store.load(); await Fixes.load(); await Custom.load(); await Hidden.load(); await Users.migrate(); } catch (e) { U.toast('Could not open storage: ' + e.message, true, 10000); }
    Store.prefs.autosave = true;
    Lookup.rebuild(Store.st); applyPrefs();
    [SheetUI, Card, DataUI, MenuUI].forEach(m => m.init());
    TABS.forEach(t => { $('#btn-' + t).onclick = () => show(t); });
    $('#topFab').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('scroll', () => { $('#topFab').hidden = window.scrollY < 600; }, { passive: true });
    Store.on(what => {
      if (what === 'prefs') { applyPrefs(); if (tab === 'reference') SheetUI.render(); if (typeof MenuUI !== 'undefined') MenuUI.render(); return; }
      if (what === 'saved' || what === 'mark' || what === 'fixes') return;
      if (what === 'hidden' || what === 'custom') { if (tab === 'reference') SheetUI.render(); DataUI.renderCounts(); return; }
      rebuild(); if (what === 'files' || tab === 'data') DataUI.renderFiles();
    });
    window.addEventListener('beforeunload', e => { if (Store.unsaved) { Store.save(); } });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    show('reference'); document.body.dataset.ready = '1';
  }
  window.App = { show };
  boot();
})();
