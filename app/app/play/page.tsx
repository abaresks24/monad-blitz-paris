"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseEther, type Hex } from "viem";
import { getBurner, getNick, saveNick, markJoined, hasJoined, saveHostToken, getHostToken, saveRole, getRole } from "@/lib/burner";
import { walletFor } from "@/lib/chain";
import { Role } from "@/lib/game";
import { useGame, useCountdown, type Snap } from "@/lib/useGame";
import { sendJoin, sendBoard } from "@/lib/tx";
import { Passenger, Controleur, TicketMark } from "@/components/art";
import { startMusic, stopMusic, isMusicOn, setSfxEnabled, playBoard, playEliminate, playSurvive, playTick } from "@/lib/sound";

function urlGameId(): string | number {
  if (typeof window === "undefined") return 0;
  return new URLSearchParams(window.location.search).get("g") ?? 0;
}

export default function Play() {
  const { state, connected } = useGame(urlGameId(), 600);
  const [burner, setBurner] = useState<{ pk: Hex; address: `0x${string}` } | null>(null);
  useEffect(() => setBurner(getBurner()), []);

  if (!burner || !state) return <Splash>{connected === false ? "Connexion…" : "Chargement du quai…"}</Splash>;

  const gid = String(state.gameId);
  const meIndex = state.roster.findIndex((r) => r.addr.toLowerCase() === burner.address.toLowerCase());
  const amIn = meIndex >= 0 && hasJoined(gid);

  if (!amIn) return <Entry burner={burner} state={state} />;
  return <Game burner={burner} state={state} meIndex={meIndex} />;
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <main className="paper min-h-[100dvh] flex items-center justify-center p-6">
      <div className="riso text-cream text-2xl animate-wobble">{children}</div>
    </main>
  );
}

function MuteButton() {
  const [on, setOn] = useState(false);
  return (
    <button
      onClick={() => {
        if (on) { stopMusic(); setSfxEnabled(false); } else { startMusic(); setSfxEnabled(true); }
        setOn(!on);
      }}
      className="btn bg-cream text-ink text-xs px-3 py-1 rounded-lg"
    >
      {on ? "♪ ON" : "♪ OFF"}
    </button>
  );
}

/* ------------------------------------------------------------------ ENTRY (create / join) */
function Entry({ burner, state }: { burner: { pk: Hex; address: `0x${string}` }; state: Snap }) {
  const [nick, setNick] = useState(getNick());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [wagons, setWagons] = useState(4);
  const [controllers, setControllers] = useState(2);
  const [stations, setStations] = useState(4);

  const g = state.game;
  const joinable = g.started === false && g.creator !== "0x0000000000000000000000000000000000000000";
  const gid = String(state.gameId);
  const feeMon = g.entryFee ? (Number(g.entryFee) / 1e18).toFixed(4) : "0.001";

  async function fundAndJoin(gameId: string, fee: bigint) {
    await fetch("/api/fund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: burner.address }) });
    await sendJoin(burner.pk, BigInt(gameId), nick.trim(), fee);
    markJoined(gameId);
  }

  async function doJoin() {
    setErr(""); if (!nick.trim()) return setErr("Choisis un pseudo");
    setBusy("Embarquement…"); saveNick(nick.trim()); startMusic(); setSfxEnabled(true);
    try {
      await fundAndJoin(gid, BigInt(g.entryFee));
    } catch (e: any) { setErr(e?.shortMessage ?? e?.message ?? "échec"); } finally { setBusy(""); }
  }

  async function doCreate() {
    setErr(""); if (!nick.trim()) return setErr("Choisis un pseudo");
    setBusy("Création…"); saveNick(nick.trim()); startMusic(); setSfxEnabled(true);
    try {
      const r = await fetch("/api/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ numWagons: wagons, numControllers: controllers, numStations: stations }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      saveHostToken(j.gameId, j.hostToken);
      await fundAndJoin(j.gameId, parseEther(j.entryFee));
      // pin everyone to THIS game (screen QR + refresh-safe)
      window.location.href = `/play?g=${j.gameId}`;
      return;
    } catch (e: any) { setErr(e?.shortMessage ?? e?.message ?? "échec"); } finally { setBusy(""); }
  }

  return (
    <main className="paper halftone min-h-[100dvh] flex flex-col items-center justify-center gap-5 p-6">
      <div className="flex items-center gap-2"><TicketMark size={40} /><span className="riso text-cream text-lg">RER B</span></div>
      <Passenger seed={nick || burner.address} size={96} />
      <input
        value={nick} onChange={(e) => setNick(e.target.value)} maxLength={18} placeholder="TON PSEUDO"
        className="card riso text-2xl text-center px-5 py-3 w-72 outline-none rounded-xl placeholder:text-ink/40"
      />

      {mode === "pick" && (
        <div className="flex flex-col gap-3 w-72">
          {joinable ? (
            <button onClick={doJoin} disabled={!!busy} className="btn bg-vermilion text-cream text-2xl py-4 rounded-xl">
              Rejoindre #{gid}
              <div className="text-sm font-sans normal-case">{g.playerCount}/{state.maxPlayers} • mise {feeMon} MON</div>
            </button>
          ) : (
            <div className="card p-3 text-center text-sm">Partie #{gid} déjà lancée. Crée la tienne 👇</div>
          )}
          <button onClick={() => setMode("create")} disabled={!!busy} className="btn bg-blue text-cream text-xl py-3 rounded-xl">
            Créer une partie
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="card p-4 w-80 space-y-3">
          <Stepper label="Wagons" v={wagons} set={(n) => { setWagons(n); if (controllers > n * 3 - 1) setControllers(Math.max(1, n * 3 - 1)); }} min={2} max={8} />
          <Stepper label="Contrôleurs" v={controllers} set={setControllers} min={1} max={wagons * 3 - 1} />
          <Stepper label="Stations" v={stations} set={setStations} min={1} max={10} />
          <div className="text-xs text-ink/70">Jusqu&apos;à {wagons * 3} joueurs • 5 par wagon max • mise {feeMon} MON</div>
          <div className="flex gap-2">
            <button onClick={() => setMode("pick")} className="btn bg-cream text-ink px-4 py-2 rounded-lg text-sm flex-1">Retour</button>
            <button onClick={doCreate} disabled={!!busy} className="btn bg-vermilion text-cream px-4 py-2 rounded-lg flex-[2]">Créer & rejoindre</button>
          </div>
        </div>
      )}

      {busy && <div className="riso text-yellow text-xl animate-wobble">{busy}</div>}
      {err && <div className="text-vermilion font-bold text-center max-w-xs">{err}</div>}
      <p className="text-cream/50 text-xs max-w-xs text-center">Un porte-monnaie de jeu est créé et rechargé automatiquement sur ton téléphone.</p>
    </main>
  );
}

function Stepper({ label, v, set, min, max }: { label: string; v: number; set: (n: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="riso text-lg">{label}</span>
      <div className="flex items-center gap-3">
        <button onClick={() => set(Math.max(min, v - 1))} className="btn bg-ink text-cream w-9 h-9 rounded-lg text-xl leading-none">–</button>
        <span className="riso text-2xl w-8 text-center">{v}</span>
        <button onClick={() => set(Math.min(max, v + 1))} className="btn bg-ink text-cream w-9 h-9 rounded-lg text-xl leading-none">+</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ GAME */
function Game({ burner, state, meIndex }: { burner: { pk: Hex; address: `0x${string}` }; state: Snap; meIndex: number }) {
  const g = state.game;
  const gid = String(state.gameId);
  const host = getHostToken(gid);
  const [role, setRole] = useState<{ role: number; controllers: string[] } | null>(getRole(gid));
  const [busy, setBusy] = useState("");
  const [myWagon, setMyWagon] = useState<number | null>(null);
  const alive = state.alive[meIndex];

  // fetch my role once started
  useEffect(() => {
    if (g.started && !role) {
      (async () => {
        try {
          const message = `RER B — quel est mon rôle ?\njeu #${gid}`;
          const w = walletFor(burner.pk);
          const signature = await w.signMessage({ account: w.account!, message });
          const r = await fetch("/api/myrole", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: gid, address: burner.address, signature }) });
          const j = await r.json();
          if (j.ok) { saveRole(gid, j.role, j.controllers); setRole({ role: j.role, controllers: j.controllers ?? [] }); }
        } catch {}
      })();
    }
  }, [g.started, gid, role, burner]);

  // reflect on-chain current wagon
  useEffect(() => {
    if (state.currentBoarding && state.currentBoarding.wagons[meIndex] >= 0) setMyWagon(state.currentBoarding.wagons[meIndex]);
    else if (state.phase === "board") setMyWagon(null);
  }, [state.station, state.phase]); // eslint-disable-line

  async function board(w: number) {
    if (!alive || state.phase !== "board") return;
    setMyWagon(w); playBoard();
    try { await sendBoard(burner.pk, BigInt(gid), state.station, w); } catch {}
  }

  async function hostAction(action: "start" | "settle") {
    setBusy(action); try {
      await fetch(`/api/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: gid, hostToken: host }) });
    } finally { setBusy(""); }
  }

  const iAmController = role?.role === Role.CONTROLEUR;

  return (
    <main className="paper min-h-[100dvh] flex flex-col p-4 gap-3 no-select">
      <header className="card px-4 py-2 flex items-center gap-3 rounded-xl">
        <Passenger seed={getNick()} size={34} />
        <div className="flex-1 min-w-0">
          <div className="riso text-lg truncate">{getNick()}</div>
          {role && <div className={`text-xs font-bold ${iAmController ? "text-vermilion" : "text-blue"}`}>{iAmController ? "🎩 CONTRÔLEUR" : "🚃 FRAUDEUR"}</div>}
        </div>
        <div className="text-right">
          <div className="riso text-xl text-vermilion leading-none">{Number(state.potMon).toFixed(3)}</div>
          <div className="text-[10px]">MON · pot</div>
        </div>
        <MuteButton />
      </header>

      {role && iAmController && role.controllers.length > 1 && state.phase !== "ended" && (
        <div className="card-dark rounded-xl px-3 py-1.5 text-xs">🎩 Coéquipiers contrôleurs : {role.controllers.length} en tout (ne vous entassez pas dans le même wagon)</div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          {g.started === false && <Lobby key="lobby" state={state} host={host} onStart={() => hostAction("start")} busy={busy} />}
          {g.started && state.phase !== "ended" && (
            alive
              ? <PlayView key="play" state={state} meIndex={meIndex} myWagon={myWagon} onBoard={board} iAmController={iAmController} />
              : <Spectator key="spec" state={state} />
          )}
          {state.phase === "ended" && <EndView key="end" state={state} meIndex={meIndex} host={host} onSettle={() => hostAction("settle")} busy={busy} />}
        </AnimatePresence>
      </div>

      <ResultFlash state={state} meIndex={meIndex} />
    </main>
  );
}

function Lobby({ state, host, onStart, busy }: { state: Snap; host: string | null; onStart: () => void; busy: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-4">
      <div className="riso text-cream text-3xl">Sur le quai…</div>
      <div className="text-cream/70">{state.game.playerCount}/{state.maxPlayers} voyageurs • {state.game.numWagons} wagons • {state.game.numStations} stations</div>
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {state.roster.map((r) => (
          <div key={r.addr} className="flex flex-col items-center w-16">
            <Passenger seed={r.nick} size={44} />
            <span className="text-cream text-xs truncate w-full text-center">{r.nick}</span>
          </div>
        ))}
      </div>
      {host ? (
        <div className="flex flex-col items-center gap-2 mt-2">
          <a href={`/screen?g=${state.gameId}`} target="_blank" rel="noreferrer" className="btn bg-blue text-cream text-sm px-4 py-2 rounded-lg">Ouvrir le grand écran ↗</a>
          <button onClick={onStart} disabled={!!busy || state.game.playerCount < 2} className="btn bg-green text-ink text-2xl px-8 py-4 rounded-xl">
            {busy ? "…" : "LANCER LE TRAIN"}
          </button>
        </div>
      ) : (
        <div className="riso text-yellow text-xl animate-wobble mt-2">En attente de l&apos;hôte…</div>
      )}
    </motion.div>
  );
}

function PlayView({ state, meIndex, myWagon, onBoard, iAmController }: { state: Snap; meIndex: number; myWagon: number | null; onBoard: (w: number) => void; iAmController: boolean }) {
  const remaining = useCountdown(state.phaseEndsAt, () => state.now);
  const secs = Math.ceil(remaining);
  const tickRef = useRef(-1);
  useEffect(() => { if (secs !== tickRef.current) { tickRef.current = secs; if (state.phase === "board" && secs <= 3 && secs > 0) playTick(secs === 1); } }, [secs, state.phase]);

  const cb = state.currentBoarding;
  const perWagon: number[][] = Array.from({ length: state.game.numWagons }, () => []);
  if (cb) state.roster.forEach((_, i) => { const w = cb.wagons[i]; if (w >= 0) perWagon[w].push(i); });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
      <div className="text-center mb-2">
        <div className={`riso text-5xl ${secs <= 3 && state.phase === "board" ? "text-vermilion" : "text-cream"}`}>
          {state.phase === "board" ? `${String(secs).padStart(2, "0")}s` : "CONTRÔLE…"}
        </div>
        <div className="text-cream/70 text-sm">
          {state.phase === "board" ? (iAmController ? "Choisis le wagon à inspecter" : "Cache-toi dans un wagon !") : "Les portes s'ouvrent…"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 flex-1 content-start">
        {Array.from({ length: state.game.numWagons }).map((_, w) => {
          const occ = perWagon[w];
          const full = occ.length >= state.game.wagonCap;
          const mine = myWagon === w;
          return (
            <button
              key={w}
              onClick={() => onBoard(w)}
              disabled={state.phase !== "board" || (full && !mine)}
              className={`relative rounded-2xl p-2 min-h-28 flex flex-col ${mine ? "bg-blue" : "bg-ink2"}`}
              style={{ border: `3px solid ${mine ? "#F3E9D2" : full ? "#FF4E3A" : "#F3E9D2"}` }}
            >
              <div className="riso text-cream text-sm">VOITURE {w + 1} <span className="text-cream/60">{occ.length}/{state.game.wagonCap}</span></div>
              <div className="flex flex-wrap gap-0.5 items-end justify-center flex-1 overflow-hidden">
                {occ.slice(0, 6).map((i) => <Passenger key={i} seed={state.roster[i].nick} size={30} />)}
              </div>
              {full && !mine && <span className="absolute inset-0 flex items-center justify-center riso text-vermilion text-lg -rotate-6">COMPLET</span>}
              {mine && <span className="absolute top-1 right-2 riso text-cream text-xs">TOI ✓</span>}
            </button>
          );
        })}
      </div>
      <div className="text-center text-cream/60 text-xs mt-2">Station {state.station + 1}/{state.game.numStations} • {state.survivors} survivants</div>
    </motion.div>
  );
}

function Spectator({ state }: { state: Snap }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-center gap-3">
      <div className="text-6xl opacity-60">👻</div>
      <div className="riso text-cream text-3xl">Fantôme du RER</div>
      <p className="text-cream/70">Tu as été éliminé. Regarde qui s&apos;en sort…</p>
      <div className="card-dark rounded-xl px-4 py-2">
        <div className="riso text-2xl text-vermilion">{Number(state.potMon).toFixed(3)} MON</div>
        <div className="text-xs">pot • {state.survivors} survivants</div>
      </div>
    </motion.div>
  );
}

function EndView({ state, meIndex, host, onSettle, busy }: { state: Snap; meIndex: number; host: string | null; onSettle: () => void; busy: string }) {
  const settled = state.game.settled;
  const survived = state.alive[meIndex];
  const share = settled && state.survivorAddrs?.length ? Number(state.potMon) / state.survivorAddrs.length : 0;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center gap-4">
      <div className="riso text-cream text-2xl">TERMINUS · CDG</div>
      {survived ? (
        <>
          <div className="riso text-green text-6xl riso-offset">SURVIVANT !</div>
          {settled && <div className="riso text-yellow text-4xl">+{share.toFixed(4)} MON</div>}
        </>
      ) : (
        <div className="riso text-vermilion text-5xl">Éliminé</div>
      )}
      {!settled && host && (
        <button onClick={onSettle} disabled={!!busy} className="btn bg-vermilion text-cream text-xl px-6 py-3 rounded-xl">
          {busy ? "…" : "PARTAGER LE POT 💰"}
        </button>
      )}
      {!settled && !host && <div className="text-cream/60">En attente du partage du pot…</div>}
      {settled && <div className="text-cream/70">{state.survivorAddrs?.length} survivant(s) se partagent {Number(state.potMon).toFixed(3)} MON</div>}
    </motion.div>
  );
}

function ResultFlash({ state, meIndex }: { state: Snap; meIndex: number }) {
  const lastSeen = useRef(-1);
  const [show, setShow] = useState<null | "caught" | "safe">(null);
  useEffect(() => {
    const lr = state.lastReveal;
    if (!lr || lr.station === lastSeen.current) return;
    if (state.phase !== "reveal") return;
    lastSeen.current = lr.station;
    const caught = lr.caught.includes(meIndex) || lr.idleOut.includes(meIndex);
    if (caught) { setShow("caught"); playEliminate(); if (navigator.vibrate) navigator.vibrate([120, 60, 120]); }
    else if (state.alive[meIndex]) { setShow("safe"); playSurvive(); if (navigator.vibrate) navigator.vibrate(40); }
    const t = setTimeout(() => setShow(null), 2600);
    return () => clearTimeout(t);
  }, [state.lastReveal?.station, state.phase]); // eslint-disable-line
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${show === "caught" ? "bg-vermilion" : "bg-green"}`}
        >
          {show === "caught" ? (
            <motion.div initial={{ scale: 2, rotate: -12 }} animate={{ scale: 1, rotate: -6 }} className="text-center">
              <Controleur size={120} />
              <div className="riso text-cream text-6xl mt-2">CONTRÔLÉ !</div>
            </motion.div>
          ) : (
            <div className="text-center">
              <Passenger seed={getNick()} size={120} />
              <div className="riso text-ink text-6xl mt-2">SAUVÉ 😮‍💨</div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
