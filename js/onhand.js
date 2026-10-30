/* onhand.js — Inventory (in-stock) item helpers: what is physically in the van, keyed by part #.
   - inferFits(item): guesses which makes/years an item fits from its title
     ("Chrysler/Dodge/Jeep Y164 2004+" -> Chrysler, Dodge, Jeep 2004+). Guesses are marked
     src:'inferred' (low confidence) — Aaron can add exact fits by hand (src:'manual').
   - linkTokens(item): part numbers / FCC IDs used to link an Inventory item to Reference catalog products.
   - confidence(item, fit): 'verified' | 'manual' | 'inferred'. No DOM. */
(function (G) {
  'use strict';
  const D = G.Data, S = G.Search;
  const MAKE_WORDS = { chrysler: ['chrysler'], dodge: ['dodge'], jeep: ['jeep'], ram: ['ram'], ford: ['ford'], lincoln: ['lincoln'], mercury: ['mercury'],
    gm: ['chevrolet', 'gmc', 'buick', 'cadillac'], chevy: ['chevrolet'], chevrolet: ['chevrolet'], gmc: ['gmc'], buick: ['buick'], cadillac: ['cadillac'],
    toyota: ['toyota'], lexus: ['lexus'], scion: ['scion'], honda: ['honda'], acura: ['acura'], nissan: ['nissan'], infiniti: ['infiniti'],
    hyundai: ['hyundai'], kia: ['kia'], mazda: ['mazda'], subaru: ['subaru'], mitsubishi: ['mitsubishi'], vw: ['volkswagen'], volkswagen: ['volkswagen'],
    fiat: ['fiat'], bmw: ['bmw'], mercedes: ['mercedes'], audi: ['audi'], volvo: ['volvo'] };
  // Only real vehicle keys/fobs get guessed fits — not cutters, picks, lock parts, heads/blades.
  const KEY_RE = /transp|smart key|prox|fobik|remote|key w\/|chip|flip key|ikey/i;
  const NOT_KEY_RE = /lishi|cutter|decoder|lubric|mfk|refill|cylinder|lock body|\bring\b|\bcam\b|jig|vise|pick/i;
  function inferFits(item) {
    const name = String(item.name || ''); if (!KEY_RE.test(name) || NOT_KEY_RE.test(name)) return [];
    const words = name.toLowerCase().split(/[^a-z]+/), makes = new Set();
    words.forEach(w => (MAKE_WORDS[w] || []).forEach(m => makes.add(m)));
    if (!makes.size) return [];
    const spans = S.yearSpans(name.replace(/\b(\d{4})\+/g, '$1+ '));
    const years = spans.length ? spans.map(([a, b]) => a === b ? String(a) : (b > new Date().getFullYear() ? a + '+' : a + '-' + b)).join(', ') : '';
    return [...makes].map(m => ({ make: m.toUpperCase(), model: '', years, src: 'inferred' }));
  }
  const allFits = item => (item.fits || []).concat(item.noInfer ? [] : inferFits(item).filter(f => !(item.fits || []).some(g => S.canonMake(g.make) === S.canonMake(f.make))));
  const linkTokens = item => D.pnTokens([item.pn, item.name, item.links].join(' '));
  function confidence(item, fit) { if (item.verified) return 'verified'; if (fit && fit.src === 'inferred') return 'inferred'; return 'manual'; }
  G.OnHand = { inferFits, allFits, linkTokens, confidence };
  if (typeof module !== 'undefined') module.exports = G.OnHand;
})(typeof window !== 'undefined' ? window : globalThis);
