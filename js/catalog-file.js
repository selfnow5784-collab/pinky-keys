/* catalog-file.js (v3.9-7) — Pinky's catalog CSV = ONE list (like one tape in a player).
   Columns: Year(s),Make,Model,Product_Name,id (+ any of Type,Qty,Notes,FCC_ID,Chip,Blade,OEM_PN,Supplier_Part_Number,Supplier,
   Key_Type,Strattec_PN,Product_URL,Buttons,Frequency, the *_Source columns, Reason, Data_Pulled …).
   v3.9-7 changes:
   - A Reason column no longer means "this whole file is the review file". Every row imports as a normal row; only rows whose
     Reason cell is filled are marked Needs review. Old files without Reason import with no marks.
   - Importing a catalog file REPLACES the loaded catalog (all earlier CSV rows, including old v3.8–v3.9-6 'review:' rows).
     Your own items (fromCsv 'mine'), in-stock list, hidden rows, custom columns and pending My Fixes are kept.
   - "When the data was pulled": a Data_Pulled column (2026-11 = November 2026, or a bare year 2026), or a metadata line before the header: # Data_Pulled: 2026-11.
     Missing = shown as Unknown.
   - Export writes the loaded file's own columns back (with your applied changes, and Reason blank on rows you Confirmed ✓).
   Stock links by Source|Item #|Part # (Stock.ref) exactly as before (PN and Source come from Notes first).
   Buttons = the Buttons column, else only a count written in the product title ("4-Btn", "3 Button"); never guessed. */
(function (G) {
  'use strict';
  const NK = { fcc: 'fcc', chip: 'chip', freq: 'freq', pn: 'pn', price: 'price', source: 'src', blade: 'blade' };
  const isClean = h => ['Year(s)', 'Make', 'Model', 'Product_Name', 'id'].every(c => h.includes(c));
  function buttons(title) {
    const out = [];
    for (const m of String(title || '').matchAll(/(?<![\d\-\/])(\d{1,2}(?:\s*[\/+]\s*\d{1,2})*)\s*-?\s*(?:btns?|buttons?)\b/gi)) {
      const v = m[1].replace(/\s+/g, ''); if (!out.includes(v)) out.push(v); }
    return out.join(' / ');
  }
  const COLMAP = { FCC_ID: 'fcc', Chip: 'chip', Blade: 'blade', OEM_PN: 'oem', Supplier: 'supplier', Source_URL: 'url',
    Original_Supplier_Years: 'origYears', Compatibility_FCC_ID: 'compatFcc', Research_Sources: 'research', Source_File: 'srcFile',
    Key_Type: 'keyType', Strattec_PN: 'strattec', Product_URL: 'productUrl', Original_Notes: 'origNotes', Data_Pulled: 'pulled',
    OEM_PN_Source: 'oemSource', Strattec_PN_Source: 'strattecSource', FCC_ID_Source: 'fccSource',
    Buttons_Source: 'buttonsSource', Frequency_Source: 'freqSource', Key_Type_Source: 'keyTypeSource',
    Chip_Source: 'chipSource', Blade_Source: 'bladeSource', Compatibility_FCC_ID_Source: 'compatFccSource',
    Product_URL_Source: 'productUrlSource', Type_Source: 'typeSource', 'Year(s)_Source': 'yearsSource' };
  // fields that can be filled from Notes / the title when their own column is blank (export writes those columns back blank)
  const DERIVABLE = { fcc: 'FCC_ID', chip: 'Chip', blade: 'Blade', freq: 'Frequency', buttons: 'Buttons', productUrl: 'Product_URL' };
  function toRow(x) {
    const id = (x['id'] || '').trim(), r = { id, cid: id, item: id.split('/')[0], years: x['Year(s)'] || '', make: x['Make'] || '', model: x['Model'] || '',
      product: x['Product_Name'] || '', type: x['Type'] || '', qty: 0, csvQty: Data.parseQty(x['Qty']), notes: x['Notes'] || '', compat: '', fromCsv: 'main' };
    (x['Notes'] || '').split(/;\s*/).forEach(p => { const m = p.match(/^(\w+):\s*(.*)$/); if (m && NK[m[1].toLowerCase()]) r[NK[m[1].toLowerCase()]] = m[2].trim(); });
    Object.entries(COLMAP).forEach(([c, f]) => { const v = (x[c] || '').trim(); if (v) r[f] = v; }); // explicit columns win over Notes (not PN/Source: stock link)
    if (!r.pn && (x['Supplier_Part_Number'] || '').trim()) r.pn = x['Supplier_Part_Number'].trim();
    r.spn = (x['Supplier_Part_Number'] || '').trim();
    r.buttons = (x['Buttons'] || '').trim() || buttons(r.product);
    if ((x['Frequency'] || '').trim()) r.freq = x['Frequency'].trim();
    if (!r.productUrl && r.url) r.productUrl = r.url;
    const der = Object.keys(DERIVABLE).filter(f => r[f] && !(x[DERIVABLE[f]] || '').trim()); if (der.length) r.derived = der;
    r.review = (x['Reason'] || '').trim(); r.reviewOnly = false; // v3.9-7: blank Reason = regular row
    return r;
  }
  const FIELDS = ['years', 'make', 'model', 'product', 'type', 'fcc', 'chip', 'freq', 'blade', 'buttons', 'oem', 'pn', 'spn', 'item', 'price', 'src', 'supplier', 'url', 'origYears', 'compatFcc', 'research', 'srcFile', 'notes', 'review', 'keyType', 'strattec', 'productUrl', 'origNotes', 'pulled', 'derived', 'oemSource', 'strattecSource', 'fccSource', 'buttonsSource', 'freqSource', 'keyTypeSource', 'chipSource', 'bladeSource', 'compatFccSource', 'productUrlSource', 'typeSource', 'yearsSource'];
  const SHORT = { 'american key supply': 'AKS', aks: 'AKS', uhs: 'UHS', 'uhs hardware': 'UHS', 'key innovations': 'KI', ki: 'KI' };
  const NAME = { AKS: 'American Key Supply', UHS: 'UHS Hardware', KI: 'Key Innovations' };
  // short supplier code for a row: Supplier column first, then "Source: AKS" from Notes, then the id prefix
  function supplierCode(r) {
    const a = SHORT[String(r.supplier || '').trim().toLowerCase()] || SHORT[String(r.src || '').trim().toLowerCase()];
    if (a) return a; const p = String(r.item || '').split('-')[0].toUpperCase(); return NAME[p] ? p : (r.supplier || r.src || '');
  }
  function pulledOf(rows, meta) {
    const set = new Set(rows.map(r => r.pulled).filter(Boolean));
    if (!set.size && meta) Object.keys(meta).forEach(k => { if (/pulled|data[_ ]?year/i.test(k) && meta[k]) set.add(meta[k]); });
    return [...set].sort().join(', ');
  }
  // v3.9-8: "2026-11" -> "November 2026"; a bare "2026" stays "2026" (a month is never guessed); anything else is shown as written
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function pulledLabel(v) {
    return String(v || '').split(/\s*,\s*/).filter(Boolean).map(x => { const m = x.match(/^(\d{4})-(0[1-9]|1[0-2])$/); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : x; }).join(', ');
  }
  // parse result -> rows + file info (no changes to the app yet)
  function prepare(name, parsed) {
    const rows = parsed.data.map(toRow).filter(r => r.cid);
    const seen = new Set(), uniq = []; rows.forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); uniq.push(r); } });
    return { name, rows: uniq, headers: parsed.headers.filter(Boolean), meta: parsed.meta || {}, pulled: pulledOf(uniq, parsed.meta),
      marked: uniq.filter(r => r.review).length };
  }
  const isCsvRow = r => (r.fromCsv === 'main' || r.fromCsv === 'review') && !(G.Users && Users.isMine(r));
  // v3.8–v3.9-6 kept review rows as 'review:'+id; move hidden marks and custom values over to the plain id
  async function remapOldIds(keep) {
    const hid = G.Hidden ? Hidden.raw() : {}, vals = G.Custom ? Custom.rawVals() : {}; let ch = false;
    Object.keys(hid).forEach(k => { if (k.startsWith('review:') && keep.has(k.slice(7))) { hid[k.slice(7)] = hid[k]; delete hid[k]; ch = true; } });
    Object.keys(vals).forEach(k => { if (k.startsWith('review:') && keep.has(k.slice(7))) { vals[k.slice(7)] = Object.assign({}, vals[k], vals[k.slice(7)] || {}); delete vals[k]; ch = true; } });
    if (ch) { if (G.Hidden) await Hidden.replaceAll(hid); if (G.Custom) await Custom.replaceAll(Custom.rawCols(), vals); }
  }
  // opts.applyFixes: true = put pending My Fixes on top of the new file, false = load the file as it is (fixes stay listed for export)
  async function importClean(name, parsedOrPrep, opts) {
    opts = opts || {};
    const P = parsedOrPrep.rows ? parsedOrPrep : prepare(name, parsedOrPrep), rows = P.rows;
    const keep = new Set(rows.map(r => r.id));
    Store.remove('catalog', Store.st.catalog.filter(r => isCsvRow(r) && !keep.has(r.id)).map(r => r.id));
    Store.remove('files', Store.st.files.filter(f => !!f.csv).map(f => f.id));
    const f = Store.add('files', [{ name, kind: 'catalog', csv: 'main', rows: rows.length, date: new Date().toISOString(), headers: P.headers, meta: P.meta, pulled: P.pulled }])[0];
    const fresh = [];
    rows.forEach(r => { r.file = f.id; const ex = Store.byId.catalog.get(r.id);
      if (ex) { FIELDS.forEach(k => { if (!(k in r)) delete ex[k]; }); Object.assign(ex, r); } else fresh.push(r); });
    Store.add('catalog', fresh); Store.markAllDirty();
    await remapOldIds(keep);
    Lookup.rebuild(Store.st);
    for (const r of rows) if (r.csvQty > 0) { await Stock.set(r, true); const it = Store.st.inventory.find(i => i.ref === Stock.ref(r)); if (it && +it.qty !== r.csvQty) Store.update('inventory', it, 'qty', r.csvQty, true); }
    let fx = null; if (G.Fixes) fx = await Fixes.reapply(keep, opts.applyFixes !== false);
    Lookup.rebuild(Store.st);
    await Store.save(); document.body.dataset.lastFixResult = JSON.stringify(fx || {}); return rows.length;
  }
  // Remove file: takes the loaded catalog out. Your items, stock, hidden rows, custom columns and My Fixes stay.
  async function removeLoaded() {
    const ids = Store.st.catalog.filter(isCsvRow).map(r => r.id), n = ids.length;
    Store.remove('catalog', ids); Store.remove('files', Store.st.files.filter(f => !!f.csv).map(f => f.id));
    Lookup.rebuild(Store.st); await Store.save(); return n;
  }
  const HEAD_MAIN = ['Year(s)', 'Make', 'Model', 'Product_Name', 'Type', 'Qty', 'Notes', 'id', 'FCC_ID', 'Chip', 'Blade', 'OEM_PN', 'Supplier_Part_Number', 'Supplier', 'Source_URL', 'Source_File', 'Original_Supplier_Years', 'Original_Notes', 'Compatibility_FCC_ID', 'Research_Sources', 'Buttons', 'Frequency', 'Key_Type', 'Strattec_PN', 'Product_URL', 'OEM_PN_Source', 'Strattec_PN_Source', 'FCC_ID_Source', 'Buttons_Source', 'Frequency_Source', 'Key_Type_Source', 'Chip_Source', 'Blade_Source', 'Compatibility_FCC_ID_Source', 'Product_URL_Source', 'Type_Source', 'Year(s)_Source'];
  const HEAD_REV = HEAD_MAIN.concat(['Reason']);
  // row -> CSV record (current values = with your applied My Fixes; Confirmed ✓ rows get a blank Reason)
  function toCsvRow(r, file) {
    const der = new Set(r.derived || []), fixed = k => G.Fixes && Fixes.edited(r, k), d = (k, v) => (der.has(k) && !fixed(k)) ? '' : (v || '');
    const reason = (G.Fixes && Fixes.isConfirmed(r)) ? '' : (r.review || '');
    return { 'Year(s)': r.years || '', Make: r.make || '', Model: r.model || '', Product_Name: r.product || '', Type: r.type || '',
      Qty: r.csvQty != null && r.csvQty !== '' ? r.csvQty : '', Notes: r.notes || '', id: r.cid || '', FCC_ID: d('fcc', r.fcc), Chip: d('chip', r.chip),
      Blade: d('blade', r.blade), OEM_PN: r.oem || '', Supplier_Part_Number: r.spn || '', Supplier: r.supplier || '', Source_URL: r.url || '',
      Source_File: r.srcFile || '', Original_Supplier_Years: r.origYears || '', Original_Notes: r.origNotes || '', Compatibility_FCC_ID: r.compatFcc || '',
      Research_Sources: r.research || '', Buttons: d('buttons', r.buttons), Frequency: d('freq', r.freq),
      Key_Type: r.keyType || '', Strattec_PN: r.strattec || '', Product_URL: d('productUrl', r.productUrl),
      OEM_PN_Source: r.oemSource || '', Strattec_PN_Source: r.strattecSource || '', FCC_ID_Source: r.fccSource || '',
      Buttons_Source: r.buttonsSource || '', Frequency_Source: r.freqSource || '', Key_Type_Source: r.keyTypeSource || '',
      Chip_Source: r.chipSource || '', Blade_Source: r.bladeSource || '', Compatibility_FCC_ID_Source: r.compatFccSource || '',
      Product_URL_Source: r.productUrlSource || '', Type_Source: r.typeSource || '', 'Year(s)_Source': r.yearsSource || '',
      Data_Pulled: r.pulled || (file && file.pulled) || '', Reason: reason };
  }
  const loadedFile = () => Store.st.files.filter(f => !!f.csv).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  const loadedFiles = () => Store.st.files.filter(f => !!f.csv);
  const csvRows = () => Store.st.catalog.filter(isCsvRow);
  // the whole loaded catalog as CSV text (its own columns; old two-file setups export as one list with Reason)
  function catalogCsv() {
    const rows = csvRows(), file = loadedFile();
    let headers = file && file.headers && file.headers.length ? file.headers.slice() : HEAD_REV.slice();
    if (!headers.includes('Reason') && rows.some(r => r.review)) headers.push('Reason');
    let text = CSV.unparse(rows.map(r => toCsvRow(r, file)), headers);
    const meta = file && file.meta ? Object.entries(file.meta) : [];
    if (meta.length) text = '\uFEFF' + meta.map(([k, v]) => '# ' + k + ': ' + v).join('\r\n') + '\r\n' + text.replace(/^\uFEFF/, '');
    return { text, rows: rows.length, name: (file && file.name) || ('pinky-catalog-' + U.stamp() + '.csv') };
  }
  function exportClean(suffix) {
    const c = catalogCsv(); if (!c.rows) return 0;
    const name = suffix ? c.name.replace(/(\.csv)?$/i, '-' + suffix + '-' + U.stamp() + '.csv') : c.name;
    U.download(c.text, name); document.body.dataset.exportedCatalog = name + ':' + c.rows; return c.rows;
  }
  G.CatalogFile = { isClean, prepare, importClean, removeLoaded, toRow, buttons, exportClean, catalogCsv, toCsvRow, supplierCode, NAME, pulledLabel, loadedFile, loadedFiles, csvRows, isCsvRow, HEAD_MAIN, HEAD_REV };
})(window);
