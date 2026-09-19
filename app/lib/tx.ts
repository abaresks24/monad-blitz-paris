"use client";
import { decodeEventLog, type Hex } from "viem";
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
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  if (rcpt.status === "reverted") throw new Error("transaction reverted");
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

/** The player's own wallet creates the game (so they are the on-chain creator). Returns gameId. */
export async function sendCreate(
  pk: Hex,
  p: { numWagons: number; numControllers: number; numStations: number; boardDuration: number; fee: bigint }
): Promise<string> {
  const wallet = walletFor(pk);
  const hash = await withRetry(() =>
    wallet.writeContract({
      address: CONTRACT_ADDRESS,
      abi: RERB_ABI,
      functionName: "createGame",
      args: [p.numWagons, 5, p.numControllers, p.numStations, p.boardDuration, p.fee],
      account: wallet.account!,
    } as any)
  );
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  for (const log of rcpt.logs) {
    if (log.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: RERB_ABI, data: log.data, topics: log.topics }) as any;
      if (ev.eventName === "GameCreated") return ev.args.gameId.toString();
    } catch {}
  }
  throw new Error("createGame: no GameCreated event");
}

export async function sendJoin(pk: Hex, gameId: bigint, nick: string, fee: bigint) {
  return withRetry(() => write(pk, "join", [gameId, nick], fee));
}

/** Creator starts the game with role commitments fetched from the server (hashes only). */
export async function sendStart(pk: Hex, gameId: bigint, commits: Hex[]) {
  return withRetry(() => write(pk, "startGame", [gameId, commits]));
}

export async function sendBoard(pk: Hex, gameId: bigint, station: number, wagon: number) {
  return withRetry(() => write(pk, "board", [gameId, station, wagon]));
}
