/* ui-sheet.js (v3.9) — Reference sheet: search, fold-away Filters, spreadsheet with row
   checkboxes (select-all-visible), ⚙ column picker (includes custom columns), Show more,
   Print / Export of the current (or selected) list. Hidden rows are omitted. User rows
   (Source = "My item") appear with the rest. Print lives in the File menu, not the toolbar. */
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
    { key: 'supplier', label: 'Supplier' }, { key: 'price', label: 'Price' }, { key: 'notes', label: 'Notes' }];
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
  function renderFilters() {
    const sum = chipsSummary(); $('#fBtn').classList.toggle('on', sum.length > 0); $('#fBtn').textContent = 'Filters' + (sum.length ? ' (' + sum.length + ')' : '');
    $('#fSummary').hidden = st.open || !sum.length; $('#fSummary').innerHTML = `<span>${esc(sum.join(' · '))}</span> <button id="fClear" class="x" aria-label="Clear filters">✕</button>`;
    $('#fPanel').hidden = !st.open; if (!st.open) return;
    const chip = (attr, val, on, label) => `<button class="chip${on ? ' on' : ''}" data-${attr}="${esc(val)}" aria-pressed="${on}">${esc(label)}</button>`;
    $('#fPanel').innerHTML = `<div class="chips">${typeList().map(t => chip('ftype', t, st.types.has(t), typeLabel(t))).join('')}</div>
      <div class="chips">${chip('fflag', 'inStock', st.inStock, 'In stock')}${chip('fflag', 'review', st.review, 'Needs review')}${chip('fflag', 'oem', st.oem, 'Has OEM')}</div>
      <div class="row"><button id="fDone" class="primary">Done</button>${sum.length ? '<button id="fClear2">Clear all</button>' : ''}</div>`;
  }
  const cellVal = (r, c) => c.key === 'stock' ? '' : esc(c.custom ? Custom.val(r.id, c.cid) : (r[c.key] || ''));
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
      cols.map(c => `<th data-sort="${c.key}" class="c-${c.custom ? 'custom' : c.key}${st.sortKey === c.key ? (st.dir > 0 ? ' asc' : ' desc') : ''}">${esc(c.label)}</th>`).join('') +
      '<th class="gear"><button id="colBtn" aria-label="Choose columns" title="Choose columns">⚙</button></th>';
    const body = slice.map(r => {
      const rev = Fixes.needsReview(r), mine = Users.isMine(r), on = st.sel.has(r.id);
      const cls = [rev ? 'rev' : '', mine ? 'mine' : '', on ? 'picked' : ''].filter(Boolean).join(' ');
      return `<tr data-id="${esc(r.id)}"${cls ? ` class="${cls}"` : ''}>` +
        `<td class="c-sel"><input type="checkbox" data-sel="${esc(r.id)}" ${on ? 'checked' : ''} aria-label="Select row"></td>` +
        cols.map(c => c.key === 'stock' ? Stock.cell(r, stockQ(r))
          : `<td class="c-${c.custom ? 'custom' : c.key}${!c.custom && Fixes.edited(r, c.key) ? ' fixed' : ''}">${c.key === 'years' && rev ? '<span class="dot" title="Needs review"></span>' : ''}${cellVal(r, c)}</td>`).join('') +
        '<td class="gear"></td></tr>';
    }).join('');
    $('#count').textContent = n.toLocaleString() + (n === 1 ? ' row' : ' rows');
    $('#sheet').innerHTML = `<div class="tscroll"><table class="sheet main"><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 2}" class="empty">${Store.st.catalog.length ? 'No matches' : 'Import your catalog in Settings / Data.'}</td></tr>`}</tbody></table></div>` +
      (n > st.shown ? `<button id="more" class="showmore">Show more (${(n - st.shown).toLocaleString()} more)</button>` : '');
    $('#qClear').hidden = !$('#q').value;
    const sa = $('#selAll'); if (sa) sa.indeterminate = some && !allOn;
    renderSelBar();
  }
  const refresh = () => { st.shown = PAGE; render(); };
  function pickBody() {
    const sel = new Set(visCols().map(c => c.key));
    const extras = Custom.list();
    return `<p class="note">Year, Make, Model and Product name always show.</p>` +
      COLS.filter(c => !c.fixed).map(c => `<label class="inline big"><input type="checkbox" class="colcb" value="${c.key}" ${sel.has(c.key) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('') +
      (extras.length ? '<h4>Custom columns</h4>' + extras.map(c => `<label class="inline big"><input type="checkbox" class="colcb" value="${esc(Custom.keyOf(c))}" ${sel.has(Custom.keyOf(c)) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('') : '') +
      `<div class="row addcol"><input id="newColName" placeholder="New column name, e.g. Bin location" autocomplete="off"><button type="button" id="colAddIn">Add</button></div>`;
  }
  async function pickCols() {
    const p = U.dialog('Columns', pickBody(), [{ label: 'Cancel', value: null }, { label: 'Done', cls: 'primary', value: () => [...document.querySelectorAll('.colcb:checked')].map(x => x.value) }]);
    const b = $('#dlgBody');
    b.onclick = async e => {
      if (e.target.id !== 'colAddIn') return;
      const name = ($('#newColName') || {}).value; const c = await Custom.add(name);
      if (!c) return U.toast('Give the column a name that is not already used', true);
      b.innerHTML = pickBody();
    };
    const v = await p; b.onclick = null; if (!v) return; await Store.setPref('cols', v); render();
  }
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
    if (ids.length > 20 && !await U.confirmBox('Hide ' + ids.length.toLocaleString() + ' rows?', 'You can restore them from Settings / Data → Hidden rows, or tap Undo.', 'Hide')) return;
    await Hidden.hide(ids); st.sel.clear(); refresh();
  }
  async function markStock(on) {
    const rs = selectedRows(); if (!rs.length) return U.toast('Select a row first', true);
    await Stock.setMany(rs, on); render();
  }
  function toggleFilters(force) { st.open = force == null ? !st.open : !!force; renderFilters(); }
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
    $('#fBtn').onclick = () => toggleFilters();
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('#fClear, #fClear2')) { st.types.clear(); st.inStock = st.review = st.oem = false; renderFilters(); refresh(); return; }
      if (t.closest('#fDone')) { st.open = false; renderFilters(); return; }
      const ty = t.closest('[data-ftype]'); if (ty) { const v = ty.dataset.ftype; st.types.has(v) ? st.types.delete(v) : st.types.add(v); renderFilters(); refresh(); return; }
      const fl = t.closest('[data-fflag]'); if (fl) { st[fl.dataset.fflag] = !st[fl.dataset.fflag]; renderFilters(); refresh(); return; }
    });
    $('#sheet').addEventListener('click', e => {
      const t = e.target; if (t.closest('#colBtn')) return pickCols();
      if (t.closest('#more')) { st.shown += PAGE; render(); return; }
      const h = t.closest('th[data-sort]'); if (h) { const k = h.dataset.sort; if (st.sortKey === k) st.dir = -st.dir; else { st.sortKey = k; st.dir = 1; } refresh(); return; }
      if (t.closest('.stk') || t.closest('.c-sel')) return;
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
    renderFilters();
  }
  G.SheetUI = { init, render, refresh, renderFilters, toggleFilters, rows: () => lastRows, COLS, state: st, pickCols, printView, exportCsv, selectAll, clearSel, hideSelected, markStock, selectedRows, wantRows, promptAdd, visCols };
})(window);
