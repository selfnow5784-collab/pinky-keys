/* ui-data.js (v3.9-10) — Data tab = one catalog file, like one tape in a player:
   Import new CSV, a box with the loaded file, and its basic info (rows, month/year the data was pulled, sources, rows still
   marked Needs review). Export catalog. v3.9-9: Empty (beside Import) = the same replace flow, but loads nothing.
   Replacing the file offers to save a copy of the current catalog first (with your changes), and only asks about My Fixes
   when some are not already in the new file. Import never wipes stock, user rows or hidden ids. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const read = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });
  async function importFile(file, kind) {
    const parsed = CSV.parse(await read(file));
    if (CatalogFile.isClean(parsed.headers)) return importCatalog(file.name, parsed);
    kind = kind === 'auto' || !kind ? Data.detectKind(parsed.headers) : kind;
    if (!kind) kind = await U.dialog('What is this file?', `<p>${esc(file.name)}: columns ${esc(parsed.headers.join(', '))}</p>`, [{ label: 'Inventory (in stock)', value: 'inventory' }, { label: 'Reference catalog', value: 'catalog' }, { label: 'Vehicle ref', value: 'vehicles' }, { label: 'Cancel', value: null }]);
    if (!kind) return;
    let map = Data.mapHeaders(kind, parsed.headers), a;
    const opts = sel => '<option value="">(none)</option>' + parsed.headers.map(h => `<option ${h === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
    const body = () => { a = Data.analyse(kind, parsed, Store.st[kind], map); const F = Data.KINDS[kind].fields;
      return `<p><b>${esc(file.name)}</b> → <b>${Data.KINDS[kind].label}</b>. ${a.total} rows: ${a.rows.length} usable, ${a.bad.length} skipped (missing ${Data.KINDS[kind].required.join('/')}), ${a.dupFile.length} repeated inside the file, ${a.dupExisting.length} already in the app${a.truncated.length ? `, ${a.truncated.length} with cut-off model names (e.g. "F-")` : ''}.</p>
      <div class="tscroll"><table class="sheet map"><tr><th>App column</th><th>From your column</th></tr>${F.map(f => `<tr><td>${Data.LABEL[f]}</td><td><select data-f="${f}">${opts(map[f])}</select></td></tr>`).join('')}</table></div>
      <h4>Preview</h4><div class="tscroll"><table class="sheet"><tr>${F.map(f => `<th>${Data.LABEL[f]}</th>`).join('')}</tr>${a.rows.slice(0, 5).map(r => `<tr>${F.map(f => `<td>${esc(r[f])}</td>`).join('')}</tr>`).join('')}</table></div>
      <h4>How to add it</h4><label class="inline"><input type="radio" name="impMode" value="merge" checked> Merge – skip duplicates${kind === 'inventory' ? ' (same part # = update qty)' : ''}</label>
      <label class="inline"><input type="radio" name="impMode" value="replace"> Replace – delete all current ${Data.KINDS[kind].label} first</label><label class="inline"><input type="radio" name="impMode" value="all"> Add all – keep duplicates</label>`; };
    const wire = () => setTimeout(() => document.querySelectorAll('#dlgBody select[data-f]').forEach(s => { s.onchange = () => { map[s.dataset.f] = s.value; $('#dlgBody').innerHTML = body(); wire(); }; }));
    wire();
    const mode = await U.dialog('Import preview', body(), [{ label: 'Cancel', value: null }, { label: 'Import', cls: 'primary', value: () => ($('input[name=impMode]:checked') || {}).value }]);
    if (!mode) return;
    const n = commit(kind, file.name, a, mode); if (kind === 'inventory') await Users.migrate(); document.body.dataset.imported = (+document.body.dataset.imported || 0) + 1; document.body.dataset.lastImport = n; return n;
  }
  const bump = k => { document.body.dataset[k] = (+document.body.dataset[k] || 0) + 1; };
  const hasLoaded = () => CatalogFile.csvRows().length > 0 || CatalogFile.loadedFiles().length > 0;
  // one catalog file in, the old one out
  async function importCatalog(name, parsed) {
    const P = CatalogFile.prepare(name, parsed);
    if (!P.rows.length) { U.toast('No rows with an id in ' + name, true, 6000); return 0; }
    if (hasLoaded()) {
      const cur = CatalogFile.loadedFile(), curN = CatalogFile.csvRows().length;
      const v = await U.dialog('Replace the loaded file?', `<p>Loaded now: <b>${esc((cur && cur.name) || 'catalog')}</b> (${curN.toLocaleString()} rows).<br>New file: <b>${esc(name)}</b> (${P.rows.length.toLocaleString()} rows).</p>
        <p>Save a copy of the current catalog first? The copy includes the changes already in it (your fixes and Confirmed ✓ marks).</p>`,
        [{ label: 'Cancel', value: null }, { label: 'Replace without saving', value: 'replace' }, { label: 'Save copy, then replace', cls: 'primary', value: 'save' }]);
      if (!v) { bump('replaceCancelled'); return 0; }
      if (v === 'save') CatalogFile.exportClean('copy');
    }
    const pend = Fixes.pendingAgainst(P.rows); let apply = true;
    document.body.dataset.fixPrompt = '0';
    if (pend.pending.length) {
      document.body.dataset.fixPrompt = String(pend.pending.length);
      const v = await U.dialog('Apply your fixes?', `<p>${pend.pending.length.toLocaleString()} of your fixes ${pend.pending.length === 1 ? 'is' : 'are'} not in <b>${esc(name)}</b>.${pend.already.length ? ' ' + pend.already.length.toLocaleString() + ' already ' + (pend.already.length === 1 ? 'is' : 'are') + ' in it and will be cleared from My Fixes.' : ''}</p>
        <p><b>Apply</b> puts your values on top of the new file. <b>Load without them</b> shows the file as it is; your fixes stay in My Fixes so you can still export and send them.</p>`,
        [{ label: 'Cancel import', value: null }, { label: 'Load without them', value: 'skip' }, { label: 'Apply my fixes', cls: 'primary', value: 'apply' }]);
      if (!v) { bump('replaceCancelled'); return 0; }
      apply = v === 'apply';
    }
    const n = await CatalogFile.importClean(name, P, { applyFixes: apply });
    renderFiles(); renderCounts(); SheetUI.refresh();
    bump('imported'); document.body.dataset.lastImport = n; return n;
  }
  // Empty: like importing a file that has nothing in it. Same question as Replace; then the catalog is unloaded.
  // Your in-stock list, your own items, My Fixes, hidden rows and settings stay.
  async function emptyCatalog() {
    if (!hasLoaded()) return 0;
    const cur = CatalogFile.loadedFile(), curN = CatalogFile.csvRows().length;
    const v = await U.dialog('Empty the app?', `<p>Loaded now: <b>${esc((cur && cur.name) || 'catalog')}</b> (${curN.toLocaleString()} rows). Empty unloads it and loads nothing, so the sheet is blank until you import a file.</p>
      <p>Save a copy of the current catalog first? The copy includes the changes already in it (your fixes and Confirmed ✓ marks).</p>
      <p class="note">Your in-stock list, your own items, My Fixes, hidden rows and settings stay.</p>`,
      [{ label: 'Cancel', value: null }, { label: 'Empty without saving', value: 'empty' }, { label: 'Save copy, then empty', cls: 'primary', value: 'save' }]);
    if (!v) { bump('emptyCancelled'); return 0; }
    if (v === 'save') CatalogFile.exportClean('copy');
    const n = await CatalogFile.removeLoaded(); renderFiles(); renderCounts(); SheetUI.refresh(); bump('emptied'); return n;
  }
  function commit(kind, name, a, mode) {
    if (mode === 'replace') { Store.replaceKind(kind); Store.st.files.filter(f => f.kind === kind).forEach(f => Store.remove('files', [f.id])); }
    let rows = a.rows.filter(r => mode === 'all' ? true : mode === 'replace' ? !r._dupFile : !r._dupFile && !r._dupEx);
    if (kind === 'inventory' && mode === 'merge') a.rows.filter(r => r._dupEx).forEach(r => { const ex = Store.st.inventory.find(x => Data.dedupeKey('inventory', x) === Data.dedupeKey('inventory', r)); if (ex) Store.update('inventory', ex, 'qty', r.qty, true); });
    rows = rows.map(r => { const o = {}; Object.keys(r).forEach(k => { if (k[0] !== '_') o[k] = r[k]; }); if (kind === 'inventory') o.fits = []; return o; });
    const f = Store.add('files', [{ name, kind, rows: rows.length, date: new Date().toISOString() }])[0];
    Store.add(kind, rows, f.id); renderFiles(); return rows.length;
  }
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  function info() {
    const rows = CatalogFile.csvRows(), files = CatalogFile.loadedFiles(), f = CatalogFile.loadedFile();
    const src = new Map(); rows.forEach(r => { const c = CatalogFile.supplierCode(r) || 'Other'; src.set(c, (src.get(c) || 0) + 1); });
    const pulled = (f && f.pulled) || [...new Set(rows.map(r => r.pulled).filter(Boolean))].sort().join(', ');
    return { rows: rows.length, files, f, pulled, sources: [...src].sort((a, b) => b[1] - a[1]), review: rows.filter(Fixes.needsReview).length };
  }
  function renderFiles() {
    const el = $('#fileInfo'); if (!el) return; const I = info();
    if (!I.rows && !I.files.length) {
      el.innerHTML = '<div class="loaded empty"><div class="k">Loaded file</div><div class="fn">No file loaded</div></div>';
    } else {
      const names = I.files.map(x => x.name).filter(Boolean);
      const sources = I.sources.map(([c, n]) => `<span class="srcpill" title="${esc(CatalogFile.NAME[c] || c)}">${esc(c)} <small>${n.toLocaleString()}</small></span>`).join(' ');
      el.innerHTML = `<div class="loaded"><div class="k">Loaded file</div><div class="fn">${esc(names.join(' + ') || 'catalog')}</div>${I.f && I.f.date ? `<div class="meta">Imported ${esc(fmtDate(I.f.date))}</div>` : ''}</div>
        <dl class="finfo">
          <div><dt>Rows</dt><dd id="fiRows">${I.rows.toLocaleString()}</dd></div>
          <div><dt>Data pulled</dt><dd id="fiYear">${I.pulled ? esc(CatalogFile.pulledLabel(I.pulled)) : '<span class="blank">Unknown</span>'}</dd></div>
          <div><dt>Sources</dt><dd id="fiSrc">${sources || '<span class="blank">—</span>'}</dd></div>
          <div><dt>Still marked Needs review</dt><dd id="fiRev">${I.review.toLocaleString()}</dd></div>
        </dl>`;
    }
    const has = I.rows > 0; const exp = $('#expCat'); if (exp) exp.hidden = !has;
    const em = $('#emptyBtn'); if (em) em.disabled = !has && !I.files.length;
  }
  function renderPrefs() {
    renderCounts();
  }
  function renderCounts() {
    const fc = $('#fixCount'); if (fc) { const n = Fixes.count(); fc.textContent = n ? '(' + n.toLocaleString() + ')' : ''; }
    const hc = $('#hidCount'); if (hc) { const h = Hidden.count(); hc.textContent = h ? '(' + h.toLocaleString() + ')' : ''; }
  }
  function hiddenBody() {
    const list = Hidden.list();
    if (!list.length) return '<p class="note">No hidden rows.</p>';
    return `<p class="note">${list.length.toLocaleString()} hidden. Restore puts a row back on the sheet.</p><ul class="hidlist">` +
      list.map(x => { const r = x.row, title = r ? [r.years, r.make, r.model].filter(Boolean).join(' ') : '(not in current list)', sub = r ? (r.product || '') : '';
        return `<li><div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div><button type="button" data-rest="${esc(x.id)}">Restore</button></li>`;
      }).join('') + '</ul>';
  }
  async function openHidden() {
    const d = $('#dlg'); const p = U.dialog('Hidden rows', hiddenBody(), [{ label: 'Restore all', value: 'all' }, { label: 'Close', value: true }]);
    d.classList.add('wide');
    const b = $('#dlgBody');
    b.onclick = async e => { const id = e.target.dataset && e.target.dataset.rest; if (!id) return; await Hidden.restore([id]); b.innerHTML = hiddenBody(); renderCounts(); SheetUI.refresh(); };
    const v = await p; d.classList.remove('wide'); b.onclick = null;
    if (v === 'all') { await Hidden.restore(); renderCounts(); SheetUI.refresh(); }
  }
  function exportCatalog() { const n = CatalogFile.exportClean(); if (!n) U.toast('No catalog to export', true); return n; }
  function openHelp() {
    const html = $('#helpText') ? $('#helpText').innerHTML : (document.querySelector('.help') ? document.querySelector('.help').innerHTML : '');
    return U.dialog('How to use', html, [{ label: 'Close', value: true }]);
  }
  function init() {
    $('#impFile').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await importFile(f, 'auto'); } catch (err) { U.toast('Import failed: ' + err.message, true, 8000); } });
    const exp = $('#expCat'); if (exp) exp.onclick = () => exportCatalog();
    if ($('#emptyBtn')) $('#emptyBtn').onclick = () => emptyCatalog();
    renderFiles(); renderPrefs();
  }
  G.DataUI = { init, renderFiles, renderPrefs, renderFixCount: renderCounts, renderCounts, importFile, importCatalog, emptyCatalog, commit, openHidden, openHelp, exportCatalog, info };
})(window);
