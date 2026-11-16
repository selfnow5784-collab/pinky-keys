/* ui-sheet.js (v3.9-7) — Reference sheet: search, spreadsheet with row checkboxes (select-all-visible), Show more,
   Print / Share PDF / selected-row Export of the current (or selected) list. Hidden rows are omitted. User rows
   (Source = "My item") appear with the rest.
   v3.9-7: the Filters and Columns choices live in the menu as drop-downs (filtersHtml / colsHtml, drawn by MenuUI).
   Applied filters stay on screen as chips next to ⟳ Refresh (tap a chip to drop it). Refresh = clear search, filters
   and sort, back to the full sheet. The ⚙ header button is gone (Columns is in the menu). */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const firstYear = r => { const sp = Search.yearSpans(r.years); return sp.length ? sp[0][0] : 0; };
  const stockQ = r => Stock.qty(r);
  const COLS = [
    { key: 'years', label: 'Year(s)', fixed: true, sort: firstYear }, { key: 'make', label: 'Make', fixed: true }, { key: 'model', label: 'Model', fixed: true },
    { key: 'product', label: 'Product name', fixed: true }, { key: 'stock', label: 'In stock', on: true, sort: stockQ },
    { key: 'type', label: 'Type', on: true }, { key: 'buttons', label: 'Buttons', on: true }, { key: 'fcc', label: 'FCC ID', on: true }, { key: 'chip', label: 'Chip', on: true },
    { key: 'blade', label: 'Blade', on: true }, { key: 'oem', label: 'OEM part #' }, { key: 'freq', label: 'Frequency' }, { key: 'pn', label: 'Part #' },
    { key: 'supplier', label: 'Supplier' }, { key: 'price', label: 'Price' }, { key: 'notes', label: 'Notes' },
    { key: 'keyType', label: 'Key type' }, { key: 'strattec', label: 'Strattec #' }, { key: 'productUrl', label: 'Link' }];
  const PAGE = 100;
  const st = { types: new Set(), inStock: false, review: false, oem: false, sortKey: null, dir: 1, shown: PAGE, open: false, sel: new Set() };
  let lastRows = [];
  function visCols() {
    const sel = Store.prefs.cols;
    const base = COLS.filter(c => c.fixed || (sel ? sel.includes(c.key) : c.on));
    const extra = Custom.list().map(c => ({ key: Custom.keyOf(c), label: c.label, custom: true, cid: c.id, on: true, sort: r => Custom.val(r.id, c.id) }));
    return base.concat(extra.filter(c => !sel || sel.includes(c.key)));
  }
  const typeLabel = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : 'No type';
  function typeList() { const m = new Map(); Store.st.catalog.forEach(r => { if (Hidden.isHidden(r.id)) return; m.set(r.type || '', (m.get(r.type || '') || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1]).map(x => x[0]); }
  function rows() {
    const hide = id => Hidden.isHidden(id);
    const q = $('#q').value.trim(); let out = Store.st.catalog.filter(r => !hide(r.id));
    if (q && Lookup.L) out = Search.run(q, Lookup.L.cat, Lookup.L.vocab).hits.map(e => e.r).filter(r => !hide(r.id));
    if (st.types.size) out = out.filter(r => st.types.has(r.type || ''));
    if (st.inStock) out = out.filter(r => stockQ(r) > 0);
    if (st.review) out = out.filter(Fixes.needsReview);
    if (st.oem) out = out.filter(r => r.oem);
    if (st.sortKey) {
      const cols = visCols().concat(COLS), c = cols.find(x => x.key === st.sortKey) || COLS.find(x => x.key === st.sortKey), g = (c && c.sort) || (r => (c && c.custom ? Custom.val(r.id, c.cid) : (r[c.key] || ''))), d = st.dir;
      out = out.slice().sort((a, b) => { const x = g(a), y = g(b); return d * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })); }); }
    return out;
  }
  function chipsSummary() { const p = [...st.types].map(typeLabel); if (st.inStock) p.push('In stock'); if (st.review) p.push('Needs review'); if (st.oem) p.push('Has OEM'); return p; }
  const nFilters = () => st.types.size + (st.inStock ? 1 : 0) + (st.review ? 1 : 0) + (st.oem ? 1 : 0);
  const chip = (attr, val, on, label) => `<button type="button" class="chip${on ? ' on' : ''}" data-${attr}="${esc(val)}" aria-pressed="${on}">${esc(label)}</button>`;
  // applied filters on screen: one chip each, tap = remove that filter
  function renderFilters() {
    const el = $('#fChips'); if (el) {
      const on = [...st.types].map(t => ['ftype', t, typeLabel(t)]).concat([['inStock', 'In stock'], ['review', 'Needs review'], ['oem', 'Has OEM']].filter(([k]) => st[k]).map(([k, l]) => ['fflag', k, l]));
      el.hidden = !on.length;
      el.innerHTML = on.map(([a, v, l]) => `<button type="button" class="chip on fchip" data-${a}="${esc(v)}" aria-label="Remove filter ${esc(l)}">${esc(l)} ✕</button>`).join('');
    }
    if (G.MenuUI && MenuUI.isOpen()) MenuUI.render();
  }
  // Filters drop-down (in the menu)
  function filtersHtml() {
    return `<div class="mpanel fpanel"><div class="chips">${typeList().map(t => chip('ftype', t, st.types.has(t), typeLabel(t))).join('') || '<span class="note">Import a catalog to filter by type.</span>'}</div>
      <div class="chips">${chip('fflag', 'inStock', st.inStock, 'In stock')}${chip('fflag', 'review', st.review, 'Needs review')}${chip('fflag', 'oem', st.oem, 'Has OEM')}</div>
      <div class="row"><button type="button" id="fDone" class="primary">Done</button>${nFilters() ? '<button type="button" id="fClear2">Clear all</button>' : ''}</div></div>`;
  }
  // Columns drop-down (in the menu): tick = shown right away. Custom columns: add, rename, delete here.
  function colsHtml() {
    const sel = new Set(visCols().map(c => c.key)), extras = Custom.list();
    return `<div class="mpanel cpanel"><p class="note">Year, Make, Model and Product name always show.</p>` +
      COLS.filter(c => !c.fixed).map(c => `<label class="inline"><input type="checkbox" class="colcb" value="${c.key}" ${sel.has(c.key) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('') +
      `<div class="mhead2">Custom columns</div>` +
      (extras.length ? extras.map(c => `<div class="ccrow"><label class="inline"><input type="checkbox" class="colcb" value="${esc(Custom.keyOf(c))}" ${sel.has(Custom.keyOf(c)) ? 'checked' : ''}> ${esc(c.label)}</label><span><button type="button" data-cren="${esc(c.id)}">Rename</button><button type="button" data-cdel="${esc(c.id)}" class="danger">Delete</button></span></div>`).join('') : '<p class="note">None yet.</p>') +
      `<div class="row addcol"><input id="newColName" placeholder="New column, e.g. Bin location" autocomplete="off"><button type="button" id="colAddIn">Add</button></div></div>`;
  }
  async function setCol(key, on) {
    const cur = visCols().map(c => c.key).filter(k => !COLS.find(c => c.key === k && c.fixed));
    const next = on ? (cur.includes(key) ? cur : cur.concat(key)) : cur.filter(k => k !== key);
    await Store.setPref('cols', next); render();
  }
  async function addCol(name) { const c = await Custom.add(name); if (!c) { U.toast('Give the column a name that is not already used', true); return null; } render(); if (G.MenuUI) MenuUI.render(); return c; }
  function linkHtml(s) {
    const parts = String(s || '').split(/\s*;\s*/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return '';
    return parts.map(u => /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener" class="ext">${esc(u)}</a>` : esc(u)).join('; ');
  }
  const cellVal = (r, c) => {
    if (c.key === 'stock') return '';
    if (c.key === 'productUrl') return linkHtml(r.productUrl || r.url || '');
    return esc(c.custom ? Custom.val(r.id, c.cid) : (r[c.key] || ''));
  };
  function renderSelBar() {
    const b = $('#selBar'); if (!b) return; const n = st.sel.size; b.hidden = n === 0; if (!n) return;
    b.innerHTML = `<b>${n.toLocaleString()} selected</b><button data-sact="print">Print</button><button data-sact="in">Mark in stock</button><button data-sact="out">Mark not</button><button data-sact="hide">Hide</button><button data-sact="export">Export CSV</button><button data-sact="clear">Clear</button>`;
  }
  function render() {
    const cols = visCols(); lastRows = rows();
    const vis = new Set(lastRows.map(r => r.id)); [...st.sel].forEach(id => { if (!vis.has(id)) st.sel.delete(id); });
    const n = lastRows.length, slice = lastRows.slice(0, st.shown);
    const allOn = n > 0 && lastRows.every(r => st.sel.has(r.id)), some = lastRows.some(r => st.sel.has(r.id));
    const th = `<th class="c-sel" title="Select all visible"><input type="checkbox" id="selAll" aria-label="Select all visible" ${allOn ? 'checked' : ''}></th>` +
      cols.map(c => `<th data-sort="${c.key}" class="c-${c.custom ? 'custom' : c.key}${st.sortKey === c.key ? (st.dir > 0 ? ' asc' : ' desc') : ''}">${esc(c.label)}</th>`).join('');
    const body = slice.map(r => {
      const rev = Fixes.needsReview(r), mine = Users.isMine(r), on = st.sel.has(r.id);
      const cls = [rev ? 'rev' : '', mine ? 'mine' : '', on ? 'picked' : ''].filter(Boolean).join(' ');
      return `<tr data-id="${esc(r.id)}"${cls ? ` class="${cls}"` : ''}>` +
        `<td class="c-sel"><input type="checkbox" data-sel="${esc(r.id)}" ${on ? 'checked' : ''} aria-label="Select row"></td>` +
        cols.map(c => c.key === 'stock' ? Stock.cell(r, stockQ(r))
          : `<td class="c-${c.custom ? 'custom' : c.key}${!c.custom && Fixes.edited(r, c.key) ? ' fixed' : ''}">${c.key === 'years' && rev ? '<span class="dot" title="Needs review"></span>' : ''}${cellVal(r, c)}</td>`).join('') +
        '</tr>';
    }).join('');
    $('#count').textContent = n.toLocaleString() + (n === 1 ? ' row' : ' rows');
    $('#sheet').innerHTML = `<div class="tscroll"><table class="sheet main"><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 1}" class="empty">${Store.st.catalog.length ? 'No matches' : 'Import your catalog in Data.'}</td></tr>`}</tbody></table></div>` +
      (n > st.shown ? `<button id="more" class="showmore">Show more (${(n - st.shown).toLocaleString()} more)</button>` : '');
    $('#qClear').hidden = !$('#q').value;
    const sa = $('#selAll'); if (sa) sa.indeterminate = some && !allOn;
    renderSelBar();
  }
  const refresh = () => { st.shown = PAGE; render(); };
  function displayVal(r, c) {
    if (c.key === 'stock') return stockQ(r) > 0 ? 'Yes' + (stockQ(r) > 1 ? ' (' + stockQ(r) + ')' : '') : 'No';
    if (c.custom) return Custom.val(r.id, c.cid);
    return r[c.key] || '';
  }
  const selectedRows = () => lastRows.filter(r => st.sel.has(r.id));
  const wantRows = () => st.sel.size ? selectedRows() : lastRows;
  function printView(list) {
    const cols = visCols(), rs = list || wantRows(), q = $('#q').value.trim(), f = chipsSummary();
    const doIt = () => {
      $('#printArea').innerHTML = `<h1>Pinky's Auto Reference and Inventory</h1><p class="pmeta">Printed ${esc(new Date().toLocaleString())} · Search: ${esc(q || '(none)')} · Filters: ${esc(f.join(', ') || '(none)')} · ${rs.length.toLocaleString()} rows</p>
        <table><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rs.map(r => `<tr>${cols.map(c => `<td>${c.key === 'years' && Fixes.needsReview(r) ? '• ' : ''}${esc(displayVal(r, c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      document.body.dataset.printed = rs.length; window.print(); };
    if (rs.length > 1000) return U.dialog('Print ' + rs.length.toLocaleString() + ' rows?', '<p>That is a lot of pages. Search or filter first to print less.</p>', [{ label: 'Cancel', value: false }, { label: 'Print anyway', value: true }]).then(ok => ok && doIt());
    doIt();
  }
  function exportCsv(list) {
    const cols = visCols(), rs = list || wantRows();
    const headers = cols.map(c => c.label);
    U.download(CSV.unparse(rs.map(r => { const o = {}; cols.forEach(c => { o[c.label] = displayVal(r, c); }); return o; }), headers), 'pinky-list-' + U.stamp() + '.csv');
    document.body.dataset.exported = String(rs.length);
  }
  function selectAll() { lastRows = lastRows.length ? lastRows : rows(); lastRows.forEach(r => st.sel.add(r.id)); render(); }
  function clearSel() { st.sel.clear(); render(); }
  async function hideSelected() {
    const ids = [...st.sel]; if (!ids.length) return U.toast('Select a row first', true);
    if (ids.length > 20 && !await U.confirmBox('Hide ' + ids.length.toLocaleString() + ' rows?', 'You can restore them from Data → Hidden rows, or tap Undo.', 'Hide')) return;
    await Hidden.hide(ids); st.sel.clear(); refresh();
  }
  async function markStock(on) {
    const rs = selectedRows(); if (!rs.length) return U.toast('Select a row first', true);
    await Stock.setMany(rs, on); render();
  }
  function clearFilters() { st.types.clear(); st.inStock = st.review = st.oem = false; }
  // ⟳ Refresh: full sheet again (search, filters, sort and paging cleared; your selection stays)
  function resetView() {
    $('#q').value = ''; clearFilters(); st.sortKey = null; st.dir = 1; st.shown = PAGE; renderFilters(); render();
    const sc = $('#sheet .tscroll'); if (sc) { sc.scrollTop = 0; sc.scrollLeft = 0; } window.scrollTo(0, 0);
    document.body.dataset.refreshed = (+document.body.dataset.refreshed || 0) + 1;
  }
  async function promptAdd() {
    const field = (k, l) => `<label class="ed">${esc(l)}<input data-ak="${k}" value=""></label>`;
    const body = field('years', 'Year(s)') + field('make', 'Make') + field('model', 'Model') + field('product', 'Product name') +
      field('type', 'Type') + field('fcc', 'FCC ID') + field('chip', 'Chip') + field('blade', 'Blade') + field('oem', 'OEM part #') +
      field('pn', 'Part #') + field('price', 'Price') + field('notes', 'Notes') +
      Custom.list().map(c => `<label class="ed">${esc(c.label)}<input data-ck="${c.id}" value=""></label>`).join('') +
      `<label class="inline big"><input type="checkbox" id="akStock"> In stock</label>`;
    const v = await U.dialog('Add item', body, [{ label: 'Cancel', value: null }, { label: 'Add', cls: 'primary', value: () => {
      const o = {}; document.querySelectorAll('#dlgBody [data-ak]').forEach(i => { o[i.dataset.ak] = i.value; });
      const cv = {}; document.querySelectorAll('#dlgBody [data-ck]').forEach(i => { if (i.value.trim()) cv[i.dataset.ck] = i.value.trim(); });
      return { o, cv, stock: !!( $('#akStock') && $('#akStock').checked ) };
    } }]);
    if (!v) return;
    if (!(v.o.product || v.o.pn || v.o.make)) return U.toast('Give it a product name, part # or make', true);
    if (!v.o.product) v.o.product = v.o.pn || [v.o.make, v.o.model].filter(Boolean).join(' ');
    const r = Users.add(v.o);
    for (const [id, val] of Object.entries(v.cv)) await Custom.setVal(r.id, id, val);
    if (v.stock) await Stock.set(r, true);
    document.body.dataset.added = r.id; SheetUI.refresh();
  }
  function init() {
    $('#q').addEventListener('input', U.debounce(refresh, 250));
    $('#qClear').onclick = () => { $('#q').value = ''; refresh(); $('#q').focus(); };
    $('#refreshBtn').onclick = () => resetView();
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('#fClear2')) { clearFilters(); renderFilters(); refresh(); return; }
      if (t.closest('#fDone')) { if (G.MenuUI) MenuUI.close(); return; }
      if (t.closest('#colAddIn')) { const i = $('#newColName'); addCol(i ? i.value : ''); return; }
      const cr = t.closest('[data-cren]'); if (cr && t.closest('#menuRoot')) { const id = cr.dataset.cren; if (G.MenuUI) MenuUI.close(); DataUI.renameColumn(id); return; }
      const cd = t.closest('[data-cdel]'); if (cd && t.closest('#menuRoot')) { const id = cd.dataset.cdel; if (G.MenuUI) MenuUI.close(); DataUI.deleteColumn(id); return; }
      const ty = t.closest('[data-ftype]'); if (ty) { const v = ty.dataset.ftype; st.types.has(v) ? st.types.delete(v) : st.types.add(v); renderFilters(); refresh(); return; }
      const fl = t.closest('[data-fflag]'); if (fl) { st[fl.dataset.fflag] = !st[fl.dataset.fflag]; renderFilters(); refresh(); return; }
    });
    $('#sheet').addEventListener('click', e => {
      const t = e.target;
      if (t.closest('#more')) { st.shown += PAGE; render(); return; }
      const h = t.closest('th[data-sort]'); if (h) { const k = h.dataset.sort; if (st.sortKey === k) st.dir = -st.dir; else { st.sortKey = k; st.dir = 1; } refresh(); return; }
      if (t.closest('a') || t.closest('.stk') || t.closest('.c-sel')) return;
      const tr = t.closest('tr[data-id]'); if (tr) { const r = Store.byId.catalog.get(tr.dataset.id); if (r) Card.open(r); }
    });
    $('#sheet').addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'selAll') { if (t.checked) lastRows.forEach(r => st.sel.add(r.id)); else st.sel.clear(); return render(); }
      if (t.dataset.sel) { t.checked ? st.sel.add(t.dataset.sel) : st.sel.delete(t.dataset.sel); return render(); }
      const id = t.dataset.stock; if (!id) return; const r = Store.byId.catalog.get(id); if (r) Stock.set(r, t.checked).then(render);
    });
    $('#selBar').addEventListener('click', e => {
      const a = e.target.closest('[data-sact]'); if (!a) return;
      const k = a.dataset.sact;
      if (k === 'print') printView(selectedRows());
      else if (k === 'in') markStock(true);
      else if (k === 'out') markStock(false);
      else if (k === 'hide') hideSelected();
      else if (k === 'export') exportCsv(selectedRows());
      else if (k === 'clear') clearSel();
    });
    $('#undoBtn').onclick = async () => { await Hidden.undo(); refresh(); };
    document.addEventListener('change', e => { const t = e.target; if (t.classList && t.classList.contains('colcb') && t.closest('#menuRoot')) setCol(t.value, t.checked); });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'newColName') { e.preventDefault(); addCol(e.target.value); } });
    renderFilters();
  }
  G.SheetUI = { init, render, refresh, renderFilters, filtersHtml, colsHtml, setCol, addCol, resetView, clearFilters, nFilters, chipsSummary, displayVal, rows: () => lastRows, COLS, state: st, printView, exportCsv, selectAll, clearSel, hideSelected, markStock, selectedRows, wantRows, promptAdd, visCols };
})(window);
