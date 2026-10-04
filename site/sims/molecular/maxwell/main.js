// Maxwell speed distribution — two views on one page:
//   model:  a 2D hard-disc gas relaxing to the equilibrium speed distribution;
//   theory: the 3D Maxwell distribution of real gases in SI units.
// Only the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createModel } from './model.js';
import { createTheory } from './theory.js';

const views = {
  model: createModel(),
  theory: createTheory(),
};

const tabs = bindTabs('tabs', { hash: true, onChange: (name) => name === 'theory' && views.theory.draw() });

startLoop((dt) => views[tabs.value]?.frame(dt));
