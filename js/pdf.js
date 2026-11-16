/* pdf.js (v3.9-7) — File → Share: makes a PDF of the current data view (the rows on the sheet now, or the ticked rows,
   with the columns on screen) right on the phone, no internet. Then opens the phone's / computer's send options
   (Web Share with the file). If this browser cannot share files, the PDF is downloaded instead.
   Plain PDF 1.4, Helvetica, landscape Letter, header row repeated on every page. */
(function (G) {
  'use strict';
  // Helvetica widths (1/1000 em) for chars 32..126
  const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  // Unicode -> WinAnsi byte for the few non-ASCII characters that show up in the catalog
  const WIN = { '\u2014': 0x97, '\u2013': 0x96, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93, '\u201d': 0x94, '\u2022': 0x95, '\u2026': 0x85, '\u20ac': 0x80, '\u2122': 0x99 };
  function win(s) { let o = ''; for (const ch of String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ')) { const c = ch.charCodeAt(0);
      if (c >= 32 && c < 127) o += ch; else if (c >= 160 && c < 256) o += ch; else if (WIN[ch]) o += String.fromCharCode(WIN[ch]); else if (ch === '\u2713') o += 'v'; else o += '?'; } return o; }
  const cw = (ch, bold) => { const c = ch.charCodeAt(0); return c >= 32 && c < 127 ? (bold ? WB : W)[c - 32] : 556; };
  const width = (s, size, bold) => { let w = 0; for (const ch of s) w += cw(ch, bold); return w * size / 1000; };
  function fit(s, max, size, bold) { if (width(s, size, bold) <= max) return s; const ell = '\x85'; let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (width(s.slice(0, m) + ell, size, bold) <= max) lo = m; else hi = m - 1; } return s.slice(0, lo) + ell; }
  const pstr = s => '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
  // build({ title, meta, headers:[..], rows:[[..]] }) -> Uint8Array (PDF bytes)
  function build(doc) {
    const PW = 792, PH = 612, M = 28, FS = 7, HFS = 7, LH = 9.6, top = PH - M;
    const heads = doc.headers.map(win), rows = doc.rows.map(r => r.map(win));
    // column widths: by content (sampled), scaled to the page width
    const sample = rows.slice(0, 400), want = heads.map((h, i) => Math.min(220, Math.max(width(h, HFS, true) + 6, ...sample.map(r => width(r[i] || '', FS) + 6), 24)));
    const total = want.reduce((a, b) => a + b, 0), avail = PW - 2 * M, scale = total > avail ? avail / total : 1, colW = want.map(w => w * scale);
    const pages = []; let ops = [], y = 0, pageNo = 0;
    const text = (x, yy, s, bold, size) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pstr(s)} Tj ET`);
    function header() {
      y = top;
      if (pageNo === 0) { text(M, y - 11, win(doc.title), true, 12); y -= 16; text(M, y - 8, fit(win(doc.meta), avail, 7.5), false, 7.5); y -= 14; }
      ops.push('0.85 g'); ops.push(`${M} ${(y - LH - 1).toFixed(2)} ${avail.toFixed(2)} ${(LH + 2).toFixed(2)} re f`); ops.push('0 g');
      let x = M; heads.forEach((h, i) => { text(x + 2, y - LH + 1.5, fit(h, colW[i] - 4, HFS, true), true, HFS); x += colW[i]; }); y -= LH + 2;
    }
    function finish() { ops.push(`BT /F1 7 Tf ${(PW - M - 60).toFixed(2)} ${(M - 14).toFixed(2)} Td ${pstr('Page ' + (pageNo + 1))} Tj ET`); pages.push(ops.join('\n')); ops = []; pageNo++; }
    header();
    rows.forEach((r, ri) => {
      if (y - LH < M) { finish(); header(); }
      if (ri % 2) { ops.push('0.94 g'); ops.push(`${M} ${(y - LH + 0.5).toFixed(2)} ${avail.toFixed(2)} ${LH.toFixed(2)} re f`); ops.push('0 g'); }
      let x = M; r.forEach((c, i) => { if (c) text(x + 2, y - LH + 2.5, fit(c, colW[i] - 4, FS), false, FS); x += colW[i]; }); y -= LH;
    });
    if (!rows.length) { text(M, y - LH, '(no rows)', false, FS); }
    finish();
    // objects: 1 catalog, 2 pages, 3 F1, 4 F2, then page+content pairs
    const objs = [], kids = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((c, i) => { const p = 5 + i * 2, k = p + 1; kids.push(p + ' 0 R');
      objs[p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${k} 0 R >>`;
      objs[k] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`; });
    objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
    objs.push(`<< /Title ${pstr(win(doc.title))} /Producer (Pinky's Auto Reference) >>`); const info = objs.length - 1;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
    for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return { bytes, pages: pages.length };
  }
  // the current data view as a PDF document
  function currentView() {
    const cols = SheetUI.visCols(), rs = SheetUI.wantRows(), q = (document.getElementById('q') || {}).value || '', f = SheetUI.chipsSummary();
    const meta = `Shared ${new Date().toLocaleString()} · Search: ${q.trim() || '(none)'} · Filters: ${f.join(', ') || '(none)'} · ${rs.length.toLocaleString()} rows${SheetUI.state.sel.size ? ' (selected)' : ''}`;
    return { title: "Pinky's Auto Reference and Inventory", meta, headers: cols.map(c => c.label),
      rows: rs.map(r => cols.map(c => (c.key === 'years' && Fixes.needsReview(r) ? '\u2022 ' : '') + SheetUI.displayVal(r, c))) };
  }
  // send it: Web Share with the PDF file, else download. Runs synchronously up to navigator.share so the tap still counts.
  function share() {
    const doc = currentView(), out = build(doc), name = 'pinky-view-' + U.stamp() + '.pdf';
    const blob = new Blob([out.bytes], { type: 'application/pdf' });
    G.__lastPdf = { name, rows: doc.rows.length, pages: out.pages, size: blob.size };
    const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); document.body.dataset.shared = 'download'; return 'download'; };
    let file = null; try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { file = null; }
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: doc.title, text: doc.meta }).then(() => { document.body.dataset.shared = 'share'; return 'share'; },
        e => { if (e && e.name === 'AbortError') { document.body.dataset.shared = 'cancelled'; return 'cancelled'; } return download(); });
    }
    return Promise.resolve(download());
  }
  function shareView() {
    const n = SheetUI.wantRows().length;
    if (n > 1000) return U.dialog('Share ' + n.toLocaleString() + ' rows?', '<p>That is a big PDF. Search or filter first to send less.</p>', [{ label: 'Cancel', value: false }, { label: 'Make PDF anyway', value: true }]).then(ok => ok ? share() : null);
    return share();
  }
  G.PDF = { build, currentView, share, shareView, win };
})(window);
