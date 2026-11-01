/* catalog-file.js — loads the supplier catalog from the plain file catalog.csv next to the app (made by tools/build_catalog.py).
   To update the catalog: replace catalog.csv and bump VERSION in sw.js. On the next open, if the file changed,
   rows that came from the file are replaced (your own added rows and Inventory are kept; edits to file rows are lost).
   Rows with text in Review = flagged/unverified (shown grey; listed on the Review tab). List = "review only" rows are not searched. */
(function (G) {
  'use strict';
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return s.length + ':' + h; };
  const years = (a, b) => a && b && a !== b ? a + '-' + b : (a || b || '');
  function toRow(x) {
    return { src: x['Source'], reviewOnly: x['List'] === 'review only', make: x['Make'], model: x['Model'], years: years(x['Year start'], x['Year end']),
      product: x['Product'], type: x['Type'], pn: x['Part #'], item: x['Item #'], fcc: x['FCC ID'], chip: x['Chip'], freq: x['Frequency'],
      buttons: x['Buttons'], blade: x['Blade'], price: x['Price'], review: x['Review'], url: x['URL'], compat: '', notes: '', qty: 0, fromFile: true };
  }
  async function sync() {
    let text; try { const r = await fetch('catalog.csv'); if (!r.ok) return; text = await r.text(); } catch (e) { return; }
    const h = hash(text); if ((await DB.getMeta('catalogFile')) === h && Store.st.catalog.some(r => r.fromFile)) return;
    const rows = CSV.parse(text).data.map(toRow);
    Store.remove('catalog', Store.st.catalog.filter(r => r.fromFile).map(r => r.id));
    Store.add('catalog', rows); await Store.save(); await DB.setMeta('catalogFile', h);
  }
  G.CatalogFile = { sync, toRow };
})(window);
