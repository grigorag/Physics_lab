// Heisenberg uncertainty relation — two experiments on one page:
// a wave packet built from plane waves, and electrons passing a single slit.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createPacket } from './packet.js';
import { createSlit } from './slit.js';

const sims = {
  packet: createPacket(),
  slit: createSlit(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => sims[tabs.value]?.frame(dt));
