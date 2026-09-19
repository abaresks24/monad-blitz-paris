import { encodeFunctionData, parseEther, formatEther, type Address, type Hex } from "viem";
import { publicClient } from "./chain.js";
import { FraudeRERB_ABI, roleCommitFor, roleFor, roleSaltFor, Role, commitHash } from "./game.js";
import { batchFromGM, writeWithRetry, readContract, waitUntil, sleep, mapLimit } from "./client.js";
import { botDecision, choiceSalt, type Bot } from "./bots.js";

// bounded concurrency so the keeper's bots (all one IP) don't 429 the public RPC
const BOT_TX_CONCURRENCY = Number(process.env.BOT_TX_CONCURRENCY ?? 5);

export type GameTimes = { commitStart: number; commitEnd: number; revealEnd: number };

export async function stationTimes(addr: Address, gameId: bigint, station: number): Promise<GameTimes> {
  const [cStart, cEnd, rEnd] = (await readContract(addr, "stationTimes", [gameId, station])) as bigint[];
  return { commitStart: Number(cStart), commitEnd: Number(cEnd), revealEnd: Number(rEnd) };
}

export async function readGame(addr: Address, gameId: bigint) {
  const g = (await readContract(addr, "getGame", [gameId])) as any[];
  return {
    gm: g[0] as Address,
    numStations: Number(g[1]),
    commitDuration: Number(g[2]),
    revealDuration: Number(g[3]),
    startedAt: Number(g[4]),
    finished: g[5] as boolean,
    playerCount: Number(g[6]),
    stationDuration: Number(g[7]),
    gameEnd: Number(g[8]),
  };
}

/** GM funds each bot (for gas) and registers it with its deterministic role commitment. */
export async function fundAndRegisterBots(
  gmKey: Hex,
  addr: Address,
  gameId: bigint,
  bots: Bot[],
  secret: string,
  denom: number,
  fundMon: string
) {
  console.log(`  funding ${bots.length} bots with ${fundMon} MON each...`);
  await batchFromGM(
    gmKey,
    bots.map((b) => ({ to: b.address, value: parseEther(fundMon) }))
  );
  console.log(`  registering ${bots.length} bots...`);
  await batchFromGM(
    gmKey,
    bots.map((b) => ({
      to: addr,
      data: encodeFunctionData({
        abi: FraudeRERB_ABI,
        functionName: "registerPlayer",
        args: [gameId, b.address, b.nickname, roleCommitFor(gameId, b.address, secret, denom)],
      }),
    }))
  );
}

/** All bots commit their choice for a station (bounded concurrency, each from its own account). */
export async function botsCommit(addr: Address, gameId: bigint, station: number, bots: Bot[], secret: string) {
  const results = await mapLimit(bots, BOT_TX_CONCURRENCY, (b) => {
    const { car, action } = botDecision(gameId, b, station);
    const salt = choiceSalt(gameId, b.address, station, secret);
    return writeWithRetry(b.key, addr, "commit", [gameId, station, commitHash(car, action, salt, b.address, station)], {
      label: `commit ${b.nickname}`,
    });
  });
  return results.filter(Boolean).length;
}

/** All bots reveal for a station (bounded concurrency). */
export async function botsReveal(addr: Address, gameId: bigint, station: number, bots: Bot[], secret: string) {
  const results = await mapLimit(bots, BOT_TX_CONCURRENCY, (b) => {
    const { car, action } = botDecision(gameId, b, station);
    const salt = choiceSalt(gameId, b.address, station, secret);
    const roleSalt = b.role === Role.CONTROLEUR ? roleSaltFor(gameId, b.address, secret) : (("0x" + "0".repeat(64)) as Hex);
    return writeWithRetry(b.key, addr, "reveal", [gameId, station, car, action, salt, roleSalt], {
      label: `reveal ${b.nickname}`,
    });
  });
  return results.filter(Boolean).length;
}

export async function resolveStation(gmKey: Hex, addr: Address, gameId: bigint, station: number) {
  return writeWithRetry(gmKey, addr, "resolveStation", [gameId, station], { label: `resolve st${station}` });
}

/**
 * Finish the game: reconstruct EVERY player's role + salt deterministically from the
 * on-chain roster and the shared secret, then submit finishGame.
 */
export async function finishGame(
  gmKey: Hex,
  addr: Address,
  gameId: bigint,
  secret: string,
  denom: number
) {
  const players = (await readContract(addr, "getPlayers", [gameId])) as Address[];
  const roles = players.map((p) => roleFor(gameId, p, secret, denom));
  const salts = players.map((p) => roleSaltFor(gameId, p, secret));
  return writeWithRetry(gmKey, addr, "finishGame", [gameId, players, roles, salts], { label: "finishGame" });
}

/** Pretty leaderboard + awards, read straight from chain. */
export async function printResults(addr: Address, gameId: bigint) {
  const [addrs, nicks, pts, roles] = (await readContract(addr, "getBoard", [gameId])) as [
    Address[],
    string[],
    bigint[],
    number[],
  ];
  const rows = addrs.map((a, i) => ({
    addr: a,
    nick: nicks[i],
    pts: Number(pts[i]),
    role: Number(roles[i]),
  }));
  rows.sort((a, b) => b.pts - a.pts);
  console.log("\n===== LEADERBOARD (Aéroport CDG) =====");
  rows.forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    const tag = r.role === Role.CONTROLEUR ? "🎩 CONTRÔLEUR" : "🚇 passager";
    console.log(`${medal} ${String(r.pts).padStart(4)} pts  ${r.nick.padEnd(16)} ${tag}`);
  });
  return rows;
}
