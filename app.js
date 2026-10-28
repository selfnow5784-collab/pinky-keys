/* Transponder DB – Pinky's Locksmithing. All data stays on this device (IndexedDB). */
'use strict';
let db;
const DB_NAME = 'TransponderDB';
const DB_VERSION = 4;
const INVENTORY_STORE = 'inventory', VEHICLE_STORE = 'vehicles', STOCK_STORE = 'stock', FILES_STORE = 'files';
const AUTO_BACKUP_KEY = 'pinkyAutoBackup', LAST_BACKUP_KEY = 'pinkyLastBackupDownload';

const TYPES = {
  inventory: { store: INVENTORY_STORE, label: 'Inventory',
    fields: ['Make', 'Model', 'Year(s)', 'Product_Name', 'Type', 'Qty', 'Notes'], yearField: 'Year(s)',
    required: ['Make', 'Model', 'Product_Name'] },
  vehicle: { store: VEHICLE_STORE, label: 'Vehicle Reference',
    fields: ['Make', 'Model', 'Year_Range', 'Product_Name', 'STRATTEC', 'Qty', 'Notes'], yearField: 'Year_Range',
    required: ['Make', 'Model', 'Product_Name'] },
  stock: { store: STOCK_STORE, label: 'Stock List',
    fields: ['Item_ID', 'Part_No', 'Name', 'Type', 'Price', 'Facility', 'Qty', 'Image'], yearField: null,
    required: ['Name'] }
};
const FIELD_LABEL = { Product_Name: 'Product Name', Year_Range: 'Year Range', Item_ID: 'Item ID', Part_No: 'Part #' };
const label = f => FIELD_LABEL[f] || f;

// Header name variations (compared lowercase with spaces/punctuation removed)
const HEADER_ALIASES = {
  inventory: { Make: ['make', 'manufacturer', 'brand'], Model: ['model'],
    'Year(s)': ['years', 'year', 'yearrange', 'yearsrange', 'yr', 'yrs'],
    Product_Name: ['productname', 'product', 'keyname', 'key', 'transponderkey', 'name', 'item', 'itemname', 'description'],
    Type: ['type', 'types', 'keytype', 'transpondertype', 'chip', 'strattec'],
    Qty: ['qty', 'quantity', 'mytotalqty', 'totalqty', 'stock', 'currentstock', 'instock', 'onhand', 'count'],
    Notes: ['notes', 'note', 'comments', 'comment', 'remarks'] },
  vehicle: { Make: ['make', 'manufacturer', 'brand'], Model: ['model'],
    Year_Range: ['yearrange', 'years', 'year', 'yearsrange', 'yr', 'yrs'],
    Product_Name: ['productname', 'product', 'transponderkey', 'keyname', 'key', 'transponder', 'name', 'chip'],
    STRATTEC: ['strattec', 'strattecpart', 'type', 'keytype'],
    Qty: ['qty', 'quantity', 'instock', 'stock', 'mytotalqty', 'currentstock', 'onhand'],
    Notes: ['notes', 'note', 'comments', 'comment', 'remarks'] },
  stock: { Item_ID: ['id', 'itemid', 'itemno'], Part_No: ['model', 'partno', 'partnumber', 'part', 'sku', 'itemnumber'],
    Name: ['name', 'productname', 'description', 'product', 'keyname'], Type: ['types', 'type', 'category'],
    Price: ['price', 'cost', 'unitprice'], Facility: ['facilityqty', 'facility', 'location'],
    Qty: ['mytotalqty', 'totalqty', 'qty', 'quantity', 'stock', 'onhand'], Image: ['image', 'imageurl', 'photo'] }
};
const normHeader = h => (h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- text cleaning / normalising ----------
function fixMojibake(s) {
  // Text that was UTF-8 but read as Latin-1/Windows-1252 (e.g. "â‡†" instead of "⇆")
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(s)) return s;
  try {
    const bytes = new Uint8Array([...s].map(c => { const n = c.charCodeAt(0); if (n > 255) throw 0; return n; }));
    const out = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return out;
  } catch (e) {
    // mixed string: fix runs individually
    return s.replace(/[\u00c2-\u00f4][\u0080-\u00bf]{1,3}/g, run => {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([...run].map(c => c.charCodeAt(0)))); } catch (e2) { return run; }
    });
  }
}
// Returns cleaned display text + flags of what changed
function cleanCell(v, flags, keepLines) {
  if (v === null || v === undefined) return '';
  let s = String(v), o = s;
  const m = fixMojibake(s); if (m !== s) { flags.mojibake++; s = m; }
  if (/<\s*\/?\s*[a-z][^>]*>/i.test(s)) { flags.html++; s = s.replace(/<\s*br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '); }
  s = s.replace(/[\u00a0\u2007\u202f]/g, ' ');
  s = keepLines ? s.split(/\r\n|\r|\n/).map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (s !== o) flags.cells++;
  return s;
}
function norm(s) { return (s === null || s === undefined) ? '' : String(s).replace(/[\u00a0]/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase(); }
const normalizeProductName = norm;
const compact = s => norm(s).replace(/[^a-z0-9]/g, '');
const MAKE_ALIASES = { chevy: 'chevrolet', vw: 'volkswagen', benz: 'mercedes', 'mercedes-benz': 'mercedes', mb: 'mercedes', merc: 'mercury', landrover: 'land rover', caddy: 'cadillac', olds: 'oldsmobile' };
function canonMake(s) { const n = norm(s); return MAKE_ALIASES[n] || n; }
function dedupeKey(type, r) {
  if (type === 'stock') return r.Item_ID ? 'id:' + norm(r.Item_ID) : 'pn:' + compact(r.Part_No) + '|' + norm(r.Name);
  return [norm(r.Product_Name), canonMake(r.Make), norm(r.Model), norm(r[TYPES[type].yearField]).replace(/\s/g, '')].join('|');
}
function safeKeyFromNormalized(n) { return (n || 'unknown_product').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 60) + '_' + hash(n || ''); }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// ---------- years ----------
const CUR_YEAR = new Date().getFullYear();
function y2(n) { n = parseInt(n, 10); return n >= 50 ? 1900 + n : 2000 + n; }
// Parse a year cell into [start,end] spans. Handles 2010-2016, 2010–16, 2012+, 2012-, 2012-up, -2005, up to 2005, 10-16, 2010, lists "2004, 2006-2008"
function yearSpans(str) {
  if (!str) return [];
  let s = String(str).toLowerCase().replace(/[–—]/g, '-').replace(/\bto\b|thru|through/g, '-');
  const spans = []; let m;
  const used = [];
  const take = (a, b, i, len) => { spans.push([a, b]); used.push([i, i + len]); };
  const isUsed = i => used.some(([a, b]) => i >= a && i < b);
  for (m of s.matchAll(/(\d{4})\s*-\s*(\d{4})/g)) take(+m[1], +m[2], m.index, m[0].length);
  for (m of s.matchAll(/(\d{4})\s*-\s*(\d{2})(?!\d)/g)) if (!isUsed(m.index)) take(+m[1], Math.floor(+m[1] / 100) * 100 + +m[2], m.index, m[0].length);
  for (m of s.matchAll(/(\d{4})\s*(\+|-\s*(?:up|present|now|newer)?(?=\s|$|[^\d\w])|and up|& up|up|or newer|newer|-\s*$)/g)) if (!isUsed(m.index)) take(+m[1], CUR_YEAR + 1, m.index, m[0].length);
  for (m of s.matchAll(/(?:^|[^\d])(?:-|up to|before|pre)\s*(\d{4})/g)) { const i = m.index + m[0].indexOf(m[1]); if (!isUsed(i)) take(1900, +m[1], i, 4); }
  for (m of s.matchAll(/(?:^|[^\d'])(\d{2})\s*-\s*(\d{2})(?![\d])/g)) { const i = m.index + m[0].indexOf(m[1]); if (!isUsed(i)) { let a = y2(m[1]), b = y2(m[2]); if (b < a) b += 100; take(a, b, i, m[0].length); } }
  for (m of s.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) if (!isUsed(m.index)) take(+m[1], +m[1], m.index, 4);
  return spans.filter(([a, b]) => a >= 1900 && a <= 2100 && b >= a);
}
function yearMatchesRange(year, str) { return yearSpans(str).some(([a, b]) => year >= a && year <= b); }

// ---------- stock ----------
function isInStock(qty) {
  if (qty === null || qty === undefined) return false;
  const s = String(qty).replace(/\u00a0/g, ' ').trim();
  if (s === '') return false;
  if (/^[-+]?\d*[.,]?\d+$/.test(s) && parseFloat(s.replace(',', '.')) === 0) return false;
  return true;
}

// ---------- search ----------
const INTERNAL = k => k === 'id' || k.startsWith('_') || k === 'Image';
function termMatcher(term) {
  term = term.toLowerCase();
  const alts = new Set([term]);
  if (MAKE_ALIASES[term]) alts.add(MAKE_ALIASES[term]);
  for (const [a, b] of Object.entries(MAKE_ALIASES)) if (b === term) alts.add(a);
  let year = null;
  if (/^\d{4}$/.test(term)) year = +term;
  else if (/^'\d{2}$/.test(term)) year = y2(term.slice(1));
  const cTerm = compact(term);
  return (item, yearField) => {
    for (const k in item) {
      if (INTERNAL(k)) continue;
      const v = item[k]; if (v === null || v === undefined || v === '') continue;
      const vs = String(v).toLowerCase();
      for (const a of alts) {
        if (a.length <= 3 && /^[a-z]+$/.test(a) && MAKE_ALIASES[a] !== undefined) { if (new RegExp('\\b' + a + '\\b').test(vs)) return true; }
        else if (vs.includes(a)) return true;
      }
      if (cTerm.length >= 3 && compact(vs).includes(cTerm)) return true;   // "rx350" finds "RX 350"
      if (year && (k === yearField || /year/i.test(k)) && yearMatchesRange(year, vs)) return true;
    }
    return false;
  };
}
function makeFilter(text, yearField) {
  const terms = (text || '').toLowerCase().trim().split(/\s+/).filter(Boolean).map(termMatcher);
  return item => terms.every(t => t(item, yearField));
}

// ---------- DB ----------
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onblocked = () => showToast('Please close other open copies of this app, then reload.', true);
    req.onsuccess = () => { db = req.result; db.onversionchange = () => { db.close(); showToast('App updated in another tab – please reload.', true); }; resolve(db); };
    req.onupgradeneeded = (e) => {
      const d = req.result, tx = req.transaction;
      if (!d.objectStoreNames.contains(INVENTORY_STORE)) d.createObjectStore(INVENTORY_STORE, { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains(FILES_STORE)) d.createObjectStore(FILES_STORE, { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains(STOCK_STORE)) d.createObjectStore(STOCK_STORE, { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains(VEHICLE_STORE)) {
        d.createObjectStore(VEHICLE_STORE, { keyPath: 'id', autoIncrement: true });
      } else if (tx.objectStore(VEHICLE_STORE).keyPath !== 'id') {
        // Old version stored vehicles without an id, so they could never be edited. Migrate them.
        const old = []; tx.objectStore(VEHICLE_STORE).openCursor().onsuccess = ev => {
          const c = ev.target.result;
          if (c) { old.push(c.value); c.continue(); return; }
          d.deleteObjectStore(VEHICLE_STORE);
          const ns = d.createObjectStore(VEHICLE_STORE, { keyPath: 'id', autoIncrement: true });
          old.forEach(v => { delete v.id; ns.add(v); });
        };
      }
    };
  });
}
function txDone(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error || new Error('Database write failed')); tx.onabort = () => rej(tx.error || new Error('Database write was cancelled (storage full?)')); }); }
function getAll(store) {
  return new Promise((res, rej) => { try { const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
}
function dbError(e, what) { console.error(e); showToast('⚠ Could not ' + what + ': ' + (e && (e.message || e.name) || e), true, 8000); }
const now = () => new Date().toISOString();

// ---------- UI helpers ----------
function escapeHtml(u) { if (u === null || u === undefined) return ''; return String(u).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
let toastTimer;
function showToast(msg, isError, ms, action) {
  const t = document.getElementById('toast');
  t.className = isError ? 'error' : ''; t.innerHTML = escapeHtml(msg);
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { t.style.display = 'none'; action.fn(); }; t.appendChild(b); }
  t.style.display = 'block'; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.style.display = 'none', ms || 3000);
}
function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function openDialog(title, bodyHtml, buttons) {
  const dlg = document.getElementById('appDialog');
  document.getElementById('dlgTitle').textContent = title;
  document.getElementById('dlgBody').innerHTML = bodyHtml;
  const foot = document.getElementById('dlgFoot'); foot.innerHTML = '';
  return new Promise(resolve => {
    buttons.forEach(b => {
      const el = document.createElement('button'); el.className = 'save-button' + (b.cls ? ' ' + b.cls : ''); el.textContent = b.label;
      el.onclick = () => { if (b.validate && !b.validate()) return; const val = b.collect ? b.collect() : b.value; dlg.close(); resolve(val); };
      foot.appendChild(el);
    });
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
  });
}
function confirmDialog(title, text, okLabel) {
  return openDialog(title, '<p>' + escapeHtml(text) + '</p>', [{ label: 'Cancel', cls: 'grey-button', value: false }, { label: okLabel || 'OK', cls: 'danger-button', value: true }]);
}
function downloadString(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function timestampForFilename() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// ---------- tabs ----------
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab + 'Tab').classList.add('active');
  document.getElementById(tab + 'Content').classList.add('active');
  if (tab === 'inventory') filterInventory(); else if (tab === 'vehicle') filterVehicles(); else if (tab === 'data') displayFileList(); else performQuickSearch();
}

// ---------- duplicates ----------
function dupCounts(type, rows) { const c = new Map(); rows.forEach(r => { const k = dedupeKey(type, r); c.set(k, (c.get(k) || 0) + 1); }); return c; }
const dupFlag = '<span class="dup-flag" title="Another row has the same key, make, model and years">DUP</span>';

// ---------- Quick Search ----------
let searchSeq = 0;
async function performQuickSearch(pickKey) {
  const out = document.getElementById('searchResults');
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { out.className = 'no-results'; out.innerHTML = 'Enter a vehicle to find compatible keys...'; return; }
  const seq = ++searchSeq;
  let inv, veh, stock;
  try { [inv, veh, stock] = await Promise.all([getAll(INVENTORY_STORE), getAll(VEHICLE_STORE), getAll(STOCK_STORE)]); } catch (e) { return dbError(e, 'search'); }
  if (seq !== searchSeq) return;
  const inStockOnly = document.getElementById('inStockOnly').checked;
  const fInv = makeFilter(q, 'Year(s)'), fVeh = makeFilter(q, 'Year_Range'), fStock = makeFilter(q, null);
  const items = inv.filter(it => (!inStockOnly || isInStock(it.Qty)) && fInv(it));
  const vItems = veh.filter(it => (!inStockOnly || isInStock(it.Qty)) && fVeh(it));
  const sItems = stock.filter(it => (!inStockOnly || isInStock(it.Qty)) && fStock(it));
  out.className = ''; let html = '';
  const keys = [...new Set(items.map(i => norm(i.Product_Name)))];
  if (!items.length) html += '<div class="no-results">No items found in inventory.</div>';
  else if (keys.length === 1 || (pickKey && keys.includes(pickKey))) {
    const k = keys.length === 1 ? keys[0] : pickKey;
    const rowsForKey = inv.filter(i => norm(i.Product_Name) === k);
    html += renderKeyDetail(rowsForKey, items.filter(i => norm(i.Product_Name) === k));
    if (keys.length > 1) html += `<button class="save-button" onclick="performQuickSearch()">← Back to all ${keys.length} keys</button>`;
  } else {
    html += `<h3 style="color:hotpink;margin:10px 0 0;">${keys.length} keys fit (${items.length} matching rows) – tap a product for details</h3>`;
    html += '<div class="table-scroll"><table><thead><tr><th>Product</th><th>Make</th><th>Model</th><th>Year</th><th>Qty</th></tr></thead><tbody>' +
      items.map(it => `<tr data-id="${it.id}"><td><a href="#" style="color:black;font-weight:bold;" onclick="performQuickSearch(${escapeHtml(JSON.stringify(norm(it.Product_Name)))});return false;">${escapeHtml(it.Product_Name)}</a></td><td>${escapeHtml(it.Make)}</td><td>${escapeHtml(it.Model)}</td><td>${escapeHtml(it['Year(s)'])}</td><td class="${isInStock(it.Qty) ? 'stock-indicator' : 'no-stock'}">${escapeHtml(it.Qty)}</td></tr>`).join('') +
      '</tbody></table></div>';
  }
  if (vItems.length) {
    html += `<div class="compatible-list" style="margin-top:15px;"><h4>Vehicle Reference (${vItems.length})</h4><div class="table-scroll"><table><thead><tr><th>Make</th><th>Model</th><th>Years</th><th>Transponder / Key</th><th>Qty</th></tr></thead><tbody>` +
      vItems.slice(0, 200).map(v => `<tr><td>${escapeHtml(v.Make)}</td><td>${escapeHtml(v.Model)}</td><td>${escapeHtml(v.Year_Range)}</td><td>${escapeHtml(v.Product_Name)}${v.STRATTEC ? '<br><small>Strattec: ' + escapeHtml(v.STRATTEC) + '</small>' : ''}${v.Notes ? '<br><small>' + escapeHtml(v.Notes) + '</small>' : ''}</td><td>${escapeHtml(v.Qty)}</td></tr>`).join('') +
      '</tbody></table></div>' + (vItems.length > 200 ? '<div>Showing first 200 – type more words to narrow down.</div>' : '') + '</div>';
  }
  if (sItems.length) {
    html += `<div class="compatible-list" style="margin-top:15px;"><h4>Stock List (${sItems.length})</h4><div class="table-scroll"><table><thead><tr><th>Part #</th><th>Name</th><th>Type</th><th>Qty</th></tr></thead><tbody>` +
      sItems.slice(0, 100).map(s => `<tr><td>${escapeHtml(s.Part_No)}</td><td>${escapeHtml(s.Name)}</td><td>${escapeHtml(s.Type)}</td><td class="${isInStock(s.Qty) ? 'stock-indicator' : 'no-stock'}">${escapeHtml(s.Qty)}</td></tr>`).join('') + '</tbody></table></div></div>';
  }
  out.innerHTML = html;
}
function keyQtySummary(rows) {
  const vals = [...new Set(rows.map(r => String(r.Qty ?? '').trim()))];
  if (vals.length === 1) return { text: vals[0] || '0', differs: false, inStock: isInStock(vals[0]) };
  return { text: vals.map(v => v || '(blank)').join(' / '), differs: true, inStock: rows.some(r => isInStock(r.Qty)) };
}
function renderKeyDetail(allRows, matched) {
  const first = matched[0] || allRows[0];
  const q = keyQtySummary(allRows);
  const types = [...new Set(allRows.map(r => r.Type).filter(Boolean))].join(', ');
  const notes = [...new Set(allRows.map(r => r.Notes).filter(Boolean))];
  let html = `<div class="compatible-list"><h4>${escapeHtml(first.Product_Name || 'Unknown Key')}</h4>`;
  html += `<div><strong>Type:</strong> ${escapeHtml(types || '—')} <strong style="margin-left:20px;">Qty:</strong> <span class="${q.inStock ? 'stock-indicator' : 'no-stock'}">${escapeHtml(q.text)}</span>${q.differs ? ' <span class="dup-flag" title="Rows for this key list different quantities">rows differ</span>' : ''}</div>`;
  if (notes.length) html += `<div class="notes-display"><strong>Notes:</strong> ${notes.map(escapeHtml).join('<br>')}</div>`;
  html += `<h4 style="margin-top:10px;">Compatible Vehicles (${allRows.length})</h4><table style="width:100%;"><thead><tr><th>Make</th><th>Model</th><th>Year(s)</th></tr></thead><tbody>`;
  const mIds = new Set(matched.map(m => m.id));
  allRows.slice().sort((a, b) => (a.Make + a.Model).localeCompare(b.Make + b.Model)).forEach(v => {
    html += `<tr${mIds.has(v.id) ? ' style="background:#fff0f6;font-weight:bold;"' : ''}><td>${escapeHtml(v.Make)}</td><td>${escapeHtml(v.Model)}</td><td>${escapeHtml(v['Year(s)'])}</td></tr>`;
  });
  return html + '</tbody></table></div>';
}

// ---------- Inventory ----------
window.inventoryExpanded = new Set();
async function filterInventory() {
  const text = document.getElementById('inventorySearchInput').value;
  let data; try { data = await getAll(INVENTORY_STORE); } catch (e) { return dbError(e, 'load inventory'); }
  const container = document.getElementById('inventoryTableContainer');
  const total = data.length;
  const inStockOnly = document.getElementById('inventoryInStockOnly').checked;
  const f = makeFilter(text, 'Year(s)');
  const dups = dupCounts('inventory', data);
  data = data.filter(it => (!inStockOnly || isInStock(it.Qty)) && f(it));
  if (!data.length) { container.innerHTML = `<div class="no-results">${total ? 'No inventory rows match.' : 'No inventory data. Import a CSV file or tap “+ Add New Row”.'}</div>`; return; }
  const view = document.querySelector('input[name="inventoryView"]:checked').value;
  if (view === 'grouped') displayGroupedInventory(data, container); else displayVehicleInventory(data, container, dups);
}
const displayInventory = filterInventory;
function sortRows(rows, col, dir) {
  return rows.slice().sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? '';
    const an = parseFloat(av), bn = parseFloat(bv);
    let c = (!isNaN(an) && !isNaN(bn) && /^\s*-?[\d.]+\s*$/.test(av) && /^\s*-?[\d.]+\s*$/.test(bv)) ? an - bn : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return dir === 'asc' ? c : -c;
  });
}
const sortState = { inventory: { col: null, dir: 'asc' }, vehicle: { col: null, dir: 'asc' }, grouped: { col: null, dir: 'asc' } };
function thSort(ctx, col, text) {
  const s = sortState[ctx]; const cls = s.col === col ? (s.dir === 'asc' ? 'sorted-asc' : 'sorted-desc') : 'sortable';
  return `<th class="${cls}" onclick="sortTable('${ctx}','${col}')">${escapeHtml(text)}</th>`;
}
function sortTable(ctx, col) { const s = sortState[ctx]; if (s.col === col) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.col = col; s.dir = 'asc'; } ctx === 'vehicle' ? filterVehicles() : filterInventory(); }
function sortInventoryTable(col) { sortTable('inventory', col); }
function editAttr(store, ids, field) { return `contenteditable="true" data-store="${store}" data-ids="${ids}" data-field="${escapeHtml(field)}"`; }

function displayGroupedInventory(data, container) {
  const grouped = new Map();
  data.forEach(item => {
    const k = norm(item.Product_Name) || '';
    if (!grouped.has(k)) grouped.set(k, { productDisplay: item.Product_Name || '(no product name)', normalized: k, rows: [] });
    grouped.get(k).rows.push(item);
  });
  let arr = [...grouped.values()].map(g => {
    const q = keyQtySummary(g.rows);
    return Object.assign(g, { qty: q, Product_Name: g.productDisplay, Vehicles: g.rows.length, Qty: q.text, notes: [...new Set(g.rows.map(r => r.Notes).filter(Boolean))].join(' | ') });
  });
  const s = sortState.grouped; arr = s.col ? sortRows(arr, s.col, s.dir) : arr.sort((a, b) => a.productDisplay.localeCompare(b.productDisplay));
  let html = '<table id="inventoryTable"><thead><tr><th style="width:40px;"><input type="checkbox" id="selectAllInventory" onchange="toggleSelectAll(\'inventory\')"></th>' +
    thSortG('Product_Name', 'Product Name') + thSortG('Vehicles', 'Vehicles') + thSortG('Qty', 'Qty') + '<th>Notes</th></tr></thead><tbody>';
  arr.forEach(g => {
    const ids = g.rows.map(r => r.id).join(',');
    const safeKey = safeKeyFromNormalized(g.normalized);
    const expanded = window.inventoryExpanded.has(safeKey);
    html += `<tr data-group-key="${safeKey}"><td><input type="checkbox" class="row-checkbox" data-ids="${ids}"></td>`;
    html += `<td ${editAttr('inventory', ids, 'Product_Name')}>${escapeHtml(g.productDisplay)}</td>`;
    html += `<td style="text-align:center;"><button type="button" class="expand-btn" data-count="${g.rows.length}" onclick="toggleVehicleList('${safeKey}')" aria-expanded="${expanded}" title="${g.rows.length} vehicles"><span class="arrow">${expanded ? '▾' : '▸'}</span><span class="count">${g.rows.length}</span></button></td>`;
    html += `<td ${editAttr('inventory', ids, 'Qty')} class="${g.qty.inStock ? 'stock-indicator' : 'no-stock'}" title="Editing here sets the qty on all ${g.rows.length} rows of this key">${escapeHtml(g.qty.text)}</td>`;
    html += g.notes.includes(' | ') ? `<td title="Rows have different notes – edit them in By Vehicle view">${escapeHtml(g.notes)}</td>` : `<td ${editAttr('inventory', ids, 'Notes')}>${escapeHtml(g.notes)}</td>`;
    html += '</tr>';
    html += `<tr id="vehicleList-${safeKey}" style="display:${expanded ? 'table-row' : 'none'};"><td colspan="5"><div style="background:#f9f9f9;padding:10px;border-left:3px solid hotpink;"><strong>Compatible with:</strong>`;
    html += '<table style="width:100%;margin-top:10px;"><tr><th>Make</th><th>Model</th><th>Year</th></tr>';
    g.rows.forEach(v => {
      html += `<tr><td ${editAttr('inventory', v.id, 'Make')}>${escapeHtml(v.Make)}</td><td ${editAttr('inventory', v.id, 'Model')}>${escapeHtml(v.Model)}</td><td ${editAttr('inventory', v.id, 'Year(s)')}>${escapeHtml(v['Year(s)'])}</td></tr>`;
    });
    html += `</table><button type="button" data-ids="${ids}" onclick="addVehicleToGroup('${safeKey}', this.dataset.ids)" style="margin-top:10px;padding:5px 10px;background:hotpink;color:white;border:none;border-radius:4px;cursor:pointer;">+ Add Vehicle</button></div></td></tr>`;
  });
  html += `</tbody></table><div style="margin-top:10px;color:#666;">Showing ${arr.length} unique keys (${data.length} vehicles total)</div>`;
  container.innerHTML = html;
}
function thSortG(col, text) { const s = sortState.grouped; const cls = s.col === col ? (s.dir === 'asc' ? 'sorted-asc' : 'sorted-desc') : 'sortable'; return `<th class="${cls}" onclick="sortGrouped('${col}')">${text}</th>`; }
function sortGrouped(col) { const s = sortState.grouped; if (s.col === col) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.col = col; s.dir = 'asc'; } filterInventory(); }

function displayVehicleInventory(data, container, dups) {
  const headers = TYPES.inventory.fields; const s = sortState.inventory;
  if (s.col) data = sortRows(data, s.col, s.dir);
  let html = '<table id="inventoryTable"><thead><tr><th style="width:40px;"><input type="checkbox" id="selectAllInventory" onchange="toggleSelectAll(\'inventory\')"></th>';
  headers.forEach(h => html += thSort('inventory', h, label(h)));
  html += thSort('inventory', '_updated', 'Updated') + '</tr></thead><tbody>';
  data.forEach(r => {
    html += `<tr data-row-id="${r.id}"><td><input type="checkbox" class="row-checkbox" data-ids="${r.id}">${dups.get(dedupeKey('inventory', r)) > 1 ? dupFlag : ''}</td>`;
    headers.forEach(h => html += `<td ${editAttr('inventory', r.id, h)}${h === 'Qty' ? ` class="${isInStock(r.Qty) ? 'stock-indicator' : 'no-stock'}"` : ''}>${escapeHtml(r[h])}</td>`);
    html += `<td class="updated-col">${fmtDate(r._updated || r._created)}</td></tr>`;
  });
  html += `</tbody></table><div style="margin-top:10px;color:#666;">Showing ${data.length} vehicle entries</div>`;
  container.innerHTML = html;
}
function toggleVehicleList(key) {
  const row = document.getElementById('vehicleList-' + key);
  const btn = document.querySelector(`tr[data-group-key="${key}"] .expand-btn`);
  const show = row.style.display === 'none';
  row.style.display = show ? 'table-row' : 'none';
  if (btn) { btn.querySelector('.arrow').textContent = show ? '▾' : '▸'; btn.setAttribute('aria-expanded', show); }
  show ? window.inventoryExpanded.add(key) : window.inventoryExpanded.delete(key);
}
function toggleSelectAll(ctx) {
  const tableId = ctx === 'vehicle' ? 'vehicleTable' : 'inventoryTable';
  const checked = document.getElementById(ctx === 'vehicle' ? 'selectAllVehicle' : 'selectAllInventory').checked;
  document.querySelectorAll('#' + tableId + ' .row-checkbox').forEach(cb => cb.checked = checked);
}

// ---------- Vehicle Reference ----------
async function filterVehicles() {
  const text = document.getElementById('vehicleSearchInput').value;
  let data; try { data = await getAll(VEHICLE_STORE); } catch (e) { return dbError(e, 'load vehicles'); }
  const container = document.getElementById('vehicleTableContainer'); const total = data.length;
  const dups = dupCounts('vehicle', data);
  const f = makeFilter(text, 'Year_Range'); data = data.filter(f);
  if (!data.length) { container.innerHTML = `<div class="no-results">${total ? 'No vehicle rows match.' : 'No vehicle data. Import a CSV file or tap “+ Add New Row”.'}</div>`; return; }
  const headers = TYPES.vehicle.fields; const s = sortState.vehicle;
  if (s.col) data = sortRows(data, s.col, s.dir);
  const shown = data.slice(0, 1000);
  let html = '<table id="vehicleTable"><thead><tr><th style="width:40px;"><input type="checkbox" id="selectAllVehicle" onchange="toggleSelectAll(\'vehicle\')"></th>';
  headers.forEach(h => html += thSort('vehicle', h, label(h)));
  html += thSort('vehicle', '_updated', 'Updated') + '</tr></thead><tbody>';
  shown.forEach(r => {
    html += `<tr data-row-id="${r.id}"><td><input type="checkbox" class="row-checkbox" data-ids="${r.id}">${dups.get(dedupeKey('vehicle', r)) > 1 ? dupFlag : ''}</td>`;
    headers.forEach(h => html += `<td ${editAttr('vehicle', r.id, h)}>${escapeHtml(r[h])}</td>`);
    html += `<td class="updated-col">${fmtDate(r._updated || r._created)}</td></tr>`;
  });
  html += `</tbody></table><div style="margin-top:10px;color:#666;">Showing ${shown.length} of ${data.length} vehicle entries${data.length > shown.length ? ' – type in the search box to narrow down' : ''}</div>`;
  container.innerHTML = html;
}
const displayVehicles = filterVehicles;

// ---------- Editing: autosave each cell ----------
const pendingSaves = new Set();
const storeOf = s => s === 'vehicle' ? VEHICLE_STORE : s === 'stock' ? STOCK_STORE : INVENTORY_STORE;
const statusEl = s => document.getElementById(s === 'vehicle' ? 'saveVehicleStatus' : 'saveStatus');
function setStatus(s, text, isErr) { const el = statusEl(s); if (!el) return; el.textContent = text; el.className = isErr ? 'error' : ''; }
document.addEventListener('focusin', e => { const td = e.target.closest && e.target.closest('td[contenteditable][data-ids]'); if (td) td.dataset.orig = td.innerText.trim(); });
document.addEventListener('keydown', e => { const td = e.target.closest && e.target.closest('td[contenteditable][data-ids]'); if (td && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); td.blur(); } if (td && e.key === 'Escape') { td.innerText = td.dataset.orig || ''; td.blur(); } });
document.addEventListener('focusout', e => {
  const td = e.target.closest && e.target.closest('td[contenteditable][data-ids]'); if (!td) return;
  const val = td.innerText.replace(/\u00a0/g, ' ').trim();
  if (val === (td.dataset.orig ?? '')) return;
  const p = saveCell(td, val); pendingSaves.add(p); p.finally(() => pendingSaves.delete(p));
});
async function saveCell(td, val) {
  const s = td.dataset.store, field = td.dataset.field, ids = td.dataset.ids.split(',').filter(Boolean).map(Number);
  td.classList.add('saving'); td.classList.remove('save-error'); setStatus(s, 'Saving…');
  try {
    const tx = db.transaction(storeOf(s), 'readwrite'); const st = tx.objectStore(storeOf(s)); const t = now();
    ids.forEach(id => { const r = st.get(id); r.onsuccess = () => { const rec = r.result; if (!rec) return; rec[field] = val; rec._updated = t; st.put(rec); }; });
    await txDone(tx);
    td.dataset.orig = val; td.classList.remove('saving');
    if (field === 'Qty') td.className = isInStock(val) ? 'stock-indicator' : 'no-stock';
    setStatus(s, '✓ Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
    scheduleAutoBackup();
  } catch (e) {
    td.classList.remove('saving'); td.classList.add('save-error');
    setStatus(s, '⚠ NOT saved – ' + (e.message || e), true); dbError(e, 'save your change');
    throw e;
  }
}
async function flushSaves(s) {
  if (document.activeElement && document.activeElement.matches('td[contenteditable]')) document.activeElement.blur();
  await new Promise(r => setTimeout(r, 0));
  const list = [...pendingSaves];
  try { await Promise.all(list); setStatus(s, list.length ? '✓ All changes saved' : '✓ Everything is saved (changes save automatically)'); }
  catch (e) { setStatus(s, '⚠ Some changes were NOT saved', true); }
}
function saveInventory() { return flushSaves('inventory'); }
function saveVehicles() { return flushSaves('vehicle'); }

// ---------- Add / delete rows ----------
function vehicleForm(title, fields, values) {
  const body = fields.map(f => `<label class="field">${escapeHtml(label(f))}<input type="text" id="fld_${f.replace(/\W/g, '')}" value="${escapeHtml((values || {})[f] || '')}"></label>`).join('') + '<div id="formErr" style="color:#c00;margin-top:8px;"></div>';
  const get = () => Object.fromEntries(fields.map(f => [f, document.getElementById('fld_' + f.replace(/\W/g, '')).value.replace(/\s+/g, ' ').trim()]));
  const p = openDialog(title, body, [{ label: 'Cancel', cls: 'grey-button', value: null }, { label: 'Save', collect: get, validate: () => { const v = get(); const miss = fields.filter(f => ['Make', 'Model', 'Product_Name', 'Name'].includes(f) && !v[f]); if (miss.length) { document.getElementById('formErr').textContent = 'Please fill in: ' + miss.map(label).join(', '); return false; } return true; } }]);
  setTimeout(() => { const first = document.querySelector('#dlgBody input'); if (first) first.focus(); }, 50);
  return p;
}
async function addRecord(type, rec) {
  const t = now(); Object.assign(rec, { _created: t, _updated: t, _fileId: null });
  const tx = db.transaction(TYPES[type].store, 'readwrite'); tx.objectStore(TYPES[type].store).add(rec); await txDone(tx); scheduleAutoBackup();
}
async function addNewInventoryRow() {
  const v = await vehicleForm('Add inventory row', TYPES.inventory.fields); if (!v) return;
  try { await addRecord('inventory', v); setStatus('inventory', '✓ Row added & saved'); filterInventory(); } catch (e) { dbError(e, 'add the row'); }
}
async function addNewVehicleRow() {
  const v = await vehicleForm('Add vehicle reference row', TYPES.vehicle.fields); if (!v) return;
  try { await addRecord('vehicle', v); setStatus('vehicle', '✓ Row added & saved'); filterVehicles(); } catch (e) { dbError(e, 'add the row'); }
}
async function addVehicleToGroup(safeKey, idsStr) {
  const id = Number(idsStr.split(',')[0]);
  const all = await getAll(INVENTORY_STORE); const tmpl = all.find(r => r.id === id); if (!tmpl) return;
  const v = await vehicleForm('Add vehicle to: ' + tmpl.Product_Name, ['Make', 'Model', 'Year(s)']); if (!v) return;
  try {
    await addRecord('inventory', { Make: v.Make, Model: v.Model, 'Year(s)': v['Year(s)'], Product_Name: tmpl.Product_Name, Type: tmpl.Type || '', Qty: tmpl.Qty ?? '0', Notes: '' });
    window.inventoryExpanded.add(safeKey); setStatus('inventory', '✓ Vehicle added & saved'); filterInventory();
  } catch (e) { dbError(e, 'add the vehicle'); }
}
async function deleteSelectedRows(ctx) {
  const tableId = ctx === 'vehicle' ? 'vehicleTable' : 'inventoryTable';
  const ids = [...new Set([...document.querySelectorAll('#' + tableId + ' .row-checkbox:checked')].flatMap(cb => cb.dataset.ids.split(',')).filter(Boolean).map(Number))];
  if (!ids.length) { showToast('Tick the box next to the rows you want to delete first.'); return; }
  if (!await confirmDialog('Delete rows?', `Delete ${ids.length} row(s)? You can undo right after.`, 'Delete')) return;
  const store = ctx === 'vehicle' ? VEHICLE_STORE : INVENTORY_STORE;
  try {
    const all = await getAll(store); const removed = all.filter(r => ids.includes(r.id));
    const tx = db.transaction(store, 'readwrite'); ids.forEach(id => tx.objectStore(store).delete(id)); await txDone(tx);
    scheduleAutoBackup(); ctx === 'vehicle' ? filterVehicles() : filterInventory();
    showToast(`Deleted ${removed.length} row(s).`, false, 10000, { label: 'Undo', fn: async () => {
      try { const t2 = db.transaction(store, 'readwrite'); removed.forEach(r => t2.objectStore(store).put(r)); await txDone(t2); showToast('Restored.'); scheduleAutoBackup(); ctx === 'vehicle' ? filterVehicles() : filterInventory(); } catch (e) { dbError(e, 'undo'); }
    } });
  } catch (e) { dbError(e, 'delete rows'); }
}

// ---------- Import ----------
function detectType(headers) {
  const n = headers.map(normHeader);
  const has = a => a.some(x => n.includes(x));
  if (!has(['make']) && has(['mytotalqty', 'price', 'facilityqty']) && has(['name', 'description'])) return 'stock';
  if (has(['transponderkey', 'strattec', 'instock'])) return 'vehicle';
  return null;
}
function mapHeaders(type, headers) {
  const aliases = HEADER_ALIASES[type]; const map = {}; const used = new Set();
  // exact-priority: walk each field's alias list in order
  Object.keys(aliases).forEach(field => {
    for (const a of aliases[field]) { const idx = headers.findIndex((h, i) => !used.has(i) && normHeader(h) === a); if (idx >= 0) { map[field] = headers[idx]; used.add(idx); break; } }
  });
  const unused = headers.filter((h, i) => !used.has(i) && h);
  return { map, unused };
}
function analyseImport(type, parsed, existing) {
  const { map, unused } = mapHeaders(type, parsed.headers);
  const T = TYPES[type]; const flags = { cells: 0, html: 0, mojibake: 0 };
  const rows = [], bad = [], dupInFile = [], dupExisting = [], oddYears = [], truncated = [], nonNumQty = [];
  const exKeys = new Set(existing.map(r => dedupeKey(type, r))); const seen = new Set();
  parsed.data.forEach((raw, i) => {
    const rec = {};
    T.fields.forEach(f => { rec[f] = map[f] ? cleanCell(raw[map[f]], flags, f === 'Notes') : ''; });
    if (type === 'stock' && /^\s*\S+\(\d+\)/.test(rec.Facility)) rec.Facility = rec.Facility.replace(/_+$/, '').replace(/__/g, ', ');
    const extra = {}; unused.forEach(h => { if (raw[h] !== undefined && String(raw[h]).trim() !== '') extra[h] = raw[h]; });
    if (Object.keys(extra).length) rec._extra = extra;
    const line = i + 2;
    const missing = T.required.filter(f => !rec[f]);
    if (missing.length) { bad.push({ line, missing, rec }); return; }
    if (T.yearField && rec[T.yearField] && !yearSpans(rec[T.yearField]).length) oddYears.push({ line, v: rec[T.yearField] });
    else if (T.yearField && rec[T.yearField] && /\d{4}\s*-\s*$|\(/.test(rec[T.yearField])) oddYears.push({ line, v: rec[T.yearField], note: true });
    if (rec.Model && /[-\/]$/.test(rec.Model)) truncated.push({ line, v: rec.Make + ' ' + rec.Model });
    if (rec.Qty && !/^\d+$/.test(rec.Qty)) nonNumQty.push({ line, v: rec.Qty });
    const k = dedupeKey(type, rec);
    rec._line = line; rec._dupKey = k;
    if (seen.has(k)) { dupInFile.push({ line, rec }); rec._dupInFile = true; }
    else if (exKeys.has(k)) { dupExisting.push({ line, rec }); rec._dupExisting = true; }
    seen.add(k); rows.push(rec);
  });
  return { type, map, unused, flags, rows, bad, dupInFile, dupExisting, oddYears, truncated, nonNumQty, total: parsed.data.length };
}
function examples(list, fmt, n = 5) { return list.slice(0, n).map(fmt).map(escapeHtml).join('<br>') + (list.length > n ? `<br>…and ${list.length - n} more` : ''); }
async function startImport(event, chosenType) {
  const input = event.target; const file = input.files[0]; input.value = ''; if (!file) return;
  let text;
  try {
    const buf = await file.arrayBuffer();
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); showToast('File was not UTF-8; read it as Windows text.', false, 5000); }
  } catch (e) { return dbError(e, 'read the file'); }
  const parsed = CSV.parse(text);
  if (!parsed.headers.length || !parsed.data.length) { showToast('That file has no data rows.', true); return; }
  let type = chosenType; const detected = detectType(parsed.headers);
  if (detected && detected !== type) {
    const sw = await openDialog('Check file type', `<p>“${escapeHtml(file.name)}” looks like a <strong>${TYPES[detected].label}</strong> file (columns: ${escapeHtml(parsed.headers.join(', '))}), but you picked <strong>${TYPES[type].label}</strong>.</p>`,
      [{ label: 'Cancel', cls: 'grey-button', value: null }, { label: 'Import as ' + TYPES[type].label, cls: 'grey-button', value: type }, { label: 'Import as ' + TYPES[detected].label, value: detected }]);
    if (!sw) return; type = sw;
  }
  let existing; try { existing = await getAll(TYPES[type].store); } catch (e) { return dbError(e, 'read existing data'); }
  const a = analyseImport(type, parsed, existing);
  const T = TYPES[type];
  let h = `<div class="info-box"><strong>${escapeHtml(file.name)}</strong> → ${T.label}<br>Rows read: <strong>${a.total}</strong> · good rows: <strong>${a.rows.length}</strong> · already in app: ${existing.length}</div>`;
  h += '<strong>Columns recognised:</strong><br>' + T.fields.map(f => a.map[f] ? `✓ ${escapeHtml(label(f))} ← “${escapeHtml(a.map[f])}”` : `<span style="color:#999">– ${escapeHtml(label(f))} (not in file)</span>`).join('<br>');
  const missingReq = T.required.filter(f => !a.map[f]);
  if (missingReq.length) h += `<div class="warn-box">⚠ Required column(s) not found: <strong>${missingReq.map(label).join(', ')}</strong>. Every row will be rejected. Is this the right import button?</div>`;
  if (a.unused.length) h += `<div class="warn-box">⚠ Columns not recognised (kept with each row but not shown or searched): ${escapeHtml(a.unused.join(', '))}</div>`;
  if (a.bad.length) h += `<div class="warn-box">⚠ ${a.bad.length} row(s) missing ${T.required.map(label).join('/')} – will be skipped unless you tick the box below:<br>${examples(a.bad, b => 'line ' + b.line + ': missing ' + b.missing.map(label).join(', '))}</div>`;
  if (a.dupInFile.length) h += `<div class="warn-box">⚠ ${a.dupInFile.length} duplicate row(s) inside this file:<br>${examples(a.dupInFile, d => 'line ' + d.line + ': ' + [d.rec.Make, d.rec.Model, d.rec[T.yearField], d.rec.Product_Name || d.rec.Name].filter(Boolean).join(' · ').slice(0, 90))}${a.dupInFile.some(d => /[-\/]$/.test(d.rec.Model || '')) ? '<br><strong>Note:</strong> some of these have a cut-off model name (like “F-”), so they may really be different models (F-150, F-250…). Choose “Add all” to keep them.' : ''}</div>`;
  if (a.dupExisting.length) h += `<div class="warn-box">⚠ ${a.dupExisting.length} row(s) are already in the app (same key, make, model, years).</div>`;
  if (a.truncated.length) h += `<div class="warn-box">⚠ ${a.truncated.length} model name(s) look cut off (end in “-”), e.g. “F-” – please check the original:<br>${examples(a.truncated, t => 'line ' + t.line + ': ' + t.v)}</div>`;
  if (a.oddYears.length) h += `<div class="warn-box">⚠ ${a.oddYears.length} unusual year value(s) (imported as-is):<br>${examples(a.oddYears, o => 'line ' + o.line + ': “' + o.v + '”' + (o.note ? '' : ' (no year found – will not match year searches)'))}</div>`;
  if (a.nonNumQty.length) h += `<div class="info-box">${a.nonNumQty.length} quantity value(s) are not plain numbers (e.g. ${escapeHtml(a.nonNumQty.slice(0, 3).map(x => '“' + x.v + '”').join(', '))}). Anything not empty and not 0 counts as in stock.</div>`;
  if (a.flags.cells) h += `<div class="info-box">Tidied ${a.flags.cells} cell(s): extra/odd spaces removed${a.flags.html ? `, ${a.flags.html} HTML tag cell(s) like &lt;br&gt; removed` : ''}${a.flags.mojibake ? `, ${a.flags.mojibake} garbled character cell(s) fixed (e.g. “â‡†” → “⇆”)` : ''}. No values were invented.</div>`;
  const hasExisting = existing.length > 0;
  h += `<div style="margin-top:12px;"><strong>How to import:</strong><br>
    <label><input type="radio" name="impMode" value="merge" ${hasExisting ? 'checked' : ''}> <strong>Merge</strong> – add new rows, skip duplicates</label><br>
    <label><input type="radio" name="impMode" value="replace" ${hasExisting ? '' : 'checked'}> <strong>Replace</strong> – delete all current ${T.label} data first${hasExisting ? ` (${existing.length} rows)` : ''}</label><br>
    <label><input type="radio" name="impMode" value="add"> <strong>Add all</strong> – add every row, even duplicates</label><br>
    ${a.bad.length ? `<label><input type="checkbox" id="impBad"> Also import the ${a.bad.length} incomplete row(s)</label>` : ''}</div>`;
  const choice = await openDialog('Import preview', h, [{ label: 'Cancel', cls: 'grey-button', value: null },
    { label: 'Import', collect: () => ({ mode: document.querySelector('input[name=impMode]:checked').value, bad: !!(document.getElementById('impBad') || {}).checked }) }]);
  if (!choice) { showToast('Import cancelled – nothing changed.'); return; }
  try {
    const res = await commitImport(type, file.name, a, choice);
    showToast(`✓ Imported ${res.added} row(s) into ${T.label}` + (res.skipped ? `, skipped ${res.skipped}` : '') + '.', false, 6000);
    refreshAll();
  } catch (e) { dbError(e, 'import (nothing was changed)'); }
}
async function commitImport(type, filename, a, choice) {
  const T = TYPES[type]; const t = now(); const fileId = Date.now();
  let rows = a.rows.slice(); if (choice.bad) rows = rows.concat(a.bad.map(b => b.rec));
  let skipped = a.bad.length - (choice.bad ? a.bad.length : 0);
  if (choice.mode === 'merge') { const before = rows.length; rows = rows.filter(r => !r._dupInFile && !r._dupExisting); skipped += before - rows.length; }
  if (choice.mode === 'replace') { const before = rows.length; rows = rows.filter(r => !r._dupInFile); skipped += before - rows.length; }
  const tx = db.transaction([T.store, FILES_STORE], 'readwrite');
  const st = tx.objectStore(T.store), fs = tx.objectStore(FILES_STORE);
  if (choice.mode === 'replace') {
    st.clear();
    fs.getAll().onsuccess = ev => ev.target.result.filter(f => f.dataType === type || f.type === T.label).forEach(f => fs.delete(f.id));
  }
  rows.forEach(r => { const rec = {}; T.fields.forEach(f => rec[f] = r[f] ?? ''); if (r._extra) rec._extra = r._extra; Object.assign(rec, { _fileId: fileId, _created: t, _updated: t }); st.add(rec); });
  fs.add({ filename, type: T.label, dataType: type, importDate: t, recordCount: rows.length, fileId, mode: choice.mode, skipped, rowsRead: a.total });
  await txDone(tx); scheduleAutoBackup();
  return { added: rows.length, skipped };
}

// ---------- Files list ----------
async function displayFileList() {
  let files, inv, veh, stock;
  try { [files, inv, veh, stock] = await Promise.all([getAll(FILES_STORE), getAll(INVENTORY_STORE), getAll(VEHICLE_STORE), getAll(STOCK_STORE)]); } catch (e) { return dbError(e, 'load file list'); }
  const box = document.getElementById('fileListBox');
  const countBy = rows => rows.reduce((m, r) => (m[r._fileId] = (m[r._fileId] || 0) + 1, m), {});
  const live = Object.assign({}, countBy(inv), countBy(veh), countBy(stock));
  box.innerHTML = files.length ? files.slice().reverse().map(f => `<div class="file-item"><label><input type="checkbox" class="file-checkbox" data-file-id="${f.id}" data-internal-id="${f.fileId}"><div class="file-details"><div class="file-name">${escapeHtml(f.filename)}</div><div class="file-meta">Type: ${escapeHtml(f.type)} | ${f.recordCount} imported${f.skipped ? `, ${f.skipped} skipped` : ''} | ${live[f.fileId] || 0} still in app | ${f.mode ? escapeHtml(f.mode) + ' | ' : ''}Imported: ${fmtDate(f.importDate)}</div></div></label></div>`).join('')
    : '<div style="color:#999;text-align:center;padding:50px;">No files loaded. Import a CSV to get started.</div>';
  const manual = n => n.filter(r => !r._fileId).length;
  const dupN = (type, rows) => [...dupCounts(type, rows).values()].reduce((s, c) => s + (c > 1 ? c - 1 : 0), 0);
  const last = rows => rows.reduce((m, r) => (r._updated || '') > m ? r._updated : m, '');
  document.getElementById('dataSummary').innerHTML = `<strong>What's on this device</strong><br>
    Inventory: ${inv.length} rows (${manual(inv)} added by hand, ${dupN('inventory', inv)} duplicates, last change ${fmtDate(last(inv)) || '—'})<br>
    Vehicle Reference: ${veh.length} rows (${manual(veh)} added by hand, ${dupN('vehicle', veh)} duplicates, last change ${fmtDate(last(veh)) || '—'})<br>
    Stock List: ${stock.length} items <br>
    <small>Stock List = supplier stock export (e.g. American Key Supply “My Total Qty”). It has no make/model/year, so it shows in Quick Search when your words match a part name or number.</small><br>
    <button class="save-button" onclick="document.getElementById('stockFileInput').click()">Import Stock List CSV</button>
    <input type="file" id="stockFileInput" accept=".csv,text/csv" style="display:none;" onchange="startImport(event, 'stock')" />
    <button class="save-button" onclick="exportStock()" style="margin-left:10px;">Export Stock List CSV</button>`;
}
async function deleteSelectedFiles() {
  const cbs = [...document.querySelectorAll('.file-checkbox:checked')];
  if (!cbs.length) { showToast('Tick the files you want to delete first.'); return; }
  if (!await confirmDialog('Delete imports?', `Delete ${cbs.length} import(s) and every row that came from them? Rows you edited that came from these files are deleted too. Tip: download a backup first.`, 'Delete')) return;
  const fileIds = cbs.map(cb => +cb.dataset.fileId), internal = cbs.map(cb => +cb.dataset.internalId);
  try {
    const tx = db.transaction([INVENTORY_STORE, VEHICLE_STORE, STOCK_STORE, FILES_STORE], 'readwrite');
    fileIds.forEach(id => tx.objectStore(FILES_STORE).delete(id));
    [INVENTORY_STORE, VEHICLE_STORE, STOCK_STORE].forEach(s => { tx.objectStore(s).openCursor().onsuccess = ev => { const c = ev.target.result; if (c) { if (internal.includes(c.value._fileId)) c.delete(); c.continue(); } }; });
    await txDone(tx); scheduleAutoBackup(); showToast('✓ Selected imports deleted.'); refreshAll();
  } catch (e) { dbError(e, 'delete imports'); }
}

// ---------- Export CSV ----------
function exportRows(type, rows, name) {
  const fields = TYPES[type].fields.concat(['Last_Updated']);
  const out = rows.map(r => Object.assign({}, r, { Last_Updated: r._updated || '' }));
  downloadString(CSV.unparse(out, fields), `${name}-${timestampForFilename()}.csv`, 'text/csv');
}
async function exportInventory() {
  const text = document.getElementById('inventorySearchInput').value; const inStock = document.getElementById('inventoryInStockOnly').checked;
  const f = makeFilter(text, 'Year(s)'); const rows = (await getAll(INVENTORY_STORE)).filter(r => (!inStock || isInStock(r.Qty)) && f(r));
  if (!rows.length) { showToast('No rows to export with current filter.'); return; }
  exportRows('inventory', rows, 'transponder-inventory');
}
async function exportVehicles() {
  const f = makeFilter(document.getElementById('vehicleSearchInput').value, 'Year_Range'); const rows = (await getAll(VEHICLE_STORE)).filter(f);
  if (!rows.length) { showToast('No vehicle rows to export with current filter.'); return; }
  exportRows('vehicle', rows, 'transponder-vehicles');
}
async function exportStock() { const rows = await getAll(STOCK_STORE); if (!rows.length) { showToast('Stock list is empty.'); return; } exportRows('stock', rows, 'transponder-stock-list'); }

// ---------- Backup / restore ----------
async function buildBackup() {
  const [inventory, vehicles, stock, files] = await Promise.all([getAll(INVENTORY_STORE), getAll(VEHICLE_STORE), getAll(STOCK_STORE), getAll(FILES_STORE)]);
  return { app: 'pinky-transponder-db', backupVersion: 1, created: now(), counts: { inventory: inventory.length, vehicles: vehicles.length, stock: stock.length, files: files.length }, stores: { inventory, vehicles, stock, files } };
}
async function downloadBackup() {
  try { const b = await buildBackup(); downloadString(JSON.stringify(b), `transponder-db-backup-${timestampForFilename()}.json`, 'application/json'); localStorage.setItem(LAST_BACKUP_KEY, now()); updateBackupStatus(); showToast('✓ Backup downloaded – keep it somewhere safe (email it to yourself or save to Drive).', false, 6000); }
  catch (e) { dbError(e, 'make a backup'); }
}
async function restoreFromObject(b, sourceText) {
  if (!b || b.app !== 'pinky-transponder-db' || !b.stores) throw new Error('This is not a Transponder DB backup file.');
  const c = b.counts || {};
  if (!await confirmDialog('Restore backup?', `Replace EVERYTHING on this device with the backup from ${fmtDate(b.created)} ${sourceText || ''} (${b.stores.inventory.length} inventory, ${b.stores.vehicles.length} vehicle, ${(b.stores.stock || []).length} stock rows)?`, 'Restore')) return false;
  const tx = db.transaction([INVENTORY_STORE, VEHICLE_STORE, STOCK_STORE, FILES_STORE], 'readwrite');
  const pairs = [[INVENTORY_STORE, b.stores.inventory], [VEHICLE_STORE, b.stores.vehicles], [STOCK_STORE, b.stores.stock || []], [FILES_STORE, b.stores.files || []]];
  pairs.forEach(([s, rows]) => { const st = tx.objectStore(s); st.clear(); rows.forEach(r => st.put(r)); });
  await txDone(tx); return true;
}
async function restoreBackup(event) {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try { const b = JSON.parse(await file.text()); if (await restoreFromObject(b)) { showToast('✓ Backup restored.'); scheduleAutoBackup(); refreshAll(); } }
  catch (e) { dbError(e, 'restore'); }
}
let backupTimer;
function scheduleAutoBackup() { clearTimeout(backupTimer); backupTimer = setTimeout(autoBackup, 800); }
async function autoBackup() {
  try { const b = await buildBackup(); const s = JSON.stringify(b); localStorage.setItem(AUTO_BACKUP_KEY, s); localStorage.setItem(AUTO_BACKUP_KEY + 'Time', b.created); }
  catch (e) { console.warn('auto-backup skipped', e); localStorage.setItem(AUTO_BACKUP_KEY + 'Time', 'failed'); }
  updateBackupStatus();
}
function updateBackupStatus() {
  const el = document.getElementById('backupStatus'); const last = localStorage.getItem(LAST_BACKUP_KEY);
  const auto = localStorage.getItem(AUTO_BACKUP_KEY + 'Time');
  const days = last ? (Date.now() - new Date(last)) / 864e5 : Infinity;
  el.innerHTML = (days > 14 ? '<span class="warn">Backup: ' + (last ? Math.floor(days) + ' days old' : 'none yet') + '</span>' : '<span class="ok">Backup: ' + fmtDate(last) + '</span>') +
    (auto === 'failed' ? ' · <span class="warn">auto-copy failed</span>' : '');
}
async function resetEverything() {
  const typed = await openDialog('Reset everything?', '<p>This deletes ALL inventory, vehicle reference, stock list and file records on this device. It cannot be undone.</p><p><button class="save-button" onclick="downloadBackup()">💾 Download a backup first</button></p><label class="field">Type RESET to confirm<input type="text" id="resetTyped" autocomplete="off"></label>',
    [{ label: 'Cancel', cls: 'grey-button', value: null }, { label: 'Delete everything', cls: 'danger-button', collect: () => document.getElementById('resetTyped').value.trim() }]);
  if (typed === null) return;
  if (typed !== 'RESET') { showToast('Not reset – you must type RESET exactly.', true); return; }
  try {
    const tx = db.transaction([INVENTORY_STORE, VEHICLE_STORE, STOCK_STORE, FILES_STORE], 'readwrite');
    [INVENTORY_STORE, VEHICLE_STORE, STOCK_STORE, FILES_STORE].forEach(s => tx.objectStore(s).clear()); await txDone(tx);
    localStorage.removeItem(AUTO_BACKUP_KEY); localStorage.removeItem(AUTO_BACKUP_KEY + 'Time');
    showToast('Everything was reset.'); refreshAll(); updateBackupStatus();
  } catch (e) { dbError(e, 'reset'); }
}

// ---------- Offline / storage ----------
function registerSW() {
  const el = document.getElementById('offlineStatus');
  if (!('serviceWorker' in navigator)) { el.innerHTML = '<span class="warn">This browser cannot work offline</span>'; return; }
  if (location.protocol === 'file:') { el.innerHTML = '<span class="warn">Offline mode needs the app to be opened from a website (not a file)</span>'; return; }
  navigator.serviceWorker.register('service_worker.js').then(reg => {
    const markReady = () => { el.innerHTML = '<span class="ok">✓ Available offline</span>' + (navigator.onLine ? '' : ' · <span class="warn">you are offline</span>'); };
    if (reg.active) markReady();
    navigator.serviceWorker.ready.then(markReady);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showToast('A new version of the app is ready.', false, 60000, { label: 'Update now', fn: () => nw.postMessage('skipWaiting') });
      });
    });
    reg.update().catch(() => {});
  }).catch(e => { el.innerHTML = '<span class="warn">Offline mode failed: ' + escapeHtml(e.message) + '</span>'; });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (window.__swHadController && !reloading) { reloading = true; location.reload(); } });
  window.__swHadController = !!navigator.serviceWorker.controller;
  window.addEventListener('online', () => registerSWStatus()); window.addEventListener('offline', () => registerSWStatus());
}
function registerSWStatus() { const el = document.getElementById('offlineStatus'); if (navigator.serviceWorker && navigator.serviceWorker.controller) el.innerHTML = '<span class="ok">✓ Available offline</span>' + (navigator.onLine ? '' : ' · <span class="warn">you are offline</span>'); }
async function requestPersistence() {
  const el = document.getElementById('storageStatus');
  if (!navigator.storage || !navigator.storage.persist) { el.innerHTML = '<span class="warn">Storage may be cleared by the browser – keep backups</span>'; return; }
  try {
    let ok = await navigator.storage.persisted(); if (!ok) ok = await navigator.storage.persist();
    el.innerHTML = ok ? '<span class="ok">✓ Storage protected</span>' : '<span class="warn" title="The browser may clear app data if the phone runs low on space. Install the app to the home screen and download backups.">⚠ Storage not protected – keep backups</span>';
  } catch (e) { el.innerHTML = '<span class="warn">Storage protection unknown</span>'; }
}
function refreshAll() { displayFileList(); filterInventory(); filterVehicles(); performQuickSearch(); }

window.addEventListener('scroll', () => { const show = window.scrollY > 400; document.querySelectorAll('.scroll-top-btn').forEach(b => b.style.display = show ? 'block' : 'none'); });
window.addEventListener('DOMContentLoaded', async () => {
  registerSW(); requestPersistence(); updateBackupStatus();
  if (!window.indexedDB) { document.body.insertAdjacentHTML('afterbegin', '<div class="warn-box">This browser cannot store data (IndexedDB missing / private mode). Nothing will be saved.</div>'); return; }
  try { await initDB(); } catch (e) { document.body.insertAdjacentHTML('afterbegin', '<div class="warn-box">⚠ Could not open the database: ' + escapeHtml(e.message || e) + '. If you are in private browsing mode, switch to normal mode.</div>'); return; }
  refreshAll();
  // If the database is empty but an automatic copy exists, offer it (protects against lost data)
  try {
    const [inv, veh] = await Promise.all([getAll(INVENTORY_STORE), getAll(VEHICLE_STORE)]);
    const snap = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!inv.length && !veh.length && snap) { const b = JSON.parse(snap); if ((b.counts.inventory || b.counts.vehicles) && await restoreFromObject(b, '(automatic copy kept by the app – your data looks empty)')) refreshAll(); }
  } catch (e) { console.warn(e); }
});
window.__test = { yearSpans, yearMatchesRange, isInStock, makeFilter, dedupeKey, cleanCell, fixMojibake };
