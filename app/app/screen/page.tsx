"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame, useCountdown, type Snap } from "@/lib/useGame";
import { stationLabels, Role } from "@/lib/game";
import { Passenger, Controleur, Wagon, TicketMark } from "@/components/art";
import { QRCode } from "@/components/QRCode";
import { Confetti } from "@/components/Confetti";
import { ANNOUNCEMENTS, pickAnnouncement } from "@/lib/announcements";
import { startMusic, stopMusic, setSfxEnabled, speak, playDoors, playTick } from "@/lib/sound";

export default function Screen() {
  const { state, connected } = useGame(0, 400);
  const [on, setOn] = useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const lastKey = useRef("");
  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}-${state.station}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (on && state.phase === "board") speak(pickAnnouncement(state.station * 7 + 3));
    if (on && state.phase === "reveal") playDoors();
  }, [state?.phase, state?.station, on]); // eslint-disable-line

  if (!state) return <Shell><div className="riso text-cream text-5xl animate-wobble">{connected === false ? "CONNEXION…" : "EN GARE…"}</div></Shell>;

  return (
    <Shell>
      <button onClick={() => { const n = !on; setOn(n); setSfxEnabled(n); if (n) startMusic(); else stopMusic(); }} className="absolute top-4 right-4 z-50 btn bg-cream text-ink px-4 py-2 rounded-lg text-sm">
        {on ? "♪ SON ON" : "♪ ACTIVER LE SON"}
      </button>
      {state.game.started === false ? <Lobby state={state} baseUrl={baseUrl} /> : state.phase === "ended" ? <End state={state} /> : <Running state={state} on={on} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="paper halftone relative w-screen h-[100dvh] overflow-hidden flex flex-col">{children}</main>;
}

/* -------------------- LOBBY -------------------- */
function Lobby({ state, baseUrl }: { state: Snap; baseUrl: string }) {
  const labels = stationLabels(state.game.numStations);
  return (
    <div className="flex-1 flex items-center justify-center gap-12 p-10">
      <div className="space-y-5 max-w-xl">
        <div className="flex items-center gap-3"><TicketMark size={48} /><span className="riso text-cream text-2xl tracking-widest">LIGNE B</span></div>
        <h1 className="riso riso-offset text-cream text-7xl">Fraude sur<br />le RER B</h1>
        <p className="text-cream text-3xl font-bold">Cachez-vous dans le bon wagon.<br /><span className="text-vermilion">Les contrôleurs rôdent.</span></p>
        <div className="text-cream/70 text-xl">{labels[0]} → {labels[labels.length - 1]} · mise {(Number(state.game.entryFee) / 1e18).toFixed(4)} MON</div>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="card p-4 rounded-2xl"><QRCode text={`${baseUrl}/play`} size={300} /></div>
        <div className="riso text-cream text-3xl">SCANNEZ POUR JOUER</div>
      </div>
      <div className="w-80">
        <div className="riso text-yellow text-3xl mb-3">{state.game.playerCount} À BORD</div>
        <div className="flex flex-wrap gap-2 justify-center">
          <AnimatePresence>
            {state.roster.map((r) => (
              <motion.div key={r.addr} initial={{ scale: 0, y: -20 }} animate={{ scale: 1, y: 0 }} className="flex flex-col items-center w-20">
                <Passenger seed={r.nick} size={52} />
                <span className="text-cream text-xs truncate w-full text-center">{r.nick}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* -------------------- RUNNING -------------------- */
function Running({ state, on }: { state: Snap; on: boolean }) {
  const labels = stationLabels(state.game.numStations);
  const remaining = useCountdown(state.phaseEndsAt, () => state.now);
  const secs = Math.max(0, Math.ceil(remaining));
  const tickRef = useRef(-1);
  useEffect(() => { if (secs !== tickRef.current) { tickRef.current = secs; if (on && state.phase === "board" && secs <= 3 && secs > 0) playTick(secs === 1); } }, [secs, state.phase, on]);

  const reveal = state.phase === "reveal";
  const lr = state.lastReveal;
  const nWag = state.game.numWagons;

  // occupants per wagon
  const perWagon: number[][] = Array.from({ length: nWag }, () => []);
  if (reveal && lr) {
    state.roster.forEach((_, i) => { const w = lr.wagonOf[i]; if (w >= 0) perWagon[w].push(i); });
  } else if (state.currentBoarding) {
    state.roster.forEach((_, i) => { const w = state.currentBoarding!.wagons[i]; if (w >= 0) perWagon[w].push(i); });
  }
  const caught = new Set(reveal && lr ? [...lr.caught, ...lr.idleOut] : []);
  const inspected = new Set(reveal && lr ? lr.controllerWagons : []);
  const nCaught = caught.size;

  const ticker = useMemo(() => ANNOUNCEMENTS.join("   ✦   "), []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* quay board */}
      <div className="bg-ink2 border-y-4 border-cream/30 px-8 py-3 flex items-center justify-between">
        <div className="riso text-yellow text-4xl">PROCHAIN ARRÊT — {(labels[Math.min(state.station, labels.length - 1)] ?? "").toUpperCase()}</div>
        <div className={`riso text-4xl ${secs <= 3 && !reveal ? "text-vermilion" : "text-cream"}`}>{reveal ? "CONTRÔLE" : `EMBARQUEMENT ${String(secs).padStart(2, "0")}s`}</div>
      </div>
      <div className="overflow-hidden bg-ink py-1"><div className="whitespace-nowrap riso text-cream/70 text-lg animate-marquee inline-block">{ticker}   ✦   {ticker}</div></div>

      {/* pot + survivors */}
      <div className="flex items-center justify-center gap-10 py-3">
        <Counter label="POT" value={`${Number(state.potMon).toFixed(3)} MON`} color="text-vermilion" />
        <Counter label="SURVIVANTS" value={`${state.survivors}`} color="text-green" />
        <Counter label="STATION" value={`${Math.min(state.station + 1, state.game.numStations)}/${state.game.numStations}`} color="text-blue" />
      </div>

      {/* the train */}
      <motion.div className="flex-1 flex items-stretch gap-3 px-6 pb-6 min-h-0" animate={reveal && nCaught > 0 ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.5 }}>
        {Array.from({ length: nWag }).map((_, w) => {
          const occ = perWagon[w];
          const isInsp = inspected.has(w);
          return (
            <div key={w} className="flex-1 min-w-0">
              <Wagon index={w} inspected={isInsp} full={!reveal && occ.length >= state.game.wagonCap}>
                {isInsp && (
                  <motion.div initial={{ x: -80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="absolute top-8 right-1 z-10">
                    <Controleur size={54} />
                  </motion.div>
                )}
                {occ.map((i) => (
                  <div key={i} className="relative">
                    <Passenger seed={state.roster[i].nick} size={40} caught={caught.has(i)} />
                    {caught.has(i) && (
                      <motion.div initial={{ scale: 2.4, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -10, opacity: 1 }} className="absolute -top-1 -left-1 z-20">
                        <span className="riso text-cream bg-vermilion text-[9px] px-1 border-2 border-ink -rotate-6 inline-block">DEHORS</span>
                      </motion.div>
                    )}
                  </div>
                ))}
              </Wagon>
            </div>
          );
        })}
      </motion.div>

      {reveal && nCaught > 0 && (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center pb-4 riso text-vermilion text-4xl">
          {nCaught} pincé{nCaught > 1 ? "s" : ""} !
        </motion.div>
      )}
    </div>
  );
}

function Counter({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`riso text-5xl ${color}`}>{value}</div>
      <div className="text-cream/60 text-sm tracking-widest">{label}</div>
    </div>
  );
}

/* -------------------- END -------------------- */
function End({ state }: { state: Snap }) {
  const survivors = state.roster.filter((_, i) => state.alive[i]);
  const controllers = state.finalRoles ? state.roster.filter((_, i) => state.finalRoles![i] === Role.CONTROLEUR) : [];
  const share = survivors.length ? Number(state.potMon) / survivors.length : 0;
  return (
    <div className="flex-1 relative overflow-hidden p-10">
      <Confetti count={90} />
      <div className="text-center">
        <div className="riso text-cream text-3xl">TERMINUS · AÉROPORT CDG 2</div>
        <h1 className="riso riso-offset text-cream text-7xl mt-2">Les survivants</h1>
        {state.game.settled && <div className="riso text-yellow text-4xl mt-2">{share.toFixed(4)} MON chacun</div>}
      </div>
      <div className="flex flex-wrap gap-5 justify-center mt-8">
        {survivors.length === 0 && <div className="riso text-vermilion text-4xl">Personne n&apos;a survécu 😈</div>}
        {survivors.map((r) => (
          <motion.div key={r.addr} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col items-center card p-4 rounded-2xl">
            <Passenger seed={r.nick} size={72} />
            <div className="riso text-xl mt-1">{r.nick}</div>
          </motion.div>
        ))}
      </div>
      {controllers.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-10 text-center">
          <div className="riso text-vermilion text-3xl mb-3">LES CONTRÔLEURS ÉTAIENT…</div>
          <div className="flex flex-wrap gap-4 justify-center">
            {controllers.map((r, i) => (
              <motion.div key={r.addr} initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }} transition={{ delay: 1.7 + i * 0.15 }} className="flex flex-col items-center card-dark p-3 rounded-2xl">
                <Controleur size={56} />
                <div className="riso text-cream mt-1">{r.nick}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
