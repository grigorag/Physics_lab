// Energy levels and the laser — two experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createAtomTab } from './atom.js';
import { createLaserTab } from './laser.js';

const sims = {
  atom: createAtomTab(),
  laser: createLaserTab(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => sims[tabs.value]?.frame(dt));
