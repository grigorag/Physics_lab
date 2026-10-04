// Site chrome: renders the header (brand + breadcrumbs + theme toggle), the
// footer and, on sim pages, the previous/next links — all based on the catalog.
//
// Pages include it with:
//   <script defer src="bundle.js"></script>   (built from this module by `npm run build`)
// and mark themselves with <body data-sim="<sim id>"> (sim pages),
// <body data-page="home"> or <body data-page="section"> (section.html?id=…). Placeholders <header data-shell="header"> and
// <footer data-shell="footer"> are filled in place.

import { SITE_TITLE, SITE_CREDIT, sims, getSim, getSection } from '../catalog.js';
import { currentTheme, toggleTheme, onThemeChange } from './theme.js';
import { syncRangeFill } from './controls.js';

/** URL of the site root, independent of where the page lives (every page loads assets/js/theme-init.js). */
export const ROOT = new URL('../../', document.querySelector('script[src$="theme-init.js"]').src);
export const siteUrl = (path = '') => new URL(path, ROOT).href;
/** URL of the page that lists one section's labs. */
export const sectionUrl = (id) => siteUrl(`section.html?id=${id}`);

export const BRAND_MARK = `
  <svg class="brand__mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <ellipse cx="16" cy="16" rx="13" ry="5"/>
    <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(60 16 16)"/>
    <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(120 16 16)"/>
    <circle cx="16" cy="16" r="2.4" fill="currentColor" stroke="none"/>
  </svg>`;

const THEME_ICONS = `
  <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>
  </svg>
  <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>
  </svg>`;

const THEME_LABELS = { dark: 'Միացնել լուսավոր ռեժիմը', light: 'Միացնել մութ ռեժիմը' };

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fullTitle = (sim) => (sim.tag ? `${sim.title} (${sim.tag})` : sim.title);

function crumbs(sim, section) {
  if (!section) return '';
  const here = (title) => `<span aria-current="page">${escape(title)}</span>`;
  return `
    <nav class="crumbs" aria-label="Նավիգացիա">
      <span class="crumbs__sep">/</span>
      ${sim ? `<a href="${sectionUrl(section.id)}">${escape(section.title)}</a>` : here(section.title)}
      ${sim ? `<span class="crumbs__sep">/</span>${here(fullTitle(sim))}` : ''}
    </nav>`;
}

function renderHeader(el, sim, section) {
  el.classList.add('site-header');
  el.innerHTML = `
    <div class="site-header__inner">
      <a class="brand" href="${siteUrl()}" aria-label="${escape(SITE_TITLE)}">${BRAND_MARK}<span>${escape(SITE_TITLE)}</span></a>
      ${crumbs(sim, section)}
      <div class="site-header__actions">
        <button class="icon-btn theme-toggle" type="button">${THEME_ICONS}</button>
      </div>
    </div>`;

  const toggle = el.querySelector('.theme-toggle');
  const label = () => {
    toggle.title = THEME_LABELS[currentTheme()];
    toggle.setAttribute('aria-label', toggle.title);
  };
  toggle.addEventListener('click', toggleTheme);
  onThemeChange(label);
  label();
}

function renderFooter(el) {
  el.classList.add('site-footer');
  el.innerHTML = `
    <div class="site-footer__inner">
      <span>${escape(SITE_TITLE)}</span>
      <span>${escape(SITE_CREDIT)}</span>
    </div>`;
}

/** Previous / next simulation links at the bottom of a sim page (catalog order). */
function renderSimNav(main, sim) {
  const i = sims.indexOf(sim);
  const link = (target, dir, label) => (target ? `
    <a class="sim-nav__link sim-nav__link--${dir}" href="${siteUrl(target.path)}" data-section="${target.section}">
      <span class="sim-nav__dir">${label}</span>
      <span class="sim-nav__title">${escape(fullTitle(target))}</span>
    </a>` : '');
  main.insertAdjacentHTML('beforeend', `
    <nav class="sim-nav" aria-label="Այլ լաբորատորիաներ">
      ${link(sims[i - 1], 'prev', '← Նախորդը')}
      ${link(sims[i + 1], 'next', 'Հաջորդը →')}
    </nav>`);
}

const sim = getSim(document.body.dataset.sim);
// The section this page belongs to: the sim's, or ?id=… on a section page.
const section = sim
  ? getSection(sim.section)
  : document.body.dataset.page === 'section'
    ? getSection(new URLSearchParams(location.search).get('id'))
    : null;
if (section) document.body.dataset.section = section.id;   // accent color
const header = document.querySelector('[data-shell="header"]');
const footer = document.querySelector('[data-shell="footer"]');
const main = document.querySelector('main.page');
if (header) renderHeader(header, sim, section);
if (footer) renderFooter(footer);
if (sim && main) renderSimNav(main, sim);

// Slider track fill for every range input on the page (bound or not).
document.querySelectorAll('input[type="range"]').forEach(syncRangeFill);
document.addEventListener('input', (e) => {
  if (e.target.matches?.('input[type="range"]')) syncRangeFill(e.target);
});
