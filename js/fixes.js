/* fixes.js — "My Fixes": your own edits and "Confirmed ✓" marks on catalog rows, kept SEPARATE from the supplier data
   (IndexedDB meta key 'fixes'), keyed by the CSV row id (cid). Each fix: { cid, fields: { field: {orig, val, conflict?} }, confirmed, date, snap }.
   - edit(row, field, value): stores the original supplier value once and the new value; back to the original = that field's fix is dropped.
   - After a new CSV import, reapply(): CSV value = your value -> fix cleared (already in the update);
     CSV value = the original -> your value is put back; CSV value is something new -> your value stays and the field is FLAGGED (conflict).
     A confirmation is cleared when the row is no longer in the review file (it was merged into the main CSV).
   - toCSV(): one line per changed field (+ one per confirmation) to send in for the next CSV update. */
(function (G) {
  'use strict';
  let fx = {};
  const CONFLICT_NONE = undefined;
  const LABELS = { years: 'Year(s)', make: 'Make', model: 'Model', product: 'Product', type: 'Type', buttons: 'Buttons', fcc: 'FCC ID', chip: 'Chip', freq: 'Frequency',
    blade: 'Blade', oem: 'OEM part #', price: 'Price', notes: 'Notes' };
  const EDITABLE = Object.keys(LABELS);
  const s = v => v == null ? '' : String(v);
  async function load() { fx = (await DB.getMeta('fixes')) || {}; Object.values(fx).forEach(f => { const r = rowOf(f.cid); if (r) applyTo(r, f); }); }
  const persist = () => DB.setMeta('fixes', fx);
  const rowOf = cid => Store.byId.catalog.get(cid) || Store.byId.catalog.get('review:' + cid);
  const cidOf = r => r.cid || r.id;
  const get = r => fx[cidOf(r)];
  function applyTo(r, f) { Object.entries(f.fields || {}).forEach(([k, v]) => { r[k] = v.val; }); }
  const snap = r => ({ years: r.years, make: r.make, model: r.model, product: r.product, spn: r.spn || r.pn || '', src: r.src || '', review: r.review || '', csv: r.fromCsv || '' });
  function ensure(r) { const c = cidOf(r); if (!fx[c]) fx[c] = { cid: c, fields: {}, confirmed: false, date: '', snap: snap(r) }; return fx[c]; }
  function tidy(c) { const f = fx[c]; if (f && !Object.keys(f.fields).length && !f.confirmed) delete fx[c]; }
  async function edit(r, field, value) {
    if (!EDITABLE.includes(field)) return;
    value = s(value).replace(/\s+/g, ' ').trim(); const cur = s(r[field]); if (value === cur) return;
    const f = ensure(r), e = f.fields[field];
    if (!e) f.fields[field] = { orig: cur, val: value };
    else if (value === e.orig && e.conflict === CONFLICT_NONE) delete f.fields[field]; else e.val = value;
    r[field] = value; f.date = new Date().toISOString(); f.snap = Object.assign(snap(r), f.fields.product ? { product: f.fields.product.orig } : {});
    tidy(f.cid); Store.update('catalog', r, field, value, true); await Store.save(); await persist(); Store.changed && Store.changed('fixes');
  }
  async function confirm(r, on) { const f = ensure(r); f.confirmed = !!on; f.date = new Date().toISOString(); tidy(f.cid); await persist(); Store.changed && Store.changed('fixes'); }
  const isConfirmed = r => !!(get(r) && get(r).confirmed);
  const needsReview = r => !!r.review && !isConfirmed(r);
  const edited = (r, k) => { const f = get(r); return f && f.fields[k]; };
  // called by CatalogFile.importClean after rows were refreshed from the CSV
  // fresh = Set of row ids that this import just refreshed from the CSV (rows from the other file are left alone)
  async function reapply(fresh) {
    const res = { cleared: 0, applied: 0, flagged: 0, missing: 0 };
    Object.values(fx).forEach(f => {
      const r = rowOf(f.cid); if (!r) { f.missing = true; res.missing++; return; } f.missing = false;
      if (fresh && !fresh.has(r.id)) return;
      Object.entries(f.fields).forEach(([k, e]) => { const cur = s(r[k]), base = e.conflict !== CONFLICT_NONE ? e.conflict : e.orig;
        if (cur === e.val) { delete f.fields[k]; res.cleared++; return; }
        if (cur !== base) { e.conflict = cur; res.flagged++; } else res.applied++;
        r[k] = e.val; Store.update('catalog', r, k, e.val, true); });
      if (f.confirmed && !r.review) { f.confirmed = false; res.cleared++; }
      f.snap = Object.assign(snap(r), f.fields.product ? { product: f.fields.product.conflict !== CONFLICT_NONE ? f.fields.product.conflict : f.fields.product.orig } : {});
      tidy(f.cid);
    });
    await persist(); return res;
  }
  // flagged field: keep my value (supplier's new value becomes the original) or take the supplier's
  async function resolve(cid, k, keepMine) {
    const f = fx[cid], e = f && f.fields[k]; if (!e || e.conflict === CONFLICT_NONE) return; const r = rowOf(cid);
    if (keepMine) { e.orig = e.conflict; delete e.conflict; }
    else { if (r) { r[k] = e.conflict; Store.update('catalog', r, k, e.conflict, true); } delete f.fields[k]; }
    tidy(cid); if (r) await Store.save(); await persist(); Store.changed && Store.changed('fixes');
  }
  async function remove(cid) { const f = fx[cid]; if (!f) return; const r = rowOf(cid);
    if (r) Object.entries(f.fields).forEach(([k, e]) => { const v = e.conflict !== CONFLICT_NONE ? e.conflict : e.orig; r[k] = v; Store.update('catalog', r, k, v, true); });
    delete fx[cid]; if (r) await Store.save(); await persist(); Store.changed && Store.changed('fixes'); }
  const all = () => Object.values(fx).sort((a, b) => s(b.date).localeCompare(s(a.date)));
  function toCSV() {
    const H = ['id', 'File', 'Year(s)', 'Make', 'Model', 'Product_Name', 'Supplier_Part_Number', 'Field', 'Original value', 'New value', 'Confirmed', 'Supplier changed it to', 'Review reason', 'Date'], out = [];
    all().forEach(f => { const r = rowOf(f.cid) || {}, sn = f.snap || {}, base = { id: f.cid, File: r.fromCsv || sn.csv || '', 'Year(s)': sn.years, Make: sn.make, Model: sn.model, Product_Name: sn.product,
      Supplier_Part_Number: sn.spn, Confirmed: f.confirmed ? 'yes' : '', 'Review reason': r.review || sn.review || '', Date: s(f.date).slice(0, 10) };
      const ks = Object.keys(f.fields);
      ks.forEach(k => { const e = f.fields[k]; out.push(Object.assign({}, base, { Field: LABELS[k] || k, 'Original value': e.orig, 'New value': e.val, 'Supplier changed it to': e.conflict !== CONFLICT_NONE ? e.conflict : '' })); });
      if (!ks.length) out.push(Object.assign({}, base, { Field: '(confirmed, no change)' })); });
    return CSV.unparse(out, H);
  }
  const replaceAll = async obj => { fx = obj || {}; await persist(); };
  G.Fixes = { load, edit, confirm, isConfirmed, needsReview, edited, reapply, resolve, remove, all, toCSV, get, rowOf, LABELS, EDITABLE, raw: () => fx, replaceAll, count: () => Object.keys(fx).length };
})(window);
