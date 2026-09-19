import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { serverPublic, cfg, CONTRACT, MASTER_SECRET } from "@/lib/server";
import { roleCommitsFor } from "@/lib/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Returns role COMMITMENTS (keccak hashes) for a game's current roster, in player order.
// Safe to expose: commitments reveal nothing without the salts (which stay server-side).
export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured" });
    const { gameId } = await req.json();
    const gid = BigInt(gameId);
    const players = (await serverPublic.readContract({ ...cfg(), functionName: "getPlayers", args: [gid] })) as Address[];
    const g = (await serverPublic.readContract({ ...cfg(), functionName: "getGame", args: [gid] })) as any[];
    const numControllers = Number(g[3]);
    if (players.length < 2 || numControllers >= players.length) {
      return NextResponse.json({ ok: false, error: "il faut au moins 2 joueurs (et plus de joueurs que de contrôleurs)" });
    }
    const commits = roleCommitsFor(gid, players, MASTER_SECRET, numControllers);
    return NextResponse.json({ ok: true, commits });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "commits failed" });
  }
}
