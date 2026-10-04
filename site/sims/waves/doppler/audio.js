// Optional sound: a sine tone at the currently observed pitch (Web Audio).
// Must be started from a user gesture. Fades in/out to avoid clicks.

const GAIN = 0.12;

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let osc = null;
  let gain = null;
  let on = false;

  function start() {
    if (!AC || on) return on;
    try {
      ctx = new AC();
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      ctx.resume?.();
      on = true;
    } catch {
      stop();
    }
    return on;
  }

  function stop() {
    on = false;
    const c = ctx, o = osc, g = gain;
    ctx = osc = gain = null;
    if (!c) return;
    try {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setTargetAtTime(0, c.currentTime, 0.03);
      o.stop(c.currentTime + 0.2);
      setTimeout(() => c.close?.(), 400);
    } catch { /* already closed */ }
  }

  /** freq in Hz, or null for silence. */
  function set(freq) {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    if (freq === null || !Number.isFinite(freq)) {
      gain.gain.setTargetAtTime(0, t, 0.05);
    } else {
      osc.frequency.setTargetAtTime(freq, t, 0.03);
      gain.gain.setTargetAtTime(GAIN, t, 0.05);
    }
  }

  return {
    supported: !!AC,
    get on() { return on; },
    start,
    stop,
    set,
  };
}
