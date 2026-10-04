// Sound waves and beats — two tabs sharing one audio engine.
// Only the visible tab is animated; the sound is switched off whenever the
// user pauses, changes tab or leaves the page.

import { bindTabs } from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { createAudioEngine } from './audio.js';
import { createSound } from './sound.js';
import { createBeats } from './beats.js';

const engine = createAudioEngine();
const sims = {
  sound: createSound(engine),
  beats: createBeats(engine),
};

const stopAllAudio = () => Object.values(sims).forEach((s) => s.stopAudio());

const tabs = bindTabs('tabs', { hash: true, onChange: stopAllAudio });

document.addEventListener('visibilitychange', () => { if (document.hidden) stopAllAudio(); });
window.addEventListener('pagehide', stopAllAudio);

startLoop((dt) => sims[tabs.value]?.frame(dt));
