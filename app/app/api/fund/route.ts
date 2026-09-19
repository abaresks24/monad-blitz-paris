import { NextRequest, NextResponse } from "next/server";
import { parseEther, formatEther, type Address } from "viem";
import { serverPublic, gmSendValue, CONTRACT, BURNER_FUND_MON } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!CONTRACT) return NextResponse.json({ ok: false, error: "server not configured" });
    const { address } = await req.json();
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ ok: false, error: "bad address" });
    const bal = (await serverPublic.getBalance({ address: address as Address })) as bigint;
    const target = parseEther(BURNER_FUND_MON);
    if (bal < target / 2n) {
      // fire the funding tx but DON'T block on the receipt — the client polls its own balance.
      // keeps the join rush fast when 30 players fund at once.
      const hash = await gmSendValue(address as Address, target);
      return NextResponse.json({ ok: true, funded: true, hash });
    }
    return NextResponse.json({ ok: true, funded: false, balance: formatEther(bal) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "fund failed" });
  }
}
