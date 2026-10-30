/* db.js — IndexedDB wrapper (on-device storage, works offline, no login).
   Stores: catalog (Reference), vehicles, inventory (in stock), files (one record per imported file), meta (prefs etc).
   Migration: v3 kept in-stock items in a store called 'van'. Version 2 of the DB copies every 'van' record
   into 'inventory' (same ids) inside the upgrade transaction, then drops 'van' — nothing is lost. */
(function (G) {
  'use strict';
  const NAME = 'PinkyKeysV3', STORES = ['catalog', 'vehicles', 'inventory', 'files'];
  let db;
  function open() {
    return new Promise((res, rej) => { const r = indexedDB.open(NAME, 2);
      r.onupgradeneeded = () => { const d = r.result, tx = r.transaction; STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
        if (d.objectStoreNames.contains('van')) { const inv = tx.objectStore('inventory'), g = tx.objectStore('van').getAll();
          g.onsuccess = () => { g.result.forEach(x => inv.put(x)); d.deleteObjectStore('van'); }; }
        if (tx.objectStore('files')) { const f = tx.objectStore('files'), c = f.openCursor(); // old file records said kind 'van'
          c.onsuccess = () => { const k = c.result; if (!k) return; if (k.value.kind === 'van') { k.value.kind = 'inventory'; k.update(k.value); } k.continue(); }; }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' }); };
      r.onsuccess = () => { db = r.result; res(db); }; r.onerror = () => rej(r.error); });
  }
  const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('write aborted (storage full?)')); });
  const all = s => new Promise((res, rej) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function write(s, puts, dels) { const tx = db.transaction(s, 'readwrite'), os = tx.objectStore(s); (dels || []).forEach(id => os.delete(id)); (puts || []).forEach(r => os.put(r)); return done(tx); }
  function clear(s) { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).clear(); return done(tx); }
  const getMeta = k => new Promise(res => { const r = db.transaction('meta').objectStore('meta').get(k); r.onsuccess = () => res(r.result ? r.result.v : undefined); r.onerror = () => res(undefined); });
  function setMeta(k, v) { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: k, v }); return done(tx); }
  G.DB = { open, all, write, clear, getMeta, setMeta, STORES };
})(window);
