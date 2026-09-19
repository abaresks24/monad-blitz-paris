"use client";

// Hand-drawn riso-style SVG illustrations. No emoji, no stock art — flat fills, thick ink
// outlines, a limited screenprint palette. Every traveller is generated from a seed so the
// crowd feels varied but is deterministic.

const INK = "#0F1017";
const CREAM = "#F3E9D2";
const YELLOW = "#FFC53D";
const PAL = ["#FF4E3A", "#3B6BFF", "#FFC53D", "#37C871", "#F3E9D2", "#E86AA6"];
const HAIR = ["#2A2118", "#6B4A2B", "#111318", "#C9A227", "#8A5A2B", "#3a3f4a"];
const SKIN = ["#F1C9A5", "#E0A878", "#C98A5E", "#A9713F", "#F3D9BE"];

function fnv(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function Passenger({
  seed,
  size = 64,
  caught = false,
  dim = false,
}: {
  seed: string;
  size?: number;
  caught?: boolean;
  dim?: boolean;
}) {
  const h = fnv(seed);
  const coat = PAL[h % PAL.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const skin = SKIN[(h >> 6) % SKIN.length];
  const hat = (h >> 9) % 3; // 0 none, 1 beanie, 2 cap
  const scarf = ((h >> 11) & 1) === 1;
  const scarfCol = PAL[(h >> 12) % PAL.length];
  const bag = ((h >> 15) & 1) === 1;

  return (
    <svg width={size} height={size} viewBox="0 0 64 72" style={{ opacity: dim ? 0.4 : 1 }} className="no-select overflow-visible">
      {/* legs + shoes */}
      <rect x="24" y="52" width="6" height="12" fill={INK} />
      <rect x="34" y="52" width="6" height="12" fill={INK} />
      <rect x="22" y="62" width="10" height="4" rx="2" fill={INK} />
      <rect x="32" y="62" width="10" height="4" rx="2" fill={INK} />
      {/* bag strap + bag */}
      {bag && <rect x="40" y="34" width="10" height="12" rx="2" fill={scarfCol} stroke={INK} strokeWidth="2.5" />}
      {/* coat / body */}
      <path
        d="M20 36 Q20 28 32 28 Q44 28 44 36 L46 54 Q32 58 18 54 Z"
        fill={coat}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* arms */}
      <path d="M20 37 L15 50" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <path d="M44 37 L49 50" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      {/* scarf */}
      {scarf && <rect x="26" y="27" width="12" height="6" rx="3" fill={scarfCol} stroke={INK} strokeWidth="2" />}
      {/* head */}
      <circle cx="32" cy="18" r="11" fill={skin} stroke={INK} strokeWidth="3" />
      {/* hair / hat */}
      {hat === 0 && <path d="M21 15 Q22 6 32 6 Q42 6 43 15 Q38 10 32 10 Q26 10 21 15 Z" fill={hair} />}
      {hat === 1 && <path d="M21 14 Q22 4 32 4 Q42 4 43 14 Z" fill={coat === "#3B6BFF" ? "#FF4E3A" : "#3B6BFF"} stroke={INK} strokeWidth="2.5" />}
      {hat === 2 && (
        <>
          <path d="M21 13 Q22 5 32 5 Q42 5 43 13 Z" fill={hair} stroke={INK} strokeWidth="2.5" />
          <rect x="30" y="12" width="16" height="4" rx="2" fill={hair} stroke={INK} strokeWidth="2" />
        </>
      )}
      {/* face */}
      {caught ? (
        <>
          <path d="M25 16 l5 5 M30 16 l-5 5" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M34 16 l5 5 M39 16 l-5 5" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="32" cy="24" rx="3" ry="3.5" fill={INK} />
          {/* sweat */}
          <path d="M43 18 q3 4 0 7 q-3 -3 0 -7Z" fill="#7FC8FF" stroke={INK} strokeWidth="1" />
        </>
      ) : (
        <>
          <circle cx="28" cy="18" r="1.8" fill={INK} />
          <circle cx="36" cy="18" r="1.8" fill={INK} />
          <path d="M28 23 Q32 26 36 23" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

// The inspector: cap (képi) + red band + ticket punch. A stern silhouette, no face.
export function Controleur({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 72" className="no-select overflow-visible">
      <rect x="24" y="52" width="6" height="12" fill={INK} />
      <rect x="34" y="52" width="6" height="12" fill={INK} />
      <rect x="22" y="62" width="10" height="4" rx="2" fill={INK} />
      <rect x="32" y="62" width="10" height="4" rx="2" fill={INK} />
      {/* long coat */}
      <path d="M18 36 Q18 27 32 27 Q46 27 46 36 L48 56 Q32 60 16 56 Z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* badge */}
      <circle cx="40" cy="40" r="3" fill={YELLOW} />
      {/* arm + ticket punch */}
      <path d="M46 38 L54 46" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <rect x="50" y="44" width="9" height="7" rx="1.5" fill="#9AA3B2" stroke={INK} strokeWidth="2" />
      {/* head silhouette */}
      <circle cx="32" cy="18" r="11" fill={INK} />
      {/* képi: flat top + red band + visor */}
      <rect x="20" y="9" width="24" height="6" rx="2" fill={INK} stroke={INK} strokeWidth="2" />
      <rect x="20" y="13" width="24" height="3.5" fill="#FF4E3A" />
      <rect x="19" y="16" width="26" height="3" rx="1.5" fill={INK} />
      {/* subtle glaring eyes */}
      <rect x="27" y="18" width="4" height="2" rx="1" fill="#FF4E3A" />
      <rect x="34" y="18" width="4" height="2" rx="1" fill="#FF4E3A" />
    </svg>
  );
}

// A drawn RER car. Children (passengers) are laid out by the caller.
export function Wagon({
  index,
  inspected = false,
  full = false,
  children,
  height = 150,
}: {
  index: number;
  inspected?: boolean;
  full?: boolean;
  children?: React.ReactNode;
  height?: number;
}) {
  const body = inspected ? "#2A1512" : "#181A26";
  const edge = inspected ? "#FF4E3A" : CREAM;
  return (
    <div className="relative flex flex-col h-full" style={{ minWidth: 0 }}>
      <div
        className="relative rounded-2xl overflow-hidden h-full"
        style={{ background: body, border: `3px solid ${edge}`, boxShadow: inspected ? "0 0 0 3px rgba(255,78,58,0.35)" : "none", height: height ?? "100%" }}
      >
        {/* roof line */}
        <div className="absolute top-0 left-0 right-0 h-2" style={{ background: edge, opacity: 0.5 }} />
        {/* windows strip */}
        <div className="absolute top-3 left-2 right-2 flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 h-5 rounded-sm" style={{ background: inspected ? "#3a1a16" : "#0F1017", border: `2px solid ${edge}` }} />
          ))}
        </div>
        {/* number */}
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 riso text-[13px] px-1"
          style={{ color: edge }}
        >
          VOITURE {index + 1}
        </div>
        {/* occupants area */}
        <div className="absolute inset-x-1 bottom-8 top-10 flex flex-wrap items-end justify-center gap-0.5 overflow-hidden content-end">
          {children}
        </div>
        {/* doors */}
        <div className="absolute bottom-0 left-0 right-0 h-7 flex items-stretch">
          <div className="flex-1" />
          <div className="w-8 mx-1 rounded-t" style={{ borderLeft: `3px solid ${edge}`, borderRight: `3px solid ${edge}`, borderTop: `3px solid ${edge}` }} />
          <div className="flex-1" />
        </div>
        {full && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="riso text-vermilion text-xl -rotate-6" style={{ textShadow: "2px 2px 0 #0F1017" }}>
              COMPLET
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Title lockup mark: a ticket stub with the line-B roundel.
export function TicketMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="no-select">
      <rect x="6" y="16" width="52" height="32" rx="5" fill={CREAM} stroke={INK} strokeWidth="3" />
      <circle cx="6" cy="32" r="4" fill={INK} />
      <circle cx="58" cy="32" r="4" fill={INK} />
      <circle cx="24" cy="32" r="10" fill="#3B6BFF" stroke={INK} strokeWidth="3" />
      <text x="24" y="37" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="12" fill={CREAM}>
        B
      </text>
      <rect x="38" y="27" width="14" height="3" fill={INK} />
      <rect x="38" y="33" width="10" height="3" fill={INK} />
    </svg>
  );
}
