// Capacitor: RC circuit and parallel-plate capacitor — two tabs on one page.
// Only the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createRCTab } from './rc.js';
import { createPlatesTab } from './plates.js';

const sims = {
  rc: createRCTab(),
  plates: createPlatesTab(),
};

const tabs = bindTabs('tabs', {
  hash: true,
  onChange: (name) => sims[name]?.activate(),
});
sims[tabs.value]?.activate();

startLoop((dt) => sims[tabs.value]?.frame(dt));
