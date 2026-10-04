// Site chrome: renders the header (brand + breadcrumbs) and the footer on
// every page, based on the catalog.
//
// Pages include it with:
//   <script type="module" src="…/assets/js/core/shell.js"></script>
// and mark themselves with <body data-sim="<sim id>"> (sim pages) or
// <body data-page="home">. Placeholders <header data-shell="header"> and
// <footer data-shell="footer"> are filled in place.

import { SITE_TITLE, SITE_CREDIT, getSim, getSection } from '../catalog.js';

/** URL of the site root, independent of where the page lives. */
export const ROOT = new URL('../../../', import.meta.url);
export const siteUrl = (path = '') => new URL(path, ROOT).href;

export const BRAND_MARK = `
  <svg class="brand__mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <ellipse cx="16" cy="16" rx="13" ry="5"/>
    <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(60 16 16)"/>
    <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(120 16 16)"/>
    <circle cx="16" cy="16" r="2.4" fill="currentColor" stroke="none"/>
  </svg>`;

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function crumbs(sim) {
  if (!sim) return '';
  const section = getSection(sim.section);
  const title = sim.tag ? `${sim.title} (${sim.tag})` : sim.title;
  return `
    <nav class="crumbs" aria-label="Նավիգացիա">
      <span class="crumbs__sep">/</span>
      <a href="${siteUrl(`#${section.id}`)}">${escape(section.title)}</a>
      <span class="crumbs__sep">/</span>
      <span aria-current="page">${escape(title)}</span>
    </nav>`;
}

function renderHeader(el, sim) {
  el.classList.add('site-header');
  el.innerHTML = `
    <div class="site-header__inner">
      <a class="brand" href="${siteUrl()}">${BRAND_MARK}<span>${escape(SITE_TITLE)}</span></a>
      ${crumbs(sim)}
    </div>`;
}

function renderFooter(el) {
  el.classList.add('site-footer');
  el.innerHTML = `
    <div class="site-footer__inner">
      <span>${escape(SITE_TITLE)}</span>
      <span>${escape(SITE_CREDIT)}</span>
    </div>`;
}

const sim = getSim(document.body.dataset.sim);
const header = document.querySelector('[data-shell="header"]');
const footer = document.querySelector('[data-shell="footer"]');
if (header) renderHeader(header, sim);
if (footer) renderFooter(footer);
