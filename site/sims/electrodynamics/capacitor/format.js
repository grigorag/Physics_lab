// Number formatting with SI-prefixed Armenian units. DOM-free.

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const UNITS = {
  time:    [[1, 'վ'], [1e-3, 'մվ'], [1e-6, 'մկվ']],
  current: [[1, 'Ա'], [1e-3, 'մԱ'], [1e-6, 'մկԱ']],
  charge:  [[1, 'Կլ'], [1e-3, 'մԿլ'], [1e-6, 'մկԿլ'], [1e-9, 'նԿլ'], [1e-12, 'պԿլ']],
  energy:  [[1, 'Ջ'], [1e-3, 'մՋ'], [1e-6, 'մկՋ'], [1e-9, 'նՋ'], [1e-12, 'պՋ']],
  cap:     [[1e-6, 'մկՖ'], [1e-9, 'նՖ'], [1e-12, 'պՖ']],
  field:   [[1e3, 'կՎ/մ'], [1, 'Վ/մ']],
};

/** Typographic minus, and no "−0.00". */
export function minus(s) {
  if (Number(s) === 0) s = s.replace('-', '');
  return s.replace('-', '−');
}

/** Largest unit [factor, name] with |ref| ≥ k·factor (else the smallest). */
export function pickUnit(ref, units, k = 1) {
  const a = Math.abs(ref);
  return units.find(([f]) => a >= k * f * (1 - 1e-9)) ?? units[units.length - 1];
}

/** v with n significant digits (fixed notation). */
export function sig(v, n = 3) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a === 0 ? n - 1 : clamp(n - 1 - Math.floor(Math.log10(a)), 0, 8);
  return minus(v.toFixed(d));
}

/**
 * Formatter with ONE unit and a fixed number of decimals chosen from a
 * reference magnitude, so a decaying quantity does not change unit or
 * precision while it runs.  k: how many units the reference must span.
 */
export function makeFormatter(ref, units, { n = 3, k = 1 } = {}) {
  const [f, name] = pickUnit(ref, units, k);
  const refU = Math.abs(ref) / f;
  const d = refU > 0 ? clamp(n - 1 - Math.floor(Math.log10(refU)), 0, 8) : n - 1;
  return (v) => `${minus((v / f).toFixed(d))} ${name}`;
}

/** Formatter that picks the unit from the value itself. */
export function autoFormat(v, units, n = 3) {
  let [f, name] = pickUnit(v, units, 1);
  let s = sig(v / f, n);
  if (Math.abs(parseFloat(s)) >= 1000) {
    const i = units.findIndex(([ff]) => ff === f);
    if (i > 0) { [f, name] = units[i - 1]; s = sig(v / f, n); }
  }
  return `${s} ${name}`;
}

export const fmtOhm = (R) => (R >= 1000
  ? `${Number((R / 1000).toPrecision(2))} կՕմ`
  : `${Number(R.toPrecision(3))} Օմ`);

export const fmtMicroF = (C) => `${Number((C * 1e6).toPrecision(3))} մկՖ`;

export const fmtVolt = (U) => `${minus(U.toFixed(2))} Վ`;

/** Speed-up factor like ×1, ×0.25, ×50, ×1200. */
export function fmtFactor(x) {
  const v = x >= 100 ? Math.round(x) : Number(x.toPrecision(2));
  return `×${v}`;
}
