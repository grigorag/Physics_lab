// Diffusion and Brownian motion — two experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createBrownian } from './brownian.js';
import { createDiffusion } from './diffusion.js';

const sims = {
  brownian: createBrownian(),
  diffusion: createDiffusion(),
};

const tabs = bindTabs('tabs', { hash: true });

// The physics works in 60-fps frame units; maxDt 0.05 s = 3 frames (the original cap).
startLoop((dt) => sims[tabs.value]?.frame(dt * 60));
