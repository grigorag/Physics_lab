// Standing waves and resonance — three experiments on one page.
// Only the experiment in the visible tab is animated.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { createString } from './string.js';
import { createPipe } from './pipe.js';
import { createResonance } from './resonance.js';

const sims = {
  string: createString(),
  pipe: createPipe(),
  resonance: createResonance(),
};

const redrawAll = () => Object.values(sims).forEach((s) => s.redraw());

const tabs = bindTabs('tabs', {
  hash: true,
  onChange: (name) => {
    if (name !== 'pipe') sims.pipe.stopSound();
    // canvases in a hidden panel have no size; draw once they are visible
    requestAnimationFrame(() => sims[name].redraw());
  },
});

onThemeChange(redrawAll);
fontsReady().then(redrawAll);

// exposed for automated checks
window.__standingWaves = sims;

startLoop((dt) => sims[tabs.value]?.frame(dt));
