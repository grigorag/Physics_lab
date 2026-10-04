// Electromagnetic induction — two experiments on one page.
// Only the experiment in the visible tab is stepped and drawn.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createMagnetLab } from './magnet.js';
import { createFrameLab } from './frame.js';

const labs = {
  magnet: createMagnetLab(),
  frame: createFrameLab(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => labs[tabs.value]?.frame(dt));

// Handle for checking the physics from the browser console.
window.inductionLab = labs;
