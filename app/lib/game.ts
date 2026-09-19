import { encodeAbiParameters, keccak256, type Hex, type Address } from "viem";

export const Role = { NONE: 0, FRAUDEUR: 1, CONTROLEUR: 2 } as const;

export function roleCommit(player: Address, role: number, roleSalt: Hex, gameId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" }],
      [player, role, roleSalt, gameId]
    )
  );
}

export function roleSaltFor(gameId: bigint, player: Address, secret: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "string" }],
      ["RERB2_SALT", gameId, player, secret]
    )
  );
}

function rankHash(gameId: bigint, player: Address, secret: string): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "string" }],
        ["RERB2_RANK", gameId, player, secret]
      )
    )
  );
}

/** Exactly N controllers, lowest-ranked by secret hash. Same order as `players`. */
export function assignRoles(gameId: bigint, players: Address[], secret: string, numControllers: number): number[] {
  const ranked = players
    .map((p) => ({ p, h: rankHash(gameId, p, secret) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const ctrl = new Set(ranked.slice(0, numControllers).map((r) => r.p.toLowerCase()));
  return players.map((p) => (ctrl.has(p.toLowerCase()) ? Role.CONTROLEUR : Role.FRAUDEUR));
}

export function roleCommitsFor(gameId: bigint, players: Address[], secret: string, numControllers: number): Hex[] {
  const roles = assignRoles(gameId, players, secret, numControllers);
  return players.map((p, i) => roleCommit(p, roles[i], roleSaltFor(gameId, p, secret), gameId));
}

// Real station names on the line, from Robinson to CDG.
export const STATION_NAMES = [
  "Robinson",
  "Bourg-la-Reine",
  "Denfert-Rochereau",
  "Saint-Michel",
  "Châtelet-Les Halles",
  "Gare du Nord",
  "La Plaine",
  "Le Bourget",
  "Aulnay-sous-Bois",
  "Aéroport CDG 2",
];

export function stationLabels(numStations: number): string[] {
  if (numStations <= 1) return ["Aéroport CDG 2"];
  const out = [STATION_NAMES[0]];
  const middle = STATION_NAMES.slice(1, -1);
  const need = numStations - 2;
  for (let i = 0; i < need; i++) out.push(middle[Math.floor((i * middle.length) / Math.max(1, need))]);
  out.push(STATION_NAMES[STATION_NAMES.length - 1]);
  return out.slice(0, numStations);
}
