import type { Address } from "viem";
import abi from "./abi.json";
import { publicClient, CONTRACT_ADDRESS } from "./chain";

export const FraudeRERB_ABI = abi as any[];

export function cfg() {
  return { address: CONTRACT_ADDRESS, abi: FraudeRERB_ABI } as const;
}

export async function read(fn: string, args: any[] = []) {
  return publicClient.readContract({ ...cfg(), functionName: fn, args });
}

export type GameInfo = {
  gm: Address;
  numStations: number;
  commitDuration: number;
  revealDuration: number;
  startedAt: number;
  finished: boolean;
  playerCount: number;
  stationDuration: number;
  gameEnd: number;
};

export async function getGame(gameId: bigint): Promise<GameInfo> {
  const g = (await read("getGame", [gameId])) as any[];
  return {
    gm: g[0],
    numStations: Number(g[1]),
    commitDuration: Number(g[2]),
    revealDuration: Number(g[3]),
    startedAt: Number(g[4]),
    finished: g[5],
    playerCount: Number(g[6]),
    stationDuration: Number(g[7]),
    gameEnd: Number(g[8]),
  };
}

export type BoardRow = { addr: Address; nick: string; pts: number; role: number };

export async function getBoard(gameId: bigint): Promise<BoardRow[]> {
  const [addrs, nicks, pts, roles] = (await read("getBoard", [gameId])) as [Address[], string[], bigint[], number[]];
  return addrs.map((addr, i) => ({ addr, nick: nicks[i], pts: Number(pts[i]), role: Number(roles[i]) }));
}

export async function stationTimes(gameId: bigint, station: number) {
  const [cStart, cEnd, rEnd] = (await read("stationTimes", [gameId, station])) as bigint[];
  return { commitStart: Number(cStart), commitEnd: Number(cEnd), revealEnd: Number(rEnd) };
}

/** Which station index is active right now, and its phase, from the deterministic schedule. */
export function currentPhase(g: GameInfo, nowSec: number) {
  if (!g.startedAt) return { station: -1, phase: "lobby" as const, endsAt: 0 };
  const sd = g.stationDuration;
  const elapsed = nowSec - g.startedAt;
  if (elapsed < 0) return { station: -1, phase: "lobby" as const, endsAt: g.startedAt };
  const station = Math.floor(elapsed / sd);
  if (station >= g.numStations) return { station: g.numStations, phase: "ended" as const, endsAt: g.gameEnd };
  const into = elapsed - station * sd;
  const commitStart = g.startedAt + station * sd;
  if (into < g.commitDuration) return { station, phase: "commit" as const, endsAt: commitStart + g.commitDuration };
  if (into < g.commitDuration + g.revealDuration)
    return { station, phase: "reveal" as const, endsAt: commitStart + g.commitDuration + g.revealDuration };
  return { station, phase: "resolve" as const, endsAt: commitStart + sd };
}
