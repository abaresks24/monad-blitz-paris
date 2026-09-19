/**
 * Live-game keeper (run on the laptop during the demo).
 *   - creates (or attaches to) a game
 *   - fills it with bots up to N_BOTS and registers them
 *   - waits for the GM to press START in /admin (or auto-starts)
 *   - each station: drives the bots' commit + reveal, then resolves at the deadline
 *   - finishes the game and reveals roles
 *
 * Humans join independently via the web app's /api/join (same deterministic role scheme).
 * Bots persist to keeper/state so a restart never double-registers.
 *
 *   npm run keeper
 * Env: GAME_ID (optional), N_BOTS, STATIONS, COMMIT_DURATION, REVEAL_DURATION,
 *      AUTOSTART_SECONDS (0 = wait for admin), MASTER_SECRET, CONTRACT_ADDRESS
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatEther, type Address, type Hex } from "viem";
import { publicClient, requireGmKey, gmAccount, RPC_URL, CHAIN_ID } from "./chain.js";
import { Role } from "./game.js";
import { readContract, writeWithRetry, waitUntilChain, chainNow, sleep } from "./client.js";
import { makeBots, type Bot } from "./bots.js";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "../state");

const N_BOTS = Number(process.env.N_BOTS ?? 20);
const STATIONS = Number(process.env.STATIONS ?? 4);
const COMMIT = Number(process.env.COMMIT_DURATION ?? 12);
const REVEAL = Number(process.env.REVEAL_DURATION ?? 5);
const SECRET = process.env.MASTER_SECRET ?? "blitz-demo-secret";
const DENOM = Number(process.env.ROLE_DENOM ?? 8);
const FUND = process.env.BURNER_FUND_MON ?? "0.02";
const AUTOSTART = Number(process.env.AUTOSTART_SECONDS ?? 0);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

function saveBots(gameId: bigint, bots: Bot[]) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, `bots-${gameId}.json`), JSON.stringify(bots, null, 2));
}
function loadBots(gameId: bigint): Bot[] | null {
  const p = join(STATE_DIR, `bots-${gameId}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Bot[]) : null;
}

async function main() {
  const gmKey = requireGmKey();
  const gm = gmAccount();
  const addr = process.env.CONTRACT_ADDRESS as Address;
  if (!addr) throw new Error("Set CONTRACT_ADDRESS in .env (run `npm run deploy` first).");
  const bal = await publicClient.getBalance({ address: gm.address });
  console.log(`\n🚇 KEEPER — chain ${CHAIN_ID} @ ${RPC_URL}`);
  console.log(`GM ${gm.address}  balance ${formatEther(bal)} MON  contract ${addr}`);

  // 1. Resolve game id
  let gameId: bigint;
  if (process.env.GAME_ID) {
    gameId = BigInt(process.env.GAME_ID);
  } else {
    await writeWithRetry(gmKey, addr, "createGame", [STATIONS, COMMIT, REVEAL], { label: "createGame" });
    gameId = (await readContract(addr, "gameCount", [])) as bigint;
    console.log(`Created game ${gameId} (${STATIONS} stations, ${COMMIT}s/${REVEAL}s).`);
  }

  // 2. Bots (reload if we already registered them for this game)
  let g = await readGame(addr, gameId);
  let bots = loadBots(gameId);
  if (!bots) {
    if (g.startedAt !== 0) {
      console.log("Game already started; skipping bot registration.");
      bots = [];
    } else {
      const slots = Math.max(0, N_BOTS - g.playerCount);
      bots = makeBots(gameId, slots, SECRET, DENOM);
      const nCtrl = bots.filter((b) => b.role === Role.CONTROLEUR).length;
      console.log(`Adding ${bots.length} bots (${nCtrl} contrôleurs)...`);
      await fundAndRegisterBots(gmKey, addr, gameId, bots, SECRET, DENOM, FUND);
      saveBots(gameId, bots);
    }
  } else {
    console.log(`Reloaded ${bots.length} bots from state.`);
  }

  // 3. Join window — wait for START
  console.log(`\n📱 Join at: ${BASE_URL}/play   |   Screen: ${BASE_URL}/screen`);
  g = await readGame(addr, gameId);
  if (g.startedAt === 0) {
    if (AUTOSTART > 0) {
      console.log(`Auto-starting in ${AUTOSTART}s (or when admin presses START)...`);
      const deadline = Date.now() + AUTOSTART * 1000;
      while (Date.now() < deadline) {
        g = await readGame(addr, gameId);
        if (g.startedAt !== 0) break;
        await sleep(1000);
      }
      if (g.startedAt === 0) {
        await writeWithRetry(gmKey, addr, "startGame", [gameId], { label: "startGame" });
      }
    } else {
      console.log("Waiting for admin to press START...");
      while (g.startedAt === 0) {
        await sleep(1000);
        g = await readGame(addr, gameId);
      }
    }
  }
  g = await readGame(addr, gameId);
  console.log(`▶️  Game started with ${g.playerCount} passengers. Driving ${bots.length} bots.`);

  // 4. Station loop
  for (let s = 0; s < g.numStations; s++) {
    if (await readContract(addr, "stationResolved", [gameId, s])) continue;
    const t = await stationTimes(addr, gameId, s);
    console.log(`\n--- Station ${s + 1}/${g.numStations} ---`);
    if ((await chainNow()) < t.commitEnd) {
      await waitUntilChain(t.commitStart, `commit st${s + 1}`);
      const c = await botsCommit(addr, gameId, s, bots, SECRET);
      console.log(`  bots committed: ${c}/${bots.length}`);
    }
    if ((await chainNow()) < t.revealEnd) {
      await waitUntilChain(t.commitEnd, `reveal st${s + 1}`);
      const r = await botsReveal(addr, gameId, s, bots, SECRET);
      console.log(`  bots revealed: ${r}/${bots.length}`);
    }
    await waitUntilChain(t.revealEnd, `resolve st${s + 1}`);
    await resolveStation(gmKey, addr, gameId, s);
    const [, inspected, , , outcomes] = (await readContract(addr, "getStationResult", [gameId, s])) as any[];
    const caught = (outcomes as number[]).filter((o) => o === 3).length;
    console.log(`  🎯 resolved — cars [${(inspected as number[]).join(",")}], ${caught} pincé(s)`);
  }

  // 5. Finish
  await waitUntilChain(g.gameEnd, "gameEnd");
  console.log(`\nFinishing game...`);
  await finishGame(gmKey, addr, gameId, SECRET, DENOM);
  await printResults(addr, gameId);
  console.log(`\n✅ Game ${gameId} complete.`);
}

main().catch((e) => {
  console.error("\n❌ KEEPER FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
