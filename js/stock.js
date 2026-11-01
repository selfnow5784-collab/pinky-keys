/* stock.js — the "In stock" tick box on Reference and Search rows (v3.6).
   Tick  = the key is in the van: adds ONE Inventory item for that catalog key (Qty 1, Part # = supplier part # or Item #,
           name = store product name, fits = every make/model/years of that key). Already there with Qty 0 -> Qty set to 1. Never duplicated.
   Untick = not in the van: removes that key's Inventory item (and sets Qty 0 on hand-made items linked to it by part #/FCC).
   Link = it.ref = Source|Item #|Part # (or product name when both blank). It survives re-imports of the catalog CSV, because
   new rows for the same key get the same ref. Saved to IndexedDB straight away. */
(function (G) {
  'use strict';
  const ref = r => [r.src || '', r.item || '', r.pn || '', r.item || r.pn ? '' : Data.productKey(r.product)].join('|');
  const byRef = k => Store.st.inventory.filter(it => it.ref === k);
  const qty = r => Lookup.L ? (Lookup.L.links.get(Data.rowKey(r)) || []).reduce((a, it) => a + (+it.qty || 0), 0) : 0;
  function fitsFor(k) {
    const seen = new Set(), out = [];
    Store.st.catalog.forEach(r => { if (ref(r) !== k) return; const f = { make: (r.make || '').toUpperCase(), model: (r.model || '').toUpperCase(), years: r.years || '', src: 'catalog' };
      const s = f.make + '|' + f.model + '|' + f.years; if (!seen.has(s) && f.make) { seen.add(s); out.push(f); } });
    return out;
  }
  async function set(r, on) {
    const k = ref(r), mine = byRef(k);
    if (on) {
      if (mine.length) { if (!(+mine[0].qty > 0)) Store.update('inventory', mine[0], 'qty', 1); }
      else Store.add('inventory', [{ ref: k, pn: r.pn || r.item || '', itemId: r.item || '', name: r.product || r.pn || r.item, qty: 1, type: r.type || '', price: r.price || '',
        links: '', notes: '', noInfer: true, fits: fitsFor(k) }]);
    } else {
      if (mine.length) Store.remove('inventory', mine.map(it => it.id));
      (Lookup.L && Lookup.L.links.get(Data.rowKey(r)) || []).forEach(it => { if (!it.ref && +it.qty > 0) Store.update('inventory', it, 'qty', 0); });
    }
    Lookup.rebuild(Store.st);
    try { await Store.save(); } catch (e) { U.toast('Save failed: ' + e.message, true, 8000); }
  }
  // tick box cell html; data-stock = catalog row id
  const cell = (r, q) => `<td class="c-stock"><label class="stk"><input type="checkbox" data-stock="${U.esc(r.id)}" ${q > 0 ? 'checked' : ''}> ${q > 0 ? 'Yes' + (q > 1 ? ` (${q})` : '') : 'No'}</label></td>`;
  G.Stock = { ref, qty, set, cell, fitsFor };
})(window);
