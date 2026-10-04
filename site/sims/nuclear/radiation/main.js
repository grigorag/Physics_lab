// α, β and γ radiation — two experiments on one page:
// the beam split by a magnetic / electric field, and penetration through absorbers.
// One animation loop drives whichever tab is visible.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createField } from './field.js';
import { createPenetration } from './penetration.js';

const sims = {
  field: createField(),
  penetration: createPenetration(),
};

const tabs = bindTabs('tabs', { hash: true });

startLoop((dt) => sims[tabs.value]?.frame(dt));
