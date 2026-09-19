import { NextRequest, NextResponse } from "next/server";
import { parseEther, verifyMessage, type Address, type Hex } from "viem";
import {
  serverPublic,
  gmWrite,
  gmSendValue,
  cfg,
  CONTRACT,
  MASTER_SECRET,
  ROLE_DENOM,
  BURNER_FUND_MON,
} from "@/lib/server";
import { roleCommitFor, roleFor, roleSaltFor } from "@/lib/game";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function joinMessage(gameId: string, nickname: string) {
  return `RER B — je monte dans le train\njeu #${gameId}\npseudo: ${nickname}`;
}

async function read(fn: string, args: any[] = []) {
  return serverPublic.readContract({ ...cfg(), functionName: fn, args });
}

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured (no contract)" });
    const body = await req.json();
    const address = body.address as Address;
    let nickname = String(body.nickname ?? "").trim().slice(0, 20) || "Anonyme";
    const signature = body.signature as Hex;
    let gameId = String(body.gameId ?? "0");

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "bad address" });
    }
    if (gameId === "0" || gameId === "latest") {
      gameId = ((await read("gameCount")) as bigint).toString();
    }
    const gid = BigInt(gameId);

    // verify the caller controls the burner (signature over the join message)
    const ok = await verifyMessage({ address, message: joinMessage(gameId, nickname), signature });
    if (!ok) return NextResponse.json({ ok: false, error: "bad signature" });

    // deterministic role for this address
    const role = roleFor(gid, address, MASTER_SECRET, ROLE_DENOM);
    const roleSalt = roleSaltFor(gid, address, MASTER_SECRET);
    const roleCommit = roleCommitFor(gid, address, MASTER_SECRET, ROLE_DENOM);

    // already registered? (idempotent — return their role again)
    const already = (await read("roleCommitOf", [gid, address])) as Hex;
    const isRegistered = already && already !== ("0x" + "0".repeat(64));

    // fund the burner for gas if needed (fire the tx, don't block on receipt)
    const bal = (await serverPublic.getBalance({ address })) as bigint;
    if (bal < parseEther(BURNER_FUND_MON) / 2n) {
      try {
        await gmSendValue(address, parseEther(BURNER_FUND_MON));
      } catch {
        /* non-fatal: they may already have gas */
      }
    }

    if (!isRegistered) {
      // ensure the game hasn't started
      const g = (await read("getGame", [gid])) as any[];
      if (Number(g[4]) !== 0) {
        return NextResponse.json({ ok: false, error: "le train est déjà parti (jeu démarré)" });
      }
      try {
        const hash = await gmWrite("registerPlayer", [gid, address, nickname, roleCommit]);
        await serverPublic.waitForTransactionReceipt({ hash });
      } catch (e: any) {
        const msg = String(e?.shortMessage ?? e?.message ?? e);
        if (!/AlreadyRegistered|TooManyPlayers/.test(msg)) throw e;
        if (/TooManyPlayers/.test(msg)) return NextResponse.json({ ok: false, error: "train complet (64 max)" });
      }
    }

    return NextResponse.json({
      ok: true,
      gameId,
      address,
      nickname,
      role,
      roleSalt,
      contract: CONTRACT,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "join failed" });
  }
}
