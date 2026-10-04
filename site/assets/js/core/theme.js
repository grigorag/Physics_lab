// Canvas-side mirror of the design tokens in assets/css/tokens.css.
// Keep these values in sync with the CSS variables of the same name.

export const COLORS = {
  bg:        '#0a0d16',
  canvasBg:  '#0b0e17',
  surface1:  '#111521',
  surface2:  '#171c2c',
  text:      '#e8eaf6',
  text2:     '#a4acc8',
  text3:     '#6f789a',
  grid:      'rgba(120,140,200,0.07)',
  axis:      'rgba(120,140,200,0.35)',

  purple: '#7c6ff7',
  teal:   '#2ecba1',
  coral:  '#f0714a',
  amber:  '#f5a623',
  blue:   '#4ea8ef',
  red:    '#f26d6d',
  green:  '#5ccf86',
};

export const FONTS = {
  sans: "'Noto Sans Armenian', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Noto Sans Armenian', ui-monospace, monospace",
  display: "'Noto Serif Armenian', Georgia, serif",
};

/** Canvas font string, e.g. font(12) or font(11, { family: 'mono', weight: 700 }). */
export const font = (size, { weight = 500, family = 'sans', style = '' } = {}) =>
  `${style} ${weight} ${size}px ${FONTS[family]}`.trim();

/** Resolves once web fonts are ready — redraw static canvases after it. */
export const fontsReady = () => (document.fonts ? document.fonts.ready : Promise.resolve());
