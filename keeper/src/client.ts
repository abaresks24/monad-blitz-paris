import { formatEther, parseEther, type Address, type Hex } from "viem";
import { publicClient, walletFor, monadTestnet } from "./chain.js";
import { FraudeRERB_ABI } from "./game.js";

export function contractCfg(address: Address) {
  return { address, abi: FraudeRERB_ABI } as const;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run tasks with bounded concurrency (avoids RPC 429 from bursting all at once). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Wait until a unix timestamp (seconds), using the local clock. */
export async function waitUntil(unixSec: number, label = "") {
  const ms = unixSec * 1000 - Date.now();
  if (ms > 0) {
    if (label) console.log(`  ⏳ waiting ${(ms / 1000).toFixed(1)}s for ${label}`);
    await sleep(ms);
  }
}

/** Latest block timestamp (the chain's clock). */
export async function chainNow(): Promise<number> {
  const b = await publicClient.getBlock({ blockTag: "latest" });
  return Number(b.timestamp);
}

/**
 * Wait until the CHAIN clock reaches `target`. Robust to any drift between the local
 * wall-clock and block timestamps (e.g. anvil --block-time, or a busy RPC).
 */
export async function waitUntilChain(target: number, label = "") {
  let first = true;
  for (;;) {
    const now = await chainNow();
    if (now >= target) return;
    if (first && label) console.log(`  ⏳ chain ${now} → waiting for ${target} (${label})`);
    first = false;
    await sleep(400);
  }
}

/** Send N txs from one account with explicit sequential nonces, in parallel; wait for all receipts. */
export async function batchFromGM(
  gmKey: Hex,
  txs: { to?: Address; data?: Hex; value?: bigint; deploy?: boolean }[]
): Promise<Hex[]> {
  const wallet = walletFor(gmKey);
  const from = wallet.account!.address;
  const baseNonce = await publicClient.getTransactionCount({ address: from });
  // bounded concurrency + retry so a 40-tx burst doesn't 429 the public RPC
  const hashes = await mapLimit(txs, 5, async (t, i) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await wallet.sendTransaction({ to: t.to, data: t.data, value: t.value, nonce: baseNonce + i } as any);
      } catch (e: any) {
        const msg = String(e?.shortMessage ?? e?.message ?? e);
        if (attempt === 3) throw e;
        await sleep((/429|Too Many/i.test(msg) ? 800 : 300) * (attempt + 1));
      }
    }
    throw new Error("unreachable");
  });
  await Promise.all(hashes.map((h) => publicClient.waitForTransactionReceipt({ hash: h })));
  return hashes;
}

/** Robustly send a single contract write with a couple of retries (RPC hiccups / window edges). */
export async function writeWithRetry(
  key: Hex,
  address: Address,
  functionName: string,
  args: any[],
  opts: { value?: bigint; retries?: number; label?: string } = {}
): Promise<Hex | null> {
  const wallet = walletFor(key);
  const retries = opts.retries ?? 3;
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const hash = await wallet.writeContract({
        ...contractCfg(address),
        functionName,
        args,
        value: opts.value,
        chain: monadTestnet,
        account: wallet.account!,
      } as any);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.shortMessage ?? e?.message ?? e);
      // window / already-done errors are terminal-ish: don't hammer
      if (/Already|Window|Committed|Revealed|Resolved/.test(msg)) return null;
      // back off harder on rate-limit (429)
      const is429 = /429|Too Many Requests|rate limit/i.test(msg);
      await sleep((is429 ? 700 : 300) * (i + 1));
    }
  }
  if (opts.label) console.warn(`  ⚠️ ${opts.label} failed: ${lastErr?.shortMessage ?? lastErr?.message}`);
  return null;
}

export async function readContract(address: Address, functionName: string, args: any[] = []) {
  return publicClient.readContract({ ...contractCfg(address), functionName, args });
}

export async function ensureFunded(gmKey: Hex, addr: Address, minMon: string, topUpMon: string) {
  const bal = await publicClient.getBalance({ address: addr });
  if (bal < parseEther(minMon)) {
    await batchFromGM(gmKey, [{ to: addr, value: parseEther(topUpMon) }]);
  }
}

export { formatEther, parseEther };
