// requestAnimationFrame loop with a clamped time step.
//
//   const loop = startLoop((dt, now) => { step(dt); draw(); });
//   loop.stop();
//
// dt is in seconds and never exceeds maxDt, so a background tab or a slow
// frame does not make the physics jump.

export function startLoop(frame, { maxDt = 0.05 } = {}) {
  let last = null;
  let id = 0;
  let running = true;

  function tick(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, maxDt);
    last = now;
    frame(dt, now);
    if (running) id = requestAnimationFrame(tick);
  }

  id = requestAnimationFrame(tick);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(id);
    },
  };
}
