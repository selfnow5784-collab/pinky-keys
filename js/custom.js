/* custom.js — user-named columns (Bin location, Cost, …). Definitions (customCols) and
   per-row values (customVals, keyed by row id) live in IndexedDB meta, separate from the
   supplier CSV, so they survive re-imports. Shown in the ⚙ column picker. */
(function (G) {
  'use strict';
  let cols = [], vals = {};
  async function load() { cols = (await DB.getMeta('customCols')) || []; vals = (await DB.getMeta('customVals')) || {}; }
  const persist = async () => { await DB.setMeta('customCols', cols); await DB.setMeta('customVals', vals); };
  const list = () => cols;
  const val = (rowId, colId) => ((vals[rowId] || {})[colId] || '');
  const keyOf = c => 'cc:' + c.id;
  const byKey = key => (key && String(key).slice(0, 3) === 'cc:') ? cols.find(c => c.id === key.slice(3)) : null;
  async function setVal(rowId, colId, value) {
    value = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!vals[rowId]) vals[rowId] = {};
    if (value) vals[rowId][colId] = value; else delete vals[rowId][colId];
    if (!Object.keys(vals[rowId]).length) delete vals[rowId];
    await persist(); Store.changed && Store.changed('custom');
  }
  const nid = () => 'cc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  async function add(label) {
    label = String(label || '').replace(/\s+/g, ' ').trim();
    if (!label) return null;
    if (cols.some(c => c.label.toLowerCase() === label.toLowerCase())) return null;
    const c = { id: nid(), label }; cols.push(c);
    const sel = Store.prefs.cols;
    if (sel && !sel.includes(keyOf(c))) { const next = sel.concat(keyOf(c)); await Store.setPref('cols', next); }
    await persist(); Store.changed && Store.changed('custom'); return c;
  }
  async function rename(id, label) {
    label = String(label || '').replace(/\s+/g, ' ').trim();
    const c = cols.find(x => x.id === id); if (!c || !label) return false;
    if (cols.some(x => x.id !== id && x.label.toLowerCase() === label.toLowerCase())) return false;
    c.label = label; await persist(); Store.changed && Store.changed('custom'); return true;
  }
  async function remove(id) {
    cols = cols.filter(c => c.id !== id);
    Object.keys(vals).forEach(rid => { if (vals[rid]) { delete vals[rid][id]; if (!Object.keys(vals[rid]).length) delete vals[rid]; } });
    const sel = Store.prefs.cols; if (sel) await Store.setPref('cols', sel.filter(k => k !== 'cc:' + id));
    await persist(); Store.changed && Store.changed('custom');
  }
  async function dropRows(idList) { idList.forEach(id => delete vals[id]); await persist(); }
  const replaceAll = async (c, v) => { cols = c || []; vals = v || {}; await persist(); };
  G.Custom = { load, list, val, setVal, add, rename, remove, dropRows, rawCols: () => cols, rawVals: () => vals, replaceAll, keyOf, byKey };
})(window);
