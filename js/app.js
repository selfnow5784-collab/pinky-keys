/* app.js — starts the app: loads data from the phone's storage, switches tabs, keeps the
   search index fresh after edits, applies settings (dark mode, text size, floating buttons),
   drives the floating Save button (RED = unsaved changes, GREEN = all saved) and registers the
   service worker so the app works with no internet after the first visit. */
(function () {
  'use strict';
  const { $ } = U;
  const TABS = ['search', 'inventory', 'reference', 'vehicles', 'data'];
  let tab = 'search';
  function show(t) {
    if (tab !== t) window.scrollTo(0, 0); tab = t; TABS.forEach(x => { $('#tab-' + x).hidden = x !== t; $('#btn-' + x).classList.toggle('active', x === t); });
    ({ search: () => QuickSearch.run(), inventory: InventoryUI.render, reference: ReferenceUI.render, vehicles: VehiclesUI.render, data: DataUI.renderFiles })[t]();
  }
  function applyPrefs() {
    const p = Store.prefs; document.body.classList.toggle('light', !p.dark); document.documentElement.style.fontSize = (18 * (p.textSize || 1)) + 'px';
    $('#floats').hidden = !p.floating; saveBtn();
  }
  function saveBtn() {
    const b = $('#saveFab'), u = Store.unsaved; b.classList.toggle('unsaved', u); b.classList.toggle('saved', !u);
    b.textContent = u ? 'Save' : 'Saved'; b.setAttribute('aria-label', u ? 'Unsaved changes – tap to save' : 'All changes saved');
  }
  const rebuild = U.debounce(() => { Lookup.rebuild(Store.st); if (tab === 'search') QuickSearch.run(); }, 250);
  async function boot() {
    try { await Store.load(); } catch (e) { U.toast('Could not open storage: ' + e.message, true, 10000); }
    Lookup.rebuild(Store.st); applyPrefs();
    [QuickSearch, InventoryUI, ReferenceUI, VehiclesUI, DataUI].forEach(m => m.init());
    TABS.forEach(t => { $('#btn-' + t).onclick = () => show(t); });
    $('#saveFab').onclick = async () => { try { await Store.save(); U.toast('Saved'); } catch (e) { U.toast('Save failed: ' + e.message, true, 8000); } };
    $('#topFab').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    Store.on(what => { saveBtn(); if (what === 'prefs') return applyPrefs(); if (what === 'saved' || what === 'mark') return;
      rebuild(); if (what === 'inventory' && tab === 'inventory') InventoryUI.render(); if (what === 'files' || tab === 'data') DataUI.renderFiles(); });
    window.addEventListener('beforeunload', e => { if (Store.unsaved) { e.preventDefault(); e.returnValue = ''; } });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    show('search'); document.body.dataset.ready = '1';
  }
  window.App = { show, saveBtn };
  boot();
})();
