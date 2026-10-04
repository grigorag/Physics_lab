// Mathematical pendulum and spring oscillator — two experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createPendulum } from './pendulum.js';
import { createSpring } from './spring.js';

const sims = {
  pendulum: createPendulum(),
  spring: createSpring(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => sims[tabs.value]?.frame(dt));
