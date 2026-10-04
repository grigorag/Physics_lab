// De Broglie waves — two experiments on one page:
// the wavelength of a moving object, and electron diffraction on a graphite foil.
// One animation loop draws only the active tab.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createWavelength } from './wavelength.js';
import { createDiffraction } from './diffraction.js';

const sims = {
  wavelength: createWavelength(),
  diffraction: createDiffraction(),
};

const tabs = bindTabs('tabs', { hash: true });
startLoop((dt) => sims[tabs.value]?.frame(dt));
