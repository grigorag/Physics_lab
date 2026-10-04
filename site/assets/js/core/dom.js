// Tiny DOM helpers shared by all pages.

export const byId = (id) => document.getElementById(id);
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

export function setHTML(id, html) {
  const el = byId(id);
  if (el) el.innerHTML = html;
}
