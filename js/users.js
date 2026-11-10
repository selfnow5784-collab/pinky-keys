/* users.js — "+ Add item" user rows (fromCsv: 'mine', Source = "My item"). Stored in the
   catalog but never touched by a CSV import, so they survive updates. Also migrates items
   that were hand-added on the old v3.7 Inventory tab (no stock-tick ref, or a ref that no
   longer matches a catalog row) into visible "My item" rows. */
(function (G) {
  'use strict';
  const isMine = r => !!(r && (r.fromCsv === 'mine' || r.user));
  const nid = () => 'mine:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const FIELDS = ['years', 'make', 'model', 'product', 'type', 'fcc', 'chip', 'freq', 'blade', 'buttons', 'oem', 'pn', 'price', 'notes'];
  const LABELS = Object.assign({ pn: 'Part #' }, (G.Fixes && Fixes.LABELS) || {});
  function blank() {
    return { years: '', make: '', model: '', product: '', type: '', fcc: '', chip: '', freq: '', blade: '', buttons: '', oem: '', pn: '', item: '',
      price: '', notes: '', src: 'My item', supplier: 'My item', qty: 0, fromCsv: 'mine', user: true, review: '', url: '', compat: '' };
  }
  function add(fields) {
    const r = Object.assign(blank(), fields || {});
    r.id = r.id || nid(); r.cid = r.id; r.item = r.item || r.id; r.src = 'My item'; r.supplier = 'My item'; r.fromCsv = 'mine'; r.user = true; r.qty = 0;
    if (!r.buttons && r.product && G.CatalogFile) r.buttons = CatalogFile.buttons(r.product);
    Store.add('catalog', [r]); return r;
  }
  async function save(r, fields) {
    const old = Stock.ref(r);
    FIELDS.forEach(k => { if (k in fields) Store.update('catalog', r, k, String(fields[k] == null ? '' : fields[k]).replace(/\s+/g, ' ').trim(), true); });
    if (fields.product && G.CatalogFile && !('buttons' in fields)) Store.update('catalog', r, 'buttons', CatalogFile.buttons(r.product), true);
    const nw = Stock.ref(r);
    if (nw !== old) Store.st.inventory.filter(it => it.ref === old).forEach(it => Store.update('inventory', it, 'ref', nw, true));
    Lookup.rebuild(Store.st);
    try { await Store.save(); } catch (e) { U.toast('Save failed: ' + e.message, true, 8000); }
  }
  async function remove(ids) {
    const s = new Set(ids), rows = Store.st.catalog.filter(r => s.has(r.id) && isMine(r));
    if (!rows.length) return;
    const refs = new Set(rows.map(r => Stock.ref(r)));
    Store.remove('catalog', rows.map(r => r.id));
    const inv = Store.st.inventory.filter(it => it.ref && refs.has(it.ref)).map(it => it.id);
    if (inv.length) Store.remove('inventory', inv);
    if (G.Hidden) await Hidden.drop(rows.map(r => r.id));
    if (G.Custom) await Custom.dropRows(rows.map(r => r.id));
    Lookup.rebuild(Store.st);
    try { await Store.save(); } catch (e) { U.toast('Save failed: ' + e.message, true, 8000); }
  }
  function rowFromInv(it, fit) {
    const r = blank();
    r.product = it.name || it.pn || ''; r.pn = it.pn || ''; r.notes = it.notes || ''; r.type = it.type || ''; r.price = it.price || '';
    r.fcc = it.links || ''; r.invId = it.id; r.item = 'inv:' + it.id;
    if (fit) { r.years = fit.years || ''; r.make = fit.make || ''; r.model = fit.model || ''; }
    r.id = nid(); r.cid = r.id;
    if (r.product && G.CatalogFile) r.buttons = CatalogFile.buttons(r.product);
    return r;
  }
  async function migrate() {
    const haveInv = new Set(Store.st.catalog.filter(isMine).map(r => r.invId).filter(Boolean));
    const catalogRefs = new Set(Store.st.catalog.map(r => Stock.ref(r)));
    let n = 0;
    Store.st.inventory.slice().forEach(it => {
      if (haveInv.has(it.id)) return;
      if (it.ref && catalogRefs.has(it.ref)) return;
      const fits = (it.fits && it.fits.length) ? it.fits : [null];
      const rows = fits.map(f => rowFromInv(it, f));
      Store.add('catalog', rows);
      const k = Stock.ref(rows[0]);
      Store.update('inventory', it, 'ref', k, true);
      haveInv.add(it.id); catalogRefs.add(k); n += rows.length;
    });
    if (n) { Lookup.rebuild(Store.st); try { await Store.save(); } catch (e) { U.toast('Save failed: ' + e.message, true, 8000); } }
    return n;
  }
  G.Users = { isMine, add, save, remove, migrate, fields: FIELDS, LABELS };
})(window);
