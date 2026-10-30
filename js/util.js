/* util.js — small shared helpers: $, esc (HTML-escape), toast, dialog/confirm, download, debounce. */
(function (G) {
  'use strict';
  const $ = (s, root) => (root || document).querySelector(s);
  const esc = v => v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  let tt;
  // v3.4: no info messages. Only errors (isErr) are shown, e.g. "Save failed", "Import failed"; info toasts are ignored.
  function toast(msg, isErr, ms) { if (!isErr) return; const t = $('#toast'); t.textContent = msg; t.className = 'show' + (isErr ? ' err' : ''); clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, ms || 3500); }
  // dialog(title, bodyHtml, [{label, value, cls}]) -> Promise(value of clicked button, or null)
  function dialog(title, body, buttons) {
    const d = $('#dlg'); $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = body;
    const f = $('#dlgFoot'); f.innerHTML = '';
    return new Promise(res => {
      (buttons || [{ label: 'OK', value: true }]).forEach(b => { const btn = document.createElement('button'); btn.textContent = b.label; btn.className = b.cls || '';
        btn.onclick = () => { const v = typeof b.value === 'function' ? b.value() : b.value; if (v === false && b.keepOpen) return; d.close(); res(v); }; f.appendChild(btn); });
      d.oncancel = () => res(null); d.showModal(); // (not onclose: a stale close event would cancel the next dialog)
    });
  }
  const confirmBox = (title, text, ok) => dialog(title, '<p>' + esc(text) + '</p>', [{ label: 'Cancel', value: false }, { label: ok || 'OK', value: true, cls: 'danger' }]);
  function download(text, name, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  G.U = { $, esc, toast, dialog, confirmBox, download, stamp, debounce };
})(window);
