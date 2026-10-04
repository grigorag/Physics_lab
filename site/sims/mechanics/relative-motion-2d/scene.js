// Canvas scene for the 2D relative-motion sim: grass ground, conveyor belt,
// ladybugs, velocity arrows and the arrow legend. The scene is a light
// illustration and keeps its own colors (independent of the dark site theme).
// Everything is drawn in the fixed 800 × 520 logical coordinate system.

import { arrow, roundRect, text } from '../../../assets/js/core/draw.js';
import { TAU } from '../../../assets/js/core/math.js';

export const W = 800;
export const H = 520;

// Belt geometry: a horizontal strip across the middle
export const BELT_TOP = 200;
export const BELT_BOTTOM = 340;

const VEC_SCALE = 0.6;                 // px of arrow per px/s of velocity
const C = {
  own: '#2e7d32',                      // own velocity (green)
  belt: '#c79100',                     // belt velocity (yellow)
  ground: '#1a1a1a',                   // ground-frame resultant (black)
};

export function drawGround(ctx) {
  // Two ground strips (above and below the belt)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#cfe0b8');
  grad.addColorStop(1, '#b5cc99');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, BELT_TOP);
  ctx.fillRect(0, BELT_BOTTOM, W, H - BELT_BOTTOM);

  // Subtle grid texture
  ctx.strokeStyle = 'rgba(80, 100, 60, 0.18)';
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = 0; x <= W; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, BELT_TOP);
    ctx.moveTo(x + 0.5, BELT_BOTTOM);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = 0; y <= BELT_TOP; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  for (let y = BELT_BOTTOM; y <= H; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();

  // Little grass tufts (only on the ground areas)
  ctx.fillStyle = 'rgba(70, 90, 50, 0.35)';
  for (let i = 0; i < 80; i++) {
    const seedX = (i * 97 + 13) % W;
    const seedY = (i * 53 + 7) % H;
    if (seedY > BELT_TOP - 6 && seedY < BELT_BOTTOM + 6) continue;
    ctx.fillRect(seedX, seedY, 1.5, 1.5);
  }
}

/** Belt body, rails, moving chevrons. phase = belt displacement (px), vx = belt velocity. */
export function drawBelt(ctx, phase, vx) {
  // Belt body
  const grad = ctx.createLinearGradient(0, BELT_TOP, 0, BELT_BOTTOM);
  grad.addColorStop(0, '#2c2c2c');
  grad.addColorStop(0.5, '#444');
  grad.addColorStop(1, '#2c2c2c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, BELT_TOP, W, BELT_BOTTOM - BELT_TOP);

  // Side rails (suggest rollers)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, BELT_TOP - 4, W, 6);
  ctx.fillRect(0, BELT_BOTTOM - 2, W, 6);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, BELT_TOP - 1, W, 1);
  ctx.fillRect(0, BELT_BOTTOM, W, 1);

  // Chevrons: moving pattern showing the belt direction
  const spacing = 70;
  const offset = ((phase % spacing) + spacing) % spacing;
  const dir = vx >= 0 ? 1 : -1;
  const cy = (BELT_TOP + BELT_BOTTOM) / 2;
  const cHeight = (BELT_BOTTOM - BELT_TOP) * 0.55;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 210, 63, 0.95)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let x = -spacing * 2; x < W + spacing * 2; x += spacing) {
    const cx = x + offset;
    ctx.beginPath();
    ctx.moveTo(cx - 14 * dir, cy - cHeight / 2);
    ctx.lineTo(cx + 14 * dir, cy);
    ctx.lineTo(cx - 14 * dir, cy + cHeight / 2);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle scanline texture
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = BELT_TOP + 6; y < BELT_BOTTOM; y += 8) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
}

/** Ladybug at (lb.x, lb.y) heading along its ground-frame velocity (gvx, gvy). */
export function drawLadybug(ctx, lb, gvx, gvy) {
  // Face the ground-frame motion if moving; otherwise own motion; otherwise +x
  let angle = 0;
  if (Math.hypot(gvx, gvy) > 0.5) angle = Math.atan2(gvy, gvx);
  else if (Math.hypot(lb.vx, lb.vy) > 0.5) angle = Math.atan2(lb.vy, lb.vx);

  ctx.save();
  ctx.translate(lb.x, lb.y);

  // Soft shadow
  ctx.save();
  ctx.translate(2, 3);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 13, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.rotate(angle);

  // Legs (six little lines)
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const lx of [-8, 0, 8]) {
    const tip = lx + Math.sign(lx) * 3;
    ctx.moveTo(lx, -8);
    ctx.lineTo(tip, -14);
    ctx.moveTo(lx, 8);
    ctx.lineTo(tip, 14);
  }
  ctx.stroke();

  // Body
  ctx.fillStyle = lb.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 12, 0, 0, TAU);
  ctx.fill();

  // Body shading (same ellipse path)
  const bodyGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 16);
  bodyGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
  bodyGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Center line (wing divide)
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-14, 0);
  ctx.stroke();

  // Spots
  ctx.fillStyle = '#1a1a1a';
  for (const [sx, sy] of [[3, -6], [3, 6], [-7, -6], [-7, 6], [-2, 0]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, TAU);
    ctx.fill();
  }

  // Head
  ctx.beginPath();
  ctx.ellipse(13, 0, 5, 7, 0, 0, TAU);
  ctx.fill();

  // Tiny eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(15, -3, 1, 0, TAU);
  ctx.moveTo(16, 3);
  ctx.arc(15, 3, 1, 0, TAU);
  ctx.fill();

  // Antennae
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(16, -3);
  ctx.quadraticCurveTo(22, -7, 24, -10);
  ctx.moveTo(16, 3);
  ctx.quadraticCurveTo(22, 7, 24, 10);
  ctx.stroke();
  // Antenna tips
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(24, -10, 1.4, 0, TAU);
  ctx.moveTo(25.4, 10);
  ctx.arc(24, 10, 1.4, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// Arrow with the original geometry: head length 0.9·size, half-width 0.5·size.
function vecArrow(ctx, x1, y1, x2, y2, color, width, size) {
  if (Math.hypot(x2 - x1, y2 - y1) < 2) return;
  arrow(ctx, x1, y1, x2, y2, {
    color, width, head: size * Math.hypot(0.9, 0.5), spread: Math.atan2(0.5, 0.9),
  });
}

/**
 * Own (green), belt (yellow, offset above) and ground-frame resultant
 * (black, offset below) velocity arrows of one ladybug.
 * beltVx = belt velocity felt by this bug (0 when it is on the ground).
 */
export function drawVectors(ctx, lb, beltVx) {
  const { x, y, vx, vy } = lb;
  const gvx = vx + beltVx;

  vecArrow(ctx, x, y, x + vx * VEC_SCALE, y + vy * VEC_SCALE, C.own, 2.5, 9);
  if (Math.abs(beltVx) > 0.5) {
    vecArrow(ctx, x, y - 22, x + beltVx * VEC_SCALE, y - 22, C.belt, 2.5, 9);
  }
  vecArrow(ctx, x, y + 22, x + gvx * VEC_SCALE, y + 22 + vy * VEC_SCALE, C.ground, 3, 10);
}

export function drawLegend(ctx) {
  const x = 14, y = H - 70;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, 200, 58, 4);
  ctx.fill();
  ctx.stroke();

  const rows = [
    [C.own, 'սեփական արագություն'],
    [C.belt, 'ժապավենի արագություն'],
    [C.ground, 'արդյունարար (գետնի)'],
  ];
  rows.forEach(([color, label], i) => {
    const ry = y + 12 + i * 16;
    ctx.fillStyle = color;
    ctx.fillRect(x + 10, ry, 14, 3);
    text(ctx, label, x + 32, ry + 5, { color: '#1a1a1a', size: 12, weight: 400, baseline: 'alphabetic' });
  });
}
