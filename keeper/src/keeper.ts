/**
 * V2 live keeper (laptop). Attaches to a game created in the app, fills it with bots (pay+join),
 * waits for the host to press Lancer, drives the bots' boarding each station, then settles the pot.
 *   GAME_ID=<id> N_BOTS=8 npm run keeper
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { publicClient, requireGmKey, gmAccount, CHAIN_ID, RPC_URL } from "./chain.js";
import { assignRoles, roleSaltFor, roleCommitsFor, Role } from "./game.js";
import { readContract, writeWithRetry, waitUntilChain, batchFromGM, mapLimit, sleep } from "./client.js";
import { simulate as simEliminations } from "./sim.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "../state");

const N_BOTS = Number(process.env.N_BOTS ?? 8);
const SECRET = process.env.MASTER_SECRET ?? "blitz-demo-secret";
const NAMES = ["Zizou","Kevin92","Malaury","Nadia","Poucave","Gérard","Momo","Clara","Babtou","Yasmina","Fraudinho","Turnstile","Sonia","Dédé","Amine","Fatou","Bébert","Wesh","Djamel","Enzo","Kylian","Ginette","Rocco","Naïma"];

type Bot = { key: Hex; address: Address; nick: string };

async function readGame(addr: Address, gameId: bigint) {
  const g = (await readContract(addr, "getGame", [gameId])) as any[];
  return {
    creator: g[0] as Address,
    numWagons: Number(g[1]),
    wagonCap: Number(g[2]),
    numControllers: Number(g[3]),
    numStations: Number(g[4]),
    boardDuration: Number(g[5]),
    startedAt: Number(g[6]),
    started: g[7] as boolean,
    settled: g[8] as boolean,
    playerCount: Number(g[9]),
    entryFee: g[10] as bigint,
    pot: g[11] as bigint,
    stationDuration: Number(g[12]),
    gameEnd: Number(g[13]),
  };
}

function spread(gameId: bigint, addr: Address, station: number, wagons: number) {
  let h = 0;
  const s = `${gameId}-${addr}-${station}`;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0;
  return h % wagons;
}

async function main() {
  const gmKey = requireGmKey();
  const gm = gmAccount();
  const addr = process.env.CONTRACT_ADDRESS as Address;
  const gameId = BigInt(process.env.GAME_ID ?? "0");
  if (!addr || !gameId) throw new Error("Set CONTRACT_ADDRESS and GAME_ID in env.");
  console.log(`🚇 KEEPER V2 — chain ${CHAIN_ID} @ ${RPC_URL}`);
  console.log(`GM ${gm.address} ${formatEther(await publicClient.getBalance({ address: gm.address }))} MON  game #${gameId}`);

  let g = await readGame(addr, gameId);

  // add bots (fund + pay-join) if not started yet
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const botsPath = join(STATE_DIR, `bots-${gameId}.json`);
  let bots: Bot[] = existsSync(botsPath) ? JSON.parse(readFileSync(botsPath, "utf8")) : [];
  if (!g.started && bots.length === 0 && N_BOTS > 0) {
    const cap = (await readContract(addr, "maxPlayers", [gameId])) as bigint;
    const slots = Math.max(0, Math.min(N_BOTS, Number(cap) - g.playerCount));
    bots = Array.from({ length: slots }, (_, i) => {
      const key = generatePrivateKey();
      return { key, address: privateKeyToAccount(key).address as Address, nick: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : "") };
    });
    console.log(`funding + joining ${bots.length} bots (fee ${formatEther(g.entryFee)} MON each)...`);
    await batchFromGM(gmKey, bots.map((b) => ({ to: b.address, value: g.entryFee + parseEther("0.01") })));
    await mapLimit(bots, 5, (b) => writeWithRetry(b.key, addr, "join", [gameId, b.nick], { value: g.entryFee, label: `join ${b.nick}` }));
    writeFileSync(botsPath, JSON.stringify(bots));
    console.log(`bots in. Waiting for host to press Lancer...`);
  }

  // wait for start
  while (!g.started) {
    await sleep(1500);
    g = await readGame(addr, gameId);
  }
  const players = (await readContract(addr, "getPlayers", [gameId])) as Address[];
  const roles = assignRoles(gameId, players, SECRET, g.numControllers);
  const keyByAddr = new Map(bots.map((b) => [b.address.toLowerCase(), b.key] as const));
  console.log(`▶️ started — ${players.length} joueurs, ${g.numControllers} contrôleurs. Driving ${bots.length} bots.`);

  // drive bots each station
  for (let s = 0; s < g.numStations; s++) {
    const [bStart] = (await readContract(addr, "stationWindow", [gameId, s])) as bigint[];
    await waitUntilChain(Number(bStart), `board st${s + 1}`);
    const prior = await fetchBoarding(addr, gameId, s, players);
    const alive = s === 0 ? players.map(() => true) : simEliminations(gameId, g.numWagons, s, players, roles as number[], prior).alive;
    const boarders = players.map((p, i) => ({ p, i })).filter(({ p, i }) => alive[i] && keyByAddr.has(p.toLowerCase()));
    await mapLimit(boarders, 5, ({ p }) =>
      writeWithRetry(keyByAddr.get(p.toLowerCase())!, addr, "board", [gameId, s, spread(gameId, p, s, g.numWagons)], { label: `board st${s}` })
    );
    console.log(`  station ${s + 1}: bots montés`);
  }

  // settle
  await waitUntilChain(g.gameEnd, "gameEnd");
  g = await readGame(addr, gameId);
  if (!g.settled) {
    const salts = players.map((p) => roleSaltFor(gameId, p, SECRET));
    console.log("règlement du pot...");
    await writeWithRetry(gmKey, addr, "settle", [gameId, roles, salts], { label: "settle" });
  }
  const survivors = (await readContract(addr, "getSurvivors", [gameId])) as Address[];
  console.log(`✅ terminé — ${survivors.length} survivant(s) se partagent ${formatEther(g.pot)} MON`);
}

async function fetchBoarding(addr: Address, gameId: bigint, upto: number, players: Address[]) {
  const out: { boarded: boolean; wagon: number }[][] = [];
  for (let s = 0; s < upto; s++) {
    const [, boarded, wagons] = (await readContract(addr, "getBoarding", [gameId, s])) as [Address[], boolean[], number[], number[]];
    out[s] = players.map((_, i) => ({ boarded: boarded[i], wagon: Number(wagons[i]) }));
  }
  return out;
}

main().catch((e) => {
  console.error("❌ KEEPER FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
