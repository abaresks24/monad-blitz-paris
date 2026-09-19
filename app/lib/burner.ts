"use client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex, Address } from "viem";

const KEY = "rerb_burner_pk";
const NICK = "rerb_nick";

export function getBurner(): { pk: Hex; address: Address } {
  let pk = (typeof window !== "undefined" ? localStorage.getItem(KEY) : null) as Hex | null;
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(KEY, pk);
  }
  return { pk, address: privateKeyToAccount(pk).address };
}

export function resetBurner() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(NICK);
  // also drop any per-game join records
  Object.keys(localStorage)
    .filter((k) => k.startsWith("rerb_join_"))
    .forEach((k) => localStorage.removeItem(k));
}

export function saveNick(n: string) {
  localStorage.setItem(NICK, n);
}
export function getNick(): string {
  return (typeof window !== "undefined" ? localStorage.getItem(NICK) : "") ?? "";
}

/** Persist the private role info returned by /api/join, tied to this game. */
export type JoinInfo = { gameId: string; role: number; roleSalt: Hex; nickname: string };

export function saveJoin(info: JoinInfo) {
  localStorage.setItem(`rerb_join_${info.gameId}`, JSON.stringify(info));
}
export function getJoin(gameId: string): JoinInfo | null {
  const raw = typeof window !== "undefined" ? localStorage.getItem(`rerb_join_${gameId}`) : null;
  return raw ? (JSON.parse(raw) as JoinInfo) : null;
}
