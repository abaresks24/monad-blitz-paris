import { encodeAbiParameters, keccak256, type Hex, type Address } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FraudeRERB_ABI = JSON.parse(
  readFileSync(join(__dirname, "../../shared/FraudeRERB.abi.json"), "utf8")
) as any[];

export function loadBytecode(): Hex {
  const j = JSON.parse(
    readFileSync(join(__dirname, "../../contracts/out/FraudeRERB.sol/FraudeRERB.json"), "utf8")
  );
  return j.bytecode.object as Hex;
}

// Enums (must match FraudeRERB.sol)
export const Role = { NONE: 0, PASSAGER: 1, CONTROLEUR: 2 } as const;
export const Action = { NONE: 0, PAY: 1, FRAUD: 2, INSPECT: 3 } as const;
export const Outcome = { NONE: 0, PAID: 1, FRAUD_SAFE: 2, CAUGHT: 3, INSPECT_HIDDEN: 4 } as const;

export type RoleV = (typeof Role)[keyof typeof Role];
export type ActionV = (typeof Action)[keyof typeof Action];

export const CARS = 4;

/** roleCommit = keccak256(abi.encode(player, role, roleSalt, gameId)) */
export function roleCommit(player: Address, role: number, roleSalt: Hex, gameId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint256" }],
      [player, role, roleSalt, gameId]
    )
  );
}

/** commit hash = keccak256(abi.encode(car, action, salt, player, stationIndex)) */
export function commitHash(
  car: number,
  action: number,
  salt: Hex,
  player: Address,
  station: number
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint8" }, { type: "uint8" }, { type: "bytes32" }, { type: "address" }, { type: "uint8" }],
      [car, action, salt, player, station]
    )
  );
}

export function randomSalt(seed: string): Hex {
  // deterministic-ish salt without Math.random / Date.now
  return keccak256(new TextEncoder().encode(seed)) as Hex;
}

/**
 * Deterministic role assignment from a shared MASTER_SECRET.
 * Both the Vercel backend (/api/join) and the laptop keeper compute these identically,
 * so no shared database is needed — roles can be assigned at join time and fully
 * reconstructed at finishGame from just (gameId, playerAddress, secret).
 */
export function roleSaltFor(gameId: bigint, player: Address, secret: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "string" }],
      ["RERB_ROLE_SALT", gameId, player, secret]
    )
  );
}

export function roleFor(gameId: bigint, player: Address, secret: string, denom = 8): RoleV {
  const h = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "string" }],
      ["RERB_ROLE", gameId, player, secret]
    )
  );
  return BigInt(h) % BigInt(denom) === 0n ? Role.CONTROLEUR : Role.PASSAGER;
}

/** roleCommit for a player using the deterministic scheme. */
export function roleCommitFor(gameId: bigint, player: Address, secret: string, denom = 8): Hex {
  return roleCommit(player, roleFor(gameId, player, secret, denom), roleSaltFor(gameId, player, secret), gameId);
}
