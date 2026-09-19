import { createPublicClient, http, fallback, defineChain, createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_POOL = [
  "https://testnet-rpc.monad.xyz",
  "https://10143.rpc.thirdweb.com",
  "https://rpc.ankr.com/monad_testnet",
];
const RPC_URLS = (process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? DEFAULT_POOL.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const RPC_URL = RPC_URLS[0];
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const poolTransport = () => fallback(RPC_URLS.map((u) => http(u, { retryCount: 2 })));

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: monadTestnet, transport: poolTransport() });

export function walletFor(pk: Hex) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: monadTestnet, transport: poolTransport() });
}
