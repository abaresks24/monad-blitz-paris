import { NextRequest, NextResponse } from "next/server";
import { serverPublic, cfg, jsonSafe, CONTRACT } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// tiny in-memory TTL cache so many phones + the screen don't each hammer the RPC
type Cached = { at: number; data: any };
const cache = new Map<string, Cached>();
const TTL = 400;

async function read(fn: string, args: any[] = []) {
  return serverPublic.readContract({ ...cfg(), functionName: fn, args });
}

function activeStation(g: any, now: number) {
  if (!g.startedAt) return { station: -1, phase: "lobby", endsAt: 0 };
  const sd = g.stationDuration;
  const elapsed = now - g.startedAt;
  const station = Math.floor(elapsed / sd);
  if (station >= g.numStations) return { station: g.numStations, phase: "ended", endsAt: g.gameEnd };
  const into = elapsed - station * sd;
  const cs = g.startedAt + station * sd;
  if (into < g.commitDuration) return { station, phase: "commit", endsAt: cs + g.commitDuration };
  if (into < g.commitDuration + g.revealDuration)
    return { station, phase: "reveal", endsAt: cs + g.commitDuration + g.revealDuration };
  return { station, phase: "resolve", endsAt: cs + sd };
}

export async function GET(req: NextRequest) {
  if (!CONTRACT) return NextResponse.json({ ok: false, error: "no contract configured" }, { status: 200 });
  const gameId = req.nextUrl.searchParams.get("gameId") ?? "0";
  const key = gameId;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  try {
    const gid = BigInt(gameId === "0" ? ((await read("gameCount")) as bigint).toString() : gameId);
    const g = (await read("getGame", [gid])) as any[];
    const game = {
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
    const now = Number((await serverPublic.getBlock({ blockTag: "latest" })).timestamp);
    const [addrs, nicks, pts, roles] = (await read("getBoard", [gid])) as [string[], string[], bigint[], number[]];
    const board = addrs.map((a, i) => ({ addr: a, nick: nicks[i], pts: Number(pts[i]), role: Number(roles[i]) }));

    const act = activeStation(game, now);
    const st = act.station;

    let dots: any = null;
    if (st >= 0 && st < game.numStations) {
      const [da, dc, dr] = (await read("getStationBoard", [gid, st])) as [string[], boolean[], boolean[]];
      dots = { addrs: da, committed: dc, revealed: dr };
    }

    const results: Record<number, any> = {};
    for (const s of [st - 1, st].filter((x) => x >= 0 && x < game.numStations)) {
      const [resolved, inspectedCars, ra, cars, outcomes] = (await read("getStationResult", [gid, s])) as [
        boolean,
        number[],
        string[],
        number[],
        number[],
      ];
      results[s] = {
        resolved,
        inspectedCars: (inspectedCars as any[]).map(Number),
        addrs: ra,
        cars: (cars as any[]).map(Number),
        outcomes: (outcomes as any[]).map(Number),
      };
    }

    const data = jsonSafe({
      ok: true,
      gameId: Number(gid),
      now,
      game,
      board,
      activeStation: act.station,
      phase: act.phase,
      phaseEndsAt: act.endsAt,
      dots,
      results,
    });
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "read failed" });
  }
}
