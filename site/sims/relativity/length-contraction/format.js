// Number formatting shared by both tabs.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** 3 significant digits. */
function sig3(x) {
  if (x >= 100) return x.toFixed(0);
  if (x >= 10) return x.toFixed(1);
  return x.toFixed(2);
}

/** Seconds → նվ / մկվ / մվ / վ. */
export function fmtTime(t) {
  if (!Number.isFinite(t)) return '∞';
  if (t < 1e-6) return `${sig3(t * 1e9)} նվ`;
  if (t < 1e-3) return `${sig3(t * 1e6)} մկվ`;
  if (t < 1) return `${sig3(t * 1e3)} մվ`;
  return `${sig3(t)} վ`;
}

/** 179875 → "179 875". */
export const group = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Fraction → percent text; tiny values as a·10ⁿ. */
export function fmtPercent(f) {
  const p = f * 100;
  if (p >= 10) return `${p.toFixed(1)} %`;
  if (p >= 0.01) return `${p.toFixed(2)} %`;
  if (p <= 0) return '0 %';
  const e = Math.floor(Math.log10(p));
  if (e < -99) return '≈ 0 %';
  const m = (p / 10 ** e).toFixed(1);
  return `${m}·10${[...String(e)].map((ch) => SUP[ch]).join('')} %`;
}
