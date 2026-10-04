// Length contraction — two experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createRocket } from './rocket.js';
import { createMuons } from './muons.js';

const sims = {
  rocket: createRocket(),
  muons: createMuons(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => sims[tabs.value]?.frame(dt));
