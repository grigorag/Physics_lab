// Line-art illustrations for the home-page cards (keyed by sim id).
// Drawn in currentColor, so each card takes its section's accent color.
// viewBox is always 0 0 160 90.

const svg = (body) =>
  `<svg viewBox="0 0 160 90" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const chevrons = (y) =>
  `<path stroke-opacity=".4" stroke-width="2"
     d="M18 ${y - 5}l5 5-5 5M48 ${y - 5}l5 5-5 5M78 ${y - 5}l5 5-5 5M108 ${y - 5}l5 5-5 5M138 ${y - 5}l5 5-5 5"/>`;

export const thumbs = {
  'relative-motion-1d': svg(`
    <rect x="-2" y="40" width="164" height="20" fill="currentColor" fill-opacity=".08" stroke-opacity=".3"/>
    ${chevrons(50)}
    <circle cx="40" cy="26" r="6" fill="currentColor" stroke="none"/>
    <path d="M50 26h28m-5-4 5 4-5 4" stroke-width="2"/>
    <circle cx="96" cy="50" r="6" fill="currentColor" fill-opacity=".6" stroke="none"/>
    <path d="M106 50h22m-5-4 5 4-5 4" stroke-width="2"/>
    <path d="M10 76h140M10 72v8M45 74v4M80 72v8M115 74v4M150 72v8" stroke-opacity=".4"/>
  `),

  'relative-motion-2d': svg(`
    <rect x="-2" y="52" width="164" height="22" fill="currentColor" fill-opacity=".08" stroke-opacity=".3"/>
    ${chevrons(63)}
    <circle cx="44" cy="63" r="6" fill="currentColor" stroke="none"/>
    <path d="M44 54V22M40 27l4-5 4 5" stroke-width="2"/>
    <path d="M44 22h56M95 18l5 4-5 4" stroke-opacity=".55" stroke-dasharray="3 4"/>
    <path d="M44 54 100 22M93 22.5 100 22l-4 5.8" stroke-width="2.2"/>
  `),

  'spring-waves': svg(`
    <path d="M6 45h148" stroke-opacity=".25" stroke-dasharray="2 4"/>
    <rect x="5" y="28" width="3" height="34" fill="currentColor" fill-opacity=".5" stroke="none"/>
    <rect x="152" y="28" width="3" height="34" fill="currentColor" fill-opacity=".5" stroke="none"/>
    <polyline stroke-opacity=".45" points="8,45 14,45 26,34.4 38,31.1 50,37.4 62,48.9 74,57.7 86,57.7 98,48.9 110,37.4 122,31.1 134,34.4 146,45 152,45"/>
    <g fill="currentColor" stroke="none">
      <circle cx="14" cy="45" r="4.5"/><circle cx="26" cy="34.4" r="4.5"/><circle cx="38" cy="31.1" r="4.5"/>
      <circle cx="50" cy="37.4" r="4.5"/><circle cx="62" cy="48.9" r="4.5"/><circle cx="74" cy="57.7" r="4.5"/>
      <circle cx="86" cy="57.7" r="4.5"/><circle cx="98" cy="48.9" r="4.5"/><circle cx="110" cy="37.4" r="4.5"/>
      <circle cx="122" cy="31.1" r="4.5"/><circle cx="134" cy="34.4" r="4.5"/><circle cx="146" cy="45" r="4.5"/>
    </g>
  `),

  diffusion: svg(`
    <rect x="10" y="12" width="140" height="66" rx="4" stroke-opacity=".45"/>
    <path d="M80 14v62" stroke-opacity=".35" stroke-dasharray="3 4"/>
    <g fill="currentColor" stroke="none">
      <circle cx="22" cy="24" r="3"/><circle cx="34" cy="54" r="3"/><circle cx="48" cy="30" r="3"/>
      <circle cx="26" cy="68" r="3"/><circle cx="60" cy="62" r="3"/><circle cx="66" cy="24" r="3"/>
      <circle cx="52" cy="46" r="3"/><circle cx="38" cy="38" r="3"/><circle cx="90" cy="36" r="3"/>
    </g>
    <g stroke-opacity=".8">
      <circle cx="98" cy="26" r="3"/><circle cx="112" cy="58" r="3"/><circle cx="126" cy="22" r="3"/>
      <circle cx="138" cy="46" r="3"/><circle cx="102" cy="68" r="3"/><circle cx="138" cy="68" r="3"/>
      <circle cx="120" cy="40" r="3"/><circle cx="72" cy="56" r="3"/>
    </g>
  `),

  'charged-particle': svg(`
    <path d="M132 80V12M128 17l4-5 4 5" stroke-opacity=".55"/>
    <path d="M24 80V12M20 17l4-5 4 5" stroke-opacity=".55"/>
    <ellipse cx="78" cy="70" rx="30" ry="8" stroke-opacity=".3"/>
    <ellipse cx="78" cy="56" rx="30" ry="8" stroke-opacity=".5"/>
    <ellipse cx="78" cy="42" rx="30" ry="8" stroke-opacity=".75"/>
    <path d="M48 28a30 8 0 0 0 60 0" stroke-width="2.2"/>
    <circle cx="108" cy="28" r="5" fill="currentColor" stroke="none"/>
    <path d="M108 28 96 16M98 21l-2-5 5 2" stroke-width="1.6"/>
  `),

  'thin-lens': svg(`
    <path d="M6 48h148" stroke-opacity=".35"/>
    <path d="M80 12v72M76 17l4-5 4 5M76 79l4 5 4-5" stroke-width="2" stroke-opacity=".8"/>
    <circle cx="58" cy="48" r="2" fill="currentColor"/><circle cx="102" cy="48" r="2" fill="currentColor"/>
    <path d="M36 48V28M32 32l4-4 4 4" stroke-width="2.2"/>
    <path d="M36 28h44l44 40" stroke-opacity=".7"/>
    <path d="M36 28l88 40" stroke-opacity=".45"/>
    <path d="M124 48v20M120 64l4 4 4-4" stroke-width="2.2"/>
  `),

  'wave-optics': svg(`
    <g stroke-opacity=".55">
      <circle cx="22" cy="34" r="16"/><circle cx="22" cy="34" r="32" stroke-opacity=".4"/>
      <circle cx="22" cy="34" r="48" stroke-opacity=".28"/><circle cx="22" cy="34" r="64" stroke-opacity=".18"/>
      <circle cx="22" cy="56" r="16"/><circle cx="22" cy="56" r="32" stroke-opacity=".4"/>
      <circle cx="22" cy="56" r="48" stroke-opacity=".28"/><circle cx="22" cy="56" r="64" stroke-opacity=".18"/>
    </g>
    <circle cx="22" cy="34" r="3" fill="currentColor" stroke="none"/>
    <circle cx="22" cy="56" r="3" fill="currentColor" stroke="none"/>
    <g fill="currentColor" stroke="none">
      <rect x="146" y="8" width="6" height="8" fill-opacity=".25"/><rect x="146" y="20" width="6" height="10" fill-opacity=".7"/>
      <rect x="146" y="34" width="6" height="6" fill-opacity=".2"/><rect x="146" y="40" width="6" height="10" fill-opacity="1"/>
      <rect x="146" y="50" width="6" height="6" fill-opacity=".2"/><rect x="146" y="60" width="6" height="10" fill-opacity=".7"/>
      <rect x="146" y="74" width="6" height="8" fill-opacity=".25"/>
    </g>
  `),
};

export const fallbackThumb = svg(`
  <circle cx="80" cy="45" r="5" fill="currentColor" stroke="none"/>
  <ellipse cx="80" cy="45" rx="34" ry="12" stroke-opacity=".6"/>
  <ellipse cx="80" cy="45" rx="34" ry="12" stroke-opacity=".6" transform="rotate(60 80 45)"/>
  <ellipse cx="80" cy="45" rx="34" ry="12" stroke-opacity=".6" transform="rotate(120 80 45)"/>
`);
