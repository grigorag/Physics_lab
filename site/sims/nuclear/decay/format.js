// Number formatting for readouts and axes.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => [...String(n)].map((ch) => SUP[ch] ?? ch).join('');

/**
 * `sig` significant digits; very large / small values as m·10ⁿ.
 * Integers ≥ 10^sig are not rounded (5730, 11460).
 */
export function fmtSig(v, sig = 3) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const neg = v < 0;
  const a = Math.abs(v);
  let e = Math.floor(Math.log10(a));
  let s;
  if (e >= 6 || e < -3) {
    let m = a / 10 ** e;
    if (parseFloat(m.toFixed(sig - 1)) >= 10) { m /= 10; e += 1; }
    s = `${m.toFixed(sig - 1)}·10${sup(e)}`;
  } else {
    s = a.toFixed(Math.max(0, sig - 1 - e));
    if (parseFloat(s) >= 10 ** (e + 1) && sig - 2 - e >= 0) s = a.toFixed(Math.max(0, sig - 2 - e));
  }
  return (neg ? '−' : '') + s;
}
