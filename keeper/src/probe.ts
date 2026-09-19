/**
 * M0 risk-check probe.
 * Deploys the trivial `Ping` contract, then blasts N txs from the GM key using
 * explicit parallel nonce management, and measures inclusion latency.
 *
 * Usage:
 *   npm run probe            # 20 txs from GM key
 *   npm run probe -- --n 30 --senders 3
 *
 * Requires: PRIVATE_KEY funded with MON in ../.env
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { encodeFunctionData, parseEther, formatEther, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { publicClient, monadTestnet, requireGmKey, walletFor, RPC_URL, CHAIN_ID } from "./chain.js";
import { mapLimit } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const N = arg("n", 20);
const SENDERS = arg("senders", 1);

// Minimal Ping artifact (abi + bytecode) — read from forge build output.
function loadPing(): { abi: any[]; bytecode: Hex } {
  const p = join(__dirname, "../../contracts/out/Ping.sol/Ping.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object as Hex };
}

async function main() {
  console.log(`\n=== M0 PROBE — Monad Testnet (chain ${CHAIN_ID}) ===`);
  console.log(`RPC: ${RPC_URL}`);
  const gmPk = requireGmKey();
  const gm = privateKeyToAccount(gmPk);
  const gmWallet = walletFor(gmPk);
  const bal = await publicClient.getBalance({ address: gm.address });
  console.log(`GM: ${gm.address}  balance: ${formatEther(bal)} MON`);
  if (bal === 0n) throw new Error("GM balance is 0 — fund via blitz.devnads.com");

  const chainId = await publicClient.getChainId();
  console.log(`chainId reported by RPC: ${chainId}`);

  // --- Deploy Ping ---
  const { abi, bytecode } = loadPing();
  console.log(`\nDeploying Ping...`);
  const tDeploy = Date.now();
  const deployHash = await gmWallet.deployContract({ abi, bytecode, args: [] });
  const deployRcpt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contract = deployRcpt.contractAddress!;
  console.log(`Ping @ ${contract}  (deploy mined in ${Date.now() - tDeploy} ms, block ${deployRcpt.blockNumber})`);

  // --- Prepare senders ---
  const senderKeys: Hex[] = [gmPk];
  for (let i = 1; i < SENDERS; i++) senderKeys.push(generatePrivateKey());
  if (SENDERS > 1) {
    console.log(`\nFunding ${SENDERS - 1} extra sender key(s)...`);
    let nonce = await publicClient.getTransactionCount({ address: gm.address });
    const fundHashes: Hex[] = [];
    for (let i = 1; i < SENDERS; i++) {
      const acct = privateKeyToAccount(senderKeys[i]);
      const h = await gmWallet.sendTransaction({
        to: acct.address,
        value: parseEther("0.02"),
        nonce: nonce++,
      });
      fundHashes.push(h);
    }
    await Promise.all(fundHashes.map((h) => publicClient.waitForTransactionReceipt({ hash: h })));
    console.log(`Funded.`);
  }

  const pingData = encodeFunctionData({ abi, functionName: "ping", args: [] });

  // --- Blast N txs with explicit parallel nonce management ---
  console.log(`\nBlasting ${N} ping() txs across ${SENDERS} sender(s), parallel nonces...`);
  const wallets = senderKeys.map((k) => ({ pk: k, acct: privateKeyToAccount(k), wallet: walletFor(k) }));
  const nonces = await Promise.all(
    wallets.map((w) => publicClient.getTransactionCount({ address: w.acct.address }))
  );

  const CONC = arg("conc", 5); // bounded concurrency (real keeper strategy vs public-RPC 429s)
  console.log(`  (concurrency cap = ${CONC}; pass --conc N to change)`);
  const t0 = Date.now();
  const submitTimes: number[] = [];
  const hashes = await mapLimit(
    Array.from({ length: N }, (_, i) => i),
    CONC,
    async (i) => {
      const w = wallets[i % SENDERS];
      const nonce = nonces[i % SENDERS] + Math.floor(i / SENDERS);
      for (let a = 0; a < 4; a++) {
        try {
          const hash = await w.wallet.sendTransaction({ to: contract, data: pingData, nonce });
          submitTimes.push(Date.now() - t0);
          return hash;
        } catch (e: any) {
          const msg = String(e?.shortMessage ?? e?.message ?? e);
          if (a === 3) throw e;
          await new Promise((r) => setTimeout(r, (/429|Too Many/i.test(msg) ? 800 : 300) * (a + 1)));
        }
      }
      throw new Error("unreachable");
    }
  );
  const tAllSubmitted = Date.now() - t0;
  console.log(`All ${N} submitted (accepted by RPC) in ${tAllSubmitted} ms`);

  // --- Wait for all receipts, measure per-tx mined latency ---
  const minedTimes: number[] = [];
  await Promise.all(
    hashes.map((h) =>
      publicClient.waitForTransactionReceipt({ hash: h }).then(() => {
        minedTimes.push(Date.now() - t0);
      })
    )
  );
  const tAllMined = Date.now() - t0;

  const stats = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return {
      min: s[0],
      p50: s[Math.floor(s.length * 0.5)],
      p95: s[Math.floor(s.length * 0.95)],
      max: s[s.length - 1],
    };
  };

  console.log(`\n--- RESULTS ---`);
  console.log(`submit latency ms:`, stats(submitTimes));
  console.log(`mined  latency ms:`, stats(minedTimes));
  console.log(`ALL ${N} txs mined in ${tAllMined} ms wall-clock`);
  const verdict =
    tAllMined < 6000
      ? "✅ COMFORTABLE — 12s commit window is safe for 20+ passengers."
      : tAllMined < 11000
        ? "⚠️  TIGHT — fits 12s but add sender keys / bump commit to 15s."
        : "❌ TOO SLOW — increase commit window or reduce bots. See fallbacks in NOTES.md.";
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`\nPaste the above into NOTES.md under "M0 RESULT".`);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message ?? e);
  process.exit(1);
});
