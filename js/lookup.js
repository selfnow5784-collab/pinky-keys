/* lookup.js — answers "which key fits this vehicle, and do we have it in stock (Inventory)?".
   Lookup.rebuild(state) precomputes search indexes (call after data changes; cheap, ~ms).
   Lookup.query(text, {onHandOnly}) -> { q, products[], vehicles[], onHand[] }
     products: Reference catalog keys grouped by product, each with matched vehicle rows, all compatible rows,
               linked Inventory items (onHand / onHandQty -> "In stock: Yes (n)" / "No").
               In-stock qty comes ONLY from Inventory items; the catalog's own qty column is ignored here.
     vehicles: vehicle-reference rows (chip info).   onHand: Inventory items that fit or match the words.
   No DOM. */
(function (G) {
  'use strict';
  const S = G.Search, D = G.Data, V = G.OnHand;
  let L = null;
  function rebuild(st) {
    const products = new Map();
    const cat0 = st.catalog.filter(r => !r.reviewOnly);
    cat0.forEach(r => { const k = D.rowKey(r); let p = products.get(k);
      if (!p) { p = { key: k, name: r.product, rows: [], tokens: new Set() }; products.set(k, p); } D.pnTokens([r.product, r.pn, r.fcc].join(' ')).forEach(t => p.tokens.add(t));
      p.rows.push(r); });
    const tokProducts = new Map(); products.forEach(p => p.tokens.forEach(t => { if (!tokProducts.has(t)) tokProducts.set(t, []); tokProducts.get(t).push(p); }));
    const links = new Map(); // productKey -> [Inventory items]
    const refOf = r => G.Stock ? G.Stock.ref(r) : '', refP = new Map(); // v3.6: items ticked "In stock" link by ref only
    products.forEach(p => { const k = refOf(p.rows[0]); if (!refP.has(k)) refP.set(k, []); refP.get(k).push(p); });
    st.inventory.forEach(it => { const seen = new Set(), add = p => { if (seen.has(p.key)) return; seen.add(p.key); if (!links.has(p.key)) links.set(p.key, []); links.get(p.key).push(it); };
      if (it.ref) (refP.get(it.ref) || []).forEach(add); else V.linkTokens(it).forEach(t => (tokProducts.get(t) || []).forEach(add)); });
    const cat = S.buildIndex(cat0, { get: r => ({ make: r.make, model: r.model, years: r.years, text: [r.product, r.pn, r.item, r.fcc, r.chip, r.compat, r.notes].join(' ') }) });
    const veh = S.buildIndex(st.vehicles, { get: r => ({ make: r.make, model: r.model, years: r.years, text: [r.chip, r.strattec, r.notes].join(' ') }) });
    const invRows = [];
    st.inventory.forEach(it => { const text = [it.pn, it.name, it.links, it.notes, it.type].join(' ');
      invRows.push({ it, fit: null, text, textOnly: true });
      V.allFits(it).forEach(f => invRows.push({ it, fit: f, text })); });
    const inv = S.buildIndex(invRows, { get: v => v.fit ? { make: v.fit.make, model: v.fit.model, years: v.fit.years || '*', text: v.text } : { make: '', model: '', years: '*', text: v.text, textOnly: true } });
    L = { products, links, cat, veh, inv, vocab: S.buildVocab([cat, veh, inv]), st };
    return L;
  }
  const sumQty = items => items.reduce((a, it) => a + (+it.qty || 0), 0);
  function query(text, opt) {
    opt = opt || {}; if (!L) throw new Error('Lookup.rebuild first');
    const q = S.parse(text, L.vocab);
    const c = S.run(text, L.cat, L.vocab, q), h = S.run(text, L.veh, L.vocab, q), v = S.run(text, L.inv, L.vocab, q);
    // group catalog hits by product
    const byP = new Map();
    c.hits.forEach(e => { const k = D.rowKey(e.r); if (!byP.has(k)) byP.set(k, []); byP.get(k).push(e.r); });
    let products = [...byP].map(([k, rows]) => { const p = L.products.get(k) || { name: rows[0].product, rows }; const linked = L.links.get(k) || [];
      return { key: k, name: p.name, matched: rows, all: p.rows, others: p.rows.length - rows.length, onHand: linked, onHandQty: sumQty(linked),
        verified: p.rows.every(r => r.verified), trunc: rows.some(r => S.isTruncModel(r.make, r.model)) }; });
    // Inventory items: by fit/words, plus any linked to a matched product
    const vm = new Map();
    v.hits.forEach(e => { const it = e.r.it; if (!vm.has(it)) vm.set(it, { item: it, via: e.r.fit ? 'fit' : 'words', fit: e.r.fit, conf: V.confidence(it, e.r.fit) }); });
    products.forEach(p => p.onHand.forEach(it => { if (!vm.has(it)) vm.set(it, { item: it, via: 'link', fit: null, conf: V.confidence(it, null), product: p.name }); }));
    let onHand = [...vm.values()];
    if (opt.onHandOnly) { products = products.filter(p => p.onHandQty > 0); onHand = onHand.filter(x => (+x.item.qty || 0) > 0); }
    const rank = x => (x.onHandQty > 0 ? 100 : 0);
    products.sort((a, b) => rank(b) - rank(a) || b.matched.length - a.matched.length);
    onHand.sort((a, b) => (+b.item.qty > 0) - (+a.item.qty > 0) || ({ fit: 0, link: 1, words: 2 }[a.via] - { fit: 0, link: 1, words: 2 }[b.via]));
    return { q: c.q, products, vehicles: h.hits.map(e => e.r), onHand };
  }
  // v3.4: the one-line answer() was removed (no messages on Search); the In stock Yes/No column carries it.
  G.Lookup = { rebuild, query, get L() { return L; } };
  if (typeof module !== 'undefined') module.exports = G.Lookup;
})(typeof window !== 'undefined' ? window : globalThis);
