// Rutherford's experiment — two views on one page:
//   setup   — the Geiger–Marsden apparatus with a growing histogram of counts;
//   nucleus — Coulomb trajectories near a single nucleus (or a Thomson atom).
// The atom model is shared: switching it in one tab switches the other.
// One animation loop drives whichever tab is visible.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createSetup } from './setup.js';
import { createNucleus } from './nucleus.js';

const sims = {};
sims.setup = createSetup({ onModel: (m) => sims.nucleus.setModel(m) });
sims.nucleus = createNucleus({ onModel: (m) => sims.setup.setModel(m) });

const tabs = bindTabs('tabs', { hash: true, onChange: (name) => sims[name].draw() });
sims[tabs.value].draw();

startLoop((dt) => sims[tabs.value].frame(dt));

window.__rutherford = sims;   // handy for checking numbers from the console
