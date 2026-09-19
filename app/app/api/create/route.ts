import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { serverPublic, gmWrite, cfg, CONTRACT, ENTRY_FEE_MON, hostTokenFor } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured" });
    const b = await req.json();
    const numWagons = clamp(Number(b.numWagons ?? 4), 2, 8);
    const numControllers = clamp(Number(b.numControllers ?? 2), 1, numWagons * 3 - 1);
    const numStations = clamp(Number(b.numStations ?? 4), 1, 10);
    const boardDuration = clamp(Number(b.boardDuration ?? 20), 5, 60);
    const fee = parseEther(ENTRY_FEE_MON);

    await gmWrite("createGame", [numWagons, 5, numControllers, numStations, boardDuration, fee]);
    const gid = ((await serverPublic.readContract({ ...cfg(), functionName: "gameCount", args: [] })) as bigint).toString();

    const hostToken = hostTokenFor(gid);
    return NextResponse.json({ ok: true, gameId: gid, hostToken, entryFee: ENTRY_FEE_MON, numWagons, numControllers, numStations });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "create failed" });
  }
}
