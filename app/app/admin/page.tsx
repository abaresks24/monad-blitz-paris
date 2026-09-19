"use client";
import { useState, useEffect } from "react";
import { useGame } from "@/lib/useGame";
import { Avatar } from "@/components/Avatar";
import { stationLabels } from "@/lib/game";

export default function Admin() {
  const [secret, setSecret] = useState("");
  useEffect(() => {
    const u = new URL(window.location.href);
    setSecret(u.searchParams.get("secret") ?? "");
  }, []);
  const { state, connected } = useGame(0, 700);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [numStations, setNumStations] = useState(4);
  const [commit, setCommit] = useState(12);
  const [reveal, setReveal] = useState(5);

  async function call(action: string, extra: any = {}) {
    setBusy(action);
    setMsg("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret, action, ...extra }),
      });
      const j = await r.json();
      setMsg(j.ok ? `✅ ${action} — ${JSON.stringify(j).slice(0, 120)}` : `❌ ${j.error}`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message}`);
    } finally {
      setBusy("");
    }
  }

  const g = state?.game;
  const gid = state?.gameId ?? 0;
  const labels = g ? stationLabels(g.numStations) : [];

  return (
    <main className="scanlines grain min-h-[100dvh] p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-3xl font-extrabold">🎛️ Admin — Fraude RER B</h1>
      <div className="text-sm text-gray-400">
        Jeu #{gid} · {connected ? "RPC ok" : "hors ligne"} · secret {secret ? "fourni" : "manquant (ajoute ?secret=…)"}
      </div>

      {/* status */}
      <div className="glass rounded-2xl p-4">
        {g ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Stations: <b>{g.numStations}</b></div>
            <div>Commit/Reveal: <b>{g.commitDuration}s / {g.revealDuration}s</b></div>
            <div>Passagers: <b>{g.playerCount}</b></div>
            <div>Statut: <b>{g.finished ? "terminé" : g.startedAt ? "en cours" : "lobby"}</b></div>
            <div>Phase: <b>{state?.phase}</b></div>
            <div>Station active: <b>{state?.activeStation}</b> {labels[state?.activeStation ?? -1] ? `(${labels[state!.activeStation]})` : ""}</div>
          </div>
        ) : (
          <div className="text-gray-400">Pas de partie. Crée-en une.</div>
        )}
      </div>

      {/* create */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="font-bold">Nouvelle partie</div>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Stations (1-6)" v={numStations} set={setNumStations} min={1} max={6} />
          <Field label="Commit (s)" v={commit} set={setCommit} min={5} max={60} />
          <Field label="Reveal (s)" v={reveal} set={setReveal} min={3} max={60} />
          <button
            onClick={() => call("create", { numStations, commitDuration: commit, revealDuration: reveal })}
            disabled={!!busy}
            className="rounded-xl px-5 py-3 font-bold bg-rerb neon-blue active:scale-95"
          >
            Créer
          </button>
        </div>
        <div className="flex gap-2 text-xs text-gray-400">
          <Preset label="Démo (4·12·5)" onClick={() => { setNumStations(4); setCommit(12); setReveal(5); }} />
          <Preset label="Rapide (4·8·5)" onClick={() => { setNumStations(4); setCommit(8); setReveal(5); }} />
          <Preset label="Répétition solo (3·8·4)" onClick={() => { setNumStations(3); setCommit(8); setReveal(4); }} />
        </div>
      </div>

      {/* controls */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="font-bold">Contrôle de la partie #{gid}</div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => call("start", { gameId: gid })} disabled={!!busy || !g || !!g?.startedAt} className="rounded-xl px-6 py-3 font-extrabold bg-paid text-black disabled:opacity-40 active:scale-95">
            ▶️ DÉMARRER
          </button>
          <button onClick={() => call("resolve", { gameId: gid, station: state?.activeStation })} disabled={!!busy || !g?.startedAt} className="rounded-xl px-5 py-3 font-bold glass active:scale-95">
            🎯 Forcer résolution (st {state?.activeStation})
          </button>
          <button onClick={() => call("finish", { gameId: gid })} disabled={!!busy || !g?.startedAt} className="rounded-xl px-5 py-3 font-bold glass active:scale-95">
            🏁 Terminer + révéler rôles
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Reset = crée simplement une nouvelle partie (les téléphones basculent automatiquement dessus).
          Les bots sont ajoutés par le keeper (laptop).
        </p>
      </div>

      {/* players */}
      {state?.board && state.board.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="font-bold mb-2">Passagers ({state.board.length})</div>
          <div className="flex flex-wrap gap-2">
            {state.board.map((b) => (
              <div key={b.addr} className="flex items-center gap-1 text-sm glass rounded-full pl-1 pr-3 py-1">
                <Avatar seed={b.nick} size={22} />
                <span>{b.nick}</span>
                <span className="text-gray-400">{b.pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {busy && <div className="text-amber">⏳ {busy}…</div>}
      {msg && <div className="text-sm break-all glass rounded-xl p-3">{msg}</div>}
    </main>
  );
}

function Field({ label, v, set, min, max }: { label: string; v: number; set: (n: number) => void; min: number; max: number }) {
  return (
    <label className="text-xs text-gray-400">
      <div>{label}</div>
      <input type="number" value={v} min={min} max={max} onChange={(e) => set(Number(e.target.value))} className="glass rounded-lg px-3 py-2 w-24 text-white text-base outline-none" />
    </label>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="underline hover:text-white">
      {label}
    </button>
  );
}
