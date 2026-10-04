// Canvas setup that is crisp on high-DPI screens.
//
// Two flavours:
//   fixedCanvas(canvas, w, h)   – the simulation works in a fixed logical
//                                 coordinate system (w × h); CSS scales it to fit.
//   fluidCanvas(canvas, opts)   – logical size follows the container width;
//                                 height is computed from the width.
// Both return a "view": { canvas, ctx, width, height, dpr }, where width/height
// are logical units. Draw in logical units – the DPR transform is already set.

const MAX_DPR = 2;
const currentDpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

export function fixedCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d');
  const dpr = currentDpr();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.aspectRatio = `${width} / ${height}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, width, height, dpr };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {(width:number) => number} [opts.height]  logical height for a given width
 * @param {(view) => void} [opts.onResize]          called after later size changes
 *                                                  (not for the initial sizing)
 */
export function fluidCanvas(canvas, { height = (w) => w * 0.56, onResize } = {}) {
  const ctx = canvas.getContext('2d');
  const view = { canvas, ctx, width: 0, height: 0, dpr: 1 };
  const parent = canvas.parentElement;

  function resize(notify) {
    const w = Math.round(parent.clientWidth);
    const h = Math.round(height(w));
    const dpr = currentDpr();
    if (w === view.width && h === view.height && dpr === view.dpr) return;
    Object.assign(view, { width: w, height: h, dpr });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (notify) onResize?.(view);
  }

  // Size synchronously now (no callback — the caller isn't initialised yet),
  // then notify on every later change.
  resize(false);
  new ResizeObserver(() => resize(true)).observe(parent);
  return view;
}

/** Pointer position in the view's logical coordinates. */
export function pointerPos(view, event) {
  const r = view.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - r.left) * view.width) / r.width,
    y: ((event.clientY - r.top) * view.height) / r.height,
  };
}

/**
 * Unified mouse/touch/pen dragging on a canvas.
 * handlers.start(p, e) may return false to ignore the gesture.
 * handlers.move(p, delta, e) receives logical position and delta in CSS pixels.
 */
export function onDrag(view, { start, move, end } = {}) {
  const el = view.canvas;
  let active = false;
  let last = null;

  el.addEventListener('pointerdown', (e) => {
    const p = pointerPos(view, e);
    if (start && start(p, e) === false) return;
    active = true;
    last = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const delta = { x: e.clientX - last.x, y: e.clientY - last.y };
    last = { x: e.clientX, y: e.clientY };
    move?.(pointerPos(view, e), delta, e);
  });
  const stop = (e) => {
    if (!active) return;
    active = false;
    end?.(e);
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}
