/* ui-vehicles.js — Vehicle Reference tab: chip/transponder per make-model-year, its own table
   (separate from the key catalog; chips are not stock, so no In stock column). Search, sort, edit cells, add/delete rows, export visible rows. */
(function (G) {
  'use strict';
  const { $ } = U;
  const COLS = [{ key: 'make', label: 'Make', edit: true }, { key: 'model', label: 'Model', edit: true }, { key: 'years', label: 'Years', edit: true },
    { key: 'chip', label: 'Transponder / chip', edit: true }, { key: 'strattec', label: 'Strattec', edit: true }, { key: 'notes', label: 'Notes', edit: true }];
  let table;
  function visibleRows() {
    const t = $('#vehFilter').value.trim(); let rows = Store.st.vehicles;
    if (t && Lookup.L) { const s = new Set(Search.run(t, Lookup.L.veh, Lookup.L.vocab).hits.map(e => e.r.id)); rows = rows.filter(r => s.has(r.id)); }
    if ($('#vehChecked').checked) rows = rows.filter(r => r.checked);
    return rows;
  }
  const render = () => table.render();
  function init() {
    table = Table.create({ el: $('#vehTable'), kind: 'vehicles', columns: COLS, rows: visibleRows, pageSize: 50 });
    $('#vehFilter').addEventListener('input', U.debounce(() => { table.page = 0; render(); }, 200)); $('#vehChecked').addEventListener('change', render);
    $('#vehAdd').onclick = () => { Store.add('vehicles', [{ make: '', model: '', years: '', chip: 'NEW – edit me', strattec: '', notes: '', checked: true }]); $('#vehChecked').checked = true; render(); };
    $('#vehDel').onclick = async () => { const ids = Store.st.vehicles.filter(r => r.checked).map(r => r.id); if (!ids.length) return U.toast('Check some rows first');
      if (await U.confirmBox('Delete rows?', `Delete ${ids.length} checked rows?`, 'Delete')) { Store.remove('vehicles', ids); render(); } };
    $('#vehExport').onclick = () => { const rows = visibleRows(); U.download(CSV.unparse(rows.map(r => ({ Make: r.make, Model: r.model, Year: r.years, 'Transponder Key': r.chip, STRATTEC: r.strattec, Notes: r.notes })), ['Make', 'Model', 'Year', 'Transponder Key', 'STRATTEC', 'Notes']), 'vehicle-ref-visible-' + U.stamp() + '.csv'); U.toast(`Exported ${rows.length} visible rows`); };
  }
  G.VehiclesUI = { init, render, visibleRows };
})(window);
