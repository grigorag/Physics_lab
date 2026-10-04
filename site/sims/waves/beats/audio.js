// Web Audio playback shared by both tabs: one AudioContext, a master gain
// with a short fade in/out, and one sine oscillator (+ gain) per voice.
// Everything starts from a user gesture (the «Լսել» button).

import { byId } from '../../../assets/js/core/dom.js';

const AudioCtx = window.AudioContext || window.webkitAudioContext;
export const audioSupported = Boolean(AudioCtx);

const FADE = 0.03;          // time constant of the fades, s

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let voices = [];
  let active = false;

  function ensureContext() {
    if (!ctx) {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  return {
    get active() { return active; },

    /** voices: [{ freq (Hz), gain (0…1) }] */
    start(params) {
      if (!audioSupported) return;
      if (active) this.stop();
      ensureContext();
      const now = ctx.currentTime;
      voices = params.map((p) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = p.freq;
        const g = ctx.createGain();
        g.gain.value = p.gain;
        osc.connect(g);
        g.connect(master);
        osc.start();
        return { osc, g };
      });
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.setTargetAtTime(1, now, FADE);
      active = true;
    },

    update(params) {
      if (!active) return;
      const now = ctx.currentTime;
      params.forEach((p, i) => {
        if (!voices[i]) return;
        voices[i].osc.frequency.setTargetAtTime(p.freq, now, FADE);
        voices[i].g.gain.setTargetAtTime(p.gain, now, FADE);
      });
    },

    stop() {
      if (!active) return;
      active = false;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.setTargetAtTime(0, now, FADE);
      const old = voices;
      voices = [];
      setTimeout(() => {
        for (const v of old) {
          try { v.osc.stop(); v.osc.disconnect(); v.g.disconnect(); } catch { /* already stopped */ }
        }
      }, 250);
    },
  };
}

/**
 * «🔊 Լսել» toggle for one tab.
 *   const listen = bindListen('sListen', engine, () => [{ freq, gain }]);
 *   listen.refresh()  – push changed parameters to the sound
 *   listen.stop()     – switch off (pause, tab change, page hidden)
 */
export function bindListen(id, engine, getParams) {
  const btn = byId(id);
  if (!audioSupported) {
    btn.hidden = true;
    return { refresh() {}, stop() {}, get on() { return false; } };
  }
  let on = false;

  function render() {
    btn.textContent = on ? '🔇 Անջատել ձայնը' : '🔊 Լսել';
    btn.setAttribute('aria-pressed', String(on));
  }

  function stop() {
    if (!on) return;
    on = false;
    engine.stop();
    render();
  }

  btn.addEventListener('click', () => {
    if (on) { stop(); return; }
    try {
      engine.start(getParams());
      on = true;
    } catch (err) {
      on = false;
      console.warn('Audio unavailable:', err);
    }
    render();
  });
  render();

  return {
    get on() { return on; },
    refresh() { if (on) engine.update(getParams()); },
    stop,
  };
}
