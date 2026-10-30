/* ui-reference.js — Reference tab: the big supplier key catalog (~9,700 rows, scraped, UNVERIFIED)
   as an editable spreadsheet. This is NOT stock — what is in stock lives only in the Inventory tab.
   Two views: "By vehicle" (one row per key+vehicle, sortable/editable columns) and "By key"
   (one row per product with qty, and an expandable, editable list of compatible vehicles).
   Both views have an "In stock" column: Yes (n) when an Inventory item linked by part #/FCC has qty > 0, else No
   (sortable, so Yes rows group together). Every column header sorts (tap again = reverse), incl. the compat sub-list.
   Filters: search words (same smart search as Quick Search), "In stock only" (keys linked to an
   Inventory item with qty > 0), show only checked. The supplier's own Qty column is hidden by default and,
   when shown, is labelled "Supplier qty" so it can't be mistaken for stock.
   Export writes only the rows you can currently see (after filters). */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const QTY = { key: 'qty', label: 'Supplier qty (not stock)', edit: true, type: 'num' };
  const COLS = [{ key: 'stock', label: 'In stock', type: 'num', get: r => onHandQty(r), fmt: q => q > 0 ? `Yes (${q})` : 'No' }, { key: 'make', label: 'Make', edit: true }, { key: 'model', label: 'Model', edit: true }, { key: 'years', label: 'Years', edit: true },
    { key: 'product', label: 'Product', edit: true }, { key: 'compat', label: 'Vehicle compatibility', edit: true }, { key: 'notes', label: 'Notes', edit: true }];
  // cached product key per row (recomputed only if the product name changed)
  const pk = r => (r._pkSrc === r.product ? r._pk : (r._pkSrc = r.product, r._pk = Data.productKey(r.product)));
  let table, gPage = 0, gSort = 'product', gDir = 1, sSort = null, sDir = 1; const open = new Set();
  // in stock = linked (by part # / FCC) to an Inventory item with qty > 0. The catalog's own qty never counts.
  const onHandQty = r => Lookup.L ? (Lookup.L.links.get(pk(r)) || []).reduce((a, it) => a + (+it.qty || 0), 0) : 0;
  const onHand = r => onHandQty(r) > 0;
  const showQty = () => $('#refShowQty').checked;
  const cols = () => showQty() ? COLS.slice(0, 5).concat([QTY], COLS.slice(5)) : COLS;
  function visibleRows() {
    const t = $('#refFilter').value.trim(); let rows = Store.st.catalog;
    if (t && Lookup.L) { const s = new Set(Search.run(t, Lookup.L.cat, Lookup.L.vocab).hits.map(e => e.r.id)); rows = rows.filter(r => s.has(r.id)); }
    if ($('#refOnHand').checked) rows = rows.filter(onHand);
    if ($('#refChecked').checked) rows = rows.filter(r => r.checked);
    return rows;
  }
  function groups(rows) {
    const m = new Map(); rows.forEach(r => { const k = pk(r); if (!m.has(k)) m.set(k, { key: k, name: r.product, rows: [] }); m.get(k).rows.push(r); });
    const g = [...m.values()]; g.forEach(x => { x.qty = Math.max(...x.rows.map(r => +r.qty || 0)); x.n = x.rows.length; x.stock = onHandQty(x.rows[0]); });
    const f = { product: (a, b) => a.name.localeCompare(b.name), qty: (a, b) => a.qty - b.qty, n: (a, b) => a.n - b.n, stock: (a, b) => a.stock - b.stock }[gSort];
    return g.sort((a, b) => gDir * f(a, b));
  }
  function renderGroups() {
    gIndex = new Map(); Store.st.catalog.forEach(r => { const k = pk(r); if (!gIndex.has(k)) gIndex.set(k, []); gIndex.get(k).push(r); });
    const g = groups(visibleRows()), size = 40, pages = Math.max(1, Math.ceil(g.length / size)); if (gPage >= pages) gPage = pages - 1;
    const th = (k, l) => `<th data-gsort="${k}" class="sortable${gSort === k ? (gDir > 0 ? ' asc' : ' desc') : ''}">${l}</th>`;
    const pager = `<div class="pager"><button data-gpg="-1" ${gPage ? '' : 'disabled'}>‹ Prev</button><span>Page ${gPage + 1} of ${pages} · ${g.length} keys</span><button data-gpg="1" ${gPage < pages - 1 ? '' : 'disabled'}>Next ›</button></div>`;
    const body = g.slice(gPage * size, (gPage + 1) * size).map(x => { const full = groupRows(x.key).length, all = x.rows.every(r => r.checked);
      return `<tr class="grp${all ? ' checked' : ''}" data-g="${esc(x.key)}"><td class="cb"><input type="checkbox" class="gcb" ${all ? 'checked' : ''}></td>
        <td class="gname" contenteditable="true">${esc(x.name)}</td>${showQty() ? `<td class="gqty" contenteditable="true">${x.qty}</td>` : ''}
        <td><button class="more" data-open>${open.has(x.key) ? '▾' : '▸'} ${full}${full !== x.n ? ` (${x.n})` : ''}</button></td><td class="c-stock">${x.stock > 0 ? `Yes (${x.stock})` : 'No'}</td></tr>` +
        (open.has(x.key) ? `<tr class="sublist" data-g="${esc(x.key)}"><td colspan="${showQty() ? 5 : 4}"><table class="sheet sub"><thead><tr>${['make', 'model', 'years'].map(k => `<th data-ssub="${k}" class="sortable${sSort === k ? (sDir > 0 ? ' asc' : ' desc') : ''}">${k[0].toUpperCase() + k.slice(1)}</th>`).join('')}<th></th></tr></thead><tbody>${subRows(x.key).map(r => `<tr data-id="${esc(r.id)}"><td contenteditable="true" data-k="make">${esc(r.make)}</td><td contenteditable="true" data-k="model">${esc(r.model)}</td><td contenteditable="true" data-k="years">${esc(r.years)}</td><td><button class="x" data-delrow aria-label="delete vehicle">✕</button></td></tr>`).join('')}</tbody></table><button data-addveh>+ Add vehicle</button></td></tr>` : ''); }).join('');
    $('#refTable').innerHTML = pager + `<div class="tscroll"><table class="sheet grouped"><thead><tr><th class="cb"></th>${th('product', 'Key')}${showQty() ? th('qty', 'Supplier qty') : ''}${th('n', 'Vehicles')}${th('stock', 'In stock')}</tr></thead><tbody>${body || `<tr><td colspan="${showQty() ? 5 : 4}" class="empty"></td></tr>`}</tbody></table></div>` + pager;
  }
  function render() { if ($('#refView').value === 'key') renderGroups(); else { table.o.columns = cols(); table.render(); } updateCount(); }
  function updateCount() {} // v3.4: no 'n checked' text
  let gIndex = null; // product key -> all its rows, rebuilt each grouped render
  const groupRows = k => (gIndex && gIndex.get(k)) || Store.st.catalog.filter(r => pk(r) === k);
  const subRows = k => { const r = groupRows(k); return sSort ? r.slice().sort((a, b) => sDir * String(a[sSort] || '').localeCompare(String(b[sSort] || ''), undefined, { numeric: true })) : r; };
  function init() {
    table = Table.create({ el: $('#refTable'), kind: 'catalog', columns: COLS, rows: visibleRows, pageSize: 50, onCheck: updateCount, onEdit: (r, k) => { if (k === 'qty') setTimeout(render); } });
    const again = U.debounce(() => { table.page = 0; gPage = 0; render(); }, 200);
    $('#refFilter').addEventListener('input', again); ['#refOnHand', '#refChecked', '#refView', '#refShowQty'].forEach(s => $(s).addEventListener('change', () => { table.page = 0; gPage = 0; render(); }));
    $('#refAdd').onclick = () => { const r = Store.add('catalog', [{ make: '', model: '', years: '', product: 'NEW KEY – edit me', compat: '', qty: 0, notes: '', checked: true }])[0]; $('#refChecked').checked = true; $('#refView').value = 'vehicle'; render(); U.toast('New row added (shown with "only checked")'); };
    $('#refDel').onclick = async () => { const ids = Store.st.catalog.filter(r => r.checked).map(r => r.id); if (!ids.length) return U.toast('Check some rows first');
      if (await U.confirmBox('Delete rows?', `Delete ${ids.length} checked rows?`, 'Delete')) { Store.remove('catalog', ids); render(); } };
    $('#refUncheck').onclick = () => { Store.st.catalog.forEach(r => { if (r.checked) { r.checked = false; Store.mark('catalog', r); } }); render(); };
    $('#refExport').onclick = () => { const rows = visibleRows(); if (!rows.length) return U.toast('Nothing visible to export', true);
      U.download(CSV.unparse(rows.map(r => ({ Make: r.make, Model: r.model, 'Year(s)': r.years, 'Product Name': r.product, 'Vehicle Compatibility': r.compat, 'Supplier Qty': r.qty, 'In Stock': onHandQty(r) > 0 ? `Yes (${onHandQty(r)})` : 'No', Notes: r.notes, Verified: r.verified ? 'yes' : '' })), ['Make', 'Model', 'Year(s)', 'Product Name', 'Vehicle Compatibility', 'Supplier Qty', 'In Stock', 'Notes', 'Verified']), 'reference-visible-' + U.stamp() + '.csv');
      U.toast(`Exported ${rows.length} visible rows`); };
    const el = $('#refTable');
    el.addEventListener('click', e => { if ($('#refView').value !== 'key') return;
      const ss = e.target.closest('[data-ssub]'); if (ss) { if (sSort === ss.dataset.ssub) sDir = -sDir; else { sSort = ss.dataset.ssub; sDir = 1; } return renderGroups(); }
      const s = e.target.closest('[data-gsort]'); if (s) { if (gSort === s.dataset.gsort) gDir = -gDir; else { gSort = s.dataset.gsort; gDir = 1; } return renderGroups(); }
      const p = e.target.closest('[data-gpg]'); if (p) { gPage += +p.dataset.gpg; return renderGroups(); }
      const tr = e.target.closest('[data-g]'); if (!tr) return; const k = tr.dataset.g;
      if (e.target.closest('[data-open]')) { open.has(k) ? open.delete(k) : open.add(k); return renderGroups(); }
      if (e.target.closest('[data-delrow]')) { Store.remove('catalog', [e.target.closest('tr[data-id]').dataset.id]); return renderGroups(); }
      if (e.target.closest('[data-addveh]')) { const f = groupRows(k)[0]; Store.add('catalog', [{ make: '', model: '', years: '', product: f.product, compat: f.compat, qty: f.qty, notes: '' }]); return renderGroups(); } });
    el.addEventListener('change', e => { if ($('#refView').value !== 'key') return; const tr = e.target.closest('[data-g]'); if (!tr) return; const rows = groupRows(tr.dataset.g);
      if (e.target.classList.contains('gcb')) { rows.forEach(r => { r.checked = e.target.checked; Store.mark('catalog', r); }); updateCount(); }
    });
    el.addEventListener('focusout', e => { if ($('#refView').value !== 'key' || !e.target.isContentEditable) return; const td = e.target, v = td.innerText.replace(/\s+/g, ' ').trim();
      const sub = td.closest('tr[data-id]'); if (sub && td.dataset.k) { const r = Store.byId.catalog.get(sub.dataset.id); if (r && r[td.dataset.k] !== v) Store.update('catalog', r, td.dataset.k, v); return; }
      const tr = td.closest('[data-g]'); const rows = groupRows(tr.dataset.g); if (!rows.length) return;
      if (td.classList.contains('gqty')) { const q = Data.parseQty(v); if (q !== +rows[0].qty) Store.update('catalog', rows[0], 'qty', q); }
      if (td.classList.contains('gname') && v && v !== rows[0].product) { rows.forEach(r => Store.update('catalog', r, 'product', v, true)); Store.update('catalog', rows[0], 'product', v); open.delete(tr.dataset.g); setTimeout(renderGroups); } });
  }
  G.ReferenceUI = { init, render, visibleRows };
})(window);
