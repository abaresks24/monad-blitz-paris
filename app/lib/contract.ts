import type { Address } from "viem";
import abi from "./abi.json";
import { publicClient, CONTRACT_ADDRESS } from "./chain";

export const RERB_ABI = abi as any[];

export function cfg() {
  return { address: CONTRACT_ADDRESS, abi: RERB_ABI } as const;
}

export async function read(fn: string, args: any[] = []) {
  return publicClient.readContract({ ...cfg(), functionName: fn, args });
}

export type GameInfo = {
  creator: Address;
  numWagons: number;
  wagonCap: number;
  numControllers: number;
  numStations: number;
  boardDuration: number;
  startedAt: number;
  started: boolean;
  settled: boolean;
  playerCount: number;
  entryFee: bigint;
  pot: bigint;
  stationDuration: number;
  gameEnd: number;
};

export function parseGame(g: any[]): GameInfo {
  return {
    creator: g[0],
    numWagons: Number(g[1]),
    wagonCap: Number(g[2]),
    numControllers: Number(g[3]),
    numStations: Number(g[4]),
    boardDuration: Number(g[5]),
    startedAt: Number(g[6]),
    started: g[7],
    settled: g[8],
    playerCount: Number(g[9]),
    entryFee: BigInt(g[10]),
    pot: BigInt(g[11]),
    stationDuration: Number(g[12]),
    gameEnd: Number(g[13]),
  };
}

export type Phase = "lobby" | "board" | "reveal" | "ended";

export function currentPhase(g: GameInfo, nowSec: number): { station: number; phase: Phase; endsAt: number } {
  if (!g.started) return { station: -1, phase: "lobby", endsAt: 0 };
  const sd = g.stationDuration;
  const elapsed = nowSec - g.startedAt;
  if (elapsed < 0) return { station: -1, phase: "lobby", endsAt: g.startedAt };
  const station = Math.floor(elapsed / sd);
  if (station >= g.numStations) return { station: g.numStations, phase: "ended", endsAt: g.gameEnd };
  const into = elapsed - station * sd;
  const bStart = g.startedAt + station * sd;
  if (into < g.boardDuration) return { station, phase: "board", endsAt: bStart + g.boardDuration };
  return { station, phase: "reveal", endsAt: bStart + sd };
}
