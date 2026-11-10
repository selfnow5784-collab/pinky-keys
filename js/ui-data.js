/* ui-data.js — Settings / Data tab: CSV import, imported-file list, JSON backup/restore
   (includes My Fixes, user rows, hidden list, custom columns), theme and row-size,
   Hidden rows and Custom columns, plus Help. */
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
  let fSort = null, fDir = 1;
  function renderFiles() {
    const c = Store.st;
    const lab = f => (Data.KINDS[f.kind === 'van' ? 'inventory' : f.kind] || { label: f.kind }).label, V = { name: f => f.name, kind: lab, rows: f => +f.rows, date: f => f.date };
    const files = fSort ? c.files.slice().sort((a, b) => fDir * (fSort === 'rows' ? V.rows(a) - V.rows(b) : String(V[fSort](a)).localeCompare(String(V[fSort](b)), undefined, { numeric: true }))) : c.files;
    const th = (k, l) => `<th data-fsort="${k}" class="sortable${fSort === k ? (fDir > 0 ? ' asc' : ' desc') : ''}">${l}</th>`;
    $('#fileList').innerHTML = c.files.length ? `<div class="tscroll"><table class="sheet files"><thead><tr><th></th>${th('name', 'File')}${th('kind', 'As')}${th('rows', 'Rows')}${th('date', 'Date')}</tr></thead><tbody>${files.map(f => `<tr data-fid="${esc(f.id)}"><td><input type="checkbox" class="fcb" value="${esc(f.id)}"></td><td class="c-fname" contenteditable="true">${esc(f.name)}</td><td>${esc((Data.KINDS[f.kind === 'van' ? 'inventory' : f.kind] || { label: f.kind }).label)}</td><td>${f.rows}</td><td>${esc(new Date(f.date).toLocaleDateString())}</td></tr>`).join('')}</tbody></table></div>` : '';
  }
  async function deleteFiles() {
    const ids = [...document.querySelectorAll('.fcb:checked')].map(c => c.value); if (!ids.length) return U.toast('Tick a file first');
    if (!await U.confirmBox('Delete files?', `Delete ${ids.length} file(s) and all their rows? Your own items stay.`, 'Delete')) return;
    const s = new Set(ids); ['catalog', 'vehicles', 'inventory'].forEach(k => Store.remove(k, Store.st[k].filter(r => s.has(r.file) && !(k === 'catalog' && Users.isMine(r))).map(r => r.id))); Store.remove('files', ids); renderFiles();
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
    await Store.save(); Lookup.rebuild(Store.st); Store.changed('prefs'); renderFiles(); renderCounts(); renderPrefs(); SheetUI.refresh(); U.toast('Backup restored');
  }
  const theme = () => Store.prefs.theme || (Store.prefs.dark === false ? 'light' : 'dark');
  function renderPrefs() { const p = Store.prefs; $('#pTheme').value = theme(); document.querySelectorAll('[data-rowsize]').forEach(b => b.classList.toggle('on', b.dataset.rowsize === (p.rowSize || 'compact'))); renderCounts(); }
  function renderCounts() {
    const n = Fixes.count(); $('#fixCount').textContent = n ? '(' + n.toLocaleString() + ')' : '';
    const h = Hidden.count(); $('#hidCount').textContent = h ? '(' + h.toLocaleString() + ')' : '';
    renderColList();
  }
  function renderColList() {
    const list = Custom.list(), el = $('#colList'); if (!el) return;
    el.innerHTML = list.length ? `<ul class="collist">${list.map(c => `<li><b>${esc(c.label)}</b> <button type="button" data-cren="${esc(c.id)}">Rename</button> <button type="button" data-cdel="${esc(c.id)}" class="danger">Delete</button></li>`).join('')}</ul>` : '<p class="note">None yet.</p>';
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
    const v = await U.dialog('Add column', '<label class="ed">Name<input id="ccName" placeholder="e.g. Bin location, Cost" autocomplete="off"></label>', [{ label: 'Cancel', value: null }, { label: 'Add', cls: 'primary', value: () => ($('#ccName') || {}).value }]);
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
  function openHelp() {
    const html = $('#helpText') ? $('#helpText').innerHTML : document.querySelector('.help').innerHTML;
    return U.dialog('How to use', html, [{ label: 'Close', value: true }]);
  }
  function init() {
    $('#impFile').addEventListener('change', async e => { for (const f of e.target.files) { try { await importFile(f, $('#impKind').value); } catch (err) { U.toast('Import failed: ' + err.message, true, 8000); } } e.target.value = ''; });
    const fl = $('#fileList');
    fl.addEventListener('click', e => { const h = e.target.closest('[data-fsort]'); if (!h) return; if (fSort === h.dataset.fsort) fDir = -fDir; else { fSort = h.dataset.fsort; fDir = 1; } renderFiles(); });
    fl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
    fl.addEventListener('focusout', e => { const td = e.target; if (!td.classList || !td.classList.contains('c-fname')) return; const f = Store.byId.files.get(td.closest('tr').dataset.fid); const v = td.innerText.replace(/\s+/g, ' ').trim();
      if (f && v && v !== f.name) Store.update('files', f, 'name', v); else if (f) td.textContent = f.name; });
    $('#fileDel').onclick = deleteFiles; $('#bkDown').onclick = backup; $('#bkFile').addEventListener('change', e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; });
    $('#pTheme').onchange = e => { Store.setPref('theme', e.target.value); };
    document.querySelectorAll('[data-rowsize]').forEach(b => { b.onclick = () => { Store.setPref('rowSize', b.dataset.rowsize); renderPrefs(); }; });
    $('#fixBtn').onclick = () => FixesUI.open();
    $('#hidBtn').onclick = () => openHidden();
    $('#colAdd').onclick = () => addColumn();
    $('#colList').addEventListener('click', e => {
      const ren = e.target.dataset.cren, del = e.target.dataset.cdel;
      if (ren) renameColumn(ren); else if (del) deleteColumn(del);
    });
    $('#resetAll').onclick = async () => { if (!await U.confirmBox('Erase everything?', 'Delete ALL data on this phone, including stock, My Fixes, your items, hidden rows and custom columns? Download a backup first.', 'Erase')) return; ['catalog', 'vehicles', 'inventory', 'files'].forEach(k => Store.replaceKind(k)); await Fixes.replaceAll({}); await Hidden.replaceAll({}); await Custom.replaceAll([], {}); await Store.save(); Lookup.rebuild(Store.st); renderFiles(); renderCounts(); SheetUI.refresh(); };
    renderFiles(); renderPrefs();
  }
  G.DataUI = { init, renderFiles, renderPrefs, renderFixCount: renderCounts, renderCounts, importFile, commit, backup, restore, openHidden, openHelp, addColumn };
})(window);
