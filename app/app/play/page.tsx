"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Hex } from "viem";
import { getBurner, getJoin, saveJoin, getNick, saveNick, type JoinInfo } from "@/lib/burner";
import { walletFor } from "@/lib/chain";
import { Action, Role, CARS } from "@/lib/game";
import { useGame, useCountdown } from "@/lib/useGame";
import { sendCommit, sendReveal } from "@/lib/tx";
import { Avatar } from "@/components/Avatar";

function randSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
}

type Choice = { car: number; action: number; salt: Hex };
const choiceKey = (g: number, s: number) => `rerb_choice_${g}_${s}`;
function saveChoice(g: number, s: number, c: Choice) {
  localStorage.setItem(choiceKey(g, s), JSON.stringify(c));
}
function loadChoice(g: number, s: number): Choice | null {
  const r = localStorage.getItem(choiceKey(g, s));
  return r ? (JSON.parse(r) as Choice) : null;
}

export default function Play() {
  const { state, connected } = useGame(0, 700);
  const [burner, setBurner] = useState<{ pk: Hex; address: `0x${string}` } | null>(null);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [nick, setNick] = useState("");

  useEffect(() => {
    const b = getBurner();
    setBurner(b);
    setNick(getNick());
  }, []);

  const gameId = state?.gameId ?? 0;
  useEffect(() => {
    if (gameId) setJoin(getJoin(String(gameId)));
  }, [gameId]);

  if (!burner) return <Splash>Chargement…</Splash>;
  if (!state) return <Splash>{connected ? "Connexion au train…" : "Connexion…"}</Splash>;
  if (!join) return <JoinScreen burner={burner} gameId={gameId} nick={nick} setNick={setNick} onJoined={(j) => setJoin(j)} state={state} />;
  return <GameScreen burner={burner} join={join} />;
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <main className="scanlines grain min-h-[100dvh] flex items-center justify-center p-6">
      <div className="led text-2xl animate-flicker">{children}</div>
    </main>
  );
}

function JoinScreen({
  burner,
  gameId,
  nick,
  setNick,
  onJoined,
  state,
}: {
  burner: { pk: Hex; address: `0x${string}` };
  gameId: number;
  nick: string;
  setNick: (s: string) => void;
  onJoined: (j: JoinInfo) => void;
  state: any;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const started = state?.game?.startedAt > 0;

  async function join() {
    setError("");
    const name = nick.trim();
    if (name.length < 1) return setError("Choisis un pseudo");
    setLoading(true);
    try {
      saveNick(name);
      const msg = `RER B — je monte dans le train\njeu #${gameId}\npseudo: ${name}`;
      const signature = await walletFor(burner.pk).signMessage({ account: walletFor(burner.pk).account!, message: msg });
      const r = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: String(gameId), address: burner.address, nickname: name, signature }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "échec");
      const info: JoinInfo = { gameId: String(gameId), role: j.role, roleSalt: j.roleSalt, nickname: name };
      saveJoin(info);
      onJoined(info);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "échec");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="scanlines grain min-h-[100dvh] flex flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="led text-xl">◉ RER B — VOITURE D&apos;EMBARQUEMENT ◉</div>
      <h1 className="text-4xl font-extrabold">Monte dans le train</h1>
      <div className="flex flex-col items-center gap-3">
        <Avatar seed={nick || burner.address} size={96} ring="#3B82F6" />
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={20}
          placeholder="Ton pseudo"
          className="glass rounded-2xl px-5 py-4 text-2xl text-center w-72 outline-none focus:shadow-neon"
        />
      </div>
      {started ? (
        <p className="text-amber text-lg">⚠️ Le train est déjà parti. Attends la prochaine partie.</p>
      ) : (
        <button
          onClick={join}
          disabled={loading}
          className="rounded-2xl px-10 py-5 text-2xl font-extrabold bg-rerb neon-blue disabled:opacity-50 active:scale-95 transition"
        >
          {loading ? "Embarquement…" : "MONTER DANS LE TRAIN 🚇"}
        </button>
      )}
      {error && <p className="text-fine">{error}</p>}
      <p className="text-xs text-gray-500 max-w-xs">
        Un wallet de jeu est créé sur ton téléphone. Aucun argent réel — que des points. Jeu #{gameId}.
      </p>
    </main>
  );
}

function GameScreen({ burner, join }: { burner: { pk: Hex; address: `0x${string}` }; join: JoinInfo }) {
  const { state, connected } = useGame(0, 600);
  const [peek, setPeek] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [pendingCar, setPendingCar] = useState<number | null>(null);
  const [localCommitted, setLocalCommitted] = useState<Record<number, boolean>>({});
  const [localRevealed, setLocalRevealed] = useState<Record<number, boolean>>({});
  const revealingRef = useRef<Record<number, boolean>>({});
  const [error, setError] = useState("");

  const isCtrl = join.role === Role.CONTROLEUR;
  const gid = state ? BigInt(state.gameId) : 0n;
  const station = state?.activeStation ?? -1;
  const phase = state?.phase ?? "lobby";

  const me = state?.board.find((b) => b.addr.toLowerCase() === burner.address.toLowerCase());
  const myDotIdx = state?.dots ? state.dots.addrs.findIndex((a) => a.toLowerCase() === burner.address.toLowerCase()) : -1;
  const committedOnChain = myDotIdx >= 0 && state?.dots?.committed[myDotIdx];
  const committed = phase !== "lobby" && (committedOnChain || localCommitted[station]);

  // ---- auto-reveal ----
  useEffect(() => {
    if (!state || phase !== "reveal" || station < 0) return;
    const choice = loadChoice(state.gameId, station);
    if (!choice) return;
    if (localRevealed[station] || revealingRef.current[station]) return;
    revealingRef.current[station] = true;
    (async () => {
      try {
        await sendReveal(burner.pk, gid, station, choice.car, choice.action, choice.salt, join.roleSalt as Hex);
        setLocalRevealed((m) => ({ ...m, [station]: true }));
      } catch {
        revealingRef.current[station] = false; // allow retry next tick
      }
    })();
  }, [phase, station, state?.gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmChoice(action: number) {
    if (pendingCar === null || station < 0 || !state) return;
    setError("");
    setCommitting(true);
    const salt = randSalt();
    const car = pendingCar;
    try {
      saveChoice(state.gameId, station, { car, action, salt });
      setLocalCommitted((m) => ({ ...m, [station]: true }));
      await sendCommit(burner.pk, gid, station, car, action, salt, burner.address);
    } catch (e: any) {
      setError(e?.shortMessage ?? "réseau lent, réessaie");
      setLocalCommitted((m) => ({ ...m, [station]: false }));
    } finally {
      setCommitting(false);
      setPendingCar(null);
    }
  }

  // ---- result overlay ----
  const myResult = useMemo(() => {
    if (!state) return null;
    // show the most recently resolved station's outcome for me
    const resolvedStations = Object.keys(state.results)
      .map(Number)
      .filter((s) => state.results[s]?.resolved)
      .sort((a, b) => b - a);
    for (const s of resolvedStations) {
      const r = state.results[s];
      const i = r.addrs.findIndex((a) => a.toLowerCase() === burner.address.toLowerCase());
      if (i >= 0) return { station: s, outcome: r.outcomes[i], car: r.cars[i] };
    }
    return null;
  }, [state, burner.address]);

  const lastSeenResult = useRef<number>(-1);
  useEffect(() => {
    if (myResult && myResult.station !== lastSeenResult.current) {
      lastSeenResult.current = myResult.station;
      if (myResult.outcome === 3 && navigator.vibrate) navigator.vibrate([120, 60, 120]);
      else if (navigator.vibrate) navigator.vibrate(40);
    }
  }, [myResult]);

  if (!state) return <Splash>Connexion…</Splash>;

  return (
    <main className="scanlines grain min-h-[100dvh] flex flex-col p-4 gap-3 no-select">
      {/* header */}
      <header className="glass rounded-2xl px-4 py-2 flex items-center gap-3">
        <Avatar seed={join.nickname} size={40} ring={isCtrl ? "#F5A623" : "#3B82F6"} />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{join.nickname}</div>
          <div className="text-xs text-gray-400">{connected ? "en ligne" : "reconnexion…"}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-paid">{me ? me.pts : 100}</div>
          <div className="text-[10px] text-gray-400 -mt-1">points</div>
        </div>
      </header>

      {/* role card */}
      <RoleCard isCtrl={isCtrl} peek={peek} setPeek={setPeek} />

      {/* main play area */}
      <div className="flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {phase === "lobby" && (
            <Center key="lobby">
              <div className="led text-2xl animate-flicker">EN ATTENTE DU DÉPART…</div>
              <p className="text-gray-400 mt-2">Le train part bientôt. Garde ton rôle secret 🤫</p>
            </Center>
          )}

          {(phase === "commit" || phase === "resolve") && !committed && phase === "commit" && (
            <motion.div key="choose" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <PhaseBanner phase="commit" endsAt={state.phaseEndsAt} nowSec={() => state.now} />
              <p className="text-center text-gray-300 mb-2">Choisis ta voiture</p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {Array.from({ length: CARS }).map((_, c) => (
                  <button
                    key={c}
                    onClick={() => setPendingCar(c)}
                    className={`aspect-square rounded-2xl text-2xl font-extrabold transition active:scale-95 ${
                      pendingCar === c ? "bg-rerb neon-blue" : "glass"
                    }`}
                  >
                    {c + 1}
                  </button>
                ))}
              </div>
              {isCtrl ? (
                <button
                  disabled={pendingCar === null || committing}
                  onClick={() => confirmChoice(Action.INSPECT)}
                  className="w-full rounded-2xl py-6 text-2xl font-extrabold bg-amber text-black shadow-neonAmber disabled:opacity-40 active:scale-95"
                >
                  🕵️ INSPECTER CETTE VOITURE
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={pendingCar === null || committing}
                    onClick={() => confirmChoice(Action.PAY)}
                    className="rounded-2xl py-8 text-2xl font-extrabold bg-paid text-black disabled:opacity-40 active:scale-95"
                  >
                    PAYER 🎫
                    <div className="text-sm font-medium opacity-80">−2 pts</div>
                  </button>
                  <button
                    disabled={pendingCar === null || committing}
                    onClick={() => confirmChoice(Action.FRAUD)}
                    className="rounded-2xl py-8 text-2xl font-extrabold bg-fine disabled:opacity-40 active:scale-95"
                  >
                    FRAUDER 🏃
                    <div className="text-sm font-medium opacity-80">gratuit… risqué</div>
                  </button>
                </div>
              )}
              {error && <p className="text-fine text-center mt-3">{error}</p>}
            </motion.div>
          )}

          {(committed || phase === "reveal") && !myResultActive(myResult, station) && phase !== "ended" && (
            <Center key="locked">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-6xl mb-3">
                🔒
              </motion.div>
              <div className="text-2xl font-extrabold">Choix verrouillé</div>
              <p className="text-gray-400 mt-1">
                {phase === "reveal" ? "Révélation automatique en cours…" : "En attente des autres passagers…"}
              </p>
            </Center>
          )}

          {phase === "ended" && (
            <Center key="ended">
              <div className="led text-3xl">TERMINUS · AÉROPORT CDG</div>
              <p className="text-gray-300 mt-2">Regarde le grand écran pour le palmarès 🏆</p>
              <div className="text-4xl font-extrabold text-paid mt-4">{me ? me.pts : 100} pts</div>
            </Center>
          )}
        </AnimatePresence>
      </div>

      {/* result overlay */}
      <ResultOverlay myResult={myResult} station={station} points={me?.pts ?? 100} isCtrl={isCtrl} />
    </main>
  );
}

function myResultActive(myResult: any, station: number) {
  return myResult && myResult.station === station;
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="text-center flex flex-col items-center justify-center py-10"
    >
      {children}
    </motion.div>
  );
}

function RoleCard({ isCtrl, peek, setPeek }: { isCtrl: boolean; peek: boolean; setPeek: (b: boolean) => void }) {
  return (
    <div className="card-3d" onClick={() => setPeek(!peek)}>
      <motion.div
        animate={{ rotateY: peek ? 180 : 0 }}
        transition={{ duration: 0.5 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-16 rounded-2xl cursor-pointer"
      >
        <div className="absolute inset-0 glass rounded-2xl flex items-center justify-center gap-2" style={{ backfaceVisibility: "hidden" }}>
          <span className="text-lg font-bold">🎴 Ton rôle</span>
          <span className="text-xs text-gray-400">(tape pour voir)</span>
        </div>
        <div
          className={`absolute inset-0 rounded-2xl flex items-center justify-center font-extrabold text-xl ${
            isCtrl ? "bg-amber text-black shadow-neonAmber" : "bg-rerb neon-blue"
          }`}
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {isCtrl ? "🎩 CONTRÔLEUR 🤫 garde le secret" : "🚇 PASSAGER"}
        </div>
      </motion.div>
    </div>
  );
}

function PhaseBanner({ phase, endsAt, nowSec }: { phase: string; endsAt: number; nowSec: () => number }) {
  const remaining = useCountdown(endsAt, nowSec);
  const secs = Math.ceil(remaining);
  return (
    <div className="text-center mb-3">
      <div className={`led text-4xl ${secs <= 3 ? "text-fine" : ""}`}>{String(secs).padStart(2, "0")}s</div>
      <div className="text-xs text-gray-400 uppercase tracking-widest">{phase === "commit" ? "choisis vite" : phase}</div>
    </div>
  );
}

function ResultOverlay({ myResult, station, points, isCtrl }: { myResult: any; station: number; points: number; isCtrl: boolean }) {
  const show = myResult && myResult.station === station;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={`res-${station}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-40 flex flex-col items-center justify-center text-center p-8 ${
            myResult.outcome === 3 ? "bg-fine" : myResult.outcome === 4 ? "bg-amber text-black" : myResult.outcome === 2 ? "bg-black" : "bg-paid text-black"
          }`}
        >
          {myResult.outcome === 3 && (
            <motion.div initial={{ scale: 3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: "spring", stiffness: 300 }}>
              <div className="text-7xl font-black">CONTRÔLÉ !</div>
              <div className="text-5xl font-black mt-2">−20</div>
            </motion.div>
          )}
          {myResult.outcome === 1 && <div className="text-6xl font-black">Ticket OK ✅<div className="text-3xl mt-2">−2</div></div>}
          {myResult.outcome === 2 && <div className="text-6xl font-black text-paid">Tranquille 😎<div className="text-2xl mt-2 text-white">fraude réussie</div></div>}
          {myResult.outcome === 4 && <div className="text-6xl font-black">Contrôle effectué 🕵️</div>}
          {(myResult.outcome === 0 || myResult.outcome === undefined) && <div className="text-5xl font-black">Station passée</div>}
          <div className="mt-8 text-2xl font-bold opacity-90">{points} points</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
