/**
 * Full end-to-end simulation of a 20-bot game from the terminal.
 * Deploys a fresh contract, creates a game, fills it with bots, plays every station,
 * resolves, finishes and prints the leaderboard + awards. This is the proof the core works.
 *
 * Works against Monad Testnet (PRIVATE_KEY funded) OR a local anvil:
 *   anvil &
 *   MONAD_RPC_URL=http://127.0.0.1:8545 PRIVATE_KEY=<anvil key 0> npm run simulate -- --n 20 --stations 4
 *
 * Flags: --n <bots> --stations <k> --commit <s> --reveal <s>
 */
import "dotenv/config";
import { formatEther } from "viem";
import { publicClient, walletFor, requireGmKey, gmAccount, CHAIN_ID, RPC_URL } from "./chain.js";
import { FraudeRERB_ABI, loadBytecode, Role } from "./game.js";
import { readContract, waitUntilChain, writeWithRetry } from "./client.js";
import { makeBots } from "./bots.js";
import {
  fundAndRegisterBots,
  botsCommit,
  botsReveal,
  resolveStation,
  finishGame,
  readGame,
  stationTimes,
  printResults,
} from "./engine.js";

function arg(name: string, def: number) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const N = arg("n", 20);
const STATIONS = arg("stations", 4);
const COMMIT = arg("commit", 12);
const REVEAL = arg("reveal", 5);
const SECRET = process.env.MASTER_SECRET ?? "blitz-demo-secret";
const DENOM = Number(process.env.ROLE_DENOM ?? 8);
const FUND = process.env.BURNER_FUND_MON ?? "0.02";

async function main() {
  console.log(`\n🚇 === Fraude sur le RER B — SIMULATION (${N} bots, ${STATIONS} stations) ===`);
  console.log(`RPC ${RPC_URL} (chain ${CHAIN_ID})`);
  const gmKey = requireGmKey();
  const gm = gmAccount();
  const wallet = walletFor(gmKey);
  const bal = await publicClient.getBalance({ address: gm.address });
  console.log(`GM ${gm.address}  balance ${formatEther(bal)} MON`);
  if (bal === 0n) throw new Error("GM balance 0 — fund it (blitz.devnads.com) or use anvil.");

  // 1. Deploy fresh
  console.log(`\nDeploying FraudeRERB...`);
  const dh = await wallet.deployContract({ abi: FraudeRERB_ABI, bytecode: loadBytecode(), args: [] });
  const drc = await publicClient.waitForTransactionReceipt({ hash: dh });
  const addr = drc.contractAddress!;
  console.log(`  @ ${addr}`);

  // 2. Create game
  await writeWithRetry(gmKey, addr, "createGame", [STATIONS, COMMIT, REVEAL], { label: "createGame" });
  const gameId = (await readContract(addr, "gameCount", [])) as bigint;
  console.log(`  gameId = ${gameId}`);

  // 3. Bots
  const bots = makeBots(gameId, N, SECRET, DENOM);
  const nCtrl = bots.filter((b) => b.role === Role.CONTROLEUR).length;
  console.log(`  ${bots.length} bots (${nCtrl} contrôleurs, ${bots.length - nCtrl} passagers)`);
  await fundAndRegisterBots(gmKey, addr, gameId, bots, SECRET, DENOM, FUND);

  // 4. Start
  await writeWithRetry(gmKey, addr, "startGame", [gameId], { label: "startGame" });
  const g = await readGame(addr, gameId);
  console.log(`  started; stationDuration=${g.stationDuration}s, gameEnd in ${g.gameEnd - Math.floor(Date.now() / 1000)}s`);

  // 5. Play stations
  for (let s = 0; s < STATIONS; s++) {
    const t = await stationTimes(addr, gameId, s);
    console.log(`\n--- Station ${s + 1}/${STATIONS} ---`);
    await waitUntilChain(t.commitStart, `commit st${s + 1}`);
    const committed = await botsCommit(addr, gameId, s, bots, SECRET);
    console.log(`  ✓ ${committed}/${bots.length} committed`);

    await waitUntilChain(t.commitEnd, `reveal st${s + 1}`);
    const revealed = await botsReveal(addr, gameId, s, bots, SECRET);
    console.log(`  ✓ ${revealed}/${bots.length} revealed`);

    await waitUntilChain(t.revealEnd, `resolve st${s + 1}`);
    await resolveStation(gmKey, addr, gameId, s);
    const [resolved, inspected, , , outcomes] = (await readContract(addr, "getStationResult", [
      gameId,
      s,
    ])) as [boolean, number[], string[], number[], number[]];
    const caught = (outcomes as number[]).filter((o) => o === 3).length;
    console.log(`  🎯 resolved — cars inspectés: [${inspected.join(",")}], ${caught} fraudeur(s) pincé(s)`);
  }

  // 6. Finish + results
  await waitUntilChain(g.gameEnd, "gameEnd");
  console.log(`\nFinishing game (revealing roles)...`);
  await finishGame(gmKey, addr, gameId, SECRET, DENOM);

  const rows = await printResults(addr, gameId);

  // Awards
  const passengers = rows.filter((r) => r.role === Role.PASSAGER);
  const controllers = rows.filter((r) => r.role === Role.CONTROLEUR);
  console.log("\n===== PALMARÈS =====");
  if (passengers.length) {
    const roi = passengers[0];
    console.log(`👑 Roi de la fraude : ${roi.nick} (${roi.pts} pts)`);
  }
  if (controllers.length) {
    const best = [...controllers].sort((a, b) => b.pts - a.pts)[0];
    console.log(`🎩 Contrôleur de l'année : ${best.nick} (${best.pts} pts)`);
  }
  const loser = rows[rows.length - 1];
  console.log(`😭 Pas de chance : ${loser.nick} (${loser.pts} pts)`);

  console.log(`\n✅ SIMULATION COMPLETE — contract ${addr}, game ${gameId}`);
}

main().catch((e) => {
  console.error("\n❌ SIMULATION FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
