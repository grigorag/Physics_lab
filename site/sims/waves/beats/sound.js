// Tab 1 — sound wave: loudspeaker membrane, air particles, ξ(x) and p(x) graphs.
//
// All positions in the scene are computed analytically from the wave phase
// (phase = 2π·f_vis·t_real, see physics.visibleFrequency), so the picture is
// frame-rate independent. The particle displacement is exaggerated: at 100 %
// amplitude the compression reaches ≈ 70 % of the equilibrium density.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindSegmented, bindPlayPause } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, circle } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import {
  MEDIA, freqFromSlider, sliderFromFreq, wavelength, period, hearingBand, nearestNote,
  visibleFrequency, slowFactor, displacementAt, pressureAt,
} from './physics.js';
import { bindListen } from './audio.js';
import { fmtHz, fmtLen, fmtTime, niceStep, decimalsFor, mixHex } from './shared.js';

const N_LAMBDA = 4.5;        // wavelengths shown across the scene
const MAX_STRAIN = 0.7;      // compression at 100 % amplitude
const MARKERS = [{ at: 0.75, row: 0.2 }, { at: 1.5, row: 0.5 }, { at: 2.25, row: 0.8 }];
const GAIN = 0.15;           // audio volume at 100 % amplitude

const C = themed((light) => ({
  speaker: light ? '#7d88a8' : '#5a6794',
  speakerFill: light ? '#e3e8f4' : '#1d2338',
  membrane: light ? '#2b3350' : '#cfd6f0',
  marker: COLORS.amber,
  markerRim: light ? '#6e4200' : '#ffe2a8',
  xi: COLORS.purple,
  panelBorder: light ? 'rgba(30,42,90,0.18)' : 'rgba(120,140,200,0.2)',
}));

export function createSound(engine) {
  const view = fluidCanvas(byId('sCv'), {
    height: (w) => clamp(Math.round(w * 0.9), 420, 600),
    onResize: () => draw(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const S = { f: 440, amp: 0.6, medium: 'air', phase: 0 };

  // ---------- Controls ----------
  const freqCtl = bindRange('sFreq', {
    format: (s) => fmtHz(freqFromSlider(s)),
    onInput: (s) => setFrequency(freqFromSlider(s), false),
  });
  const presets = bindSegmented('sPreset', {
    onChange: (v) => setFrequency(+v, true),
  });
  bindRange('sAmp', {
    format: (v) => `${v.toFixed(0)} %`,
    onInput: (v) => { S.amp = v / 100; listen.refresh(); updateStats(); },
  });
  bindSegmented('sMedium', {
    onChange: (v) => { S.medium = v; updateStats(); },
  });
  const showXi = bindCheckbox('sShowXi');
  const showP = bindCheckbox('sShowP');
  const showMarkers = bindCheckbox('sShowMarkers');

  const play = bindPlayPause('sPlay', {
    onChange: (paused) => { if (paused) listen.stop(); },
  });
  const listen = bindListen('sListen', engine, () => [{ freq: S.f, gain: GAIN * S.amp }]);

  function setFrequency(f, fromPreset) {
    S.f = f;
    if (fromPreset) {
      freqCtl.set(sliderFromFreq(f), { silent: true });
      freqCtl.show(fmtHz(f));
    } else {
      presets.set('', { silent: true });
    }
    listen.refresh();
    updateStats();
  }

  // ---------- Stats ----------
  function updateStats() {
    const m = MEDIA[S.medium];
    const lam = wavelength(m.v, S.f);
    const note = nearestNote(S.f);
    setText('sStatF', fmtHz(S.f));
    setText('sStatT', fmtTime(period(S.f)));
    setText('sStatLambda', fmtLen(lam));
    setText('sStatV', `${m.v} մ/վ (${m.name})`);
    setHTML('sStatNote', `${note.name}<sub>${note.octave}</sub>`);
    const n = Math.round(slowFactor(S.f));
    setText('sStatSlow', `×${n}`);
    setText('sSlow', `×${n}`);

    const band = hearingBand(S.f);
    const pitch = S.f < 100 ? 'շատ ցածր, բասային' : S.f < 250 ? 'ցածր' : S.f < 500 ? 'միջին'
      : S.f < 1000 ? 'բարձր' : 'շատ բարձր, ճռռացող';
    const range = band === 'audible' ? 'լսելի տիրույթում է'
      : band === 'infra' ? 'ինֆրաձայնային տիրույթում է և չի լսվում' : 'ուլտրաձայնային տիրույթում է և չի լսվում';
    setText('sPitchNote', `${fmtHz(S.f)}՝ ${pitch} ձայն (մոտավորապես «${note.name}» նոտա). այն ${range}։ `
      + `${fmtHz(S.f)} հաճախության դեպքում ալիքի երկարությունը ${m.loc} ${fmtLen(lam)} է։`);
  }

  // ---------- Drawing ----------
  const phaseOffset = () => S.phase;

  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const m = MEDIA[S.medium];
    const lam = wavelength(m.v, S.f);
    const phase = phaseOffset();

    // ----- layout -----
    const nGraphs = (showXi.checked ? 1 : 0) + (showP.checked ? 1 : 0);
    const axisH = 52;
    const speakerW = W < 520 ? 44 : 64;
    const xm = 12 + speakerW;                    // membrane equilibrium = x = 0
    const xr = W - 14;
    const lamPx = (xr - xm) / N_LAMBDA;
    const sceneH = nGraphs === 0 ? H - axisH : clamp(Math.round(H * 0.4), 130, 215);
    const gH = nGraphs ? (H - sceneH - axisH) / nGraphs : 0;

    // ----- scene geometry -----
    const rowsTop = 28;
    const rowsBot = sceneH - 10;
    const nRows = clamp(Math.floor((rowsBot - rowsTop) / 14) + 1, 5, 11);
    const dyRow = (rowsBot - rowsTop) / (nRows - 1);
    const nPer = clamp(Math.round(lamPx / 8), 10, 28);       // particle columns per wavelength
    const nCols = Math.round(N_LAMBDA * nPer);
    const dx = lamPx / nPer;
    const radius = clamp(dx * 0.26, 1.4, 3.2);
    const amplPx = MAX_STRAIN * (lamPx / TAU) * S.amp;       // displacement amplitude, px
    const cy = (rowsTop + rowsBot) / 2;

    // ----- loudspeaker -----
    const memX = xm + amplPx * displacementAt(0, phase);
    const boxX = 12, boxW = speakerW * 0.42;
    const coneBack = boxX + boxW;
    const halfRows = (rowsBot - rowsTop) / 2 + 8;
    ctx.save();
    ctx.fillStyle = C.speakerFill;
    ctx.strokeStyle = C.speaker;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();                                          // enclosure
    ctx.rect(boxX, cy - halfRows * 0.42, boxW, halfRows * 0.84);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();                                          // cone
    ctx.moveTo(coneBack, cy - halfRows * 0.42);
    ctx.lineTo(memX, cy - halfRows);
    ctx.lineTo(memX, cy + halfRows);
    ctx.lineTo(coneBack, cy + halfRows * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    line(ctx, memX, cy - halfRows, memX, cy + halfRows, { color: C.membrane, width: 3.5, cap: 'round' });
    if (W >= 420) {
      text(ctx, 'թաղանթ', 12, 12, { color: COLORS.text3, size: 10 });
    }

    // ----- compression / rarefaction labels (wide scenes only) -----
    if (lamPx >= 110) {
      const frac = phase / TAU;
      for (let n = -1; n <= N_LAMBDA + 1; n++) {
        for (const [off, name, color] of [[0, 'խտացում', COLORS.coral], [0.5, 'նոսրացում', COLORS.blue]]) {
          // pressure ∝ cos(φ − 2πx/λ): maximum where x/λ = φ/2π − n, minimum half a wavelength later
          const xl = frac - n - off;
          const px = xm + xl * lamPx;
          if (px < xm + 36 || px > xr - 36) continue;
          text(ctx, name, px, 12, { color, size: 11, weight: 600, align: 'center' });
        }
      }
    }

    // ----- air particles -----
    const rowY = (r) => rowsTop + r * dyRow;
    const markerCols = MARKERS.map((mk) => ({
      col: Math.round(mk.at * nPer) - 1,
      row: Math.round(mk.row * (nRows - 1)),
    }));
    const markerOn = showMarkers.checked;
    const isMarker = (c, r) => markerOn && markerCols.some((mk) => mk.col === c && mk.row === r);

    for (let c = 0; c < nCols; c++) {
      const xeq = (c + 0.5) * dx;                            // equilibrium distance from membrane, px
      const xl = xeq / lamPx;
      const shift = amplPx * displacementAt(xl, phase);
      const p = pressureAt(xl, phase) * S.amp;               // −1…1, compression > 0
      const t = clamp(Math.abs(p) * 1.25, 0, 1);
      ctx.fillStyle = mixHex(COLORS.text3, p >= 0 ? COLORS.coral : COLORS.blue, t);
      ctx.beginPath();
      for (let r = 0; r < nRows; r++) {
        if (isMarker(c, r)) continue;
        const x = xm + xeq + shift;
        const y = rowY(r);
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.fill();
    }

    // ----- marker particles -----
    if (markerOn) {
      for (const mk of markerCols) {
        const xeq = (mk.col + 0.5) * dx;
        const shift = amplPx * displacementAt(xeq / lamPx, phase);
        const y = rowY(mk.row);
        const x0 = xm + xeq;
        // dashed guide through the equilibrium column, down to the graphs
        line(ctx, x0, rowsTop - 6, x0, H - axisH, { color: alpha(COLORS.amber, 0.4), width: 1, dash: [3, 4] });
        line(ctx, x0, y, x0 + shift, y, { color: C.marker, width: 2 });
        line(ctx, x0, y - 6, x0, y + 6, { color: C.markerRim, width: 1.5 });
        circle(ctx, x0 + shift, y, Math.max(radius * 1.9, 4.5), { fill: C.marker, stroke: C.markerRim, width: 1.3 });
      }
    }

    // ----- graphs -----
    let gy = sceneH;
    const graphs = [];
    if (showXi.checked) graphs.push('xi');
    if (showP.checked) graphs.push('p');
    for (const kind of graphs) {
      const y0 = gy + 3;
      const h = gH - 6;
      const mid = y0 + h / 2;
      const half = h / 2 - 7;
      const val = (xl) => (kind === 'xi' ? displacementAt(xl, phase) : pressureAt(xl, phase)) * S.amp;
      const Y = (v) => mid - v * half;

      ctx.save();
      ctx.strokeStyle = C.panelBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(xm + 0.5, y0 + 0.5, xr - xm - 1, h - 1);
      ctx.restore();
      line(ctx, xm, mid, xr, mid, { color: COLORS.axis, width: 1 });
      for (const s of [1, -1]) {
        line(ctx, xm, Y(s), xr, Y(s), { color: COLORS.grid, width: 1, dash: [3, 5] });
      }

      // side label
      text(ctx, kind === 'xi' ? 'ξ' : 'p', xm - 10, mid - 8, {
        color: COLORS.text, size: 16, style: 'italic', family: 'display', align: 'right',
      });
      text(ctx, kind === 'xi' ? 'շեղում' : 'ճնշում', xm - 6, mid + 9, {
        color: COLORS.text3, size: 10, align: 'right',
      });

      // curve (+ tinted areas for pressure)
      const step = 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(xm, y0, xr - xm, h);
      ctx.clip();
      if (kind === 'p') {
        for (const sign of [1, -1]) {
          ctx.fillStyle = alpha(sign > 0 ? COLORS.coral : COLORS.blue, 0.28);
          ctx.beginPath();
          ctx.moveTo(xm, mid);
          for (let x = xm; x <= xr + step; x += step) {
            const v = val((x - xm) / lamPx);
            ctx.lineTo(x, Y(sign * Math.max(sign * v, 0)));
          }
          ctx.lineTo(xr + step, mid);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.strokeStyle = kind === 'xi' ? C.xi : COLORS.text;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = xm; x <= xr + step; x += step) {
        const y = Y(val((x - xm) / lamPx));
        if (x === xm) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      if (markerOn) {
        for (const mk of markerCols) {
          const xl = ((mk.col + 0.5) * dx) / lamPx;
          circle(ctx, xm + xl * lamPx, Y(val(xl)), 4.5, { fill: C.marker, stroke: C.markerRim, width: 1.3 });
        }
      }
      gy += gH;
    }

    // ----- distance axis (metres) -----
    const yA = H - axisH + 10;
    line(ctx, xm, yA, xr, yA, { color: COLORS.axis, width: 1 });
    const length = N_LAMBDA * lam;
    const step = niceStep(length / (W < 520 ? 4 : 8));
    const digits = decimalsFor(step);
    for (let k = 0; k * step <= length + 1e-9; k++) {
      const x = xm + (k * step / lam) * lamPx;
      line(ctx, x, yA, x, yA + 4, { color: COLORS.axis, width: 1 });
      text(ctx, (k * step).toFixed(digits), x, yA + 14, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
    text(ctx, 'x, մ', 12, yA + 14, { color: COLORS.text3, size: 11 });

    // wavelength dimension line
    const yL = yA + 28;
    line(ctx, xm, yL, xm + lamPx, yL, { color: COLORS.amber, width: 1.6 });
    line(ctx, xm, yL - 4, xm, yL + 4, { color: COLORS.amber, width: 1.6 });
    line(ctx, xm + lamPx, yL - 4, xm + lamPx, yL + 4, { color: COLORS.amber, width: 1.6 });
    text(ctx, `λ = ${fmtLen(lam)}`, xm + lamPx + 8, yL, { color: COLORS.amber, size: 12, weight: 600 });
  }

  // ---------- Frame ----------
  updateStats();
  return {
    frame(dt) {
      if (!play.paused) S.phase = (S.phase + TAU * visibleFrequency(S.f) * dt) % TAU;
      draw();
    },
    stopAudio: () => listen.stop(),
  };
}
