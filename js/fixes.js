/* fixes.js (v3.9-7) — "My Fixes": your edits and "Confirmed ✓" marks on catalog rows, kept in their OWN small record
   (IndexedDB meta key 'fixes'), keyed by the CSV row id (cid). The imported CSV stays the catalog: catalog rows are stored
   exactly as the CSV gave them (Store.save calls toBase), and your values are laid on top in the working view only.
   Each fix: { cid, fields: { field: {orig, val, conflict?} }, confirmed, date, snap, off? }.
   - edit(row, field, value): keeps the CSV value once (orig) and your value; going back to orig drops that field's fix.
   - pendingAgainst(newRows): before a new CSV is loaded, which fixes are NOT already in it (those are the only reason to ask).
   - reapply(fresh, apply): after a new CSV is loaded. Fix already in the new CSV -> cleared (nothing to ask). Otherwise
     apply=true -> your value is put back (flagged if the supplier changed the same value), apply=false -> left out of the view
     (off) but still listed, so it can be exported and sent in.
   - toCSV(): one line per changed field (+ one per confirmation): the file to send in for the next catalog update. */
(function (G) {
  'use strict';
  let fx = {};
  const CONFLICT_NONE = undefined;
  const LABELS = { years: 'Year(s)', make: 'Make', model: 'Model', product: 'Product', type: 'Type', buttons: 'Buttons', fcc: 'FCC ID', chip: 'Chip', freq: 'Frequency',
    blade: 'Blade', oem: 'OEM part #', price: 'Price', notes: 'Notes' };
  const EDITABLE = Object.keys(LABELS);
  const s = v => v == null ? '' : String(v);
  async function load() { fx = (await DB.getMeta('fixes')) || {}; Object.values(fx).forEach(f => { const r = rowOf(f.cid); if (r && !f.off) applyTo(r, f); }); }
  const persist = () => DB.setMeta('fixes', fx);
  const rowOf = cid => Store.byId.catalog.get(cid) || Store.byId.catalog.get('review:' + cid);
  const cidOf = r => r.cid || r.id;
  const get = r => fx[cidOf(r)];
  const live = r => { const f = get(r); return f && !f.off ? f : null; };
  function applyTo(r, f) { Object.entries(f.fields || {}).forEach(([k, v]) => { r[k] = v.val; }); }
  // stored copy of a catalog row = the CSV values (your applied values swapped back out)
  function toBase(o) { const f = fx[o.cid || o.id]; if (!f || f.off || o.fromCsv === 'mine') return o;
    Object.entries(f.fields || {}).forEach(([k, e]) => { o[k] = e.conflict !== CONFLICT_NONE ? e.conflict : e.orig; }); return o; }
  const snap = r => ({ years: r.years, make: r.make, model: r.model, product: r.product, spn: r.spn || r.pn || '', src: r.src || '', review: r.review || '', csv: r.fromCsv || '' });
  function ensure(r) { const c = cidOf(r); if (!fx[c]) fx[c] = { cid: c, fields: {}, confirmed: false, date: '', snap: snap(r) }; return fx[c]; }
  function tidy(c) { const f = fx[c]; if (f && !Object.keys(f.fields).length && !f.confirmed) delete fx[c]; }
  async function edit(r, field, value) {
    if (!EDITABLE.includes(field)) return;
    value = s(value).replace(/\s+/g, ' ').trim(); const cur = s(r[field]); if (value === cur) return;
    const f = ensure(r);
    if (f.off) { applyTo(r, f); f.off = false; } // editing a left-out fix brings the whole fix back into the view
    const e = f.fields[field];
    if (!e) f.fields[field] = { orig: cur, val: value };
    else if (value === e.orig && e.conflict === CONFLICT_NONE) delete f.fields[field]; else e.val = value;
    r[field] = value; f.date = new Date().toISOString(); f.snap = Object.assign(snap(r), f.fields.product ? { product: f.fields.product.orig } : {});
    tidy(f.cid); Store.update('catalog', r, field, value, true); await Store.save(); await persist(); Store.changed && Store.changed('fixes');
  }
  async function confirm(r, on) { const f = ensure(r); if (f.off) { applyTo(r, f); f.off = false; } f.confirmed = !!on; f.date = new Date().toISOString(); tidy(f.cid); await persist(); Store.changed && Store.changed('fixes'); }
  const isConfirmed = r => { const f = live(r); return !!(f && f.confirmed); };
  const needsReview = r => !!r.review && !isConfirmed(r);
  const edited = (r, k) => { const f = live(r); return f && f.fields[k]; };
  // which fixes are already in a new file (rows = CatalogFile.prepare(...).rows)
  function pendingAgainst(rows) {
    const by = new Map(rows.map(r => [r.cid, r])), out = { pending: [], already: [], missing: [] };
    Object.values(fx).forEach(f => {
      const n = by.get(f.cid); if (!n) { out.missing.push(f.cid); return; }
      const fieldsIn = Object.entries(f.fields).every(([k, e]) => s(n[k]) === s(e.val));
      const confIn = !f.confirmed || !n.review;
      (fieldsIn && confIn ? out.already : out.pending).push(f.cid);
    });
    return out;
  }
  // fresh = Set of row ids the import just loaded from the CSV; apply = put not-yet-included fixes back on top
  async function reapply(fresh, apply) {
    if (apply === undefined) apply = true;
    const res = { cleared: 0, applied: 0, flagged: 0, missing: 0, off: 0 };
    Object.values(fx).forEach(f => {
      const r = rowOf(f.cid); if (!r) { f.missing = true; res.missing++; return; } f.missing = false;
      if (fresh && !fresh.has(r.id)) return;
      Object.entries(f.fields).forEach(([k, e]) => { if (s(r[k]) === s(e.val)) { delete f.fields[k]; res.cleared++; } });
      if (f.confirmed && !r.review) { f.confirmed = false; res.cleared++; }
      if (!Object.keys(f.fields).length && !f.confirmed) { delete fx[f.cid]; return; }
      if (!apply) { f.off = true; res.off++; f.snap = snap(r); return; }
      f.off = false;
      Object.entries(f.fields).forEach(([k, e]) => { const cur = s(r[k]), base = e.conflict !== CONFLICT_NONE ? e.conflict : e.orig;
        if (cur !== base) { e.conflict = cur; res.flagged++; } else res.applied++;
        r[k] = e.val; Store.update('catalog', r, k, e.val, true); });
      if (f.confirmed) res.applied++;
      f.snap = Object.assign(snap(r), f.fields.product ? { product: f.fields.product.conflict !== CONFLICT_NONE ? f.fields.product.conflict : f.fields.product.orig } : {});
    });
    await persist(); return res;
  }
  async function resolve(cid, k, keepMine) {
    const f = fx[cid], e = f && f.fields[k]; if (!e || e.conflict === CONFLICT_NONE) return; const r = rowOf(cid);
    if (keepMine) { e.orig = e.conflict; delete e.conflict; }
    else { if (r && !f.off) { r[k] = e.conflict; Store.update('catalog', r, k, e.conflict, true); } delete f.fields[k]; }
    tidy(cid); if (r) await Store.save(); await persist(); Store.changed && Store.changed('fixes');
  }
  async function remove(cid) { const f = fx[cid]; if (!f) return; const r = rowOf(cid);
    if (r && !f.off) Object.entries(f.fields).forEach(([k, e]) => { const v = e.conflict !== CONFLICT_NONE ? e.conflict : e.orig; r[k] = v; Store.update('catalog', r, k, v, true); });
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
  G.Fixes = { load, edit, confirm, isConfirmed, needsReview, edited, pendingAgainst, reapply, resolve, remove, all, toCSV, toBase, get, rowOf, LABELS, EDITABLE, raw: () => fx, replaceAll, count: () => Object.keys(fx).length };
})(window);
