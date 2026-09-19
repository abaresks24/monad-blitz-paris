import { encodeAbiParameters, keccak256, type Address } from "viem";
import { Role } from "./game";

export type BoardRec = { boarded: boolean; wagon: number };

export function randomWagon(gameId: bigint, station: number, player: Address, numWagons: number): number {
  const h = BigInt(
    keccak256(
      encodeAbiParameters([{ type: "uint256" }, { type: "uint8" }, { type: "address" }], [gameId, station, player])
    )
  );
  return Number(h % BigInt(numWagons));
}

export type SimResult = {
  alive: boolean[];
  eliminatedAtStation: number[];
  stations: { wagonOf: number[]; controllerWagons: number[]; caught: number[]; idleOut: number[] }[];
};

/** Deterministic elimination sim, identical to RERBSurvival.settle(). Drives the live reveal. */
export function simulate(
  gameId: bigint,
  numWagons: number,
  numStations: number,
  players: Address[],
  roles: number[],
  boarding: BoardRec[][]
): SimResult {
  const n = players.length;
  const alive = new Array(n).fill(true);
  const eliminatedAtStation = new Array(n).fill(-1);
  const strikes = new Array(n).fill(0);
  const stations: SimResult["stations"] = [];

  for (let s = 0; s < numStations; s++) {
    const wagonOf = new Array(n).fill(-1);
    const ctrlIn = new Array(numWagons).fill(0);
    const fraudIn = new Array(numWagons).fill(0);

    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const rec = boarding[s]?.[i];
      const w = rec?.boarded ? rec.wagon : randomWagon(gameId, s, players[i], numWagons);
      wagonOf[i] = w;
      if (roles[i] === Role.CONTROLEUR) ctrlIn[w]++;
      else fraudIn[w]++;
    }
    const caught: number[] = [];
    const idleOut: number[] = [];
    for (let i = 0; i < n; i++) {
      if (alive[i] && roles[i] !== Role.CONTROLEUR && ctrlIn[wagonOf[i]] > 0) {
        alive[i] = false;
        eliminatedAtStation[i] = s;
        caught.push(i);
      }
    }
    for (let i = 0; i < n; i++) {
      if (alive[i] && roles[i] === Role.CONTROLEUR) {
        if (fraudIn[wagonOf[i]] === 0) {
          strikes[i]++;
          if (strikes[i] >= 2) {
            alive[i] = false;
            eliminatedAtStation[i] = s;
            idleOut.push(i);
          }
        } else strikes[i] = 0;
      }
    }
    const controllerWagons: number[] = [];
    for (let w = 0; w < numWagons; w++) if (ctrlIn[w] > 0) controllerWagons.push(w);
    stations.push({ wagonOf, controllerWagons, caught, idleOut });
  }
  return { alive, eliminatedAtStation, stations };
}
