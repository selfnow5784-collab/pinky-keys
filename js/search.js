/* search.js — the search brain (no DOM, also runs in Node for tests).
   Turns free text like "2014 chevy camaro ss" into: years, makes, models, free words.
   Handles make/model aliases, typos (edit distance), plurals, "f 150"/"rav 4" joins,
   2-digit years ('14 / 14), year ranges (2010-2016, 2012+), trims (ss, ex, xlt are ignored),
   chip spellings (id 46 / philips 46 / hitag2), and models cut off in the source CSV ("F-").
   Main calls: Search.buildIndex(rows, opts) once per data change, then Search.run(text, index). */
(function (G) {
  'use strict';
  const CUR = new Date().getFullYear();
  const norm = s => (s == null ? '' : String(s)).replace(/\u00a0/g, ' ').trim().toLowerCase();
  const compact = s => norm(s).replace(/[^a-z0-9]/g, '');

  // ---- make aliases (typed word -> canonical make, compact form) ----
  const MAKE_ALIAS = { chevy: 'chevrolet', chev: 'chevrolet', vw: 'volkswagen', volkswagon: 'volkswagen', benz: 'mercedes',
    mercedesbenz: 'mercedes', mb: 'mercedes', merc: 'mercedes', caddy: 'cadillac', olds: 'oldsmobile', landrover: 'landrover',
    infinity: 'infiniti', mitsu: 'mitsubishi', toyta: 'toyota', hundai: 'hyundai', hyundia: 'hyundai', vauxhall: 'vauxhall' };
  const canonMake = s => { const c = compact(s); return MAKE_ALIAS[c] || c; };
  const MAKE_FAMILY = { dodge: ['ram'], ram: ['dodge'], gmc: [], chevrolet: [] }; // Ram trucks were Dodge before 2010
  // ---- model aliases (compact typed -> compact models it may mean) ----
  const MODEL_ALIAS = { e150: ['eseries'], e250: ['eseries'], e350: ['eseries'], e450: ['eseries'], econoline: ['eseries'],
    f150raptor: ['f150raptor'], raptor: ['f150raptor'], rav: ['rav4'], crv: ['crv'], hrv: ['hrv'], cherokee: ['cherokee'],
    pickup: [], rx330: ['rx', 'rx330'], rx350: ['rx', 'rx350'], es330: ['es', 'es330'], es350: ['es', 'es350'], es300: ['es', 'es300'],
    silverado: ['silverado', 'silverado1500'], sierra: ['sierra', 'sierra1500'], c300: ['cclass', 'c300'], fobik: [] };
  const TRIMS = new Set(['ss', 'ex', 'exl', 'lx', 'dx', 'se', 'le', 'xle', 'xlt', 'lt', 'ls', 'ltz', 'lariat', 'sport', 'limited',
    'touring', 'base', 'gt', 'si', 'sv', 'sl', 'sr', 'sr5', 'trd', 'platinum', 'premium', 'xl', 'stx', 'fx4', 'king', 'ranch', 'denali', 'slt', 'sxt', 'rt', 'srt', 'hybrid']);
  const STOP = new Set(['key', 'keys', 'for', 'the', 'a', 'an', 'my', 'lost', 'all', 'do', 'i', 'have', 'it', 'van', 'in', 'need', 'inventory', 'stock', 'hand', 'on',
    'spare', 'copy', 'car', 'truck', 'what', 'of', 'and', 'with', 'is', 'we', 'you', 'got', 'any', 'make', 'new', 'one', 'cut', 'program']);
  const TYPE_WORDS = { smart: 'prox', prox: 'prox', proximity: 'prox', push: 'prox', pushstart: 'prox', start: 'prox', intelligent: 'prox',
    fob: 'remote', remote: 'remote', flip: 'flip', switchblade: 'flip', transponder: 'transponder', chip: 'transponder', blade: 'blade', emergency: 'blade' };
  const TYPE_RE = { prox: /smart|prox|intelligent|push|keyless go|ikey/, remote: /remote|fob|keyless/, flip: /flip|switchblade/,
    transponder: /transp|chip|\bid ?\d\d\b|4d ?\d\d|philips|megamos|hitag/, blade: /blade|emergency|mechanical/ };

  // ---- years ----
  function y2(n) { n = parseInt(n, 10); return n >= 50 ? 1900 + n : 2000 + n; }
  // "2010-2016", "2010–16", "2012+", "2012-up", "-2005", "10-16", "2010", "2004, 2006-2008" -> [[start,end],...]
  function yearSpans(str) {
    if (!str) return [];
    const s = String(str).toLowerCase().replace(/[–—]/g, '-').replace(/\bto\b|thru|through/g, '-');
    const spans = [], used = []; let m;
    const take = (a, b, i, len) => { spans.push([a, b]); used.push([i, i + len]); };
    const isUsed = i => used.some(([a, b]) => i >= a && i < b);
    for (m of s.matchAll(/(\d{4})\s*-\s*(\d{4})/g)) take(+m[1], +m[2], m.index, m[0].length);
    for (m of s.matchAll(/(\d{4})\s*-\s*(\d{2})(?!\d)/g)) if (!isUsed(m.index)) take(+m[1], Math.floor(+m[1] / 100) * 100 + +m[2], m.index, m[0].length);
    for (m of s.matchAll(/(\d{4})\s*(\+|-\s*(?:up|present|now|newer)?(?=\s|$|[^\d\w])|and up|& up|up|or newer|newer|-\s*$)/g)) if (!isUsed(m.index)) take(+m[1], CUR + 1, m.index, m[0].length);
    for (m of s.matchAll(/(?:^|[^\d])(?:-|up to|before|pre)\s*(\d{4})/g)) { const i = m.index + m[0].indexOf(m[1]); if (!isUsed(i)) take(1900, +m[1], i, 4); }
    for (m of s.matchAll(/(?:^|[^\d'])(\d{2})\s*-\s*(\d{2})(?![\d])/g)) { const i = m.index + m[0].indexOf(m[1]); if (!isUsed(i)) { let a = y2(m[1]), b = y2(m[2]); if (b < a) b += 100; take(a, b, i, m[0].length); } }
    for (m of s.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) if (!isUsed(m.index)) take(+m[1], +m[1], m.index, 4);
    return spans.filter(([a, b]) => a >= 1900 && a <= 2100 && b >= a);
  }

  // ---- typo distance (Damerau-Levenshtein, early exit) ----
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) { let rowMin = 99;
      for (let j = 1; j <= b.length; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]); }
      if (rowMin > max) return max + 1; }
    return d[a.length][b.length];
  }
  const maxTypos = t => t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0;

  // ---- chip spellings -> extra search tags ----
  function chipTags(t) {
    const tags = [];
    if (/philips\s*(crypto\s*2|46)|hitag\s*2(?!\d)|\bid\s*-?\s*46\b|pcf\s*79(36|41|46|47|52)|\b46\s*chip/.test(t)) tags.push('id46', 'philips46', 'hitag2');
    if (/megamos\s*(id\s*)?13|\bid\s*-?\s*13\b|\btp05\b/.test(t)) tags.push('id13', 'megamos13');
    if (/megamos\s*(crypto|48)|\bid\s*-?\s*48\b/.test(t)) tags.push('id48', 'megamos48');
    let m; const re = /4d\s*-?\s*(\d\d)/g; while ((m = re.exec(t))) tags.push('4d' + m[1]);
    if (/dst\s*-?\s*80|80\s*-?\s*bit/.test(t)) tags.push('dst80', '80bit'); if (/128\s*-?\s*bit/.test(t)) tags.push('128bit');
    return tags.join(' ');
  }
  // Model names that are cut off in the source (e.g. "F-", "CX-", "2500-", RAM "1", Chrysler "2"/"3").
  const isTruncModel = (make, model) => /[-\/]$/.test(String(model).trim()) || (/^\d$/.test(String(model).trim()) && /^(ram|chrysler)$/.test(canonMake(make)));

  /* Build a search index. rows: objects; opts.get(row) -> {make, model, years, text}. */
  function buildIndex(rows, opts) {
    const entries = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const f = opts.get(rows[i]); const text = norm(f.text);
      entries[i] = { r: rows[i], mk: f.make ? canonMake(f.make) : '', md: compact(f.model), trunc: f.model ? isTruncModel(f.make, f.model) : false,
        spans: f.years === '*' ? null : yearSpans(f.years), anyModel: !f.model,
        textOnly: !!f.textOnly, hay: ' ' + (text + ' ' + chipTags(text)).split(/[^a-z0-9]+/).join(' ') + ' ', hayc: compact(text) };
    }
    return { entries };
  }
  /* Vocabulary (all makes / models seen) so parse() can tell makes from models from free words. */
  function buildVocab(indexes) {
    const makes = new Set(), models = new Set(), trunc = new Set(), modelMakes = new Map();
    indexes.forEach(ix => ix.entries.forEach(e => { if (e.mk) makes.add(e.mk); if (e.md) { models.add(e.md); if (e.trunc) trunc.add(e.md);
      if (e.mk) { if (!modelMakes.has(e.md)) modelMakes.set(e.md, new Set()); modelMakes.get(e.md).add(e.mk); } } }));
    Object.values(MAKE_ALIAS).forEach(m => makes.add(m));
    return { makes, models: [...models], modelSet: models, trunc: [...trunc], modelMakes };
  }

  function fuzzyFind(t, list) { const mx = maxTypos(t); if (!mx) return []; let best = mx + 1, out = [];
    for (const w of list) { if (Math.abs(w.length - t.length) > mx) continue; const d = dist(t, w, mx); if (d < best) { best = d; out = [w]; } else if (d === best) out.push(w); }
    return best <= mx ? out : []; }

  function modelCandidates(t, V) {
    if (V.modelSet.has(t)) return MODEL_ALIAS[t] ? [...new Set([t, ...MODEL_ALIAS[t]])] : [t];
    if (MODEL_ALIAS[t] && MODEL_ALIAS[t].length) return MODEL_ALIAS[t];
    if (t.length >= 3) { const pre = V.models.filter(m => m.startsWith(t)); if (pre.length) return pre; }
    if (V.trunc.some(m => t.startsWith(m) && /^\d{1,4}[a-z]{0,2}$/.test(t.slice(m.length)))) return [t];
    if (t.length >= 4 && t.endsWith('s') && V.modelSet.has(t.slice(0, -1))) return [t.slice(0, -1)];
    const ld = t.match(/^([a-z]{1,4})(\d{2,4})[a-z]?$/); if (ld && V.modelSet.has(ld[1])) return [ld[1], t];
    return null;
  }

  /* Parse typed text. Returns {years, makes, models:[[cands]], free, soft, ignored, notes}. */
  function parse(text, V) {
    let raw = norm(text).replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
    const q = { years: [], makes: [], models: [], free: [], soft: [], ignored: [], notes: [] };
    // join "id 46", "f 150", "rav 4", "grand cherokee", "es 330", "mazda3"-style pieces
    const toks = [];
    for (let i = 0; i < raw.length; i++) {
      const a = compact(raw[i]), b = raw[i + 1] != null ? compact(raw[i + 1]) : null, c = raw[i + 2] != null ? compact(raw[i + 2]) : null;
      if (b && /^(id|pcf|tp|4d|philips|megamos|hitag)$/.test(a) && /^\d/.test(b)) { toks.push(a + b); i++; continue; }
      if (b && c && V.modelSet.has(a + b + c)) { toks.push(a + b + c); i += 2; continue; }
      if (b && !V.makes.has(canonMake(a)) && !/^\d{4}$/.test(b) && (V.modelSet.has(a + b) || MODEL_ALIAS[a + b] || modelCandidates(a + b, V) && /^\d/.test(b) && a.length <= 3)) { toks.push(a + b); i++; continue; }
      toks.push(raw[i]);
    }
    if (toks.length === 1 && /^[a-z0-9]{1,2}$/i.test(toks[0]) && !V.makes.has(canonMake(toks[0]))) { q.prefix = compact(toks[0]); return q; } // first letters typed
    const hasVehicleWord = toks.some(t => { const c = compact(t); return V.makes.has(canonMake(c)) || modelCandidates(c, V); });
    for (const tok of toks) {
      const t = compact(tok); if (!t) continue;
      if (/^\d{4}$/.test(t) && +t >= 1950 && +t <= CUR + 2) { q.years.push(+t); continue; }
      if (/^'\d{2}$/.test(tok)) { q.years.push(y2(tok.slice(1))); continue; }
      if (/^\d{2}$/.test(t) && hasVehicleWord && y2(t) <= CUR + 2 && !q.years.length) { q.years.push(y2(t)); q.notes.push(`"${t}" read as ${y2(t)}`); continue; }
      const mk = canonMake(t);
      if (V.makes.has(mk)) { q.makes.push(mk); continue; }
      const ld = t.match(/^([a-z]+)(\d{1,3})$/); // "mazda3" -> make mazda + model 3
      if (ld && V.makes.has(canonMake(ld[1])) && V.modelSet.has(ld[2])) { q.makes.push(canonMake(ld[1])); q.models.push([ld[2]]); continue; }
      if (STOP.has(t)) continue;
      const mc = modelCandidates(t, V); if (mc) { q.models.push(mc); continue; }
      if (TYPE_WORDS[t] && hasVehicleWord) { q.soft.push(TYPE_WORDS[t]); continue; }
      if (TRIMS.has(t) && hasVehicleWord) { q.ignored.push(t); continue; }
      if (t.length >= 4 && /^[a-z]+$/.test(t)) { // typo? try makes then models
        const fm = fuzzyFind(t, [...V.makes]); if (fm.length) { q.makes.push(fm[0]); q.notes.push(`"${t}" → ${fm[0]}`); continue; }
        const fd = fuzzyFind(t, V.models.filter(m => /^[a-z]/.test(m))); if (fd.length) { q.models.push(fd); q.notes.push(`"${t}" → ${fd.join('/')}`); continue; }
      }
      q.free.push(t);
    }
    return q;
  }

  const freeHit = (e, t) => e.hay.includes(' ' + t) || (t.length >= 3 && /\d/.test(t) && e.hayc.includes(t));
  function makeOk(e, q) {
    if (!q.makes.length) return true;
    return q.makes.some(m => e.mk === m || (MAKE_FAMILY[m] || []).includes(e.mk) || (e.md && e.md.startsWith(m) && m.length >= 3));
  }
  // An Inventory item fit with no model (e.g. "all Nissan") only counts if the typed model is made by that make.
  function modelOk(e, cands, V) {
    if (e.anyModel) return !e.mk || cands.some(c => { for (const [m, mks] of V.modelMakes) if ((m === c || m.startsWith(c)) && (mks.has(e.mk) || (MAKE_FAMILY[e.mk] || []).some(f => mks.has(f)))) return true; return false; });
    return cands.some(c => e.md === c || (c.length >= 3 && e.md.startsWith(c)) || (e.trunc && c.startsWith(e.md) && /^\d{1,4}[a-z]{0,2}$/.test(c.slice(e.md.length))));
  }
  function matches(e, q, V) {
    if (e.textOnly && (q.makes.length || q.models.length || q.years.length)) return false;
    if (q.years.length && e.spans !== null && !q.years.every(y => e.spans.some(([a, b]) => y >= a && y <= b))) return false;
    if (!makeOk(e, q)) return false;
    if (q.prefix && !(e.mk.startsWith(q.prefix) || e.md.startsWith(q.prefix))) return false;
    for (const c of q.models) if (!modelOk(e, c, V)) return false;
    for (const t of q.free) if (!freeHit(e, t)) return false;
    return true;
  }
  function score(e, q) { let s = 0; for (const k of q.soft) if (TYPE_RE[k].test(e.hay)) s += 2; if (q.models.length && !e.trunc && !e.anyModel) s += 1; return s; }

  /* Run a query over one index. Returns matching entries (best first). Empty text -> []. */
  function run(text, ix, V, parsed) {
    const q = JSON.parse(JSON.stringify(parsed || parse(text, V)));
    if (!q.years.length && !q.makes.length && !q.models.length && !q.free.length && !q.prefix) return { q, hits: [] };
    let hits = [];
    for (const e of ix.entries) if (matches(e, q, V)) hits.push(e);
    // a free word that kills everything is probably a trim or junk: retry without it
    if (!hits.length && q.free.length && (q.makes.length || q.models.length)) {
      const q2 = Object.assign({}, q, { free: [] });
      for (const e of ix.entries) if (matches(e, q2, V)) hits.push(e);
      if (hits.length) { q.ignored.push(...q.free); q.free = []; }
    }
    if (q.soft.length || q.models.length) hits.sort((a, b) => score(b, q) - score(a, q));
    return { q, hits };
  }
  const API = { norm, compact, canonMake, yearSpans, dist, parse, buildIndex, buildVocab, run, matches, isTruncModel, chipTags, TYPE_RE };
  G.Search = API; if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
