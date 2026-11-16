/* app.js (v3.9-10) — starts the app: loads data (including My Fixes, hidden rows,
   and a one-time migrate of old hand-added Inventory items), two tabs (Reference sheet +
   Data), the classic / ☰ menu, theme and row size, search index, autosave, and
   the service worker (works offline). */
(function () {
  'use strict';
  const { $ } = U;
  const TABS = ['reference', 'data'];
  let tab = 'reference';
  function show(t) {
    if (tab !== t) window.scrollTo(0, 0); tab = t; TABS.forEach(x => { $('#tab-' + x).hidden = x !== t; $('#btn-' + x).classList.toggle('active', x === t); });
    if (t === 'reference') SheetUI.render(); else { DataUI.renderFiles(); DataUI.renderPrefs(); }
    fabCheck();
  }
  function applyPrefs() {
    const p = Store.prefs, th = p.theme || (p.dark === false ? 'light' : 'dark');
    document.body.classList.toggle('light', th === 'light'); document.body.classList.toggle('alt', th === 'alt'); document.body.classList.toggle('altdark', th === 'altdark');
    document.body.dataset.theme = th; document.body.dataset.fab = p.fab === false ? 'off' : 'on'; fabCheck();
    document.body.classList.toggle('big', p.rowSize === 'big'); document.body.classList.toggle('compact', p.rowSize !== 'big');
    document.documentElement.style.fontSize = '18px';
    $('meta[name=theme-color]').content = th === 'light' ? '#ffffff' : '#000000';
  }
  // floating scroll-to-top button (View → Interface). The sheet scrolls inside its own box, so watch that too.
  function scrolled() { const sc = document.querySelector('#sheet .tscroll'); return Math.max(window.scrollY || 0, sc && tab === 'reference' ? sc.scrollTop : 0); }
  function fabCheck() { const b = $('#topFab'); if (b) b.hidden = Store.prefs.fab === false || scrolled() < 300; }
  function toTop() { const sc = document.querySelector('#sheet .tscroll'); if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  const rebuild = U.debounce(() => { Lookup.rebuild(Store.st); if (tab === 'reference') SheetUI.render(); }, 250);
  // v3.9-10: custom columns are gone. Remove what older versions stored for them (definitions, per-row values) and any
  // column id the app doesn't know from the visible-columns setting and the saved settings (e.g. a deleted 'BlueRocket').
  async function purgeCustomCols() {
    let n = 0;
    for (const k of ['customCols', 'customVals']) if ((await DB.getMeta(k)) !== undefined) { await DB.delMeta(k); n++; }
    if (await Store.cleanCols(new Set(SheetUI.COLS.map(c => c.key)))) n++;
    // (no localStorage: the app never stored anything there, and the github.io origin is shared with other sites)
    document.body.dataset.purged = n;
  }
  async function boot() {
    try { await Store.load(); await Fixes.load(); await Hidden.load(); await purgeCustomCols(); await Users.migrate(); } catch (e) { U.toast('Could not open storage: ' + e.message, true, 10000); }
    Store.prefs.autosave = true;
    Lookup.rebuild(Store.st); applyPrefs();
    [SheetUI, Card, DataUI, MenuUI].forEach(m => m.init());
    TABS.forEach(t => { $('#btn-' + t).onclick = () => show(t); });
    $('#topFab').onclick = toTop;
    window.addEventListener('scroll', fabCheck, { passive: true });
    document.addEventListener('scroll', e => { if (e.target && e.target.classList && e.target.classList.contains('tscroll')) fabCheck(); }, { passive: true, capture: true });
    Store.on(what => {
      if (what === 'prefs') { applyPrefs(); if (tab === 'reference') SheetUI.render(); if (typeof MenuUI !== 'undefined') MenuUI.render(); return; }
      if (what === 'saved' || what === 'mark') return;
      if (what === 'fixes') { if (tab === 'data') DataUI.renderFiles(); return; }
      if (what === 'hidden') { if (tab === 'reference') SheetUI.render(); DataUI.renderCounts(); return; }
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
