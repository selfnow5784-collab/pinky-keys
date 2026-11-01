/* ui-review.js — Review tab: supplier rows flagged as unverified (Review column not blank), from catalog.csv.
   Editable + sortable like Reference. Clearing the Review cell = you checked the row (it then counts as normal).
   Filter = plain text match on any column. */
(function (G) {
  'use strict';
  const { $ } = U; let table;
  const COLS = ['src:Source', 'make:Make', 'model:Model', 'years:Years', 'product:Product', 'fcc:FCC ID', 'chip:Chip', 'freq:Frequency', 'pn:Part #', 'price:Price', 'review:Review']
    .map(x => { const [key, label] = x.split(':'); return { key, label, edit: true }; });
  let keep = new Set(); // rows stay listed until the tab is reopened, so clearing Review doesn't make them jump away
  function rows() {
    const t = $('#revFilter').value.trim().toLowerCase();
    return Store.st.catalog.filter(r => (r.review || keep.has(r.id)) && (!t || COLS.some(c => String(r[c.key] || '').toLowerCase().includes(t))));
  }
  function render() { keep = new Set(Store.st.catalog.filter(r => r.review).map(r => r.id)); table.render(); }
  function init() {
    table = Table.create({ el: $('#revTable'), kind: 'catalog', columns: COLS, rows, pageSize: 50 });
    $('#revFilter').addEventListener('input', U.debounce(() => { table.page = 0; table.render(); }, 200));
  }
  G.ReviewUI = { init, render };
})(window);
