// Number formatting and small helpers shared by both tabs.

export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Decimals needed to print multiples of `step`. */
export const decimalsFor = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

/** Typographic minus, no "−0.00". */
export function fmt(v, digits = 2) {
  const s = v.toFixed(digits);
  if (parseFloat(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** Frequency: integer when it is one, otherwise one decimal. */
export const fmtHz = (f) => `${Math.abs(f - Math.round(f)) < 1e-9 ? Math.round(f) : f.toFixed(1)} Հց`;

/** Length in metres with sensible precision. */
export function fmtLen(m) {
  const digits = m >= 100 ? 0 : m >= 10 ? 1 : m >= 1 ? 2 : 3;
  return `${m.toFixed(digits)} մ`;
}

/** Time: seconds from 1 s, milliseconds below. */
export function fmtTime(s) {
  if (s >= 1) return `${s.toFixed(2)} վ`;
  return `${+(s * 1000).toPrecision(3)} մվ`;
}

/** Time always in seconds, three significant digits. */
export const fmtSec = (s) => `${+s.toPrecision(3)} վ`;

/** Mix two '#rrggbb' colours: t = 0 → a, t = 1 → b. */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
