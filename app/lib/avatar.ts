// Deterministic, colorful avatar generated from a nickname/address hash.
// No external service — pure SVG data URI so it renders instantly on the big screen.

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTES = [
  ["#3B82F6", "#93C5FD"],
  ["#F5A623", "#FCD34D"],
  ["#22C55E", "#86EFAC"],
  ["#EF4444", "#FCA5A5"],
  ["#A855F7", "#D8B4FE"],
  ["#06B6D4", "#67E8F9"],
  ["#EC4899", "#F9A8D4"],
  ["#F97316", "#FDBA74"],
];

export type Avatar = { bg: string; fg: string; hat: boolean; glasses: boolean; hue: number; initials: string };

export function avatarFor(seed: string): Avatar {
  const h = hashStr(seed);
  const pal = PALETTES[h % PALETTES.length];
  return {
    bg: pal[0],
    fg: pal[1],
    hat: ((h >> 3) & 1) === 1,
    glasses: ((h >> 5) & 1) === 1,
    hue: h % 360,
    initials: (seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2) || "??").toUpperCase(),
  };
}

/** Small round SVG avatar as a data URI (usable in <img> or CSS). */
export function avatarSvg(seed: string, size = 64): string {
  const a = avatarFor(seed);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 64 64'>
  <defs><radialGradient id='g' cx='40%' cy='35%'><stop offset='0%' stop-color='${a.fg}'/><stop offset='100%' stop-color='${a.bg}'/></radialGradient></defs>
  <circle cx='32' cy='32' r='31' fill='url(#g)' stroke='rgba(255,255,255,0.25)' stroke-width='2'/>
  <circle cx='24' cy='28' r='3.2' fill='#0b0f1a'/>
  <circle cx='40' cy='28' r='3.2' fill='#0b0f1a'/>
  <path d='M22 42 Q32 50 42 42' stroke='#0b0f1a' stroke-width='3' fill='none' stroke-linecap='round'/>
  ${a.glasses ? "<path d='M18 27 h12 M34 27 h12' stroke='#0b0f1a' stroke-width='2'/>" : ""}
  ${a.hat ? "<rect x='16' y='10' width='32' height='7' rx='3' fill='#0b0f1a'/><rect x='22' y='4' width='20' height='8' rx='3' fill='#0b0f1a'/>" : ""}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
