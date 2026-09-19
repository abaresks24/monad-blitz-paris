import { createPublicClient, http, defineChain, createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

export function walletFor(pk: Hex) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: monadTestnet, transport: http(RPC_URL) });
}
