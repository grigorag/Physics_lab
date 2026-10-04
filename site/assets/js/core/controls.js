// Bindings between the shared control markup (see components.css) and sim code.
// Each binder wires events, keeps the visible value in sync and returns a
// small handle to read/set the control from code.

import { byId, $$ } from './dom.js';

/** Updates --fill (0–100%) on a range input: the painted part of its track. */
export function syncRangeFill(input) {
  const min = parseFloat(input.min) || 0;
  const max = input.max === '' ? 100 : parseFloat(input.max);
  const ratio = max > min ? (parseFloat(input.value) - min) / (max - min) : 0;
  input.style.setProperty('--fill', `${(ratio * 100).toFixed(1)}%`);
}

/**
 * Range slider + its <output for="id"> readout.
 *   const f = bindRange('focal', { format: v => v.toFixed(1), onInput: draw });
 *   f.value  → current number;  f.set(3)  → move slider (fires onInput unless silent)
 */
export function bindRange(id, { format = String, onInput, onChange } = {}) {
  const input = byId(id);
  const output = document.querySelector(`output[for="${id}"]`);

  const handle = {
    input,
    get value() { return parseFloat(input.value); },
    set(v, { silent = false } = {}) {
      input.value = v;
      render();
      if (!silent) onInput?.(handle.value);
    },
    /** Re-render the readout (e.g. after the formatter's inputs changed). */
    render,
    /** Override the readout text without touching the slider. */
    show(text) { if (output) output.textContent = text; },
  };

  function render() {
    if (output) output.textContent = format(handle.value);
    syncRangeFill(input);
  }

  input.addEventListener('input', () => { render(); onInput?.(handle.value); });
  if (onChange) input.addEventListener('change', () => onChange(handle.value));
  render();
  return handle;
}

/** Checkbox. */
export function bindCheckbox(id, { onChange } = {}) {
  const input = byId(id);
  const handle = {
    input,
    get checked() { return input.checked; },
    set(v, { silent = false } = {}) {
      input.checked = v;
      if (!silent) onChange?.(input.checked);
    },
  };
  input.addEventListener('change', () => onChange?.(input.checked));
  return handle;
}

/** <select class="select">. */
export function bindSelect(id, { onChange } = {}) {
  const input = byId(id);
  input.addEventListener('change', () => onChange?.(input.value));
  return {
    input,
    get value() { return input.value; },
    set(v) { input.value = v; onChange?.(input.value); },
  };
}

/**
 * Segmented control: <div class="segmented" id="…"><button data-value="a">…</button>…</div>
 * The pressed button has aria-pressed="true".
 */
export function bindSegmented(id, { value, onChange } = {}) {
  const root = byId(id);
  const buttons = $$('button[data-value]', root);
  let current = value ?? buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.value
    ?? buttons[0]?.dataset.value;

  function render() {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
  }

  buttons.forEach((b) => {
    b.type = 'button';
    b.addEventListener('click', () => {
      current = b.dataset.value;
      render();
      onChange?.(current);
    });
  });
  render();

  return {
    get value() { return current; },
    set(v, { silent = false } = {}) {
      current = String(v);
      render();
      if (!silent) onChange?.(current);
    },
  };
}

/**
 * Tabs: <div class="tabs" role="tablist" id="…">
 *         <button role="tab" data-tab="a" aria-controls="panel-a">…</button>…
 *       </div>
 * Panels referenced by aria-controls are shown/hidden automatically.
 * With { hash: true } the active tab is mirrored in location.hash.
 */
export function bindTabs(id, { onChange, hash = false } = {}) {
  const root = byId(id);
  const tabs = $$('[role="tab"]', root);
  let current = null;

  function select(name, { silent = false } = {}) {
    const tab = tabs.find((t) => t.dataset.tab === name);
    if (!tab) return;
    current = name;
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = byId(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (hash) history.replaceState(null, '', `#${name}`);
    if (!silent) onChange?.(name);
  }

  tabs.forEach((t, i) => {
    t.type = 'button';
    t.addEventListener('click', () => select(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      const next = tabs[(i + dir + tabs.length) % tabs.length];
      next.focus();
      select(next.dataset.tab);
    });
  });

  const fromHash = hash && location.hash.slice(1);
  const initial = tabs.some((t) => t.dataset.tab === fromHash)
    ? fromHash
    : (tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0]).dataset.tab;
  select(initial, { silent: true });

  return {
    get value() { return current; },
    select,
  };
}

/**
 * Play/pause toggle button.
 *   const play = bindPlayPause('playBtn', { paused: false, onChange: p => state.paused = p });
 * `label(paused)` customises the text; default is ▶ Շարունակել / ⏸ Դադար.
 */
export function bindPlayPause(id, {
  paused = false,
  onChange,
  label = (p) => (p ? '▶ Շարունակել' : '⏸ Դադար'),
} = {}) {
  const btn = byId(id);
  let state = paused;

  function render() {
    btn.textContent = label(state);
    btn.setAttribute('aria-pressed', String(state));
  }

  btn.addEventListener('click', () => {
    state = !state;
    render();
    onChange?.(state);
  });
  render();

  return {
    get paused() { return state; },
    set(p, { silent = true } = {}) {
      state = p;
      render();
      if (!silent) onChange?.(state);
    },
    render,
  };
}

/** Plain button click. */
export function onClick(id, handler) {
  byId(id).addEventListener('click', handler);
}
