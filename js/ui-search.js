/* ui-search.js — Search tab. Aaron types "2014 camaro" and gets (v3.4: no message lines at all,
   only tables) three plain spreadsheet grids: In stock (Inventory), Reference keys (supplier catalog), Chip reference (Vehicles).
   Every grid has an "In stock" Yes (n) / No column where it applies (from linked Inventory items only).
   Tap a column header to sort that grid (tap again = reverse). Cells are editable in place: an edit here edits the
   underlying record (Inventory item / Reference row / Vehicle row) exactly like on its own tab, and Save stores it.
   Tap the "Fits" cell (▸ n) of a key row to list every vehicle it fits as extra (editable) rows; tap the Fits cell of
   an Inventory row to open the same Edit form as the Inventory tab. Only the first 25 keys / 30 chip rows are drawn. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  let limitP = 25, limitV = 30, last = null; const sorts = {}, open = new Set();
  const COLS = {
    inv: [['stock', 'In stock', 'num'], ['qty', 'Qty', 'num'], ['pn', 'Part #'], ['fits', 'Fits'], ['name', 'Name']],
    key: [['stock', 'In stock', 'num'], ['name', 'Key'], ['years', 'Years'], ['model', 'Model'], ['make', 'Make'], ['fcc', 'FCC ID'], ['chip', 'Chip'], ['n', 'Fits', 'num']],
    veh: [['make', 'Make'], ['model', 'Model'], ['years', 'Years'], ['chip', 'Chip'], ['notes', 'Notes']] };
  const yn = q => q > 0 ? `Yes (${q})` : 'No';
  const fitText = f => [f.make, f.model, f.years].filter(Boolean).join(' ');
  const mcls = r => Search.isTruncModel(r.make, r.model) ? 'trunc' : ''; // * shown by CSS (not part of the editable text)
  // editable cell: data-ed="kind|id|field"
  const ed = (kind, id, f, v, cls) => `<td class="${cls || ''}" contenteditable="true" data-ed="${kind}|${esc(id)}|${f}">${esc(v)}</td>`;
  function sortRows(id, rows) {
    const s = sorts[id]; if (!s) return rows; const num = COLS[id].find(c => c[0] === s.k)[2];
    return rows.slice().sort((a, b) => s.d * (num ? (+a.v[s.k] || 0) - (+b.v[s.k] || 0) : String(a.v[s.k] == null ? '' : a.v[s.k]).localeCompare(String(b.v[s.k] == null ? '' : b.v[s.k]), undefined, { numeric: true })));
  }
  function grid(id, rows) { // empty result = empty table (headers only), no sentence
    const s = sorts[id] || {}, th = COLS[id].map(c => `<th data-ssort="${id}:${c[0]}" class="sortable${s.k === c[0] ? (s.d > 0 ? ' asc' : ' desc') : ''}">${c[1]}</th>`).join('');
    return `<div class="tscroll"><table class="sheet srch" id="${id}Grid"><thead><tr>${th}</tr></thead><tbody>${sortRows(id, rows).map(r => r.html).join('')}</tbody></table></div>`;
  }
  function invRows(r) {
    return r.onHand.map(x => { const it = x.item, q = +it.qty || 0, v = { stock: q, qty: q, pn: it.pn, name: it.name, fits: x.fit ? fitText(x.fit) : x.product ? 'via ' + x.product : '' };
      return { v, html: `<tr class="irow" data-id="${esc(it.id)}"><td class="c-stock">${yn(q)}</td>${ed('inventory', it.id, 'qty', q, 'c-qty')}${ed('inventory', it.id, 'pn', it.pn, 'c-pn')}<td class="c-fits" data-iedit>${esc(v.fits)}</td>${ed('inventory', it.id, 'name', it.name, 'c-nm')}</tr>` }; });
  }
  function keyRows(products) {
    return products.slice(0, limitP).map(p => { const m = p.matched[0];
      const v = { stock: p.onHandQty, name: p.name, make: m.make, model: m.model, years: m.years, fcc: m.fcc || '', chip: m.chip || '', n: p.all.length };
      const rest = open.has(p.key) ? p.matched.slice(1).concat(p.all.filter(x => !p.matched.includes(x)))
        .map(x => `<tr class="exp${x.review ? ' unv' : ''}"><td></td><td></td>${ed('catalog', x.id, 'years', x.years, 'c-yr')}${ed('catalog', x.id, 'model', x.model, mcls(x))}${ed('catalog', x.id, 'make', x.make)}<td></td><td></td><td></td></tr>`).join('') : '';
      return { v, html: `<tr class="krow${m.review ? ' unv' : ''}" data-k="${esc(p.key)}"><td class="c-stock">${yn(p.onHandQty)}</td><td class="c-name" contenteditable="true" data-ed="product|${esc(p.key)}|product">${esc(p.name)}</td>${ed('catalog', m.id, 'years', m.years, 'c-yr')}${ed('catalog', m.id, 'model', m.model, mcls(m))}${ed('catalog', m.id, 'make', m.make)}${ed('catalog', m.id, 'fcc', m.fcc)}${ed('catalog', m.id, 'chip', m.chip)}<td class="c-n" data-open>${p.all.length > 1 ? (open.has(p.key) ? '▾ ' : '▸ ') : ''}${p.all.length}</td></tr>${rest}` }; });
  }
  function vehRows(r) {
    return r.vehicles.slice(0, limitV).map(x => ({ v: x, html: `<tr>${['make', 'model', 'years', 'chip', 'notes'].map(f => ed('vehicles', x.id, f, x[f])).join('')}</tr>` }));
  }
  function render(r) {
    const P = r.products; // plain short table titles only (no counts, no answer line)
    $('#results').innerHTML = `<h3 class="sec">Inventory</h3><div id="invHits">${grid('inv', invRows(r))}</div>
      <h3 class="sec">Reference keys</h3><div id="keyHits">${grid('key', keyRows(P))}</div>
      ${P.length > limitP ? `<button class="showmore" data-more="p">Show more keys (${P.length - limitP})</button>` : ''}
      <h3 class="sec">Chips</h3><div id="vehHits">${grid('veh', vehRows(r))}</div>
      ${r.vehicles.length > limitV ? `<button class="showmore" data-more="v">Show more (${r.vehicles.length - limitV})</button>` : ''}`;
  }
  function run() {
    const text = $('#q').value; if (!Lookup.L) return null;
    if (!text.trim()) { $('#results').innerHTML = ''; return null; }
    last = Lookup.query(text, { onHandOnly: $('#onHandOnly').checked }); render(last); return last;
  }
  // apply an in-place edit to the underlying record (same rules as the owning tab)
  function commitEdit(td) {
    const [kind, id, f] = td.dataset.ed.split('|'); let v = td.innerText.replace(/\s+/g, ' ').trim();
    if (kind === 'product') { const p = Lookup.L && Lookup.L.products.get(id); if (!p || !v || v === p.name) return; const rows = p.rows.slice();
      rows.forEach(r => Store.update('catalog', r, 'product', v, true)); Store.update('catalog', rows[0], 'product', v); return; }
    const r = Store.byId[kind].get(id); if (!r) return;
    if (f === 'qty') v = Data.parseQty(v);
    if (kind === 'inventory' && f === 'name' && !v) return;
    if (String(v) !== String(r[f] == null ? '' : r[f])) Store.update(kind, r, f, v);
  }
  const later = U.debounce(() => { limitP = 25; limitV = 30; open.clear(); run(); }, 150);
  function init() {
    $('#q').addEventListener('input', later); $('#onHandOnly').addEventListener('change', run);
    $('#qClear').onclick = () => { $('#q').value = ''; run(); $('#q').focus(); };
    const R = $('#results');
    R.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
    R.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.ed) commitEdit(e.target); });
    R.addEventListener('click', e => {
      if (e.target.isContentEditable) return;
      const h = e.target.closest('[data-ssort]'); if (h) { const [id, k] = h.dataset.ssort.split(':'), s = sorts[id]; sorts[id] = { k, d: s && s.k === k ? -s.d : 1 }; return render(last); }
      const ie = e.target.closest('[data-iedit]'); if (ie) { const it = Store.byId.inventory.get(ie.closest('tr').dataset.id); if (it) InventoryUI.edit(it); return; }
      const k = e.target.closest('tr.krow'); if (k) { open.has(k.dataset.k) ? open.delete(k.dataset.k) : open.add(k.dataset.k); return render(last); }
      const m = e.target.closest('[data-more]'); if (m) { if (m.dataset.more === 'p') limitP += 25; else limitV += 30; render(last); }
    });
    run();
  }
  G.QuickSearch = { init, run, get last() { return last; } };
})(window);
