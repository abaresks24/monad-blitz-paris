import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { serverPublic, gmWrite, cfg, CONTRACT, MASTER_SECRET, isHost } from "@/lib/server";
import { roleCommitsFor } from "@/lib/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const authorized = (gameId: string, token: string) => isHost(gameId, token);

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured" });
    const { gameId, hostToken } = await req.json();
    if (!authorized(String(gameId), hostToken)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const gid = BigInt(gameId);
    const players = (await serverPublic.readContract({ ...cfg(), functionName: "getPlayers", args: [gid] })) as Address[];
    const g = (await serverPublic.readContract({ ...cfg(), functionName: "getGame", args: [gid] })) as any[];
    const numControllers = Number(g[3]);
    const commits = roleCommitsFor(gid, players, MASTER_SECRET, numControllers);
    const hash = await gmWrite("startGame", [gid, commits]);
    await serverPublic.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, hash });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "start failed" });
  }
}
