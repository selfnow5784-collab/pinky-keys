/* reasons.js — turns the review file's technical Reason text into short plain phrases for the details card.
   Reason parts are split on ';'. Unknown parts fall back to the raw text. Reasons.plain(raw) -> [phrases] */
(function (G) {
  'use strict';
  const RULES = [
    [/works on list does not support|no fitment inferred/i, 'Years/vehicle not confirmed by supplier'],
    [/^no make\/model/i, 'Vehicle unclear'],
    [/^no clear year/i, 'Years unclear'],
    [/no "compatible with" list/i, 'Supplier lists no vehicles for this item'],
    [/unknown section "locks"|ignition lock\/parts/i, 'Not a vehicle key (lock part)'],
    [/multiple models\/qualifiers/i, 'Model name unclear (several models listed)'],
    [/make not recognised/i, 'Make unclear'],
    [/^price shown as/i, 'Price is a range, not one price'],
    [/compat line not in/i, 'Vehicle list in an odd format'],
    [/lookup page lists no products/i, 'Supplier page lists no products'],
    [/^no product name/i, 'Product name missing'],
    [/page not found|404/i, 'Supplier page missing'],
    [/page heading .* differs from dropdown/i, 'Model name spelled differently on supplier site'],
    [/cited research differs|unresolved discrepancy/i, 'Sources disagree on a value'],
    [/^no model given/i, 'Model missing'],
    [/conflict with oem key \(([^)]*) differs?\)/i, m => { const parts = m[1].replace(/key blade/i, 'blade').split('/'); return cap(parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] + ' differ' : parts[0] + ' differs') + ' from the OEM key'; }],
    [/year end before start/i, 'Years look wrong (end before start)'],
    [/^review$/i, 'Needs checking']
  ];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function plain(raw) {
    const out = [];
    String(raw || '').split(/;\s*/).map(s => s.trim()).filter(Boolean).forEach(p => {
      let t = p; for (const [re, v] of RULES) { const m = p.match(re); if (m) { t = typeof v === 'function' ? v(m) : v; break; } }
      if (!out.includes(t)) out.push(t);
    });
    return out;
  }
  G.Reasons = { plain };
})(window);
