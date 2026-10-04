// Number formatting for the lab.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => [...String(n)].map((ch) => SUP[ch]).join('');

/** a·10ⁿ with `digits` decimals in the mantissa. */
export function sci(x, digits = 2) {
  if (x === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(x)));
  let m = (x / 10 ** e).toFixed(digits);
  if (Math.abs(parseFloat(m)) >= 10) { e += 1; m = (x / 10 ** e).toFixed(digits); }
  return `${m}·10${sup(e)}`;
}

/** 4 significant digits, never in exponent form (for 0.001 ≤ x < 10⁴). */
const sig = (x, n = 4) => {
  const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)) + 1e-12));
  return x.toFixed(Math.min(d, 8));
};

/** 3 significant digits without trailing zeros. */
export const p3 = (x) => String(Number(x.toPrecision(3)));

/** "299 792" style grouping of the integer part. */
export const group = (s) => {
  const [i, f] = String(s).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return f ? `${g}.${f}` : g;
};

/** Energy given in MeV with a sensible prefix (էՎ … ՏէՎ); `tail` e.g. '/c'. */
export function fmtMeV(x, base = 'էՎ', tail = '') {
  let v = x, pre = 'Մ';
  if (x >= 1e6) { v = x / 1e6; pre = 'Տ'; }
  else if (x >= 1e4) { v = x / 1e3; pre = 'Գ'; }
  else if (x < 1e-5) { v = x * 1e6; pre = ''; }
  else if (x < 1e-2) { v = x * 1e3; pre = 'կ'; }
  return `${sig(v)} ${pre}${base}${tail}`;
}

/** β with enough digits to stay below 1. */
export function fmtBeta(beta, omb) {
  if (omb >= 1e-4) return beta.toFixed(4);
  const d = Math.min(12, Math.ceil(-Math.log10(omb)) + 1);
  return (1 - omb).toFixed(d);
}

/** Gamma factor. */
export const fmtGamma = (g) => (g >= 1000 ? g.toFixed(0) : g >= 100 ? g.toFixed(1) : g >= 10 ? g.toFixed(2) : g.toFixed(4));

/** Large counts in words: հազ. / մլն / մլրդ. */
export function fmtBig(x) {
  if (x < 1e3) return p3(x);
  if (x < 1e6) return `${p3(x / 1e3)} հազ.`;
  if (x < 1e9) return `${p3(x / 1e6)} մլն`;
  if (x < 1e12) return `${p3(x / 1e9)} մլրդ`;
  return sci(x);
}

/** Seconds → վ / րոպե / ժամ / օր / տարի. */
export function fmtDuration(s) {
  if (s < 120) return `${p3(s)} վ`;
  if (s < 7200) return `${p3(s / 60)} րոպե`;
  if (s < 172800) return `${p3(s / 3600)} ժամ`;
  if (s < 365.25 * 86400) return `${p3(s / 86400)} օր`;
  return `${p3(s / (365.25 * 86400))} տարի`;
}

/** Mass given in grams → մգ / գ / կգ. */
export function fmtMass(g) {
  if (g < 1) return `${p3(g * 1e3)} մգ`;
  if (g < 1000) return `${p3(g)} գ`;
  return `${p3(g / 1e3)} կգ`;
}
