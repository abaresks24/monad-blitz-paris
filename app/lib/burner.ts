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

export function getNick(): string {
  return (typeof window !== "undefined" ? localStorage.getItem(NICK) : "") ?? "";
}
export function saveNick(n: string) {
  localStorage.setItem(NICK, n);
}

export function markJoined(gameId: string) {
  localStorage.setItem(`rerb_joined_${gameId}`, "1");
}
export function hasJoined(gameId: string): boolean {
  return typeof window !== "undefined" && localStorage.getItem(`rerb_joined_${gameId}`) === "1";
}

export function saveHostToken(gameId: string, token: string) {
  localStorage.setItem(`rerb_host_${gameId}`, token);
}
export function getHostToken(gameId: string): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(`rerb_host_${gameId}`) : null;
}

export function saveJoinTx(gameId: string, hash: string) {
  localStorage.setItem(`rerb_jointx_${gameId}`, hash);
}
export function getJoinTx(gameId: string): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(`rerb_jointx_${gameId}`) : null;
}

// cached role for this game (fetched from /api/myrole after start)
export function saveRole(gameId: string, role: number, controllers?: string[]) {
  localStorage.setItem(`rerb_role_${gameId}`, JSON.stringify({ role, controllers: controllers ?? [] }));
}
export function getRole(gameId: string): { role: number; controllers: string[] } | null {
  const r = typeof window !== "undefined" ? localStorage.getItem(`rerb_role_${gameId}`) : null;
  return r ? JSON.parse(r) : null;
}
