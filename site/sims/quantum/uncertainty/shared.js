// Number formatting shared by the two tabs.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).replace(/[-\d]/g, (c) => SUP[c]);

/** 1.0546e-24 → "1.05·10⁻²⁴" (digits = decimals of the mantissa). */
export function sci(v, digits = 2) {
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(v)));
  let m = v / 10 ** e;
  if (Math.abs(m).toFixed(digits) === (10).toFixed(digits)) { m /= 10; e += 1; }
  return `${m.toFixed(digits)}·10${sup(e)}`;
}

/** Value expressed with a fixed power of ten: fixedPow(5.3e-35, -34) → "0.530·10⁻³⁴". */
export function fixedPow(v, exp, digits = 3) {
  return `${(v / 10 ** exp).toFixed(digits)}·10${sup(exp)}`;
}
