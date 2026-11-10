/* ui-data.js — Data tab: import/export the catalog CSV (main + review) and show current
   file info. Theme, row size, My Fixes, hidden rows, custom columns, backup/restore,
   help and erase live in the File / Edit / View / Help menus. Import never wipes
   stock, My Fixes, user rows, hidden ids or custom columns. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const read = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });
  async function importFile(file, kind) {
    const parsed = CSV.parse(await read(file));
    if (CatalogFile.isClean(parsed.headers)) { const n = await CatalogFile.importClean(file.name, parsed); renderFiles(); renderCounts(); SheetUI.refresh(); U.toast(n.toLocaleString() + ' rows imported'); document.body.dataset.imported = (+document.body.dataset.imported || 0) + 1; document.body.dataset.lastImport = n; return n; }
    kind = kind === 'auto' ? Data.detectKind(parsed.headers) : kind;
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
  function commit(kind, name, a, mode) {
    if (mode === 'replace') { Store.replaceKind(kind); Store.st.files.filter(f => f.kind === kind).forEach(f => Store.remove('files', [f.id])); }
    let rows = a.rows.filter(r => mode === 'all' ? true : mode === 'replace' ? !r._dupFile : !r._dupFile && !r._dupEx);
    if (kind === 'inventory' && mode === 'merge') a.rows.filter(r => r._dupEx).forEach(r => { const ex = Store.st.inventory.find(x => Data.dedupeKey('inventory', x) === Data.dedupeKey('inventory', r)); if (ex) Store.update('inventory', ex, 'qty', r.qty, true); });
    rows = rows.map(r => { const o = {}; Object.keys(r).forEach(k => { if (k[0] !== '_') o[k] = r[k]; }); if (kind === 'inventory') o.fits = []; return o; });
    const f = Store.add('files', [{ name, kind, rows: rows.length, date: new Date().toISOString() }])[0];
    Store.add(kind, rows, f.id); renderFiles(); return rows.length;
  }
  function fileOf(kind) { return Store.st.files.find(f => f.csv === kind) || Store.st.files.filter(f => f.kind === 'catalog').find(f => (kind === 'review') === /review/i.test(f.name || '')); }
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  function card(kind, label) {
    const f = fileOf(kind);
    const n = Store.st.catalog.filter(r => r.fromCsv === kind).length;
    if (!f && !n) return `<div class="catcard empty" data-kind="${kind}"><div class="k">${esc(label)}</div><div class="fn">—</div></div>`;
    const rows = n || +(f && f.rows) || 0;
    const name = (f && f.name) || '';
    const date = fmtDate(f && f.date);
    return `<div class="catcard" data-kind="${kind}"><div class="k">${esc(label)}</div>${name ? `<div class="fn">${esc(name)}</div>` : ''}<div class="meta">${rows.toLocaleString()} rows${date ? ' · ' + esc(date) : ''}</div></div>`;
  }
  function renderFiles() {
    const el = $('#fileInfo'); if (!el) return;
    el.innerHTML = `<div class="catinfo">${card('main', 'Main')}${card('review', 'Review')}</div>`;
    const exp = $('#expCat'); if (exp) exp.hidden = !Store.st.files.some(f => f.kind === 'catalog' || f.csv === 'main' || f.csv === 'review') && !Store.st.catalog.some(r => r.fromCsv === 'main' || r.fromCsv === 'review');
  }
  function backup() {
    const s = Store.st;
    U.download(JSON.stringify({ app: 'pinky-keys-v3.9', date: new Date().toISOString(), inventory: s.inventory, catalog: s.catalog, vehicles: s.vehicles, files: s.files, prefs: Store.prefs, fixes: Fixes.raw(), hidden: Hidden.raw(), customCols: Custom.rawCols(), customVals: Custom.rawVals() }), 'pinky-backup-' + U.stamp() + '.json', 'application/json');
  }
  async function restore(file) {
    let b; try { b = JSON.parse(await read(file)); } catch (e) { return U.toast('That is not a backup file', true); }
    if (!b || !Array.isArray(b.catalog)) return U.toast('Backup file not recognised', true);
    if (!await U.confirmBox('Restore backup?', `This replaces everything with the backup from ${b.date || '?'}.`, 'Restore')) return;
    if (!b.inventory && b.van) b.inventory = b.van;
    (b.files || []).forEach(f => { if (f.kind === 'van') f.kind = 'inventory'; });
    ['catalog', 'vehicles', 'inventory', 'files'].forEach(k => { Store.replaceKind(k); Store.add(k, (b[k] || []).map(r => Object.assign({}, r))); });
    if (b.fixes) await Fixes.replaceAll(b.fixes); else await Fixes.replaceAll({});
    await Hidden.replaceAll(b.hidden || {});
    await Custom.replaceAll(b.customCols || [], b.customVals || {});
    if (b.prefs) Object.assign(Store.prefs, b.prefs);
    await Users.migrate();
    await Store.save(); Lookup.rebuild(Store.st); Store.changed('prefs'); renderFiles(); renderCounts(); SheetUI.refresh(); U.toast('Backup restored');
  }
  function renderPrefs() { renderFiles(); }
  function renderCounts() { renderColList(); }
  function colListBody() {
    const list = Custom.list();
    const items = list.length ? `<ul class="collist" id="colList">${list.map(c => `<li><b>${esc(c.label)}</b> <button type="button" data-cren="${esc(c.id)}">Rename</button> <button type="button" data-cdel="${esc(c.id)}" class="danger">Delete</button></li>`).join('')}</ul>` : '<div id="colList"></div>';
    return items + '<div class="row addcol"><input id="ccName" autocomplete="off" aria-label="Column name"><button type="button" id="colAdd">Add</button></div>';
  }
  function renderColList() {
    const el = $('#colList'); if (!el || !$('#dlg') || !$('#dlg').open) return;
    if (!$('#colAdd')) return;
    const wrap = el.closest ? el : null;
    const b = $('#dlgBody'); if (!b || !b.contains(el)) return;
    const keep = ($('#ccName') || {}).value;
    const focused = document.activeElement === $('#ccName');
    b.innerHTML = colListBody();
    if (keep && $('#ccName')) $('#ccName').value = keep;
    if (focused && $('#ccName')) $('#ccName').focus();
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
  async function addColumn() {
    const v = await U.dialog('Add column', '<label class="ed">Name<input id="ccName" autocomplete="off"></label>', [{ label: 'Cancel', value: null }, { label: 'Add', cls: 'primary', value: () => ($('#ccName') || {}).value }]);
    if (v == null) return;
    const c = await Custom.add(v); if (!c) return U.toast('Give the column a name that is not already used', true);
    renderColList(); SheetUI.render();
  }
  async function renameColumn(id) {
    const cur = Custom.list().find(c => c.id === id); if (!cur) return;
    const v = await U.dialog('Rename column', `<label class="ed">Name<input id="ccName" value="${esc(cur.label)}" autocomplete="off"></label>`, [{ label: 'Cancel', value: null }, { label: 'Rename', cls: 'primary', value: () => ($('#ccName') || {}).value }]);
    if (v == null) return;
    if (!await Custom.rename(id, v)) return U.toast('Give the column a name that is not already used', true);
    renderColList(); SheetUI.render();
  }
  async function deleteColumn(id) {
    const cur = Custom.list().find(c => c.id === id); if (!cur) return;
    if (!await U.confirmBox('Delete column?', `Delete "${cur.label}" and its values on every row?`, 'Delete')) return;
    await Custom.remove(id); renderColList(); SheetUI.render();
  }
  async function openCustom() {
    let next = 'list';
    while (next && next !== 'close') {
      if (next === 'list') {
        let action = null;
        const p = U.dialog('Custom columns', colListBody(), [{ label: 'Close', value: 'close' }]);
        const b = $('#dlgBody');
        b.onclick = e => {
          if (e.target.id === 'colAdd') {
            const name = ($('#ccName') || {}).value;
            Custom.add(name).then(c => { if (!c) return U.toast('Give the column a name that is not already used', true); b.innerHTML = colListBody(); SheetUI.render(); });
            return;
          }
          const ren = e.target.dataset && e.target.dataset.cren, del = e.target.dataset && e.target.dataset.cdel;
          if (ren) action = { op: 'ren', id: ren };
          else if (del) action = { op: 'del', id: del };
          else return;
          const closeBtn = $('#dlgFoot button'); if (closeBtn) closeBtn.click();
        };
        const v = await p; b.onclick = null; next = action || v; continue;
      }
      if (next.op === 'ren') { await renameColumn(next.id); next = 'list'; continue; }
      if (next.op === 'del') { await deleteColumn(next.id); next = 'list'; continue; }
      next = 'close';
    }
  }
  async function exportCatalog() {
    const kinds = ['main', 'review'].filter(k => Store.st.catalog.some(r => r.fromCsv === k) || fileOf(k));
    if (!kinds.length) return U.toast('No catalog to export', true);
    if (kinds.length === 1) { CatalogFile.exportClean(kinds[0]); return; }
    const counts = k => Store.st.catalog.filter(r => r.fromCsv === k).length;
    const v = await U.dialog('Export catalog', `<div class="catinfo">${card('main', 'Main')}${card('review', 'Review')}</div>`, [
      { label: 'Main (' + counts('main').toLocaleString() + ')', value: 'main' },
      { label: 'Review (' + counts('review').toLocaleString() + ')', value: 'review' },
      { label: 'Both', cls: 'primary', value: 'both' },
      { label: 'Cancel', value: null }
    ]);
    if (v === 'both') { CatalogFile.exportClean('main'); CatalogFile.exportClean('review'); }
    else if (v) CatalogFile.exportClean(v);
  }
  function openHelp() {
    const html = $('#helpText') ? $('#helpText').innerHTML : '';
    return U.dialog('How to use', html, [{ label: 'Close', value: true }]);
  }
  async function eraseAll() {
    if (!await U.confirmBox('Erase everything?', 'Delete ALL data on this phone, including stock, My Fixes, your items, hidden rows and custom columns? Download a backup first.', 'Erase')) return;
    ['catalog', 'vehicles', 'inventory', 'files'].forEach(k => Store.replaceKind(k));
    await Fixes.replaceAll({}); await Hidden.replaceAll({}); await Custom.replaceAll([], {});
    await Store.save(); Lookup.rebuild(Store.st); renderFiles(); renderCounts(); SheetUI.refresh();
  }
  function init() {
    $('#impFile').addEventListener('change', async e => { const kindEl = $('#impKind'); for (const f of e.target.files) { try { await importFile(f, kindEl ? kindEl.value : 'auto'); } catch (err) { U.toast('Import failed: ' + err.message, true, 8000); } } e.target.value = ''; });
    const exp = $('#expCat'); if (exp) exp.onclick = () => exportCatalog();
    $('#bkFile').addEventListener('change', e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; });
    renderFiles();
  }
  G.DataUI = { init, renderFiles, renderPrefs, renderFixCount: renderCounts, renderCounts, importFile, commit, backup, restore, openHidden, openHelp, openCustom, addColumn, exportCatalog, eraseAll };
})(window);
