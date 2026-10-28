/* Small local CSV parser/writer (no internet needed).
   Handles quoted fields, commas and line breaks inside quotes, "" escapes,
   a UTF-8 BOM, CRLF / LF / CR line endings, and auto-detects ; or tab separators. */
(function (global) {
  function detectDelimiter(text) {
    const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const ch of firstLine) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch in counts) counts[ch]++;
    }
    let best = ',';
    for (const d in counts) if (counts[d] > counts[best]) best = d;
    return best;
  }
  function parseRows(text, delim) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    delim = delim || detectDelimiter(text);
    const rows = []; let row = []; let field = ''; let i = 0; let inQuotes = false; const n = text.length;
    while (i < n) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field.trim() === '') { field = ''; inQuotes = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
  }
  // Returns { headers: [...], data: [ {header: value} ], rawRows }
  function parse(text) {
    const rows = parseRows(text);
    if (!rows.length) return { headers: [], data: [] };
    const headers = rows[0].map(h => h.trim());
    const data = rows.slice(1).map(r => {
      const o = {};
      headers.forEach((h, idx) => { if (h) o[h] = r[idx] !== undefined ? r[idx] : ''; });
      return o;
    });
    return { headers, data };
  }
  function esc(v) {
    if (v === null || v === undefined) v = '';
    v = String(v);
    return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function unparse(rows, headers) {
    const lines = [headers.map(esc).join(',')];
    rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }
  global.CSV = { parse, parseRows, unparse };
})(typeof window !== 'undefined' ? window : globalThis);
