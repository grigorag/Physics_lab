// Collisions — 1D carts and 2D discs. Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createLine } from './line.js';
import { createPlane } from './plane.js';

const sims = {
  line: createLine(),
  plane: createPlane(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => sims[tabs.value]?.frame(dt));
