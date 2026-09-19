/**
 * V2 end-to-end simulation of a survival game (deploy → bots pay & join → board → settle → payout).
 *   anvil --block-time 1 &
 *   MONAD_RPC_URL=http://127.0.0.1:8545 MONAD_CHAIN_ID=31337 PRIVATE_KEY=<anvil key0> npm run simulate -- --wagons 4 --stations 4 --n 12
 */
import { formatEther, parseEther, encodeFunctionData, type Hex, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { publicClient, walletFor, requireGmKey, gmAccount, CHAIN_ID, RPC_URL } from "./chain.js";
import { RERB_ABI, loadBytecode, assignRoles, roleSaltFor, roleCommitsFor, Role } from "./game.js";
import { readContract, writeWithRetry, waitUntilChain, batchFromGM, mapLimit } from "./client.js";
import { simulate as simEliminations } from "./sim.js";

function arg(name: string, def: number) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const WAGONS = arg("wagons", 4);
const CAP = arg("cap", 5);
const CONTROLLERS = arg("controllers", 2);
const STATIONS = arg("stations", 4);
const BOARD_DUR = arg("board", 12);
const N = Math.min(arg("n", WAGONS * 3), WAGONS * 3);
const FEE = parseEther(String(process.env.ENTRY_FEE ?? "0.001"));
const SECRET = process.env.MASTER_SECRET ?? "blitz-demo-secret";

const NAMES = ["Zizou","Kevin92","Malaury","Nadia","Poucave","Gérard","Momo","Clara","Babtou","Yasmina","Fraudinho","Turnstile","Sonia","Dédé","Amine","Fatou","Bébert","Wesh","Djamel","Enzo","Kylian","Ginette","Rocco","Naïma"];

function seededWagon(gameId: bigint, addr: Address, station: number): number {
  let h = 0;
  const s = `${gameId}-${addr}-${station}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % WAGONS;
}

async function main() {
  console.log(`\n🚇 RER B — SURVIE (sim) — ${N} bots, ${WAGONS} wagons, ${CONTROLLERS} contrôleurs, ${STATIONS} stations`);
  console.log(`RPC ${RPC_URL} (chain ${CHAIN_ID})`);
  const gmKey = requireGmKey();
  const gm = gmAccount();
  const wallet = walletFor(gmKey);
  console.log(`GM ${gm.address}  ${formatEther(await publicClient.getBalance({ address: gm.address }))} MON`);

  // deploy
  const dh = await wallet.deployContract({ abi: RERB_ABI, bytecode: loadBytecode(), args: [] });
  const drc = await publicClient.waitForTransactionReceipt({ hash: dh });
  const addr = drc.contractAddress!;
  console.log(`RERBSurvival @ ${addr}`);

  // create game
  await writeWithRetry(gmKey, addr, "createGame", [WAGONS, CAP, CONTROLLERS, STATIONS, BOARD_DUR, FEE]);
  const gameId = (await readContract(addr, "gameCount", [])) as bigint;
  console.log(`game #${gameId}, mise ${formatEther(FEE)} MON`);

  // bots: fund then join (each pays the fee)
  const bots = Array.from({ length: N }, (_, i) => {
    const key = generatePrivateKey();
    return { key, address: privateKeyToAccount(key).address as Address, nick: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : "") };
  });
  console.log(`funding ${N} bots...`);
  await batchFromGM(gmKey, bots.map((b) => ({ to: b.address, value: FEE + parseEther("0.15") })));
  console.log(`bots joining (paying ${formatEther(FEE)} each)...`);
  await mapLimit(bots, 5, (b) => writeWithRetry(b.key, addr, "join", [gameId, b.nick], { value: FEE, label: `join ${b.nick}` }));

  const players = (await readContract(addr, "getPlayers", [gameId])) as Address[];
  console.log(`${players.length} joueurs à bord, pot = ${formatEther(FEE * BigInt(players.length))} MON`);

  // start with rank-based roles
  const commits = roleCommitsFor(gameId, players, SECRET, CONTROLLERS);
  await writeWithRetry(gmKey, addr, "startGame", [gameId, commits]);
  const roles = assignRoles(gameId, players, SECRET, CONTROLLERS);
  console.log(`démarré. contrôleurs: ${players.filter((_, i) => roles[i] === Role.CONTROLEUR).length}`);

  // play stations
  const boardKeyByAddr = new Map(bots.map((b) => [b.address.toLowerCase(), b.key] as const));
  for (let s = 0; s < STATIONS; s++) {
    const [bStart] = (await readContract(addr, "stationWindow", [gameId, s])) as bigint[];
    await waitUntilChain(Number(bStart), `board st${s + 1}`);
    // who's still alive going into station s? run the sim over the prior stations only
    const prior = await fetchBoarding(addr, gameId, s, players);
    const alive = s === 0 ? players.map(() => true) : simEliminations(gameId, WAGONS, s, players, roles as number[], prior).alive;
    const boarders = players.map((p, i) => ({ p, i })).filter(({ i }) => alive[i]);
    const c = await mapLimit(boarders, 5, ({ p }) => {
      const key = boardKeyByAddr.get(p.toLowerCase());
      if (!key) return Promise.resolve(null);
      return writeWithRetry(key, addr, "board", [gameId, s, seededWagon(gameId, p, s)], { label: `board st${s}` });
    });
    console.log(`  station ${s + 1}: ${c.filter(Boolean).length} montées`);
  }

  // settle
  const [, , , , , , , , , , , , , gameEnd] = (await readContract(addr, "getGame", [gameId])) as any[];
  await waitUntilChain(Number(gameEnd), "gameEnd");
  const salts = players.map((p) => roleSaltFor(gameId, p, SECRET));
  console.log(`\nrèglement...`);
  await writeWithRetry(gmKey, addr, "settle", [gameId, roles, salts]);

  const survivors = (await readContract(addr, "getSurvivors", [gameId])) as Address[];
  const share = (await readContract(addr, "payoutPerSurvivor", [gameId])) as bigint;
  const nick = (a: Address) => bots.find((b) => b.address.toLowerCase() === a.toLowerCase())?.nick ?? a.slice(0, 6);
  console.log(`\n===== TERMINUS CDG =====`);
  console.log(`survivants: ${survivors.length}/${players.length}  •  part: ${formatEther(share)} MON chacun`);
  survivors.forEach((a) => {
    const i = players.findIndex((p) => p.toLowerCase() === a.toLowerCase());
    console.log(`  🏆 ${nick(a)} ${roles[i] === Role.CONTROLEUR ? "🎩" : ""}`);
  });
  console.log(`\n✅ SIM OK — contract ${addr}, game ${gameId}`);
}

/** Fetch boarding records for stations [0, uptoExclusive) as boarding[station][playerIndex]. */
async function fetchBoarding(addr: Address, gameId: bigint, uptoExclusive: number, players: Address[]) {
  const out: { boarded: boolean; wagon: number }[][] = [];
  for (let s = 0; s < uptoExclusive; s++) {
    const [, boarded, wagons] = (await readContract(addr, "getBoarding", [gameId, s])) as [Address[], boolean[], number[], number[]];
    out[s] = players.map((_, i) => ({ boarded: boarded[i], wagon: Number(wagons[i]) }));
  }
  return out;
}

main().catch((e) => {
  console.error("\n❌ SIM FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
