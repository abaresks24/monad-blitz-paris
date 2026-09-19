/**
 * Deploy FraudeRERB to Monad Testnet and write deployments/monad-testnet.json.
 * Requires PRIVATE_KEY funded with MON.
 *   npm run deploy
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatEther } from "viem";
import { publicClient, requireGmKey, walletFor, gmAccount, CHAIN_ID, RPC_URL } from "./chain.js";
import { FraudeRERB_ABI, loadBytecode } from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const gm = gmAccount();
  const wallet = walletFor(requireGmKey());
  const bal = await publicClient.getBalance({ address: gm.address });
  console.log(`Deployer: ${gm.address}  balance: ${formatEther(bal)} MON  (chain ${CHAIN_ID})`);
  if (bal === 0n) throw new Error("Deployer balance is 0 — fund via blitz.devnads.com");

  console.log("Deploying FraudeRERB...");
  const hash = await wallet.deployContract({ abi: FraudeRERB_ABI, bytecode: loadBytecode(), args: [] });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  const address = rcpt.contractAddress!;
  console.log(`✅ FraudeRERB @ ${address}  (block ${rcpt.blockNumber})`);

  const out = {
    chainId: CHAIN_ID,
    rpc: RPC_URL,
    contract: address,
    deployer: gm.address,
    deployTx: hash,
    blockNumber: Number(rcpt.blockNumber),
    explorer: `https://testnet.monadexplorer.com/address/${address}`,
  };
  const path = join(__dirname, "../../deployments/monad-testnet.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path}`);
  console.log(`\nNext: set CONTRACT_ADDRESS=${address} and NEXT_PUBLIC_CONTRACT_ADDRESS=${address} in .env`);
}

main().catch((e) => {
  console.error("DEPLOY FAILED:", e.message ?? e);
  process.exit(1);
});
