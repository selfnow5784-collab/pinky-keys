/* store.js — the in-memory copy of all data + "unsaved changes" tracking.
   Every edit goes through Store.add / update / remove. Changes are kept in memory and
   written to IndexedDB by Store.save() — automatically if the Autosave preference is on,
   otherwise when the floating Save button (red = unsaved, green = saved) is tapped.
   Store.on(fn) lets the UI redraw after changes. Reference catalog "supplier qty" is per PRODUCT (in-stock qty lives only in inventory): editing it on one
   vehicle row updates every row of that product. */
(function (G) {
  'use strict';
  const KINDS = ['catalog', 'vehicles', 'inventory', 'files'];
  const st = { catalog: [], vehicles: [], inventory: [], files: [] }, byId = {}, dirty = {}, gone = {};
  KINDS.forEach(k => { byId[k] = new Map(); dirty[k] = new Set(); gone[k] = new Set(); });
  const prefs = { autosave: false, floating: true, dark: true, textSize: 1 };
  let seq = Date.now(), listeners = [], unsaved = false, autoT;
  const newId = k => k[0] + (seq++).toString(36);
  function changed(what) { unsaved = true; listeners.forEach(f => f(what)); if (prefs.autosave) { clearTimeout(autoT); autoT = setTimeout(save, 400); } }
  async function load() {
    await DB.open();
    for (const k of KINDS) { st[k] = await DB.all(k); byId[k] = new Map(st[k].map(r => [r.id, r])); }
    Object.assign(prefs, (await DB.getMeta('prefs')) || {}); unsaved = false;
  }
  function add(kind, rows, fileId) {
    rows.forEach(r => { r.id = r.id || newId(kind); if (fileId) r.file = fileId; if (r.verified == null && kind !== 'files') r.verified = false;
      st[kind].push(r); byId[kind].set(r.id, r); dirty[kind].add(r.id); gone[kind].delete(r.id); });
    changed(kind); return rows;
  }
  function update(kind, row, field, value, quiet) {
    if (kind === 'catalog' && field === 'qty') { const pk = Data.productKey(row.product); st.catalog.forEach(r => { if (Data.productKey(r.product) === pk) { r.qty = value; dirty.catalog.add(r.id); } }); }
    else { row[field] = value; dirty[kind].add(row.id); }
    if (!quiet) changed(kind);
  }
  // mark a row changed without a redraw (used for row checkboxes)
  function mark(kind, row) { dirty[kind].add(row.id); unsaved = true; listeners.forEach(f => f('mark')); if (prefs.autosave) { clearTimeout(autoT); autoT = setTimeout(save, 400); } }
  function remove(kind, ids) {
    const s = new Set(ids); st[kind] = st[kind].filter(r => !s.has(r.id));
    s.forEach(id => { byId[kind].delete(id); dirty[kind].delete(id); gone[kind].add(id); }); changed(kind);
  }
  function replaceKind(kind) { remove(kind, st[kind].map(r => r.id)); }
  async function save() {
    clearTimeout(autoT);
    for (const k of KINDS) { if (!dirty[k].size && !gone[k].size) continue;
      const puts = [...dirty[k]].map(id => byId[k].get(id)).filter(Boolean).map(r => { const o = Object.assign({}, r); Object.keys(o).forEach(x => { if (x[0] === '_') delete o[x]; }); return o; });
      await DB.write(k, puts, [...gone[k]]); dirty[k].clear(); gone[k].clear(); }
    await DB.setMeta('prefs', prefs); unsaved = false; listeners.forEach(f => f('saved'));
  }
  async function setPref(k, v) { prefs[k] = v; await DB.setMeta('prefs', prefs); listeners.forEach(f => f('prefs')); }
  G.Store = { st, byId, prefs, load, add, update, mark, remove, replaceKind, save, setPref, on: f => listeners.push(f), get unsaved() { return unsaved; }, markAllDirty: () => KINDS.forEach(k => st[k].forEach(r => dirty[k].add(r.id))) };
})(window);
