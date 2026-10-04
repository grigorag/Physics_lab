// Number formatting shared by both tabs (plain strings, usable in DOM and canvas).

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).replace(/[-\d]/g, (ch) => SUP[ch]);

/** Rounds to 3 significant figures. */
export const round3 = (x) => Number(x.toPrecision(3));

/** 7.27·10⁻¹⁰ */
export function sci(x, sig = 3) {
  if (!x) return '0';
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = (x / 10 ** e).toFixed(sig - 1);
  if (Math.abs(parseFloat(m)) >= 10) { e += 1; m = (x / 10 ** e).toFixed(sig - 1); }
  return e === 0 ? m : `${m}·10${sup(e)}`;
}

/** Plain number with 3 significant figures in the "human" range, otherwise scientific. */
export function num(x) {
  const a = Math.abs(x);
  if (a === 0) return '0';
  return a >= 1e-2 && a < 1e4 ? String(round3(x)) : sci(x);
}

/** A length in a convenient sub-unit, e.g. 0.727 նմ; null if no unit fits. */
export function niceLength(l) {
  const units = [[1e-3, 'մմ', 1e-4], [1e-6, 'մկմ', 1e-7], [1e-9, 'նմ', 1e-10], [1e-12, 'պմ', 1e-13], [1e-15, 'ֆմ', 1e-16]];
  if (l >= 1e-1) return null;
  for (const [u, name, from] of units) if (l >= from * 0.99999) return `${num(l / u)} ${name}`;
  return null;
}
