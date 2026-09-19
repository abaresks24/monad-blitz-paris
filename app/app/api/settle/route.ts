import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, type Address, type Hex } from "viem";
import { serverPublic, gmWrite, cfg, CONTRACT, MASTER_SECRET, ADMIN_SECRET, settleTxs } from "@/lib/server";
import { assignRoles, roleSaltFor } from "@/lib/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured" });
    const { gameId, address, signature, secret } = await req.json();
    const gid = BigInt(gameId);
    const g = (await serverPublic.readContract({ ...cfg(), functionName: "getGame", args: [gid] })) as any[];
    const creator = (g[0] as string).toLowerCase();

    // authorize: the on-chain creator (signature) OR the admin override
    let ok = secret === ADMIN_SECRET;
    if (!ok && address && signature) {
      const valid = await verifyMessage({ address: address as Address, message: `RER B — régler le pot\njeu #${gameId}`, signature: signature as Hex });
      ok = valid && (address as string).toLowerCase() === creator;
    }
    if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const players = (await serverPublic.readContract({ ...cfg(), functionName: "getPlayers", args: [gid] })) as Address[];
    const numControllers = Number(g[3]);
    const roles = assignRoles(gid, players, MASTER_SECRET, numControllers);
    const salts = players.map((p) => roleSaltFor(gid, p, MASTER_SECRET));
    const hash = await gmWrite("settle", [gid, roles, salts]);
    await serverPublic.waitForTransactionReceipt({ hash });
    settleTxs.set(String(gameId), hash);
    return NextResponse.json({ ok: true, hash });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "settle failed" });
  }
}
