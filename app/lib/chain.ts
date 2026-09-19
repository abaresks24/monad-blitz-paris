import { createPublicClient, http, fallback, defineChain, createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_POOL = [
  "https://testnet-rpc.monad.xyz",
  "https://10143.rpc.thirdweb.com",
  "https://rpc.ankr.com/monad_testnet",
];
const RAW_URLS = (process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? DEFAULT_POOL.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Shuffle the endpoint order ONCE per client so 30 phones don't all hammer the same node first.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const RPC_URLS = typeof window !== "undefined" ? shuffle(RAW_URLS) : RAW_URLS;
export const RPC_URL = RPC_URLS[0];
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
// batch:true merges JSON-RPC calls into fewer HTTP requests
const poolTransport = () => fallback(RPC_URLS.map((u) => http(u, { retryCount: 2, batch: true })));

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});

// pollingInterval ~1.2s (Monad blocks are sub-second) keeps receipt polling from spamming the RPC
export const publicClient = createPublicClient({ chain: monadTestnet, transport: poolTransport(), pollingInterval: 1200 });

export function walletFor(pk: Hex) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: monadTestnet, transport: poolTransport() });
}
