// Home page: the list of physics sections, rendered from the catalog.
// The section name opens that section's page; the arrow expands the row to
// show its labs in place. The search box filters labs across all sections.

import { sections, simsIn } from './catalog.js';
import { sectionUrl } from './core/shell.js';
import { cardGrid, normalize } from './cards.js';
import { byId, $, $$ } from './core/dom.js';

const pad = (n) => String(n).padStart(2, '0');

const CHEVRON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6"/>
  </svg>`;

function section(sec, index) {
  const items = simsIn(sec.id);
  return `
    <section class="sec" id="${sec.id}" data-section="${sec.id}">
      <div class="sec__head">
        <a class="sec__link" href="${sectionUrl(sec.id)}">
          <span class="sec__index">${pad(index + 1)}</span>
          <span class="sec__text">
            <h2 class="sec__title">${sec.title}</h2>
            <span class="sec__blurb">${sec.blurb}</span>
          </span>
        </a>
        <span class="sec__count">${items.length} լաբորատորիա</span>
        <button class="icon-btn sec__toggle" type="button" aria-expanded="false" aria-controls="labs-${sec.id}">${CHEVRON}</button>
      </div>
      <div class="sec__labs" id="labs-${sec.id}" hidden>${cardGrid(items)}</div>
    </section>`;
}

byId('sections').innerHTML = sections.map(section).join('');

// ---------- Expand / collapse, and search ----------
const search = byId('search');
const noResults = byId('noResults');
const open = new Set();          // ids of the sections the user expanded

function render() {
  const words = normalize(search.value).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  let total = 0;

  for (const el of $$('.sec')) {
    let shown = 0;
    for (const card of $$('.card[data-search]', el)) {
      const match = words.every((w) => card.dataset.search.includes(w));
      card.hidden = !match;
      if (match) shown++;
    }
    total += shown;

    // While searching, sections with matches open and the rest disappear.
    const expanded = searching ? shown > 0 : open.has(el.id);
    el.hidden = searching && shown === 0;
    $('.sec__labs', el).hidden = !expanded;
    const toggle = $('.sec__toggle', el);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.title = expanded ? 'Թաքցնել լաբորատորիաները' : 'Ցույց տալ լաբորատորիաները';
    toggle.setAttribute('aria-label', toggle.title);
  }
  noResults.hidden = !searching || total > 0;
}

for (const el of $$('.sec')) {
  $('.sec__toggle', el).addEventListener('click', () => {
    if (search.value.trim()) return;      // the search decides what is open
    if (!open.delete(el.id)) open.add(el.id);
    render();
  });
}

search.addEventListener('input', render);
search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { search.value = ''; render(); }
});

// A #section anchor in the URL opens that section and scrolls to it.
const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
if (target?.classList.contains('sec')) open.add(target.id);
render();
target?.scrollIntoView();
