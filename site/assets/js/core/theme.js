// Color theme (dark / light) and the canvas-side mirror of the design tokens
// in assets/css/tokens.css. Keep the palettes in sync with the CSS variables
// of the same name.
//
// The initial theme is applied by assets/js/theme-init.js before first paint;
// this module switches it at runtime and keeps COLORS up to date.

const STORAGE_KEY = 'physlab-theme';

const PALETTES = {
  dark: {
    bg:        '#0a0d16',
    canvasBg:  '#0b0e17',
    surface1:  '#111521',
    surface2:  '#181d2e',
    text:      '#e8eaf6',
    text2:     '#aab2cd',
    text3:     '#7c85a6',
    grid:      'rgba(120,140,200,0.07)',
    axis:      'rgba(120,140,200,0.35)',

    purple: '#8478f8',
    teal:   '#2ecba1',
    coral:  '#f0714a',
    amber:  '#f5a623',
    blue:   '#4ea8ef',
    red:    '#f26d6d',
    green:  '#5ccf86',
  },
  light: {
    bg:        '#f3f5fa',
    canvasBg:  '#fcfdff',
    surface1:  '#ffffff',
    surface2:  '#f2f4f9',
    text:      '#161a2c',
    text2:     '#454c69',
    text3:     '#687090',
    grid:      'rgba(30,42,90,0.07)',
    axis:      'rgba(30,42,90,0.38)',

    purple: '#5a4be0',
    teal:   '#0a8468',
    coral:  '#cf4a22',
    amber:  '#a86400',
    blue:   '#1f72c4',
    red:    '#d03a3a',
    green:  '#23803f',
  },
};

/** The dark palette, for canvases that stay dark in both themes (wave optics). */
export const DARK = PALETTES.dark;

export const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Colors of the active theme. Updated in place on a theme change, so read
 *  them at draw time (COLORS.text), don't copy them into module constants —
 *  or wrap derived palettes in themed(). */
export const COLORS = { ...PALETTES[currentTheme()] };

const listeners = new Set();

/** Calls fn(theme) after every theme change — redraw static canvases here. */
export function onThemeChange(fn) {
  listeners.add(fn);
}

function apply(name) {
  document.documentElement.dataset.theme = name;
  Object.assign(COLORS, PALETTES[name]);
  listeners.forEach((fn) => fn(name));
}

export function setTheme(name) {
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* storage blocked */ }
  apply(name);
}

export const toggleTheme = () => setTheme(currentTheme() === 'light' ? 'dark' : 'light');

// Follow the system setting until the user picks a theme explicitly.
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
  if (!saved) apply(e.matches ? 'light' : 'dark');
});

/**
 * A sim-local palette that follows the theme:
 *   const C = themed((light) => ({ ray: COLORS.amber, rim: light ? '#333' : '#ddd' }));
 * The returned object is rebuilt in place whenever the theme changes.
 */
export function themed(build) {
  const make = () => build(currentTheme() === 'light');
  const palette = make();
  onThemeChange(() => Object.assign(palette, make()));
  return palette;
}

/** '#rrggbb' + alpha → 'rgba(…)'. */
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

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
