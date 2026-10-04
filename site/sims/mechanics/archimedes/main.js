// Archimedes' principle: two experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createWeigh } from './weigh.js';
import { createFloat } from './float.js';

const sims = {
  weigh: createWeigh(),
  float: createFloat(),
};

const tabs = bindTabs('tabs', { hash: true, onChange: (name) => sims[name]?.resize?.() });

startLoop((dt) => sims[tabs.value]?.frame(dt));
