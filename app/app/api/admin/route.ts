import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { serverPublic, gmWrite, cfg, CONTRACT, ADMIN_SECRET, MASTER_SECRET, ROLE_DENOM } from "@/lib/server";
import { roleFor, roleSaltFor } from "@/lib/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function read(fn: string, args: any[] = []) {
  return serverPublic.readContract({ ...cfg(), functionName: fn, args });
}

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "no contract configured" });
    const body = await req.json();
    if (body.secret !== ADMIN_SECRET) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const action = body.action as string;
    switch (action) {
      case "create": {
        const stations = Number(body.numStations ?? 4);
        const commit = Number(body.commitDuration ?? 12);
        const reveal = Number(body.revealDuration ?? 5);
        const hash = await gmWrite("createGame", [stations, commit, reveal]);
        await serverPublic.waitForTransactionReceipt({ hash });
        const gameId = ((await read("gameCount")) as bigint).toString();
        return NextResponse.json({ ok: true, gameId, hash });
      }
      case "start": {
        const gid = BigInt(body.gameId);
        const hash = await gmWrite("startGame", [gid]);
        await serverPublic.waitForTransactionReceipt({ hash });
        return NextResponse.json({ ok: true, hash });
      }
      case "resolve": {
        const gid = BigInt(body.gameId);
        const hash = await gmWrite("resolveStation", [gid, Number(body.station)]);
        await serverPublic.waitForTransactionReceipt({ hash });
        return NextResponse.json({ ok: true, hash });
      }
      case "finish": {
        const gid = BigInt(body.gameId);
        const players = (await read("getPlayers", [gid])) as Address[];
        const roles = players.map((p) => roleFor(gid, p, MASTER_SECRET, ROLE_DENOM));
        const salts = players.map((p) => roleSaltFor(gid, p, MASTER_SECRET));
        const hash = await gmWrite("finishGame", [gid, players, roles, salts]);
        await serverPublic.waitForTransactionReceipt({ hash });
        return NextResponse.json({ ok: true, hash });
      }
      default:
        return NextResponse.json({ ok: false, error: "unknown action" });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "admin action failed" });
  }
}
