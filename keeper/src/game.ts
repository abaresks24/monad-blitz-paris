import { encodeAbiParameters, keccak256, type Hex, type Address } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const RERB_ABI = JSON.parse(
  readFileSync(join(__dirname, "../../shared/RERBSurvival.abi.json"), "utf8")
) as any[];

export function loadBytecode(): Hex {
  const j = JSON.parse(
    readFileSync(join(__dirname, "../../contracts/out/RERBSurvival.sol/RERBSurvival.json"), "utf8")
  );
  return j.bytecode.object as Hex;
}

export const Role = { NONE: 0, FRAUDEUR: 1, CONTROLEUR: 2 } as const;
export type RoleV = (typeof Role)[keyof typeof Role];

/** roleCommit = keccak256(abi.encode(player, role, salt, gameId)) — matches the contract. */
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

/**
 * Assign EXACTLY `numControllers` controllers among the players, deterministically:
 * rank players by a secret hash and take the lowest N. Fully reconstructible at settle
 * from the on-chain roster + secret — no storage needed.
 * Returns roles in the SAME ORDER as `players`.
 */
export function assignRoles(gameId: bigint, players: Address[], secret: string, numControllers: number): RoleV[] {
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
