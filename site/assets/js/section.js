// Section page (section.html?id=<section id>): lists the labs of one section.
// The header breadcrumb and the accent color are set by core/shell.js.

import { SITE_TITLE, getSection, simsIn } from './catalog.js';
import { siteUrl } from './core/shell.js';
import { cardGrid } from './cards.js';
import { byId } from './core/dom.js';

const sec = getSection(new URLSearchParams(location.search).get('id'));
const back = `<a class="back-link" href="${siteUrl()}">← Բոլոր բաժինները</a>`;

if (sec) {
  const items = simsIn(sec.id);
  document.title = `${sec.title} · ${SITE_TITLE}`;
  byId('section').innerHTML = `
    ${back}
    <header class="section-head">
      <h1 class="section-head__title">${sec.title}</h1>
      <p class="section-head__blurb">${sec.blurb}</p>
      <p class="section-head__count">${items.length} լաբորատորիա</p>
    </header>
    ${cardGrid(items)}`;
} else {
  byId('section').innerHTML = `
    ${back}
    <p class="no-results">Այսպիսի բաժին չկա։</p>`;
}
