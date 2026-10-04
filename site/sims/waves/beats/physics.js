// Physics of the sound-wave and beats lab (DOM-free).
//
// Sound wave: a harmonic source at x = 0 drives a longitudinal wave
//   ξ(x, t) = ξ₀ · sin(ωt − kx),   k = 2π/λ,  λ = v/f
// ξ is the displacement of an air particle from its equilibrium position.
// The pressure deviation is p = −B·∂ξ/∂x ∝ cos(ωt − kx): a quarter wave
// out of phase with ξ.
//
// Beats: y = A₁·sin(2πf₁t) + A₂·sin(2πf₂t). The sum oscillates inside the
// envelope  E(t) = √(A₁² + A₂² + 2A₁A₂·cos(2π(f₂ − f₁)t)),
// which swings between A₁ + A₂ and |A₁ − A₂| with the beat frequency |f₁ − f₂|.

const TAU = Math.PI * 2;

// ---------- Sound waves ----------

/** Speed of sound, m/s (≈20 °C for air). */
export const MEDIA = {
  air: { v: 343, name: 'օդ', loc: 'օդում' },
  water: { v: 1480, name: 'ջուր', loc: 'ջրում' },
  steel: { v: 5100, name: 'պողպատ', loc: 'պողպատում' },
};

export const F_MIN = 20;
export const F_MAX = 2000;

/** The frequency slider is logarithmic: position 0…1000 ↔ 20…2000 Hz. */
export const freqFromSlider = (s) => Math.round(F_MIN * Math.pow(F_MAX / F_MIN, s / 1000));
export const sliderFromFreq = (f) => Math.round((1000 * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN));

export const wavelength = (v, f) => v / f;
export const period = (f) => 1 / f;

/** Human hearing: 16 Hz … 20 kHz. */
export function hearingBand(f) {
  if (f < 16) return 'infra';
  if (f > 20000) return 'ultra';
  return 'audible';
}

const NOTES = ['դո', 'դո♯', 'ռե', 'ռե♯', 'մի', 'ֆա', 'ֆա♯', 'սոլ', 'սոլ♯', 'լյա', 'լյա♯', 'սի'];

/** Nearest equal-tempered note (A4 = 440 Hz) with the octave number. */
export function nearestNote(f) {
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  return { name: NOTES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1 };
}

/**
 * The real oscillation (20…2000 Hz) is far too fast to see. The animation
 * runs at a rate that grows slowly with the real frequency, so a higher
 * pitch still looks "faster" but stays readable.
 */
export const visibleFrequency = (f) => 0.5 * Math.pow(f / 440, 0.35);
export const slowFactor = (f) => f / visibleFrequency(f);

/** Normalised displacement (−1…1) at x (in wavelengths) for wave phase φ = ωt. */
export const displacementAt = (xInLambda, phase) => Math.sin(phase - TAU * xInLambda);
/** Normalised pressure deviation (−1…1): compression > 0, rarefaction < 0. */
export const pressureAt = (xInLambda, phase) => Math.cos(phase - TAU * xInLambda);

// ---------- Beats ----------

export const tone = (A, f, t) => A * Math.sin(TAU * f * t);
export const beatSum = (A1, f1, A2, f2, t) => tone(A1, f1, t) + tone(A2, f2, t);
export const envelope = (A1, f1, A2, f2, t) =>
  Math.sqrt(Math.max(0, A1 * A1 + A2 * A2 + 2 * A1 * A2 * Math.cos(TAU * (f2 - f1) * t)));
export const beatFrequency = (f1, f2) => Math.abs(f1 - f2);
export const meanFrequency = (f1, f2) => (f1 + f2) / 2;
export const envelopeMax = (A1, A2) => A1 + A2;
export const envelopeMin = (A1, A2) => Math.abs(A1 - A2);
