/* ui-card.js (v3.9-7) — details card: slides up from the bottom when a sheet row is tapped.
   v3.9-7 labels: Supplier = who you buy from (AKS / UHS / KI), Item # = that store's number, Strattec # = only Strattec
   numbers (a "STR-691643" part # shows here as 691643, not as Part #), OEM # = the car maker's number. Blank lines are
   hidden; Notes leave out what already has its own line (FCC, chip, freq, blade, PN, price, source). No "Source link" or
   "Supplier's years" lines. Link stays clickable when a real http(s) URL is there.
   Shows
   the review reason in plain words, In-stock toggle, Edit, Hide, and (for your items)
   Delete. Supplier edits go to My Fixes; your items are saved on the row itself. Swipe down / tap
   outside / Close = back to the sheet. */
(function (G) {
  'use strict';
  const { $, esc } = U;
  let cur = null, editing = false;
  const SHOW = [['type', 'Type'], ['buttons', 'Buttons'], ['fcc', 'FCC ID'], ['chip', 'Chip'], ['freq', 'Frequency'], ['blade', 'Blade'], ['oem', 'OEM #'],
    ['strattec', 'Strattec #'], ['keyType', 'Key type'],
    ['supplier', 'Supplier'], ['pn', 'Part #'], ['item', 'Item #'], ['price', 'Price'], ['compatFcc', 'Compatible FCC (electronics)'], ['notes', 'Notes']];
  const toks = v => String(v || '').split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean);
  const isStr = t => /^STR-?\s*\d/i.test(t);
  const strNum = t => t.replace(/^STR-?\s*/i, '');
  // Strattec # = Strattec column + any STR- numbers sitting in the part # (no duplicates). Part # = what is left.
  function strattecOf(r) { const out = []; toks(r.strattec).map(strNum).concat(toks(r.pn).filter(isStr).map(strNum), toks(r.spn).filter(isStr).map(strNum)).forEach(t => { if (!out.includes(t)) out.push(t); }); return out.join(', '); }
  const partOf = r => toks(r.pn).filter(t => !isStr(t)).join(', ');
  function supplierOf(r) { if (Users.isMine(r)) return 'My item'; const c = CatalogFile.supplierCode(r), n = CatalogFile.NAME[c];
    return n ? (c === 'UHS' ? 'UHS' : c + ' (' + n + ')') : (r.supplier || r.src || ''); }
  const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  // Notes without the parts that already have their own line on the card
  function notesOf(r) {
    if (Users.isMine(r) || Fixes.edited(r, 'notes')) return r.notes || '';
    const pnAll = toks(r.pn).concat(toks(r.spn)).map(norm), fx = k => { const e = Fixes.edited(r, k); return e ? norm(e.orig) : null; };
    const same = (k, v) => { const n = norm(v); if (!n) return true;
      if (k === 'pn') return norm(r.pn) === n || norm(r.spn) === n || toks(v).every(t => pnAll.includes(norm(t)));
      if (k === 'source') return !!CatalogFile.supplierCode(r) && (norm(CatalogFile.supplierCode(r)) === n || norm(r.src) === n || norm(r.supplier) === n);
      const f = { fcc: 'fcc', chip: 'chip', freq: 'freq', blade: 'blade', price: 'price' }[k]; if (!f) return false;
      const unit = x => f === 'freq' ? String(x || '').replace(/mhz$/, '') : x; // "Freq: 315" repeats "315 MHz"
      return unit(norm(r[f])) === unit(n) || (fx(f) != null && unit(fx(f)) === unit(n)); };
    return String(r.notes || '').split(/;\s*/).map(x => x.trim()).filter(Boolean).filter(p => { const m = p.match(/^(\w+):\s*(.*)$/); return !(m && same(m[1].toLowerCase(), m[2])); }).join('; ');
  }
  function shown(r, k) {
    if (k === 'strattec') return strattecOf(r); if (k === 'pn') return partOf(r); if (k === 'supplier') return supplierOf(r); if (k === 'notes') return notesOf(r);
    return r[k] || '';
  }
  function fieldRow(r, k, label, val) {
    const e = !Users.isMine(r) && Fixes.edited(r, k), v = val != null ? val : r[k];
    if (!v && !e) return ''; // v3.9-7: blank lines hidden (an edit you made to blank still shows)
    return `<div class="kv"><span class="k">${esc(label)}</span><span class="v${e ? ' fixed' : ''}">${v ? esc(v) : '<span class="blank">—</span>'}${e ? `<span class="was">was: ${esc(e.orig || '(blank)')}</span>` : ''}${e && e.conflict !== undefined ? `<span class="warnline">⚠ Supplier now says: ${esc(e.conflict || '(blank)')}</span>` : ''}</span></div>`;
  }
  function sourceRow(label, val) {
    if (!val) return '';
    return `<div class="kv src"><span class="k">${esc(label)}</span><span class="v">${esc(val)}</span></div>`;
  }
  function linkRow(label, val) {
    const parts = String(val || '').split(/\s*;\s*/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return '';
    const inner = parts.length
      ? parts.map(u => /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>` : esc(u)).join('; ')
      : '<span class="blank">—</span>';
    return `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${inner}</span></div>`;
  }
  function view(r) {
    const q = Stock.qty(r), conf = Fixes.isConfirmed(r), plain = r.review ? Reasons.plain(r.review) : [], mine = Users.isMine(r);
    const head = !mine && ['years', 'make', 'model', 'product'].some(k => Fixes.edited(r, k)) ? `<p class="note fixedtxt">Edited by you: ${['years', 'make', 'model', 'product'].filter(k => Fixes.edited(r, k)).map(k => esc(Fixes.LABELS[k]) + ' (was ' + esc(Fixes.edited(r, k).orig || 'blank') + ')').join(', ')}</p>` : '';
    const fields = mine ? SHOW.filter(([k]) => !['item', 'compatFcc'].includes(k)) : SHOW;
    $('#cardBody').innerHTML = `<h2>${esc([r.years, r.make, r.model].filter(Boolean).join(' ') || (mine ? 'My item' : ''))}</h2><p class="pname">${r.product ? esc(r.product) : '<span class="blank">(no product name given)</span>'}${mine ? ' <span class="minebadge">My item</span>' : ''}</p>${head}
      ${r.review ? `<div class="revbox${conf ? ' ok' : ''}"><b>${conf ? 'Confirmed ✓ by you' : 'Needs review'}:</b> ${esc(plain.join(' · '))}<details><summary>Details</summary><p>${esc(r.review)}</p></details></div>` : ''}
      ${fields.map(([k, l]) => { const v = shown(r, k); return fieldRow(r, k, l, v) + (k === 'oem' && r.oem ? sourceRow('OEM source', r.oemSource) : '') + (k === 'strattec' && v ? sourceRow('Strattec source', r.strattecSource) : ''); }).join('')}
      ${mine ? '' : linkRow('Link', r.productUrl || r.url || '')}`;
    $('#cardFoot').innerHTML = `<label class="stk big"><input type="checkbox" id="cStock" ${q > 0 ? 'checked' : ''}> In stock${q > 1 ? ' (' + q + ')' : ''}</label>
      <button id="cEdit">Edit</button>${!mine && r.review ? `<button id="cConf" class="${conf ? 'ok' : 'primary'}">${conf ? 'Confirmed ✓ (undo)' : 'Confirmed ✓'}</button>` : ''}
      <button id="cHide">Hide</button>${mine ? '<button id="cDel" class="danger">Delete</button>' : ''}`;
  }
  function edit(r) {
    const mine = Users.isMine(r);
    const fields = mine ? Users.fields : Fixes.EDITABLE;
    const lab = k => (Users.LABELS && Users.LABELS[k]) || (Fixes.LABELS && Fixes.LABELS[k]) || k;
    $('#cardBody').innerHTML = `<h2>Edit</h2><p class="note">${mine ? 'This is your item. It stays when you import a new CSV.' : "Your changes go to My Fixes (Data). The supplier's value is kept too."}</p>` +
      fields.map(k => `<label class="ed">${esc(lab(k))}<input data-ek="${k}" value="${esc(r[k] || '')}"></label>`).join('');
    $('#cardFoot').innerHTML = `<button id="cCancel">Cancel</button><button id="cSave" class="primary">Save</button>`;
  }
  function draw() { if (!cur) return; editing ? edit(cur) : view(cur); $('#card').scrollTop = 0; }
  function open(r) { cur = r; editing = false; draw(); const w = $('#cardWrap'); w.hidden = false; requestAnimationFrame(() => w.classList.add('up')); $('#card').scrollTop = 0; document.body.classList.add('carded'); }
  function close() { const w = $('#cardWrap'); w.classList.remove('up'); $('#card').style.transform = ''; document.body.classList.remove('carded'); setTimeout(() => { if (!w.classList.contains('up')) w.hidden = true; }, 220); cur = null; }
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
        Lookup.rebuild(Store.st); editing = false; draw(); SheetUI.render();
      }
    });
    $('#cardFoot').addEventListener('change', async e => { if (e.target.id === 'cStock' && cur) { const r = cur; await Stock.set(r, e.target.checked); if (cur === r) draw(); SheetUI.render(); } });
    const card = $('#card'); let y0 = null, dy = 0;
    card.addEventListener('touchstart', e => { y0 = (card.scrollTop <= 0 || e.target.closest('.grab')) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    card.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = `translateY(${dy}px)`; }, { passive: true });
    card.addEventListener('touchend', () => { if (y0 == null) return; card.style.transform = ''; if (dy > 90) close(); y0 = null; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && !$('#dlg').open && !(G.MenuUI && MenuUI.isOpen())) close(); });
  }
  G.Card = { init, open, close, strattecOf, partOf, supplierOf, notesOf, get current() { return cur; } };
})(window);
