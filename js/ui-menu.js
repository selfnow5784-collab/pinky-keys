/* ui-menu.js (v3.9-10) — classic menu bar on wide screens; a single ☰ menu on phones with the same items.
   File: Print, Share (PDF of the current view), Auto-save settings, Save current settings.
   View: Row size (Compact / Expanded), Theme (Dark, Light, Alternating white/gray, Alternating black/gray),
         Interface (scroll-to-top button), Hidden rows.
   v3.9-8: File is first; Filters and Columns are a submenu at the top of View (desktop menu bar and phone ☰), tap to open.
   The active filter count shows on "Filters (n)" inside View, and View turns pink while any filter is on.
   "Settings" = the View choices (row size, theme, columns, scroll-to-top button) — never catalog data. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const WIDE = window.matchMedia('(min-width: 700px)');
  let open = '', sub = '';
  const theme = () => Store.prefs.theme || (Store.prefs.dark === false ? 'light' : 'dark');
  const rowSize = () => Store.prefs.rowSize || 'compact';
  const mark = (on, label) => (on ? '✓ ' : '') + label;
  function items() {
    const auto = Store.prefs.autoSettings !== false;
    return {
      file: [['print', 'Print'], ['share', 'Share (PDF)…'], ['sep'], ['autoset', mark(auto, 'Auto-save settings')],
        ['saveset', 'Save current settings' + (!auto && Store.settingsUnsaved() ? ' •' : '')]],
      edit: [['add', '+ Add item'], ['hide', 'Hide selected'], ['selAll', 'Select all visible'], ['selClear', 'Clear selection'], ['sep'], ['fixes', 'My Fixes']],
      view: [['h', 'Row size'], ['row-compact', mark(rowSize() === 'compact', 'Compact')], ['row-big', mark(rowSize() === 'big', 'Expanded')],
        ['h', 'Theme'], ['theme-dark', mark(theme() === 'dark', 'Dark')], ['theme-light', mark(theme() === 'light', 'Light')],
        ['theme-alt', mark(theme() === 'alt', 'Alternating: white / gray, black text')], ['theme-altdark', mark(theme() === 'altdark', 'Alternating: black / gray, white text')],
        ['h', 'Interface'], ['fab', mark(Store.prefs.fab !== false, 'Scroll-to-top button')],
        ['sep'], ['hidden', 'Hidden rows']],
      help: [['help', 'How to use'], ['about', 'About']]
    };
  }
  const titles = { file: 'File', edit: 'Edit', view: 'View', help: 'Help' };
  const SUBS = { filters: 'Filters', columns: 'Columns' };
  const PANELS = { filters: () => SheetUI.filtersHtml(), columns: () => SheetUI.colsHtml() };
  const label = k => k === 'filters' && SheetUI.nFilters() ? 'Filters (' + SheetUI.nFilters() + ')' : (titles[k] || SUBS[k]);
  // View → Filters / Columns: tap to open the drop-down inside View
  const subsHtml = () => Object.keys(SUBS).map(k => `<button type="button" class="mi msub${sub === k ? ' open' : ''}${k === 'filters' && SheetUI.nFilters() ? ' on' : ''}" data-sub="${k}" aria-expanded="${sub === k}">${esc(label(k))} ${sub === k ? '▴' : '▾'}</button>${sub === k ? `<div class="msubp" data-for="${k}">${PANELS[k]()}</div>` : ''}`).join('') + '<div class="msep"></div>';
  function panelHtml(key) {
    return (key === 'view' ? subsHtml() : '') + items()[key].map(it => it[0] === 'sep' ? '<div class="msep"></div>' : it[0] === 'h' ? `<div class="mh">${esc(it[1])}</div>`
      : `<button type="button" class="mi" data-act="${it[0]}" role="menuitem">${esc(it[1])}</button>`).join('');
  }
  function render() {
    const root = $('#menuRoot'), btn = $('#mBtn'), wide = WIDE.matches;
    const keepScroll = root.querySelector('.mdrop, .msubp'), st = keepScroll ? keepScroll.scrollTop : 0, rst = root.scrollTop;
    if (btn) { btn.hidden = wide; if (wide) btn.setAttribute('aria-expanded', 'false'); }
    if (wide) {
      if (open === 'phone') open = '';
      root.className = 'wide' + (open ? ' open' : '');
      root.innerHTML = '<div class="mtop">' + Object.keys(titles).map(k => `<button type="button" class="mt${open === k ? ' open' : ''}${k === 'view' && SheetUI.nFilters() ? ' on' : ''}" data-mtop="${k}" aria-haspopup="true" aria-expanded="${open === k}">${esc(label(k))} ▾</button>`).join('') + '</div>' +
        (open ? `<div class="mdrop${open === 'view' && sub ? ' mdrop-sub' : ''}" role="menu" data-for="${open}">${panelHtml(open)}</div>` : '');
      if (open) {
        const b = root.querySelector(`[data-mtop="${open}"]`), d = root.querySelector('.mdrop');
        if (b && d) { d.style.left = Math.max(0, Math.min(b.offsetLeft, root.clientWidth - d.offsetWidth - 4)) + 'px'; d.scrollTop = st; }
      }
    } else {
      const show = open === 'phone';
      root.className = 'phone' + (show ? ' open' : '');
      if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
      root.innerHTML = show ? Object.keys(titles).map(k => `<div class="mhead">${titles[k]}</div>${panelHtml(k)}`).join('') : '';
      root.scrollTop = rst;
    }
  }
  function close() { if (!open) return; open = ''; sub = ''; render(); }
  function openPanel(k) { open = WIDE.matches ? 'view' : 'phone'; sub = k; render(); const p = $('#menuRoot [data-for="' + k + '"]'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' }); }
  function toggleTop(k) { open = (open === k) ? '' : k; sub = ''; render(); }
  async function act(k) {
    close();
    if (k === 'print') return SheetUI.printView();
    if (k === 'share') return PDF.shareView();
    if (k === 'autoset') return Store.setAutoSettings(Store.prefs.autoSettings === false);
    if (k === 'saveset') { await Store.saveSettings(); document.body.dataset.settingsSaved = (+document.body.dataset.settingsSaved || 0) + 1; return; }
    if (k === 'add') return SheetUI.promptAdd();
    if (k === 'hide') return SheetUI.hideSelected();
    if (k === 'selAll') { App.show('reference'); return SheetUI.selectAll(); }
    if (k === 'selClear') return SheetUI.clearSel();
    if (k === 'fixes') { App.show('data'); return FixesUI.open(); }
    if (/^theme-/.test(k)) { await Store.setPref('theme', k.split('-')[1]); return; }
    if (/^row-/.test(k)) { await Store.setPref('rowSize', k.split('-')[1]); return; }
    if (k === 'fab') { await Store.setPref('fab', Store.prefs.fab === false); return; }
    if (k === 'hidden') { App.show('data'); return DataUI.openHidden(); }
    if (k === 'help') return DataUI.openHelp();
    if (k === 'about') return U.dialog("Pinky's Auto Reference and Inventory", '<p>Version 3.9-10. Offline key reference and in-stock lookup for Pinky\'s Locksmithing.</p>', [{ label: 'Close', value: true }]);
  }
  function init() {
    $('#mBtn').onclick = e => { e.stopPropagation(); open = (open === 'phone') ? '' : 'phone'; if (!open) sub = ''; render(); };
    $('#menuRoot').addEventListener('click', e => {
      const t = e.target.closest('[data-mtop]'); if (t) { e.stopPropagation(); toggleTop(t.dataset.mtop); return; }
      const s = e.target.closest('[data-sub]'); if (s) { e.stopPropagation(); sub = sub === s.dataset.sub ? '' : s.dataset.sub;
        try { App.show('reference'); } catch (err) { console.warn('sheet redraw failed', err); } render(); return; } // v3.9-10: a sheet error can't block the submenu
      const a = e.target.closest('[data-act]'); if (a) { e.stopPropagation(); act(a.dataset.act); }
    });
    // composedPath: a chip tap re-draws the drop-down, so e.target may already be detached when this runs
    document.addEventListener('click', e => { if (!open) return; const path = e.composedPath ? e.composedPath() : [];
      if (path.some(n => n && (n.id === 'menuRoot' || n.id === 'mBtn')) || (e.target.closest && e.target.closest('#menuRoot, #mBtn, dialog'))) return; close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } });
    WIDE.addEventListener('change', () => { open = ''; sub = ''; render(); });
    render();
  }
  G.MenuUI = { init, render, close, openPanel, isOpen: () => !!open, get state() { return { open, sub }; } };
})(window);
