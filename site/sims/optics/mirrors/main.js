// Plane and spherical mirrors — two experiments on one page.
// Both canvases are static (redrawn on input, resize and theme change);
// a hidden one is redrawn by its ResizeObserver when its tab opens.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { createSpherical } from './spherical.js';
import { createPlane } from './plane.js';

const sims = {
  spherical: createSpherical(),
  plane: createPlane(),
};

const tabs = bindTabs('tabs', { hash: true, onChange: (name) => sims[name]?.draw() });
sims[tabs.value]?.draw();
