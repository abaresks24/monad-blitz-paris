import "dotenv/config";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export const RPC_URL = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const CHAIN_ID = Number(process.env.MONAD_CHAIN_ID ?? 10143);

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
  transport: http(RPC_URL),
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
    transport: http(RPC_URL),
  });
}
