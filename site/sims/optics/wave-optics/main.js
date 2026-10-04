// Wave optics lab — four experiments on one page, switched by tabs.
// A single animation loop draws only the active experiment.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createInterference } from './interference.js';
import { createDiffraction } from './diffraction.js';
import { createPolarization } from './polarization.js';
import { createDispersion } from './dispersion.js';

const MODULES = {
  itf: createInterference(),
  dif: createDiffraction(),
  pol: createPolarization(),
  dsp: createDispersion(),
};

let active = 'itf';
const tabs = bindTabs('tabs', { hash: true, onChange: (name) => { active = name; } });
active = tabs.value;

startLoop((dt) => MODULES[active].draw(dt));
