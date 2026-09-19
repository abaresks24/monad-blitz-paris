import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, type Address, type Hex } from "viem";
import { serverPublic, cfg, CONTRACT, MASTER_SECRET } from "@/lib/server";
import { assignRoles, Role } from "@/lib/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured" });
    const { gameId, address, signature } = await req.json();
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ ok: false, error: "bad address" });

    const message = `RER B — quel est mon rôle ?\njeu #${gameId}`;
    const ok = await verifyMessage({ address: address as Address, message, signature: signature as Hex });
    if (!ok) return NextResponse.json({ ok: false, error: "bad signature" });

    const gid = BigInt(gameId);
    const g = (await serverPublic.readContract({ ...cfg(), functionName: "getGame", args: [gid] })) as any[];
    if (!g[7]) return NextResponse.json({ ok: false, error: "not started" }); // roles fixed only at start
    const players = (await serverPublic.readContract({ ...cfg(), functionName: "getPlayers", args: [gid] })) as Address[];
    const numControllers = Number(g[3]);
    const roles = assignRoles(gid, players, MASTER_SECRET, numControllers);
    const i = players.findIndex((p) => p.toLowerCase() === (address as string).toLowerCase());
    if (i < 0) return NextResponse.json({ ok: false, error: "not a player" });

    const role = roles[i];
    // controllers see each other (discreet coordination)
    const controllers =
      role === Role.CONTROLEUR ? players.filter((_, j) => roles[j] === Role.CONTROLEUR) : undefined;
    return NextResponse.json({ ok: true, role, controllers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "myrole failed" });
  }
}
