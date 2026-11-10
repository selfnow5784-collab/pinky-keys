/* ui-fixes.js — "My Fixes" pop-up (Edit → My Fixes): a basic sheet of the items you reviewed/edited, changed values highlighted
   (original shown under it), flagged fields when a newer supplier CSV changed the same value, and Export CSV to send in. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  const NOTE = 'Export and send this file so it can be combined into the next CSV update.';
  function table() {
    const list = Fixes.all(); if (!list.length) return '<p class="note">No fixes yet. Tap a row in the sheet, then Edit or Confirmed ✓.</p>';
    const base = ['years', 'make', 'model'], extra = [];
    list.forEach(f => Object.keys(f.fields).forEach(k => { if (!base.includes(k) && !extra.includes(k)) extra.push(k); }));
    const cols = base.concat(Fixes.EDITABLE.filter(k => extra.includes(k) && k !== 'product'), ['product']); // changes first, long product name last
    const cell = (f, r, k) => { const e = f.fields[k], v = e ? e.val : (r ? r[k] : (f.snap || {})[k]);
      if (!e) return `<td>${esc(v || '')}</td>`;
      return `<td class="chg">${esc(e.val || '(blank)')}<span class="was">was: ${esc(e.orig || '(blank)')}</span>${e.conflict !== undefined ? `<span class="warnline">⚠ Supplier now: ${esc(e.conflict || '(blank)')}<br><button data-keep="${esc(f.cid)}|${k}">Keep mine</button> <button data-take="${esc(f.cid)}|${k}">Use supplier</button></span>` : ''}</td>`; };
    return `<div class="tscroll"><table class="sheet fixes"><thead><tr>${cols.map(k => `<th>${esc(Fixes.LABELS[k])}</th>`).join('')}<th>Status</th><th></th></tr></thead><tbody>` +
      list.map(f => { const r = Fixes.rowOf(f.cid), st = [f.confirmed ? 'Confirmed ✓' : '', Object.keys(f.fields).length ? 'Edited' : '', f.missing ? 'Not in current CSV' : ''].filter(Boolean).join(', ');
        return `<tr>${cols.map(k => cell(f, r, k)).join('')}<td class="${f.confirmed ? 'okc' : ''}">${esc(st)}</td><td><button data-undo="${esc(f.cid)}" title="Undo this fix">Undo</button></td></tr>`; }).join('') + '</tbody></table></div>';
  }
  function body() { return `<p class="fixnote">${esc(NOTE)}</p><p class="note">${Fixes.count().toLocaleString()} item(s). Highlighted = changed by you.</p><div id="fixTable">${table()}</div>`; }
  const exportCsv = () => { U.download(Fixes.toCSV(), 'pinky-my-fixes-' + U.stamp() + '.csv'); document.body.dataset.fixExported = '1'; };
  async function open() {
    const d = $('#dlg'); const p = U.dialog('My Fixes', body(), [{ label: 'Export CSV', cls: 'primary', keepOpen: true, value: () => { exportCsv(); return false; } }, { label: 'Close', value: true }]);
    d.classList.add('wide');
    const b = $('#dlgBody'); b.onclick = async e => {
      const t = e.target; let m;
      if ((m = t.dataset.undo)) { if (!await confirmInline('Undo this fix and go back to the supplier values?')) return; await Fixes.remove(m); }
      else if ((m = t.dataset.keep)) { const [c, k] = m.split('|'); await Fixes.resolve(c, k, true); }
      else if ((m = t.dataset.take)) { const [c, k] = m.split('|'); await Fixes.resolve(c, k, false); }
      else return;
      Lookup.rebuild(Store.st); $('#dlgBody').innerHTML = body(); SheetUI.render(); DataUI.renderFixCount();
    };
    await p; d.classList.remove('wide'); b.onclick = null;
  }
  const confirmInline = msg => Promise.resolve(window.confirm(msg));
  G.FixesUI = { open, exportCsv, NOTE };
})(window);
