// Nuclear binding energy — three coordinated tabs sharing one selected nuclide:
//   defect   — the mass defect on a balance (balance.js)
//   curve    — specific binding energy E/A versus A (curve.js)
//   reaction — energy of fusion / fission reactions (reaction.js)
// Physics and the mass table: physics.js.

import { bindTabs, bindSelect, onClick } from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { NUCLIDES } from './physics.js';
import { createBalance } from './balance.js';
import { createCurve } from './curve.js';
import { createReaction } from './reaction.js';

const state = { key: 'He4' };

// Both nuclide selects list the same table.
const options = NUCLIDES.map((n) => `<option value="${n.key}">${n.sym}-${n.A} · ${n.name}</option>`).join('');
for (const id of ['nuc1', 'nuc2']) byId(id).innerHTML = options;

const selects = ['nuc1', 'nuc2'].map((id) => bindSelect(id, { onChange: (v) => select(v) }));

const balance = createBalance(state);
const curve = createCurve(state, select);
const reaction = createReaction();

function select(key) {
  state.key = key;
  selects.forEach((s) => { s.input.value = key; });
  balance.update();
  curve.update();
}

function step(d) {
  const i = NUCLIDES.findIndex((n) => n.key === state.key);
  select(NUCLIDES[(i + d + NUCLIDES.length) % NUCLIDES.length].key);
}

onClick('prevBtn', () => step(-1));
onClick('nextBtn', () => step(1));

const tabs = bindTabs('tabs', {
  hash: true,
  onChange: (name) => {
    if (name === 'defect') balance.redraw();
    if (name === 'curve') curve.redraw();
    if (name === 'reaction') reaction.restart();
  },
});

select(state.key);

startLoop((dt) => {
  if (tabs.value === 'defect') balance.tick(dt);
  else if (tabs.value === 'reaction') reaction.tick(dt);
});
