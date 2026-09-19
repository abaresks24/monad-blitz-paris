import { encodeAbiParameters, keccak256, type Hex, type Address } from "viem";

export const Role = { NONE: 0, PASSAGER: 1, CONTROLEUR: 2 } as const;
export const Action = { NONE: 0, PAY: 1, FRAUD: 2, INSPECT: 3 } as const;
export const Outcome = { NONE: 0, PAID: 1, FRAUD_SAFE: 2, CAUGHT: 3, INSPECT_HIDDEN: 4 } as const;
export const CARS = 4;
export const ZERO32: Hex = ("0x" + "0".repeat(64)) as Hex;

export function roleCommit(player: Address, role: number, roleSalt: Hex, gameId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" }],
      [player, role, roleSalt, gameId]
    )
  );
}

export function commitHash(car: number, action: number, salt: Hex, player: Address, station: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint8" }, { type: "uint8" }, { type: "bytes32" }, { type: "address" }, { type: "uint8" }],
      [car, action, salt, player, station]
    )
  );
}

export function roleSaltFor(gameId: bigint, player: Address, secret: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "string" }],
      ["RERB_ROLE_SALT", gameId, player, secret]
    )
  );
}

export function roleFor(gameId: bigint, player: Address, secret: string, denom = 8): number {
  const h = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "string" }],
      ["RERB_ROLE", gameId, player, secret]
    )
  );
  return BigInt(h) % BigInt(denom) === 0n ? Role.CONTROLEUR : Role.PASSAGER;
}

export function roleCommitFor(gameId: bigint, player: Address, secret: string, denom = 8): Hex {
  return roleCommit(player, roleFor(gameId, player, secret, denom), roleSaltFor(gameId, player, secret), gameId);
}

/** Per-choice salt, stored on the phone so commit/reveal always match. */
export function choiceSalt(gameId: bigint, player: Address, station: number, secret: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "string" }],
      ["RERB_CHOICE_SALT", gameId, player, station, secret]
    )
  );
}

export const STATION_NAMES = [
  "Robinson",
  "Denfert-Rochereau",
  "Châtelet-Les Halles",
  "Gare du Nord",
  "Aulnay-sous-Bois",
  "Aéroport CDG 2",
];

/** Map a game with N stations onto the canonical line (first = Robinson, last = CDG). */
export function stationLabels(numStations: number): string[] {
  if (numStations >= STATION_NAMES.length) return STATION_NAMES.slice(0, numStations);
  const out = [STATION_NAMES[0]];
  const middle = STATION_NAMES.slice(1, -1);
  const need = numStations - 2;
  for (let i = 0; i < need; i++) out.push(middle[Math.floor((i * middle.length) / Math.max(1, need))]);
  out.push(STATION_NAMES[STATION_NAMES.length - 1]);
  return out.slice(0, numStations);
}
