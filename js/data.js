/* data.js — what a record looks like, CSV column aliasing, text cleanup, import analysis.
   Three kinds of data:
     catalog   = "Reference" tab: scraped supplier key list (UNVERIFIED, not in stock); one row per product+vehicle.
                 Its qty column is the supplier's number, shown as "Supplier qty" — never in-stock stock.
     vehicles = vehicle reference (chip / transponder per make-model-year)
     inventory = "Inventory" tab: what is IN STOCK (physically in the van), keyed by part number, with qty
   No DOM here, so Node tests can use it too. */
(function (G) {
  'use strict';
  const S = G.Search;
  const KINDS = {
    catalog: { label: 'Reference catalog', fields: ['make', 'model', 'years', 'product', 'compat', 'qty', 'notes'], required: ['make', 'product'] },
    vehicles: { label: 'Vehicle reference', fields: ['make', 'model', 'years', 'chip', 'strattec', 'notes'], required: ['make', 'chip'] },
    inventory: { label: 'Inventory (in stock)', fields: ['pn', 'name', 'qty', 'type', 'price', 'links', 'notes', 'itemId'], required: ['name'] }
  };
  const LABEL = { make: 'Make', model: 'Model', years: 'Years', product: 'Product', compat: 'Vehicle compatibility', qty: 'Qty', notes: 'Notes',
    chip: 'Transponder / chip', strattec: 'Strattec #', pn: 'Part #', name: 'Name', type: 'Type', price: 'Price', links: 'FCC / part #s it matches', itemId: 'Supplier item ID' };
  // header spellings seen in her files and common exports (compared lowercase, letters+digits only)
  const ALIASES = {
    catalog: { make: ['make', 'manufacturer', 'brand'], model: ['model', 'models'], years: ['years', 'year', 'yearrange', 'yearsrange', 'yr', 'yrs'],
      product: ['productname', 'product', 'keyname', 'key', 'name', 'item', 'itemname', 'description', 'transponderkey'],
      compat: ['vehiclecompatibility', 'compatibility', 'compatiblevehicles', 'fits', 'fitment'], qty: ['qty', 'quantity', 'mytotalqty', 'stock', 'onhand', 'instock', 'count'],
      notes: ['notes', 'note', 'comments', 'remarks'] },
    vehicles: { make: ['make', 'manufacturer', 'brand'], model: ['model'], years: ['year', 'years', 'yearrange', 'yr'],
      chip: ['transponderkey', 'transponder', 'chip', 'chiptype', 'productname', 'product', 'key'], strattec: ['strattec', 'strattecpart', 'keytype'],
      notes: ['notes', 'note', 'comments', 'remarks'] },
    inventory: { pn: ['partno', 'partnumber', 'part', 'sku', 'model', 'pn', 'itemnumber'], name: ['name', 'productname', 'description', 'product', 'item'],
      qty: ['mytotalqty', 'totalqty', 'qty', 'quantity', 'stock', 'onhand', 'facilityqty'], type: ['types', 'type', 'category'], price: ['price', 'cost', 'unitprice'],
      links: ['fcc', 'fccid', 'links', 'crossref'], notes: ['notes', 'note'], itemId: ['id', 'itemid'] }
  };
  const nh = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function fixMojibake(s) { // UTF-8 read as Windows-1252 ("â‡†") -> fix
    if (!/[\u00c2-\u00f4][\u0080-\u00bf\u2018-\u203a\u20ac\u0152-\u0178\u02c6\u02dc]/.test(s)) return s;
    return s.replace(/[\u00c2-\u00f4][\u0080-\u00bf\u2018-\u203a\u20ac\u0152-\u0178\u02c6\u02dc]{1,3}/g, run => {
      const W = { '\u20ac': 0x80, '\u201a': 0x82, '\u0192': 0x83, '\u201e': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02c6': 0x88, '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c, '\u017d': 0x8e, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93, '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02dc': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203a': 0x9b, '\u0153': 0x9c, '\u017e': 0x9e, '\u0178': 0x9f };
      try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([...run].map(c => { const n = c.charCodeAt(0); if (n < 256) return n; if (W[c]) return W[c]; throw 0; }))); } catch (e) { return run; }
    });
  }
  function clean(v) {
    if (v == null) return '';
    let s = fixMojibake(String(v));
    s = s.replace(/<\s*br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }
  function detectKind(headers) {
    const n = headers.map(nh); const has = a => a.some(x => n.includes(x));
    if (!has(['make']) && has(['mytotalqty', 'facilityqty', 'price', 'partno', 'sku'])) return 'inventory';
    if (has(['transponderkey', 'strattec', 'chip'])) return 'vehicles';
    if (has(['make']) && has(['productname', 'product', 'vehiclecompatibility'])) return 'catalog';
    return null;
  }
  function mapHeaders(kind, headers) { // -> {field: headerName}
    const map = {}, used = new Set();
    Object.entries(ALIASES[kind]).forEach(([f, al]) => { for (const a of al) { const i = headers.findIndex((h, j) => !used.has(j) && nh(h) === a); if (i >= 0) { map[f] = headers[i]; used.add(i); break; } } });
    return map;
  }
  const productKey = name => S.norm(name).replace(/\s*#\d+$/, '').replace(/\s+/g, ' ');
  // Part-number-like tokens: FCC IDs, 164-R8130, 5912560, HYQ12BBT ... (letters+digits, >=6 chars once dashes removed)
  function pnTokens(text) {
    const out = new Set(); const t = String(text || '').toUpperCase();
    for (const m of t.matchAll(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g)) { const c = m[0].replace(/-/g, ''); if (c.length >= 6 && /\d/.test(c) && /[A-Z]/.test(c) || /^\d{7}$/.test(c)) out.add(c); }
    return [...out];
  }
  function dedupeKey(kind, r) {
    if (kind === 'inventory') return r.pn ? 'pn:' + S.compact(r.pn) : 'name:' + S.norm(r.name);
    const y = S.norm(r.years).replace(/\s/g, '');
    return [S.canonMake(r.make), S.norm(r.model), y, kind === 'catalog' ? productKey(r.product) : S.norm(r.chip)].join('|');
  }
  function parseQty(v) { // "Van(5)__" or "5" -> 5 ; "" -> 0
    const s = String(v == null ? '' : v); const m = s.match(/-?\d+(\.\d+)?/); return m ? Math.max(0, Math.round(parseFloat(m[0]))) : 0;
  }
  /* Analyse a parsed CSV for import. map can be overridden from the preview screen. */
  function analyse(kind, parsed, existing, map) {
    map = map || mapHeaders(kind, parsed.headers);
    const K = KINDS[kind], rows = [], bad = [], dupFile = [], dupExisting = [], truncated = [];
    const ex = new Set(existing.map(r => dedupeKey(kind, r))), seen = new Set();
    parsed.data.forEach((raw, i) => {
      const r = {};
      K.fields.forEach(f => { r[f] = map[f] ? clean(raw[map[f]]) : ''; });
      if ('qty' in r) r.qty = parseQty(r.qty);
      const line = i + 2, miss = K.required.filter(f => !r[f]);
      if (miss.length) { bad.push({ line, miss }); return; }
      if (r.model && S.isTruncModel(r.make, r.model)) truncated.push(line);
      const k = dedupeKey(kind, r); r._line = line;
      if (seen.has(k)) { r._dupFile = true; dupFile.push(line); } else if (ex.has(k)) { r._dupEx = true; dupExisting.push(line); }
      seen.add(k); rows.push(r);
    });
    return { kind, map, rows, bad, dupFile, dupExisting, truncated, total: parsed.data.length };
  }
  G.Data = { KINDS, LABEL, ALIASES, detectKind, mapHeaders, analyse, clean, fixMojibake, productKey, pnTokens, dedupeKey, parseQty };
  if (typeof module !== 'undefined') module.exports = G.Data;
})(typeof window !== 'undefined' ? window : globalThis);
