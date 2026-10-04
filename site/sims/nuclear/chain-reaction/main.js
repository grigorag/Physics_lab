// Chain reaction — three experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createFission } from './fission.js';
import { createChain } from './chain.js';
import { createReactor } from './reactor.js';

const sims = {
  fission: createFission(),
  chain: createChain(),
  reactor: createReactor(),
};

const tabs = bindTabs('tabs', { hash: true, onChange: (name) => sims[name]?.show?.() });
sims[tabs.value]?.show?.();

startLoop((dt) => sims[tabs.value]?.frame(dt));
