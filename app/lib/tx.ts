"use client";
import type { Hex } from "viem";
import { walletFor, publicClient, CONTRACT_ADDRESS } from "./chain";
import { RERB_ABI } from "./contract";

async function write(pk: Hex, fn: string, args: any[], value?: bigint) {
  const wallet = walletFor(pk);
  const hash = await wallet.writeContract({
    address: CONTRACT_ADDRESS,
    abi: RERB_ABI,
    functionName: fn,
    args,
    value,
    account: wallet.account!,
  } as any);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const m = String(e?.shortMessage ?? e?.message ?? e);
      if (/Already|WagonFull|NotBoardingWindow|WrongFee/.test(m)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export async function sendJoin(pk: Hex, gameId: bigint, nick: string, fee: bigint) {
  return withRetry(() => write(pk, "join", [gameId, nick], fee));
}

export async function sendBoard(pk: Hex, gameId: bigint, station: number, wagon: number) {
  return withRetry(() => write(pk, "board", [gameId, station, wagon]));
}
