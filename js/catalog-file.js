/* catalog-file.js (v3.8) — imports Pinky's clean catalog CSV (main file, or the review file = same columns + Reason).
   Columns: Year(s),Make,Model,Product_Name,Type,Qty,Notes,id (+ v4 columns FCC_ID, Chip, Blade, OEM_PN, Supplier_Part_Number,
   Supplier, Source_URL, Original_Supplier_Years, Compatibility_FCC_ID, Research_Sources) (+ Reason = review file).
   Row id = file id (review rows: 'review:' + id). Re-import updates rows by id, adds new ones, drops ids no longer in that file.
   Inventory (stock) is NEVER cleared, and neither are user rows (fromCsv: 'mine'), My Fixes, hidden ids or custom columns: stock links by Source|Item #|Part # (Stock.ref), and those keep their v3.7 meaning
   (PN and Source come from Notes first, exactly as v3.7 read them). After import, My Fixes are re-applied (Fixes.reapply).
   Buttons = only a count written in the product title ("4-Btn", "3 Button", "3/4/5-Button"); blank otherwise (never guessed). */
(function (G) {
  'use strict';
  const NK = { fcc: 'fcc', chip: 'chip', freq: 'freq', pn: 'pn', price: 'price', source: 'src', blade: 'blade' };
  const isClean = h => ['Year(s)', 'Make', 'Model', 'Product_Name', 'id'].every(c => h.includes(c));
  // stated button count only. (?<![\d-]) stops "2019-2025-Btn" giving 5. "4B" style abbreviations are NOT read.
  function buttons(title) {
    const out = [];
    for (const m of String(title || '').matchAll(/(?<![\d\-\/])(\d{1,2}(?:\s*[\/+]\s*\d{1,2})*)\s*-?\s*(?:btns?|buttons?)\b/gi)) {
      const v = m[1].replace(/\s+/g, ''); if (!out.includes(v)) out.push(v); }
    return out.join(' / ');
  }
  const COLMAP = { FCC_ID: 'fcc', Chip: 'chip', Blade: 'blade', OEM_PN: 'oem', Supplier: 'supplier', Source_URL: 'url',
    Original_Supplier_Years: 'origYears', Compatibility_FCC_ID: 'compatFcc', Research_Sources: 'research', Source_File: 'srcFile' };
  function toRow(x, review) {
    const id = (x['id'] || '').trim(), r = { id: (review ? 'review:' : '') + id, cid: id, item: id.split('/')[0], years: x['Year(s)'] || '', make: x['Make'] || '', model: x['Model'] || '',
      product: x['Product_Name'] || '', type: x['Type'] || '', qty: 0, csvQty: Data.parseQty(x['Qty']), notes: x['Notes'] || '', compat: '', fromCsv: review ? 'review' : 'main' };
    (x['Notes'] || '').split(/;\s*/).forEach(p => { const m = p.match(/^(\w+):\s*(.*)$/); if (m && NK[m[1].toLowerCase()]) r[NK[m[1].toLowerCase()]] = m[2].trim(); });
    Object.entries(COLMAP).forEach(([c, f]) => { const v = (x[c] || '').trim(); if (v) r[f] = v; }); // explicit columns win over Notes (not PN/Source: stock link)
    if (!r.pn && (x['Supplier_Part_Number'] || '').trim()) r.pn = x['Supplier_Part_Number'].trim();
    r.spn = (x['Supplier_Part_Number'] || '').trim();
    r.buttons = buttons(r.product);
    r.review = review ? (x['Reason'] || 'review') : ''; r.reviewOnly = false;
    return r;
  }
  const FIELDS = ['years', 'make', 'model', 'product', 'type', 'fcc', 'chip', 'freq', 'blade', 'buttons', 'oem', 'pn', 'spn', 'item', 'price', 'src', 'supplier', 'url', 'origYears', 'compatFcc', 'research', 'srcFile', 'notes', 'review'];
  async function importClean(name, parsed) {
    const review = parsed.headers.includes('Reason'), kind = review ? 'review' : 'main';
    const rows = parsed.data.map(x => toRow(x, review)).filter(r => r.cid); // v3.8: a blank product name no longer drops the row
    const keep = new Set(rows.map(r => r.id));
    Store.remove('catalog', Store.st.catalog.filter(r => r.fromCsv === kind && !keep.has(r.id) && !(G.Users && Users.isMine(r))).map(r => r.id));
    Store.remove('files', Store.st.files.filter(f => f.csv === kind).map(f => f.id));
    const f = Store.add('files', [{ name, kind: 'catalog', csv: kind, rows: rows.length, date: new Date().toISOString() }])[0];
    const fresh = [];
    rows.forEach(r => { r.file = f.id; const ex = Store.byId.catalog.get(r.id);
      if (ex) { FIELDS.forEach(k => { if (!(k in r)) delete ex[k]; }); Object.assign(ex, r); } else fresh.push(r); });
    Store.add('catalog', fresh); Store.markAllDirty();
    Lookup.rebuild(Store.st);
    for (const r of rows) if (r.csvQty > 0) { await Stock.set(r, true); const it = Store.st.inventory.find(i => i.ref === Stock.ref(r)); if (it && +it.qty !== r.csvQty) Store.update('inventory', it, 'qty', r.csvQty, true); }
    if (G.Fixes) await Fixes.reapply(keep);
    Lookup.rebuild(Store.st);
    await Store.save(); return rows.length;
  }
  G.CatalogFile = { isClean, importClean, toRow, buttons };
})(window);
