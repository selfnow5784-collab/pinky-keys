/* hidden.js — soft-hide for catalog rows, stored in IndexedDB meta ('hidden') by row id
   so a CSV re-import cannot un-hide them. Undo of the last hide appears on the undo bar;
   View → Hidden rows (and Settings / Data) can restore any. Supplier rows are only hidden;
   user rows may also be truly deleted (Users.remove). */
(function (G) {
  'use strict';
  let map = {}, last = [], undoT;
  async function load() { map = (await DB.getMeta('hidden')) || {}; }
  const persist = () => DB.setMeta('hidden', map);
  const isHidden = id => !!map[id];
  const ids = () => Object.keys(map);
  const list = () => ids().map(id => ({ id, date: (map[id] || {}).date || '', row: Store.byId.catalog.get(id) }));
  function showUndo(n) {
    const b = document.getElementById('undoBar'); if (!b) return;
    document.getElementById('undoMsg').textContent = n === 1 ? 'Row hidden.' : n.toLocaleString() + ' rows hidden.';
    b.hidden = false; clearTimeout(undoT); undoT = setTimeout(() => { b.hidden = true; }, 8000);
  }
  async function hide(idList) {
    const now = new Date().toISOString(); last = [];
    idList.forEach(id => { if (!map[id]) last.push(id); map[id] = { date: now }; });
    await persist(); showUndo(last.length); Store.changed && Store.changed('hidden'); return last.length;
  }
  async function restore(idList) {
    (idList || ids()).forEach(id => delete map[id]); last = [];
    const b = document.getElementById('undoBar'); if (b) b.hidden = true;
    await persist(); Store.changed && Store.changed('hidden');
  }
  async function undo() {
    if (!last.length) return 0; const n = last.length; last.forEach(id => delete map[id]); last = [];
    const b = document.getElementById('undoBar'); if (b) b.hidden = true;
    await persist(); Store.changed && Store.changed('hidden'); return n;
  }
  async function drop(idList) { idList.forEach(id => delete map[id]); await persist(); }
  const replaceAll = async obj => { map = obj || {}; await persist(); };
  G.Hidden = { load, isHidden, ids, list, hide, restore, undo, drop, raw: () => map, replaceAll, count: () => Object.keys(map).length };
})(window);
