import "server-only";
import { createHmac } from "node:crypto";
import { createPublicClient, createWalletClient, http, fallback, defineChain, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import abi from "./abi.json";

export const FraudeRERB_ABI = abi as any[];

const DEFAULT_POOL = [
  "https://testnet-rpc.monad.xyz",
  "https://10143.rpc.thirdweb.com",
  "https://rpc.ankr.com/monad_testnet",
];
const RPC_URLS = (process.env.MONAD_RPC_URLS ?? process.env.MONAD_RPC_URL ?? DEFAULT_POOL.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RPC_URL = RPC_URLS[0];
const poolTransport = () => fallback(RPC_URLS.map((u) => http(u, { retryCount: 2, batch: true })));
const CHAIN_ID = Number(process.env.MONAD_CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const CONTRACT = (process.env.CONTRACT_ADDRESS ?? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as Address;
export const MASTER_SECRET = process.env.MASTER_SECRET ?? "blitz-demo-secret";
export const ROLE_DENOM = Number(process.env.ROLE_DENOM ?? 8);
export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "change-me";
export const BURNER_FUND_MON = process.env.BURNER_FUND_MON ?? "0.05";
export const ENTRY_FEE_MON = process.env.ENTRY_FEE ?? "0.001";

// Host token authorizes start/settle for a game. Derived deterministically from MASTER_SECRET
// so any serverless instance can verify it without shared state — only the game's creator ever
// receives it (from /api/create). ADMIN_SECRET is an override.
export function hostTokenFor(gameId: string): string {
  return createHmac("sha256", MASTER_SECRET).update(`host:${gameId}`).digest("hex");
}
export function isHost(gameId: string, token: string): boolean {
  return token === ADMIN_SECRET || token === hostTokenFor(gameId);
}

export const serverChain = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  testnet: true,
});

export const serverPublic = createPublicClient({ chain: serverChain, transport: poolTransport() });

export function gmKey(): Hex {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    throw new Error("Server missing valid PRIVATE_KEY (Game Master key).");
  }
  return pk as Hex;
}

export function gmWallet() {
  return createWalletClient({ account: privateKeyToAccount(gmKey()), chain: serverChain, transport: poolTransport() });
}

export function gmAddress(): Address {
  return privateKeyToAccount(gmKey()).address;
}

export function cfg() {
  return { address: CONTRACT, abi: FraudeRERB_ABI } as const;
}

/** JSON-safe (bigint → number/string) */
export function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val)));
}

// ---- Serialized GM sender with in-process nonce management + retry ----
// The join rush fires many /api/join calls at once; concurrent GM txs would collide on
// nonce. We serialize GM txs in-process and track the nonce locally, refetching on error.
let gmChain: Promise<any> = Promise.resolve();
let gmNonce: number | null = null;

function withGmLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = gmChain.then(fn, fn);
  gmChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function nextNonce(): Promise<number> {
  if (gmNonce === null) {
    gmNonce = await serverPublic.getTransactionCount({ address: gmAddress(), blockTag: "pending" });
  }
  return gmNonce;
}

/** Send a GM contract write with serialized nonce + one retry on nonce/RPC error. */
export async function gmWrite(functionName: string, args: any[], value?: bigint): Promise<`0x${string}`> {
  return withGmLock(async () => {
    const wallet = gmWallet();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const nonce = await nextNonce();
        const hash = await wallet.writeContract({
          ...cfg(),
          functionName,
          args,
          value,
          nonce,
          account: wallet.account!,
          chain: serverChain,
        } as any);
        gmNonce = nonce + 1;
        return hash;
      } catch (e: any) {
        gmNonce = null; // refetch on next attempt
        if (attempt === 1) throw e;
      }
    }
    throw new Error("unreachable");
  });
}

/** Send native MON from GM (serialized nonce). */
export async function gmSendValue(to: Address, value: bigint): Promise<`0x${string}`> {
  return withGmLock(async () => {
    const wallet = gmWallet();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const nonce = await nextNonce();
        const hash = await wallet.sendTransaction({ to, value, nonce, account: wallet.account!, chain: serverChain });
        gmNonce = nonce + 1;
        return hash;
      } catch (e: any) {
        gmNonce = null;
        if (attempt === 1) throw e;
      }
    }
    throw new Error("unreachable");
  });
}
