// Shared wave-field renderer (used by interference & diffraction).
//
// The field is computed on a low-resolution offscreen buffer (logical size ×
// scale) and stretched to the view's logical size with smoothing.

import { clamp } from '../../../assets/js/core/math.js';

export class WaveField {
  /** @param view  a view from fixedCanvas(); @param scale  buffer resolution factor */
  constructor(view, scale) {
    this.view = view;
    this.ctx = view.ctx;
    this.scale = scale;
    this.w = Math.round(view.width * scale);
    this.h = Math.round(view.height * scale);
    this.off = document.createElement('canvas');
    this.off.width = this.w;
    this.off.height = this.h;
    this.octx = this.off.getContext('2d');
    this.img = this.octx.createImageData(this.w, this.h);
  }

  /**
   * sources: [{x, y, ph}] in logical canvas coords.
   * opts: { intensity, color: [r,g,b], leftPlane: x | null }
   */
  render(sources, lambda, t, opts) {
    const k = (2 * Math.PI) / lambda;
    const N = sources.length;
    const norm = 2.6 / N;
    const cosT = Math.cos(t), sinT = Math.sin(t);
    const { intensity = false, color = [120, 200, 255], leftPlane = null } = opts || {};
    const data = this.img.data;
    const inv = 1 / this.scale;
    let p = 0;
    for (let yi = 0; yi < this.h; yi++) {
      const py = (yi + 0.5) * inv;
      for (let xi = 0; xi < this.w; xi++) {
        const px = (xi + 0.5) * inv;
        let tt; // 0..1 display value
        if (leftPlane !== null && px < leftPlane) {
          tt = intensity ? 0.75 : (Math.cos(k * px - t) + 1) / 2;
        } else {
          let re = 0, im = 0;
          for (let s = 0; s < N; s++) {
            const dx = px - sources[s].x, dy = py - sources[s].y;
            const r = Math.sqrt(dx * dx + dy * dy);
            const att = Math.sqrt(lambda / Math.max(r, lambda));
            const a = k * r + sources[s].ph;
            re += Math.cos(a) * att;
            im += Math.sin(a) * att;
          }
          if (intensity) {
            const A = Math.hypot(re, im) * norm;
            tt = clamp(A * A * 1.45, 0, 1);
          } else {
            const v = (re * cosT + im * sinT) * norm;
            tt = clamp((v + 1) / 2, 0, 1);
          }
        }
        const sh = 0.06 + 0.94 * Math.pow(tt, 1.15);
        data[p++] = color[0] * sh;
        data[p++] = color[1] * sh;
        data[p++] = color[2] * sh;
        data[p++] = 255;
      }
    }
    this.octx.putImageData(this.img, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.off, 0, 0, this.view.width, this.view.height);
  }
}
