"use client";
import type { Hex } from "viem";
import { walletFor, publicClient, CONTRACT_ADDRESS } from "./chain";
import { FraudeRERB_ABI } from "./contract";
import { commitHash, ZERO32, Action } from "./game";

async function write(pk: Hex, fn: string, args: any[]) {
  const wallet = walletFor(pk);
  const hash = await wallet.writeContract({
    address: CONTRACT_ADDRESS,
    abi: FraudeRERB_ABI,
    functionName: fn,
    args,
    account: wallet.account!,
  } as any);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Retry a client tx a couple of times (slow phone network / RPC hiccups). */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const m = String(e?.shortMessage ?? e?.message ?? e);
      if (/Already|Window|NotInCommit|NotInReveal/.test(m)) throw e; // terminal
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export async function sendCommit(
  pk: Hex,
  gameId: bigint,
  station: number,
  car: number,
  action: number,
  salt: Hex,
  player: `0x${string}`
) {
  const h = commitHash(car, action, salt, player, station);
  return withRetry(() => write(pk, "commit", [gameId, station, h]));
}

export async function sendReveal(
  pk: Hex,
  gameId: bigint,
  station: number,
  car: number,
  action: number,
  salt: Hex,
  roleSalt: Hex
) {
  const rs = action === Action.INSPECT ? roleSalt : ZERO32;
  return withRetry(() => write(pk, "reveal", [gameId, station, car, action, salt, rs]));
}
