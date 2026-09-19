"use client";
import { useEffect, useRef, useState } from "react";

export type Snap = {
  ok: boolean;
  gameId: number;
  now: number;
  game: {
    creator: string;
    numWagons: number;
    wagonCap: number;
    numControllers: number;
    numStations: number;
    boardDuration: number;
    startedAt: number;
    started: boolean;
    settled: boolean;
    playerCount: number;
    entryFee: string;
    pot: string;
    stationDuration: number;
    gameEnd: number;
  };
  maxPlayers: number;
  roster: { addr: string; nick: string }[];
  phase: "lobby" | "board" | "reveal" | "ended";
  station: number;
  phaseEndsAt: number;
  alive: boolean[];
  survivors: number;
  revealed: number;
  lastReveal: { station: number; controllerWagons: number[]; caught: number[]; idleOut: number[]; wagonOf: number[] } | null;
  currentBoarding: { wagons: number[]; counts: number[] } | null;
  elimOnChain: boolean[];
  finalRoles: number[] | null;
  survivorAddrs: string[] | null;
  decided?: boolean;
  settleTx?: string | null;
  potMon: string;
};

export function useGame(gameId: string | number = 0, intervalMs = 500) {
  const [state, setState] = useState<Snap | null>(null);
  const [connected, setConnected] = useState(false);
  const skew = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: any;
    const tick = async () => {
      try {
        const r = await fetch(`/api/state?gameId=${gameId}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j.ok) {
          // Anchor the chain/client clock offset ONCE, and only re-sync on large drift.
          // Recomputing it every poll makes the countdown jitter ("timer restarts / stuck at 8s").
          const newSkew = j.now - Date.now() / 1000;
          if (skew.current === 0 || Math.abs(newSkew - skew.current) > 2.5) skew.current = newSkew;
          setState(j);
          setConnected(true);
        } else setConnected(false);
      } catch {
        if (alive) setConnected(false);
      } finally {
        if (alive) timer = setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [gameId, intervalMs]);

  const nowSec = () => Date.now() / 1000 + skew.current;
  return { state, connected, nowSec };
}

export function useCountdown(target: number, nowSec: () => number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let t: any;
    const loop = () => {
      setRemaining(Math.max(0, target - nowSec()));
      t = setTimeout(loop, 100);
    };
    loop();
    return () => clearTimeout(t);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return remaining;
}
