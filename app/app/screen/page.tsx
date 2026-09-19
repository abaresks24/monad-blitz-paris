"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame, useCountdown } from "@/lib/useGame";
import { stationLabels, Role, Outcome, CARS } from "@/lib/game";
import { Avatar } from "@/components/Avatar";
import { QRCode } from "@/components/QRCode";
import { Confetti } from "@/components/Confetti";
import { ANNOUNCEMENTS, pickAnnouncement } from "@/lib/announcements";
import { announce, playStamp, playTick, setSoundEnabled } from "@/lib/sound";

export default function Screen() {
  const { state, connected } = useGame(0, 400);
  const [soundOn, setSoundOn] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

  const g = state?.game;
  const phase = state?.phase ?? "lobby";
  const station = state?.activeStation ?? -1;

  // announcements on phase/station change
  const lastKey = useRef("");
  useEffect(() => {
    if (!state) return;
    const key = `${phase}-${station}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (soundOn && (phase === "commit" || phase === "ended")) {
      announce(pickAnnouncement(station + phase.length));
    }
  }, [phase, station, soundOn, state]);

  if (!state || !g) {
    return (
      <Shell>
        <div className="led text-4xl animate-flicker">{connected ? "EN ATTENTE DE PARTIE…" : "CONNEXION…"}</div>
      </Shell>
    );
  }

  const labels = stationLabels(g.numStations);

  return (
    <Shell>
      <SoundToggle on={soundOn} set={setSoundOn} />
      {phase === "lobby" ? (
        <JoinScreen state={state} baseUrl={baseUrl} labels={labels} />
      ) : phase === "ended" ? (
        <EndScreen state={state} />
      ) : (
        <RunningScreen state={state} labels={labels} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="scanlines grain relative w-screen h-[100dvh] overflow-hidden bg-metro flex flex-col">{children}</main>;
}

function SoundToggle({ on, set }: { on: boolean; set: (b: boolean) => void }) {
  return (
    <button
      onClick={() => set(!on)}
      className="absolute top-4 right-4 z-50 glass rounded-full px-4 py-2 text-sm font-bold hover:scale-105 transition"
    >
      {on ? "🔊 Son ON" : "🔈 Activer le son"}
    </button>
  );
}

/* ------------------------------------------------------------------ QUAY BOARD */
function QuayBoard({ nextStop, remaining, phase }: { nextStop: string; remaining: number; phase: string }) {
  const secs = Math.max(0, Math.ceil(remaining));
  const ticker = useMemo(() => [...ANNOUNCEMENTS].sort(() => 0.5).join("   •   "), []);
  return (
    <div className="bg-black/70 border-y-2 border-led/30 py-3 px-6">
      <div className="flex items-center justify-between">
        <div className="led text-3xl md:text-5xl animate-flicker">
          PROCHAIN ARRÊT : {nextStop.toUpperCase()}
        </div>
        <div className={`led text-3xl md:text-5xl ${secs <= 3 ? "text-fine" : ""}`}>
          {phase === "commit" ? "EMBARQUEMENT" : phase === "reveal" ? "PORTES" : "CONTRÔLE"} {String(secs).padStart(2, "0")}s
        </div>
      </div>
      <div className="overflow-hidden mt-1 whitespace-nowrap">
        <div className="inline-block led text-lg animate-marquee">{ticker}   •   {ticker}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ RUNNING */
function RunningScreen({ state, labels }: { state: any; labels: string[] }) {
  const g = state.game;
  const station: number = state.activeStation;
  const phase: string = state.phase;
  const remaining = useCountdown(state.phaseEndsAt, () => state.now);

  // tick sound on last 3 seconds
  const lastTick = useRef(-1);
  useEffect(() => {
    const s = Math.ceil(remaining);
    if (s !== lastTick.current) {
      lastTick.current = s;
      if (s <= 3 && s > 0) playTick(s === 1);
    }
  }, [remaining]);

  const result = state.results[station];
  const resolved = result?.resolved;
  const showResolution = phase === "resolve" && resolved;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <QuayBoard nextStop={labels[station] ?? "…"} remaining={remaining} phase={phase} />
      <div className="flex-1 flex min-h-0">
        {/* main stage */}
        <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
          <LineMap labels={labels} station={station} numStations={g.numStations} />
          <div className="flex-1 min-h-0">
            <Train state={state} station={station} phase={phase} showResolution={showResolution} />
          </div>
        </div>
        {/* leaderboard */}
        <Leaderboard board={state.board} />
      </div>
    </div>
  );
}

function LineMap({ labels, station, numStations }: { labels: string[]; station: number; numStations: number }) {
  const pct = numStations > 1 ? (Math.min(station, numStations - 1) / (numStations - 1)) * 100 : 0;
  return (
    <div className="relative h-16 px-6">
      <div className="absolute left-6 right-6 top-1/2 h-1.5 bg-white/15 rounded-full" />
      <motion.div
        className="absolute left-6 top-1/2 h-1.5 bg-rerb rounded-full shadow-neon"
        animate={{ width: `calc(${pct}% )` }}
        style={{ maxWidth: "calc(100% - 3rem)" }}
        transition={{ type: "spring", stiffness: 60 }}
      />
      <div className="absolute left-6 right-6 top-0 flex justify-between">
        {labels.map((l, i) => (
          <div key={i} className="flex flex-col items-center" style={{ width: 0 }}>
            <div className={`w-4 h-4 rounded-full border-2 ${i <= station ? "bg-rerb border-rerb shadow-neon" : "bg-night2 border-white/30"}`} />
            <div className={`mt-1 text-[11px] whitespace-nowrap ${i === station ? "text-white font-bold" : "text-gray-500"}`}>{l}</div>
          </div>
        ))}
      </div>
      {/* gliding train icon */}
      <motion.div
        className="absolute -top-1 text-2xl"
        animate={{ left: `calc(1.5rem + ${pct}% - 1rem)` }}
        transition={{ type: "spring", stiffness: 60 }}
      >
        🚆
      </motion.div>
    </div>
  );
}

function Train({ state, station, phase, showResolution }: { state: any; station: number; phase: string; showResolution: boolean }) {
  const result = state.results[station];
  const board = state.board as { addr: string; nick: string; pts: number; role: number }[];
  const nickOf = (addr: string) => board.find((b) => b.addr.toLowerCase() === addr.toLowerCase())?.nick ?? addr.slice(2, 6);

  // group passengers by car when resolved; otherwise show the platform with choice dots
  const carsData: Record<number, { addr: string; outcome: number }[]> = { 0: [], 1: [], 2: [], 3: [] };
  const inspected: number[] = result?.inspectedCars ?? [];
  if (showResolution && result) {
    result.addrs.forEach((addr: string, i: number) => {
      const car = result.cars[i];
      const outcome = result.outcomes[i];
      if (car >= 0 && car < CARS && outcome !== Outcome.INSPECT_HIDDEN) carsData[car].push({ addr, outcome });
    });
  }

  const caughtCount = showResolution && result ? result.outcomes.filter((o: number) => o === Outcome.CAUGHT).length : 0;

  // shake the whole train briefly when a resolution with catches lands
  const shake = showResolution && caughtCount > 0;

  return (
    <div className="h-full flex flex-col">
      <motion.div
        className="flex-1 grid grid-cols-4 gap-3"
        animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {Array.from({ length: CARS }).map((_, c) => {
          const isInspected = showResolution && inspected.includes(c);
          return (
            <motion.div
              key={c}
              className={`relative rounded-3xl border-2 p-3 flex flex-col ${
                isInspected ? "border-fine" : "border-white/15"
              }`}
              animate={isInspected ? { backgroundColor: ["rgba(239,68,68,0)", "rgba(239,68,68,0.25)", "rgba(239,68,68,0.1)"] } : { backgroundColor: "rgba(17,24,39,0.5)" }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-center text-sm text-gray-400 mb-2 font-bold">VOITURE {c + 1}</div>
              {/* inspector silhouettes */}
              {isInspected && (
                <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="absolute top-2 right-2 text-2xl">
                  🕵️‍♂️
                </motion.div>
              )}
              <div className="flex flex-wrap gap-2 content-start overflow-hidden">
                {showResolution
                  ? carsData[c].map((p) => <PassengerChip key={p.addr} nick={nickOf(p.addr)} outcome={p.outcome} />)
                  : null}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* platform (choice dots) during commit/reveal */}
      {!showResolution && <Platform state={state} station={station} phase={phase} />}

      {showResolution && caughtCount > 0 && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center mt-3 text-3xl font-black text-fine"
        >
          {caughtCount} fraudeur{caughtCount > 1 ? "s" : ""} pincé{caughtCount > 1 ? "s" : ""} !
        </motion.div>
      )}
    </div>
  );
}

function PassengerChip({ nick, outcome }: { nick: string; outcome: number }) {
  const caught = outcome === Outcome.CAUGHT;
  const paid = outcome === Outcome.PAID;
  return (
    <motion.div layout initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative">
      <Avatar seed={nick} size={44} ring={caught ? "#EF4444" : paid ? "#22C55E" : undefined} />
      {caught && (
        <motion.div
          initial={{ scale: 3, rotate: -25, opacity: 0 }}
          animate={{ scale: 1, rotate: -12, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, delay: 0.15 }}
          onAnimationStart={() => playStamp()}
          className="absolute -inset-1 flex items-center justify-center"
        >
          <span className="text-fine font-black text-[10px] leading-none border-2 border-fine rounded px-1 rotate-[-12deg] bg-black/70">
            AMENDE −20
          </span>
        </motion.div>
      )}
      {paid && <span className="absolute -bottom-1 -right-1 text-xs">🎫</span>}
    </motion.div>
  );
}

function Platform({ state, station, phase }: { state: any; station: number; phase: string }) {
  const dots = state.dots;
  const board = state.board as { addr: string; nick: string }[];
  if (!dots) return null;
  const chosen = dots.committed.filter(Boolean).length;
  return (
    <div className="mt-3 glass rounded-2xl p-3">
      <div className="text-center text-sm text-gray-300 mb-2">
        {phase === "commit" ? `${chosen}/${board.length} ont choisi (choix secret 🤫)` : `révélation en cours…`}
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-h-24 overflow-hidden">
        {board.map((b, i) => {
          const committed = dots.committed[i];
          const revealed = dots.revealed[i];
          return (
            <div key={b.addr} className="relative">
              <Avatar seed={b.nick} size={34} ring={revealed ? "#22C55E" : committed ? "#3B82F6" : undefined} />
              {committed && <span className="absolute -top-1 -right-1 text-[10px]">{revealed ? "✅" : "✓"}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard({ board }: { board: { addr: string; nick: string; pts: number; role: number }[] }) {
  const sorted = [...board].sort((a, b) => b.pts - a.pts).slice(0, 12);
  return (
    <div className="w-72 shrink-0 border-l border-white/10 bg-black/30 p-4 overflow-hidden">
      <div className="led text-xl mb-3">◉ CLASSEMENT</div>
      <div className="space-y-1.5">
        <AnimatePresence>
          {sorted.map((b, i) => (
            <motion.div
              key={b.addr}
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 glass rounded-xl px-2 py-1.5"
            >
              <span className="w-5 text-center font-bold text-gray-400">{i + 1}</span>
              <Avatar seed={b.nick} size={28} />
              <span className="flex-1 truncate text-sm">{b.nick}</span>
              <span className="font-extrabold text-paid">{b.pts}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ JOIN / LOBBY */
function JoinScreen({ state, baseUrl, labels }: { state: any; baseUrl: string; labels: string[] }) {
  const board = state.board as { addr: string; nick: string }[];
  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-10 p-10">
      <div className="text-center space-y-4">
        <div className="led text-2xl">◉ LIGNE B ◉</div>
        <h1 className="text-6xl font-extrabold">
          Fraude sur le <span className="text-rerb drop-shadow-[0_0_18px_rgba(59,130,246,0.7)]">RER B</span>
        </h1>
        <p className="text-2xl text-gray-200 max-w-xl mx-auto">
          Payez votre ticket ou fraudez. Des contrôleurs se cachent parmi vous.
          <br />
          Fraudeur contrôlé = <span className="text-fine font-bold">20 pts d&apos;amende</span>.
        </p>
        <div className="text-lg text-gray-400">{labels[0]} → {labels[labels.length - 1]}</div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <QRCode text={`${baseUrl}/play`} size={340} />
        <div className="led text-2xl">SCANNEZ POUR MONTER</div>
      </div>
      <div className="w-72">
        <div className="led text-xl mb-3">◉ {board.length} PASSAGERS À BORD</div>
        <div className="flex flex-wrap gap-2 justify-center">
          <AnimatePresence>
            {board.map((b) => (
              <motion.div key={b.addr} initial={{ scale: 0, y: -20 }} animate={{ scale: 1, y: 0 }} className="flex flex-col items-center w-16">
                <Avatar seed={b.nick} size={44} />
                <span className="text-xs truncate w-full text-center">{b.nick}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ END SCREEN */
function EndScreen({ state }: { state: any }) {
  const board = [...state.board].sort((a, b) => b.pts - a.pts) as { addr: string; nick: string; pts: number; role: number }[];
  const rolesRevealed = board.some((b) => b.role !== Role.NONE);
  const passengers = board.filter((b) => b.role === Role.PASSAGER);
  const controllers = board.filter((b) => b.role === Role.CONTROLEUR);

  const awards = [
    passengers[0] && { icon: "👑", title: "Roi de la fraude", who: passengers[0].nick, sub: `${passengers[0].pts} pts` },
    controllers[0] && { icon: "🎩", title: "Contrôleur de l'année", who: controllers.sort((a, b) => b.pts - a.pts)[0].nick, sub: `${controllers.sort((a, b) => b.pts - a.pts)[0].pts} pts` },
    passengers.length && { icon: "🐤", title: "Le Pigeon", who: [...passengers].sort((a, b) => a.pts - b.pts).reverse()[0] ? passengers.reduce((lo, p) => (p.pts < lo.pts ? p : lo), passengers[0]).nick : "", sub: "a tout payé" },
    board.length && { icon: "🍀", title: "Pas de chance", who: board[board.length - 1].nick, sub: `${board[board.length - 1].pts} pts` },
  ].filter(Boolean) as { icon: string; title: string; who: string; sub: string }[];

  return (
    <div className="flex-1 relative overflow-hidden p-8">
      <Confetti count={90} />
      <div className="text-center">
        <div className="led text-3xl">TERMINUS · AÉROPORT CDG 2</div>
        <h1 className="text-5xl font-extrabold mt-2">🏆 Palmarès</h1>
      </div>

      {/* podium */}
      <div className="flex items-end justify-center gap-4 mt-8">
        {[1, 0, 2].map((rank) => {
          const p = board[rank];
          if (!p) return null;
          const h = rank === 0 ? "h-48" : rank === 1 ? "h-36" : "h-28";
          return (
            <motion.div key={p.addr} initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 * rank, type: "spring" }} className="flex flex-col items-center">
              <Avatar seed={p.nick} size={rank === 0 ? 80 : 60} ring={p.role === Role.CONTROLEUR ? "#F5A623" : "#3B82F6"} />
              <div className="font-bold mt-1">{p.nick}</div>
              <div className="text-paid font-extrabold">{p.pts}</div>
              <div className={`${h} w-28 glass rounded-t-2xl mt-2 flex items-start justify-center pt-2 text-4xl`}>
                {rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* awards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 max-w-5xl mx-auto">
        {awards.map((a, i) => (
          <motion.div key={a.title} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 1 + i * 0.25 }} className="glass rounded-2xl p-4 text-center">
            <div className="text-4xl">{a.icon}</div>
            <div className="font-bold mt-1">{a.title}</div>
            <div className="text-rerb font-extrabold text-lg">{a.who}</div>
            <div className="text-xs text-gray-400">{a.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* role reveal */}
      {rolesRevealed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }} className="mt-10 text-center">
          <div className="led text-2xl mb-3">◉ LES CONTRÔLEURS ÉTAIENT…</div>
          <div className="flex flex-wrap gap-4 justify-center">
            {controllers.map((c, i) => (
              <motion.div key={c.addr} initial={{ rotateY: 180, scale: 0.5 }} animate={{ rotateY: 0, scale: 1 }} transition={{ delay: 2.4 + i * 0.2, type: "spring" }} className="flex flex-col items-center bg-amber/20 border border-amber rounded-2xl p-3">
                <Avatar seed={c.nick} size={56} ring="#F5A623" />
                <div className="font-bold mt-1">🎩 {c.nick}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
