/* ui-menu.js — classic menu bar (File / Edit / View / Help) on wide screens; a single ☰
   menu on phones with the same items. Secondary actions live here so the Reference screen
   stays search + Filters + the sheet. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const WIDE = window.matchMedia('(min-width: 700px)');
  let open = '', phone = false;
  const theme = () => Store.prefs.theme || (Store.prefs.dark === false ? 'light' : 'dark');
  const rowSize = () => Store.prefs.rowSize || 'compact';
  const mark = (on, label) => (on ? '✓ ' : '') + label;
  function items() {
    return {
      file: [['import', 'Import CSV'], ['exportCat', 'Export catalog'], ['export', 'Export'], ['print', 'Print'], ['sep'], ['backup', 'Download backup'], ['restore', 'Restore backup'], ['sep'], ['erase', 'Erase all data']],
      edit: [['add', '+ Add item'], ['hide', 'Hide selected'], ['selAll', 'Select all visible'], ['selClear', 'Clear selection'], ['sep'], ['fixes', 'My Fixes']],
      view: [['columns', 'Columns'], ['custom', 'Custom columns'], ['filters', 'Filters'], ['sep'],
        ['theme-dark', mark(theme() === 'dark', 'Theme: Dark')], ['theme-light', mark(theme() === 'light', 'Theme: Light')], ['theme-alt', mark(theme() === 'alt', 'Theme: Alternating gray')],
        ['sep'], ['row-compact', mark(rowSize() === 'compact', 'Row size: Compact')], ['row-big', mark(rowSize() === 'big', 'Row size: Big')],
        ['sep'], ['hidden', 'Hidden rows']],
      help: [['help', 'How to use'], ['about', 'About']]
    };
  }
  const titles = { file: 'File', edit: 'Edit', view: 'View', help: 'Help' };
  function panelHtml(key) {
    return items()[key].map(it => it[0] === 'sep' ? '<div class="msep"></div>' : `<button type="button" class="mi" data-act="${it[0]}">${esc(it[1])}</button>`).join('');
  }
  function render() {
    const root = $('#menuRoot'), btn = $('#mBtn'), wide = WIDE.matches;
    phone = !wide;
    if (btn) { btn.hidden = wide; if (wide) { btn.setAttribute('aria-expanded', 'false'); phone = false; } }
    if (wide) {
      root.className = 'wide' + (open ? ' open' : '');
      root.innerHTML = '<div class="mtop">' + Object.keys(titles).map(k => `<button type="button" class="mt${open === k ? ' open' : ''}" data-mtop="${k}" aria-haspopup="true" aria-expanded="${open === k}">${titles[k]}</button>`).join('') + '</div>' +
        (open ? `<div class="mdrop" role="menu">${panelHtml(open)}</div>` : '');
      if (open) {
        const b = root.querySelector(`[data-mtop="${open}"]`), d = root.querySelector('.mdrop');
        if (b && d) d.style.left = Math.max(0, b.offsetLeft) + 'px';
      }
    } else {
      const show = open === 'phone';
      root.className = 'phone' + (show ? ' open' : '');
      if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
      root.innerHTML = show ? Object.keys(titles).map(k => `<div class="mhead">${titles[k]}</div>${panelHtml(k)}`).join('') : '';
    }
  }
  function close() { if (!open) return; open = ''; render(); }
  function toggleTop(k) { open = (open === k) ? '' : k; render(); }
  async function act(k) {
    close();
    if (k === 'import') return $('#impFile').click();
    if (k === 'exportCat') return DataUI.exportCatalog();
    if (k === 'export') return SheetUI.exportCsv();
    if (k === 'print') return SheetUI.printView();
    if (k === 'backup') return DataUI.backup();
    if (k === 'restore') return $('#bkFile').click();
    if (k === 'erase') return DataUI.eraseAll();
    if (k === 'add') return SheetUI.promptAdd();
    if (k === 'hide') return SheetUI.hideSelected();
    if (k === 'selAll') { App.show('reference'); return SheetUI.selectAll(); }
    if (k === 'selClear') return SheetUI.clearSel();
    if (k === 'fixes') return FixesUI.open();
    if (k === 'columns') { App.show('reference'); return SheetUI.pickCols(); }
    if (k === 'custom') return DataUI.openCustom();
    if (k === 'filters') { App.show('reference'); return SheetUI.toggleFilters(true); }
    if (k === 'theme-dark' || k === 'theme-light' || k === 'theme-alt') { await Store.setPref('theme', k.split('-')[1]); return; }
    if (k === 'row-compact' || k === 'row-big') { await Store.setPref('rowSize', k.split('-')[1]); return; }
    if (k === 'hidden') return DataUI.openHidden();
    if (k === 'help') return DataUI.openHelp();
    if (k === 'about') return U.dialog("Pinky's Auto Reference and Inventory", '<p>Version 3.9. Offline key reference and in-stock lookup for Pinky\'s Locksmithing.</p>', [{ label: 'Close', value: true }]);
  }
  function init() {
    $('#mBtn').onclick = e => { e.stopPropagation(); open = (open === 'phone') ? '' : 'phone'; render(); };
    $('#menuRoot').addEventListener('click', e => {
      const t = e.target.closest('[data-mtop]'); if (t) { e.stopPropagation(); toggleTop(t.dataset.mtop); return; }
      const a = e.target.closest('[data-act]'); if (a) { e.stopPropagation(); act(a.dataset.act); }
    });
    document.addEventListener('click', e => { if (open && !e.target.closest('#menuRoot, #mBtn')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } });
    WIDE.addEventListener('change', () => { open = ''; render(); });
    render();
  }
  G.MenuUI = { init, render, close, isOpen: () => !!open };
})(window);
