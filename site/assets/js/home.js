// Home page: renders the section list and simulation cards from the catalog.

import { sections, simsIn } from './catalog.js';
import { siteUrl } from './core/shell.js';
import { thumbs, fallbackThumb } from './thumbs.js';
import { byId } from './core/dom.js';

const pad = (n) => String(n).padStart(2, '0');

function card(sim) {
  const tag = sim.tag ? `<span class="card__tag">${sim.tag}</span>` : '';
  return `
    <a class="card" href="${siteUrl(sim.path)}">
      <div class="card__thumb">${thumbs[sim.id] ?? fallbackThumb}</div>
      <div class="card__body">
        <h3 class="card__title">${sim.title}${tag}</h3>
        <p class="card__summary">${sim.summary}</p>
        <span class="card__cta">Բացել →</span>
      </div>
    </a>`;
}

function section(sec, index) {
  const items = simsIn(sec.id);
  const cards = items.length
    ? items.map(card).join('')
    : '<div class="card card--empty">Շուտով…</div>';
  return `
    <section class="home-section" id="${sec.id}" data-section="${sec.id}" aria-labelledby="h-${sec.id}">
      <header class="home-section__head">
        <span class="home-section__index">${pad(index + 1)}</span>
        <div class="home-section__text">
          <h2 class="home-section__title" id="h-${sec.id}">${sec.title}</h2>
          <p class="home-section__blurb">${sec.blurb}</p>
        </div>
        <span class="home-section__count">${items.length} լաբորատորիա</span>
      </header>
      <div class="card-grid">${cards}</div>
    </section>`;
}

byId('jump').innerHTML = sections
  .map((s) => `<li data-section="${s.id}"><a href="#${s.id}">${s.title}</a></li>`)
  .join('');

byId('sections').innerHTML = sections.map(section).join('');

// Content is rendered after load, so re-apply a #section anchor from the URL.
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
