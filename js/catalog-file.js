/* catalog-file.js (v3.7) — imports Pinky's clean catalog CSV from the Data tab. The app ships with NO catalog.
   Columns: Year(s),Make,Model,Product_Name,Type,Qty,Notes,id  (+ Reason = the review file).
   Rows go to Reference keys with the file's id as the row id. Re-import updates rows by id, adds new ones,
   drops ids no longer in that file; Inventory is never cleared. Qty>0 rows are put in Inventory (one item per key, no duplicates).
   Notes "FCC: x; Chip: y; Freq: z; PN: p; Price: n; Source: AKS" fill those columns. Review-file rows show only on the Review tab. */
(function (G) {
  'use strict';
  const NK = { fcc: 'fcc', chip: 'chip', freq: 'freq', pn: 'pn', price: 'price', source: 'src' };
  const isClean = h => ['Year(s)', 'Make', 'Model', 'Product_Name', 'id'].every(c => h.includes(c));
  function toRow(x, review) {
    const id = (x['id'] || '').trim(), r = { id: (review ? 'review:' : '') + id, cid: id, item: id.split('/')[0], years: x['Year(s)'] || '', make: x['Make'] || '', model: x['Model'] || '',
      product: x['Product_Name'] || '', type: x['Type'] || '', qty: 0, csvQty: Data.parseQty(x['Qty']), notes: x['Notes'] || '', compat: '', fromCsv: review ? 'review' : 'main' };
    (x['Notes'] || '').split(/;\s*/).forEach(p => { const m = p.match(/^(\w+):\s*(.*)$/); if (m && NK[m[1].toLowerCase()]) r[NK[m[1].toLowerCase()]] = m[2].trim(); });
    if (review) { r.review = x['Reason'] || 'review'; r.reviewOnly = true; }
    return r;
  }
  async function importClean(name, parsed) {
    const review = parsed.headers.includes('Reason'), kind = review ? 'review' : 'main';
    const rows = parsed.data.map(x => toRow(x, review)).filter(r => r.cid && r.product);
    const keep = new Set(rows.map(r => r.id));
    Store.remove('catalog', Store.st.catalog.filter(r => r.fromCsv === kind && !keep.has(r.id)).map(r => r.id));
    Store.remove('files', Store.st.files.filter(f => f.csv === kind).map(f => f.id));
    const f = Store.add('files', [{ name, kind: 'catalog', csv: kind, rows: rows.length, date: new Date().toISOString() }])[0];
    const fresh = [];
    rows.forEach(r => { r.file = f.id; const ex = Store.byId.catalog.get(r.id); if (ex) Object.assign(ex, r); else fresh.push(r); });
    Store.add('catalog', fresh); Store.markAllDirty();
    Lookup.rebuild(Store.st);
    for (const r of rows) if (r.csvQty > 0) { await Stock.set(r, true); const it = Store.st.inventory.find(i => i.ref === Stock.ref(r)); if (it && +it.qty !== r.csvQty) Store.update('inventory', it, 'qty', r.csvQty, true); }
    await Store.save(); return rows.length;
  }
  G.CatalogFile = { isClean, importClean, toRow };
})(window);
