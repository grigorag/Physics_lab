// Reflection and refraction of light — two experiments on one page:
// a boundary between two media, and a plane-parallel plate.
// Both canvases are static (redrawn on input, resize and theme change);
// a hidden one is redrawn by its ResizeObserver when its tab opens.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { createInterface } from './interface.js';
import { createPlate } from './plate.js';

const sims = {
  boundary: createInterface(),
  plate: createPlate(),
};

const tabs = bindTabs('tabs', { hash: true, onChange: (name) => sims[name]?.draw() });
sims[tabs.value]?.draw();
