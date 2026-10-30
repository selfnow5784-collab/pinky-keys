/* ui-inventory.js — Inventory tab: what is IN STOCK (the ~50 things physically in the van), keyed by part #.
   Grid: In stock (Yes (n) / No), Qty with big −/+ buttons, Part #, Fits, Name. Every header sorts (tap again = reverse).
   Part # and Name are editable in place; "Edit" opens a form for part #, name, FCC/part #s it matches and exact vehicle fits.
   Fits guessed from the item title are listed like any other fit (no marker on the grid; see README).
   This list is the ONLY source of stock qty: it answers "do we have it?". */
(function (G) {
  'use strict';
  const { $, esc } = U;
  let sk = 'name', sd = 1;
  function rows() {
    const f = Search.norm($('#invFilter').value);
    let r = Store.st.inventory.filter(it => !f || Search.norm([it.pn, it.name, it.links, it.notes].join(' ')).includes(f));
    if ($('#invInOnly').checked) r = r.filter(it => +it.qty > 0);
    const val = it => sk === 'fits' ? fitsTxt(it) : it[sk];
    return r.sort((a, b) => sd * (sk === 'qty' || sk === 'stock' ? (+a.qty || 0) - (+b.qty || 0) : String(val(a) || '').localeCompare(String(val(b) || ''), undefined, { numeric: true })));
  }
  const fitsTxt = it => OnHand.allFits(it).map(f => [f.make, f.model, f.years].filter(Boolean).join(' ')).join('; ');
  function render() {
    const list = rows(), th = (k, l) => `<th data-isort="${k}" class="sortable${sk === k ? (sd > 0 ? ' asc' : ' desc') : ''}">${l}</th>`;
    $('#invList').innerHTML = list.length ? `<div class="tscroll"><table class="sheet inv"><thead><tr>${th('stock', 'In stock')}${th('qty', 'Qty')}${th('pn', 'Part #')}${th('fits', 'Fits')}${th('name', 'Name')}<th></th></tr></thead><tbody>` +
      list.map(it => `<tr class="vrow" data-id="${esc(it.id)}"><td class="c-stock">${+it.qty > 0 ? `Yes (${+it.qty})` : 'No'}</td><td class="qty"><button data-q="-1" aria-label="less">−</button><span class="qn">${+it.qty || 0}</span><button data-q="1" aria-label="more">+</button></td>
        <td class="c-pn" contenteditable="true" data-k="pn">${esc(it.pn)}</td><td class="c-fits">${esc(fitsTxt(it))}</td><td class="c-nm" contenteditable="true" data-k="name">${esc(it.name)}</td><td><button class="edit" data-edit>Edit</button></td></tr>`).join('') +
      '</tbody></table></div>' : '<div class="none">No items.</div>';
  }
  const fitRow = f => `<div class="fitrow"><input placeholder="Make" value="${esc(f.make)}"><input placeholder="Model (blank = all)" value="${esc(f.model)}"><input placeholder="Years e.g. 2011-2016" value="${esc(f.years)}"><button type="button" class="x" onclick="this.parentNode.remove()">✕</button></div>`;
  async function edit(it) {
    const isNew = !it; it = it || { pn: '', name: '', qty: 1, type: '', links: '', notes: '', fits: [] };
    const guesses = OnHand.inferFits(it);
    const body = `<label>Part #<input id="vf_pn" value="${esc(it.pn)}"></label><label>Name<input id="vf_name" value="${esc(it.name)}"></label>
      <label>Qty in stock<input id="vf_qty" type="number" min="0" value="${+it.qty || 0}"></label>
      <label>FCC IDs / part #s it matches <input id="vf_links" value="${esc(it.links)}" placeholder="e.g. 164-R8130, N5F-A08TAA"></label>
      <label>Notes<input id="vf_notes" value="${esc(it.notes)}"></label><label class="inline"><input type="checkbox" id="vf_ver" ${it.verified ? 'checked' : ''}> I checked these fits (verified)</label>
      <h4>Vehicle fits</h4><div id="vf_fits">${(it.fits || []).map(fitRow).join('')}</div><button type="button" id="vf_add">+ Add vehicle fit</button>
      ${guesses.length ? `<p class="sub">Guessed from title: ${guesses.map(g => esc(g.make + ' ' + (g.years || 'any year'))).join(', ')}</p><label class="inline"><input type="checkbox" id="vf_noinf" ${it.noInfer ? 'checked' : ''}> Ignore the guesses</label>` : ''}`;
    setTimeout(() => { $('#vf_add').onclick = () => $('#vf_fits').insertAdjacentHTML('beforeend', fitRow({ make: '', model: '', years: '' })); });
    const btns = [{ label: 'Cancel', value: null }, { label: 'Save', value: 'save', cls: 'primary' }]; if (!isNew) btns.unshift({ label: 'Delete', value: 'del', cls: 'danger' });
    const v = await U.dialog(isNew ? 'Add inventory item' : 'Edit inventory item', body, btns.map(b => b.value === 'save' ? Object.assign(b, { value: () => collect() }) : b));
    function collect() {
      return { pn: $('#vf_pn').value.trim(), name: $('#vf_name').value.trim(), qty: Data.parseQty($('#vf_qty').value), links: $('#vf_links').value.trim(), notes: $('#vf_notes').value.trim(),
        verified: $('#vf_ver').checked, noInfer: !!($('#vf_noinf') && $('#vf_noinf').checked),
        fits: [...document.querySelectorAll('#vf_fits .fitrow')].map(d => { const i = d.querySelectorAll('input'); return { make: i[0].value.trim().toUpperCase(), model: i[1].value.trim().toUpperCase(), years: i[2].value.trim(), src: 'manual' }; }).filter(f => f.make) };
    }
    if (v === 'del') { if (await U.confirmBox('Delete item?', it.name, 'Delete')) Store.remove('inventory', [it.id]); return; }
    if (!v || typeof v !== 'object') return;
    if (!v.name && !v.pn) { U.toast('Give it a part # or a name', true); return; }
    if (!v.name) v.name = v.pn;
    if (isNew) { const dup = v.pn && Store.st.inventory.find(x => Search.compact(x.pn) === Search.compact(v.pn));
      if (dup) { Store.update('inventory', dup, 'qty', (+dup.qty || 0) + v.qty); U.toast(`${v.pn} already listed – added ${v.qty} to it`); return; }
      Store.add('inventory', [Object.assign({ type: '', price: '', itemId: '' }, v)]); }
    else Object.entries(v).forEach(([k, x]) => Store.update('inventory', it, k, x, true)), Store.update('inventory', it, 'qty', v.qty);
  }
  function init() {
    $('#invFilter').addEventListener('input', render); $('#invInOnly').addEventListener('change', render);
    $('#invAdd').onclick = () => edit(null);
    $('#invExport').onclick = () => { const r = rows(); U.download(CSV.unparse(r.map(it => Object.assign({}, it, { fits: OnHand.allFits(it).map(f => `${f.make} ${f.model} ${f.years} (${f.src})`).join('; ') })), ['pn', 'name', 'qty', 'links', 'fits', 'notes', 'verified']), 'inventory-' + U.stamp() + '.csv'); };
    $('#invList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
    $('#invList').addEventListener('focusout', e => { const td = e.target; if (!td.isContentEditable || !td.dataset.k) return; const it = Store.byId.inventory.get(td.closest('.vrow').dataset.id); if (!it) return;
      const v = td.innerText.replace(/\s+/g, ' ').trim(); if (td.dataset.k === 'name' && !v) { td.textContent = it.name; return; } if (v !== String(it[td.dataset.k] || '')) Store.update('inventory', it, td.dataset.k, v); });
    $('#invList').addEventListener('click', e => { const h = e.target.closest('[data-isort]'); if (h) { sd = sk === h.dataset.isort ? -sd : 1; sk = h.dataset.isort; return render(); } const row = e.target.closest('.vrow'); if (!row) return; const it = Store.byId.inventory.get(row.dataset.id);
      const q = e.target.closest('[data-q]'); if (q) { Store.update('inventory', it, 'qty', Math.max(0, (+it.qty || 0) + +q.dataset.q)); return; }
      if (e.target.closest('[data-edit]')) edit(it); });
  }
  G.InventoryUI = { init, render, edit };
})(window);
