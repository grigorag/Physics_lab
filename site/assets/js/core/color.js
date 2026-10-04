// Color helpers for physics visualisation.

/** Visible wavelength (nm) → approximate sRGB [r, g, b] in 0..255. */
export function wavelengthToRGB(w) {
  let r = 0, g = 0, b = 0;
  if (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; }
  else if (w <= 780) { r = 1; }

  let f = 1;
  if (w < 420) f = 0.35 + (0.65 * (w - 380)) / 40;
  else if (w > 700) f = 0.35 + (0.65 * (780 - w)) / 80;

  const gamma = 0.8;
  return [r, g, b].map((c) => Math.round(255 * Math.pow(c * f, gamma)));
}

/** [r, g, b] + alpha → 'rgba(…)'. */
export const rgba = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
