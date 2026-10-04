// Number formatting for readouts.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => [...String(n)].map((ch) => SUP[ch] ?? ch).join('');

/** `sig` significant digits, plain notation (no exponent) for 1e-3 ≤ |v| < 1e6. */
export function fmtSig(v, sig = 3) {
  if (!Number.isFinite(v)) return '∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  const e = Math.floor(Math.log10(a));
  let s = a.toFixed(Math.max(0, sig - 1 - e));
  if (parseFloat(s) >= 10 ** (e + 1)) s = a.toFixed(Math.max(0, sig - 2 - e));
  return (v < 0 ? '−' : '') + s;
}

/** Scientific notation m·10ⁿ with `sig` significant digits. */
export function sci(v, sig = 3) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  let e = Math.floor(Math.log10(a));
  let m = a / 10 ** e;
  if (parseFloat(m.toFixed(sig - 1)) >= 10) { m /= 10; e += 1; }
  return `${v < 0 ? '−' : ''}${m.toFixed(sig - 1)}·10${sup(e)}`;
}

/** Length in metres → "0.39 մմ" / "3.6 սմ" / "12.9 մ". */
export function fmtLen(m, sig = 2) {
  if (!Number.isFinite(m)) return '∞';
  const a = Math.abs(m);
  if (a === 0) return '0';
  if (a < 0.01) return `${fmtSig(m * 1000, sig)} մմ`;
  if (a < 1) return `${fmtSig(m * 100, sig)} սմ`;
  return `${fmtSig(m, sig)} մ`;
}

/** Percentage with sensible precision. */
export function fmtPct(f) {
  const p = f * 100;
  if (p === 0) return '0 %';
  if (p >= 99.95) return '100 %';
  if (p >= 10) return `${p.toFixed(1)} %`;
  if (p >= 0.1) return `${p.toFixed(2)} %`;
  return `${sci(p, 2)} %`;
}
