/* ui-table.js — reusable spreadsheet-style table: sortable headers (tap to sort), editable cells
   (tap a cell, type, tap away), row checkboxes, and paging (only one page of rows is drawn, so
   10,000 rows stay fast). Used by the Reference and Vehicles tabs.
   Table.create({ el, kind, columns:[{key,label,edit,type:'bool'|'num', get:row=>value (computed column), fmt:value=>text}], rows:()=>array, pageSize, onEdit, rowExtra }) */
(function (G) {
  'use strict';
  const { esc } = U;
  function create(o) {
    const t = { page: 0, sortKey: null, dir: 1, o };
    o.pageSize = o.pageSize || 50;
    t.sorted = () => { const rows = o.rows(); if (!t.sortKey) return rows; const k = t.sortKey, col = o.columns.find(c => c.key === k), num = col.type === 'num', g = col.get || (r => r[k]);
      return rows.slice().sort((a, b) => { const x = g(a), y = g(b); return t.dir * (num ? (+x || 0) - (+y || 0) : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), undefined, { numeric: true })); }); };
    t.render = function () {
      const rows = t.sorted(), pages = Math.max(1, Math.ceil(rows.length / o.pageSize)); if (t.page >= pages) t.page = pages - 1;
      const slice = rows.slice(t.page * o.pageSize, (t.page + 1) * o.pageSize);
      const th = o.columns.map(c => `<th data-sort="${c.key}" class="sortable${t.sortKey === c.key ? (t.dir > 0 ? ' asc' : ' desc') : ''}">${esc(c.label)}</th>`).join('');
      const body = slice.map(r => `<tr data-id="${esc(r.id)}" class="${r.checked ? 'checked' : ''} ${o.rowClass ? o.rowClass(r) : ''}"><td class="cb"><input type="checkbox" class="rowcb" ${r.checked ? 'checked' : ''} aria-label="select row"></td>` +
        o.columns.map(c => c.type === 'bool' ? `<td class="c-${c.key}"><input type="checkbox" class="boolcb" data-k="${c.key}" ${r[c.key] ? 'checked' : ''}></td>`
          : `<td class="c-${c.key}" data-k="${c.key}" ${c.edit ? 'contenteditable="true"' : ''}>${esc(c.fmt ? c.fmt(c.get ? c.get(r) : r[c.key]) : r[c.key])}</td>`).join('') + (o.rowExtra ? `<td class="x">${o.rowExtra(r)}</td>` : '') + '</tr>').join('');
      o.el.innerHTML = `<div class="pager">${pager(rows.length, pages)}</div><div class="tscroll"><table class="sheet"><thead><tr><th class="cb"><input type="checkbox" class="allcb" aria-label="select page"></th>${th}${o.rowExtra ? '<th></th>' : ''}</tr></thead><tbody>${body || `<tr><td colspan="${o.columns.length + 2}" class="empty"></td></tr>`}</tbody></table></div><div class="pager">${pager(rows.length, pages)}</div>`;
    };
    const pager = (n, pages) => `<button data-pg="-1" ${t.page ? '' : 'disabled'}>‹ Prev</button><span>Page ${t.page + 1} of ${pages} · ${n.toLocaleString()} rows</span><button data-pg="1" ${t.page < pages - 1 ? '' : 'disabled'}>Next ›</button>`;
    const rowOf = el => { const tr = el.closest('tr[data-id]'); return tr && Store.byId[o.kind].get(tr.dataset.id); };
    o.el.addEventListener('click', e => {
      const s = e.target.closest('th[data-sort]'); if (s) { const k = s.dataset.sort; if (t.sortKey === k) t.dir = -t.dir; else { t.sortKey = k; t.dir = 1; } t.render(); return; }
      const p = e.target.closest('button[data-pg]'); if (p) { t.page += +p.dataset.pg; t.render(); o.el.scrollIntoView({ block: 'start' }); }
    });
    o.el.addEventListener('change', e => {
      if (e.target.classList.contains('allcb')) { o.el.querySelectorAll('tr[data-id]').forEach(tr => { const r = Store.byId[o.kind].get(tr.dataset.id); if (r) { r.checked = e.target.checked; Store.mark(o.kind, r); } }); t.render(); o.onCheck && o.onCheck(); return; }
      const r = rowOf(e.target); if (!r) return;
      if (e.target.classList.contains('rowcb')) { r.checked = e.target.checked; Store.mark(o.kind, r); e.target.closest('tr').classList.toggle('checked', r.checked); o.onCheck && o.onCheck(); }
      if (e.target.classList.contains('boolcb')) Store.update(o.kind, r, e.target.dataset.k, e.target.checked);
    });
    o.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
    o.el.addEventListener('focusout', e => {
      const td = e.target; if (!td.isContentEditable) return; const r = rowOf(td); if (!r) return;
      const k = td.dataset.k, col = o.columns.find(c => c.key === k); let v = td.innerText.replace(/\s+/g, ' ').trim();
      if (col.type === 'num') v = Data.parseQty(v);
      if (String(v) !== String(r[k] == null ? '' : r[k])) { Store.update(o.kind, r, k, v); o.onEdit && o.onEdit(r, k, v); td.textContent = v; }
    });
    return t;
  }
  G.Table = { create };
})(window);
