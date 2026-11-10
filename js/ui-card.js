/* ui-card.js — details card: slides up from the bottom when a sheet row is tapped. Shows every field,
   custom columns, the review reason in plain words, In-stock toggle, Edit, Hide, and (for your items)
   Delete. Supplier edits go to My Fixes; your items are saved on the row itself. Swipe down / tap
   outside / Close = back to the sheet. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  let cur = null, editing = false;
  const SHOW = [['type', 'Type'], ['buttons', 'Buttons'], ['fcc', 'FCC ID'], ['chip', 'Chip'], ['freq', 'Frequency'], ['blade', 'Blade'], ['oem', 'OEM part #'],
    ['supplier', 'Supplier'], ['pn', 'Part #'], ['item', 'Item #'], ['price', 'Price'], ['origYears', "Supplier's years"], ['compatFcc', 'Compatible FCC (electronics)'], ['notes', 'Notes']];
  function fieldRow(r, k, label, val) {
    const e = !Users.isMine(r) && Fixes.edited(r, k), v = val != null ? val : r[k];
    return `<div class="kv"><span class="k">${esc(label)}</span><span class="v${e ? ' fixed' : ''}">${v ? esc(v) : '<span class="blank">—</span>'}${e ? `<span class="was">was: ${esc(e.orig || '(blank)')}</span>` : ''}${e && e.conflict !== undefined ? `<span class="warnline">⚠ Supplier now says: ${esc(e.conflict || '(blank)')}</span>` : ''}</span></div>`;
  }
  function customView(r) { return Custom.list().map(c => fieldRow(r, '', c.label, Custom.val(r.id, c.id))).join(''); }
  function customEdit(r) { return Custom.list().map(c => `<label class="ed">${esc(c.label)}<input data-ck="${c.id}" value="${esc(Custom.val(r.id, c.id))}"></label>`).join(''); }
  function view(r) {
    const q = Stock.qty(r), conf = Fixes.isConfirmed(r), plain = r.review ? Reasons.plain(r.review) : [], mine = Users.isMine(r);
    const head = !mine && ['years', 'make', 'model', 'product'].some(k => Fixes.edited(r, k)) ? `<p class="note fixedtxt">Edited by you: ${['years', 'make', 'model', 'product'].filter(k => Fixes.edited(r, k)).map(k => esc(Fixes.LABELS[k]) + ' (was ' + esc(Fixes.edited(r, k).orig || 'blank') + ')').join(', ')}</p>` : '';
    const fields = mine ? SHOW.filter(([k]) => !['item', 'origYears', 'compatFcc'].includes(k) && (r[k] || k === 'supplier' || k === 'pn' || k === 'type' || k === 'notes')) : SHOW;
    $('#cardBody').innerHTML = `<h2>${esc([r.years, r.make, r.model].filter(Boolean).join(' ') || (mine ? 'My item' : ''))}</h2><p class="pname">${r.product ? esc(r.product) : '<span class="blank">(no product name given)</span>'}${mine ? ' <span class="minebadge">My item</span>' : ''}</p>${head}
      ${r.review ? `<div class="revbox${conf ? ' ok' : ''}"><b>${conf ? 'Confirmed ✓ by you' : 'Needs review'}:</b> ${esc(plain.join(' · '))}<details><summary>Details</summary><p>${esc(r.review)}</p></details></div>` : ''}
      ${fields.map(([k, l]) => fieldRow(r, k, l)).join('')}
      ${customView(r)}
      ${mine ? '' : `<div class="kv"><span class="k">Source link</span><span class="v">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Open supplier page</a>` : '<span class="blank">—</span>'}</span></div>`}`;
    $('#cardFoot').innerHTML = `<label class="stk big"><input type="checkbox" id="cStock" ${q > 0 ? 'checked' : ''}> In stock${q > 1 ? ' (' + q + ')' : ''}</label>
      <button id="cEdit">Edit</button>${!mine && r.review ? `<button id="cConf" class="${conf ? 'ok' : 'primary'}">${conf ? 'Confirmed ✓ (undo)' : 'Confirmed ✓'}</button>` : ''}
      <button id="cHide">Hide</button>${mine ? '<button id="cDel" class="danger">Delete</button>' : ''}`;
  }
  function edit(r) {
    const mine = Users.isMine(r);
    const fields = mine ? Users.fields : Fixes.EDITABLE;
    const lab = k => (Users.LABELS && Users.LABELS[k]) || (Fixes.LABELS && Fixes.LABELS[k]) || k;
    $('#cardBody').innerHTML = `<h2>Edit</h2><p class="note">${mine ? 'This is your item. It stays when you import a new CSV.' : "Your changes go to My Fixes (Settings / Data). The supplier's value is kept too."}</p>` +
      fields.map(k => `<label class="ed">${esc(lab(k))}<input data-ek="${k}" value="${esc(r[k] || '')}"></label>`).join('') + customEdit(r);
    $('#cardFoot').innerHTML = `<button id="cCancel">Cancel</button><button id="cSave" class="primary">Save</button>`;
  }
  function draw() { if (!cur) return; editing ? edit(cur) : view(cur); $('#card').scrollTop = 0; }
  function open(r) { cur = r; editing = false; draw(); const w = $('#cardWrap'); w.hidden = false; requestAnimationFrame(() => w.classList.add('up')); $('#card').scrollTop = 0; document.body.classList.add('carded'); }
  function close() { const w = $('#cardWrap'); w.classList.remove('up'); $('#card').style.transform = ''; document.body.classList.remove('carded'); setTimeout(() => { if (!w.classList.contains('up')) w.hidden = true; }, 220); cur = null; }
  async function saveCustom(r) { for (const i of document.querySelectorAll('#cardBody [data-ck]')) await Custom.setVal(r.id, i.dataset.ck, i.value); }
  function init() {
    $('#cardBack').onclick = close; $('#cX').onclick = close;
    $('#cardFoot').addEventListener('click', async e => {
      const t = e.target, r = cur; if (!r) return;
      if (t.id === 'cClose') return close();
      if (t.id === 'cEdit') { editing = true; return draw(); }
      if (t.id === 'cCancel') { editing = false; return draw(); }
      if (t.id === 'cConf') { await Fixes.confirm(r, !Fixes.isConfirmed(r)); draw(); SheetUI.render(); return; }
      if (t.id === 'cHide') { await Hidden.hide([r.id]); close(); SheetUI.refresh(); return; }
      if (t.id === 'cDel') {
        if (!await U.confirmBox('Delete this item?', 'This removes your item for good (and its in-stock tick, if any). Supplier rows can only be hidden, not deleted.', 'Delete')) return;
        await Users.remove([r.id]); close(); SheetUI.refresh(); return;
      }
      if (t.id === 'cSave') {
        if (Users.isMine(r)) { const o = {}; document.querySelectorAll('#cardBody [data-ek]').forEach(i => { o[i.dataset.ek] = i.value; }); await Users.save(r, o); }
        else { for (const i of document.querySelectorAll('#cardBody [data-ek]')) await Fixes.edit(r, i.dataset.ek, i.value); }
        await saveCustom(r); Lookup.rebuild(Store.st); editing = false; draw(); SheetUI.render();
      }
    });
    $('#cardFoot').addEventListener('change', async e => { if (e.target.id === 'cStock' && cur) { const r = cur; await Stock.set(r, e.target.checked); if (cur === r) draw(); SheetUI.render(); } });
    const card = $('#card'); let y0 = null, dy = 0;
    card.addEventListener('touchstart', e => { y0 = (card.scrollTop <= 0 || e.target.closest('.grab')) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    card.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = `translateY(${dy}px)`; }, { passive: true });
    card.addEventListener('touchend', () => { if (y0 == null) return; card.style.transform = ''; if (dy > 90) close(); y0 = null; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && !$('#dlg').open && !(G.MenuUI && MenuUI.isOpen())) close(); });
  }
  G.Card = { init, open, close, get current() { return cur; } };
})(window);
