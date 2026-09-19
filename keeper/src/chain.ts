import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, createWalletClient, http, fallback, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

// load the single repo-root .env (keeper runs from keeper/, .env lives one level up)
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../.env") });

// Pool of RPC endpoints — the keeper bursts many txs from one IP, so we fail over on 429.
// Set MONAD_RPC_URLS (comma-separated) to add a dedicated endpoint (Alchemy) for headroom.
const DEFAULT_POOL = [
  "https://testnet-rpc.monad.xyz",
  "https://10143.rpc.thirdweb.com",
  "https://rpc.ankr.com/monad_testnet",
];
export const RPC_URLS = (process.env.MONAD_RPC_URLS ?? process.env.MONAD_RPC_URL ?? DEFAULT_POOL.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const RPC_URL = RPC_URLS[0];
export const CHAIN_ID = Number(process.env.MONAD_CHAIN_ID ?? 10143);

const poolTransport = () => fallback(RPC_URLS.map((u) => http(u, { retryCount: 2 })), { rank: false });

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: poolTransport(),
});

export function requireGmKey(): Hex {
  const pk = process.env.PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    throw new Error(
      "Missing/invalid PRIVATE_KEY in .env — set a funded Monad testnet TEST key (0x + 64 hex). Fund via blitz.devnads.com."
    );
  }
  return pk as Hex;
}

export function gmAccount() {
  return privateKeyToAccount(requireGmKey());
}

export function walletFor(pk: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: monadTestnet,
    transport: poolTransport(),
  });
}
