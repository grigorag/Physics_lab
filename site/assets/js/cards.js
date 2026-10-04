// Simulation card, shared by the home page and the section pages.

import { getSection } from './catalog.js';
import { siteUrl } from './core/shell.js';
import { thumbs, fallbackThumb } from './thumbs.js';

export const normalize = (s) => s.toLocaleLowerCase('hy').trim();

/** Card markup for one sim; data-search holds the text the home search matches. */
export function simCard(sim) {
  const tag = sim.tag ? `<span class="card__tag">${sim.tag}</span>` : '';
  const haystack = normalize(`${sim.title} ${sim.tag ?? ''} ${sim.summary} ${getSection(sim.section).title}`);
  return `
    <a class="card" href="${siteUrl(sim.path)}" data-search="${haystack}">
      <div class="card__thumb">${thumbs[sim.id] ?? fallbackThumb}</div>
      <div class="card__body">
        <h3 class="card__title">${sim.title}${tag}</h3>
        <p class="card__summary">${sim.summary}</p>
        <span class="card__cta">Բացել</span>
      </div>
    </a>`;
}

/** Grid of cards for a list of sims, or a "coming soon" placeholder. */
export const cardGrid = (items) => `
  <div class="card-grid">
    ${items.length ? items.map(simCard).join('') : '<div class="card card--empty">Շուտով…</div>'}
  </div>`;
