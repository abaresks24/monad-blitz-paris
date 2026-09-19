"use client";
import { useEffect, useRef, useState } from "react";

export type StateSnapshot = {
  ok: boolean;
  error?: string;
  gameId: number;
  now: number;
  game: {
    gm: string;
    numStations: number;
    commitDuration: number;
    revealDuration: number;
    startedAt: number;
    finished: boolean;
    playerCount: number;
    stationDuration: number;
    gameEnd: number;
  };
  board: { addr: string; nick: string; pts: number; role: number }[];
  activeStation: number;
  phase: "lobby" | "commit" | "reveal" | "resolve" | "ended";
  phaseEndsAt: number;
  dots: { addrs: string[]; committed: boolean[]; revealed: boolean[] } | null;
  results: Record<number, { resolved: boolean; inspectedCars: number[]; addrs: string[]; cars: number[]; outcomes: number[] }>;
};

export function useGame(gameId: string | number = 0, intervalMs = 500) {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const skew = useRef(0); // serverNow - clientNow (seconds)

  useEffect(() => {
    let alive = true;
    let timer: any;
    const tick = async () => {
      try {
        const r = await fetch(`/api/state?gameId=${gameId}`, { cache: "no-store" });
        const j = (await r.json()) as StateSnapshot;
        if (!alive) return;
        if (j.ok) {
          skew.current = j.now - Date.now() / 1000;
          setState(j);
          setConnected(true);
        } else {
          setConnected(false);
        }
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

  // chain-synced "now" in seconds (client clock + measured skew)
  const nowSec = () => Date.now() / 1000 + skew.current;
  return { state, connected, nowSec };
}

/** A smooth 10fps countdown to a target unix timestamp, chain-synced. */
export function useCountdown(target: number, nowSec: () => number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let raf: any;
    const loop = () => {
      setRemaining(Math.max(0, target - nowSec()));
      raf = setTimeout(loop, 100);
    };
    loop();
    return () => clearTimeout(raf);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return remaining;
}
