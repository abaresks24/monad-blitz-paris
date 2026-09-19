import { formatEther, parseEther, type Address, type Hex } from "viem";
import { publicClient, walletFor, monadTestnet } from "./chain.js";
import { FraudeRERB_ABI } from "./game.js";

export function contractCfg(address: Address) {
  return { address, abi: FraudeRERB_ABI } as const;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  let nonce = await publicClient.getTransactionCount({ address: from });
  const hashes = await Promise.all(
    txs.map((t) =>
      wallet.sendTransaction({ to: t.to, data: t.data, value: t.value, nonce: nonce++ } as any)
    )
  );
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
      await sleep(300 * (i + 1));
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
