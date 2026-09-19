import { NextRequest, NextResponse } from "next/server";
import { formatEther, type Address } from "viem";
import { serverPublic, cfg, jsonSafe, CONTRACT, MASTER_SECRET } from "@/lib/server";
import { assignRoles } from "@/lib/game";
import { simulate, type BoardRec } from "@/lib/sim";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Cached = { at: number; data: any };
const cache = new Map<string, Cached>();
// 30 phones share this cache, so the RPC sees ~1 read/sec regardless of crowd size.
// Countdowns are client-side (anchored clock), so a slightly longer TTL costs nothing visible.
const TTL = 800;

async function read(fn: string, args: any[] = []) {
  return serverPublic.readContract({ ...cfg(), functionName: fn, args });
}

export async function GET(req: NextRequest) {
  if (!CONTRACT) return NextResponse.json({ ok: false, error: "no contract" });
  let gameId = req.nextUrl.searchParams.get("gameId") ?? "0";
  const hit = cache.get(gameId);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  try {
    if (gameId === "0") gameId = ((await read("gameCount")) as bigint).toString();
    const gid = BigInt(gameId);
    const g = (await read("getGame", [gid])) as any[];
    const game = {
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
      entryFee: (g[10] as bigint).toString(),
      pot: (g[11] as bigint).toString(),
      stationDuration: Number(g[12]),
      gameEnd: Number(g[13]),
    };
    const now = Number((await serverPublic.getBlock({ blockTag: "latest" })).timestamp);
    const [addrs, nicks, rolesOnChain, elimOnChain] = (await read("getRoster", [gid])) as [
      Address[],
      string[],
      number[],
      boolean[],
    ];
    const maxPlayers = Number(await read("maxPlayers", [gid]));

    const base: any = {
      ok: true,
      gameId: Number(gid),
      now,
      game,
      maxPlayers,
      roster: addrs.map((a, i) => ({ addr: a, nick: nicks[i] })),
    };

    if (!game.started) {
      const data = jsonSafe({ ...base, phase: "lobby", station: -1, alive: addrs.map(() => true), survivors: addrs.length });
      cache.set(gameId, { at: Date.now(), data });
      return NextResponse.json(data);
    }

    const sd = game.stationDuration;
    const station = Math.min(Math.floor((now - game.startedAt) / sd), game.numStations);
    const into = now - game.startedAt - station * sd;
    let phase = station >= game.numStations ? "ended" : into < game.boardDuration ? "board" : "reveal";
    const phaseEndsAt =
      station >= game.numStations
        ? game.gameEnd
        : game.startedAt + station * sd + (into < game.boardDuration ? game.boardDuration : sd);

    // roles are known server-side (deterministic) but NEVER sent to clients here
    const roles = assignRoles(gid, addrs, MASTER_SECRET, game.numControllers);

    // how many stations have finished their board window (reveal reached / past)?
    let revealed = 0;
    for (let s = 0; s < game.numStations; s++) {
      if (now >= game.startedAt + s * sd + game.boardDuration) revealed = s + 1;
    }

    // fetch boarding for revealed stations, run the sim
    const boarding: BoardRec[][] = [];
    for (let s = 0; s < revealed; s++) {
      const [, boarded, wagons] = (await read("getBoarding", [gid, s])) as [Address[], boolean[], number[], number[]];
      boarding[s] = addrs.map((_, i) => ({ boarded: boarded[i], wagon: Number(wagons[i]) }));
    }
    const sim = revealed > 0 ? simulate(gid, game.numWagons, revealed, addrs, roles, boarding) : null;
    const alive = sim ? sim.alive : addrs.map(() => true);
    const lastReveal = sim && sim.stations.length > 0 ? sim.stations[sim.stations.length - 1] : null;
    // one side wiped out → the game is over, even if stations remain on the schedule
    const decided = !!sim?.decided;
    if (decided) phase = "ended";

    // live boarding fill for the CURRENT board station (public — this is how the train visibly fills)
    let currentBoarding: { wagons: number[]; counts: number[] } | null = null;
    if (phase === "board" && station < game.numStations) {
      const [, boarded, wagons, counts] = (await read("getBoarding", [gid, station])) as [
        Address[],
        boolean[],
        number[],
        number[],
      ];
      currentBoarding = {
        wagons: addrs.map((_, i) => (boarded[i] ? Number(wagons[i]) : -1)),
        counts: (counts as any[]).map(Number),
      };
    }

    const survivors = alive.filter(Boolean).length;
    let finalRoles: number[] | null = null;
    let survivorAddrs: string[] | null = null;
    if (game.settled) {
      finalRoles = (rolesOnChain as any[]).map(Number);
      survivorAddrs = (await read("getSurvivors", [gid])) as string[];
    }

    const data = jsonSafe({
      ...base,
      phase,
      station,
      phaseEndsAt,
      alive,
      survivors,
      revealed,
      lastReveal: lastReveal
        ? {
            station: sim ? sim.stations.length - 1 : revealed - 1,
            controllerWagons: lastReveal.controllerWagons,
            caught: lastReveal.caught,
            idleOut: lastReveal.idleOut,
            wagonOf: lastReveal.wagonOf,
          }
        : null,
      currentBoarding,
      elimOnChain,
      finalRoles, // null until settled
      survivorAddrs,
      decided,
      potMon: formatEther(BigInt(game.pot)),
    });
    cache.set(gameId, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "read failed" });
  }
}
