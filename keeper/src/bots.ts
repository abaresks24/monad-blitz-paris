import { keccak256, encodeAbiParameters, type Address, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  Role,
  Action,
  CARS,
  roleFor,
  roleSaltFor,
  type RoleV,
  type ActionV,
} from "./game.js";

export type Bot = {
  key: Hex;
  address: Address;
  nickname: string;
  role: RoleV;
};

const BOT_NAMES = [
  "Ticket'Pas", "Zizou", "Kevin92", "Malaury", "Jean-Mich", "BadgeUse", "Poucave", "Rémi",
  "Nadia", "Le Fantôme", "SansContact", "Gérard", "TchouTchou", "Momo", "Clara", "Fraudinho",
  "Babtou", "Yasmina", "PèrePeinard", "Turnstile", "Sonia", "Dédé", "Cunégonde", "Brandon",
  "Salomé", "Rocco", "Amine", "Fatou", "Bébert", "Ludivine", "Wesh", "Capucine", "Djamel",
  "Océane", "Thibault", "Naïma", "Enzo", "Prudence", "Kylian", "Ginette",
];

/** Deterministic per-choice salt so commit/reveal always match, even across restarts. */
export function choiceSalt(gameId: bigint, player: Address, station: number, secret: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "string" }],
      ["RERB_CHOICE_SALT", gameId, player, station, secret]
    )
  );
}

function seededInt(...parts: (string | number | bigint)[]): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        parts.map(() => ({ type: "string" as const })),
        parts.map((p) => String(p))
      )
    )
  );
}

/** A bot's plausible, deterministic decision for a station. */
export function botDecision(
  gameId: bigint,
  bot: Bot,
  station: number
): { car: number; action: ActionV } {
  const carSeed = seededInt("car", gameId, bot.address, station);
  const car = Number(carSeed % BigInt(CARS));
  if (bot.role === Role.CONTROLEUR) {
    // controllers spread inspections across cars; occasionally chase the "busy" cars 0/1
    return { car, action: Action.INSPECT };
  }
  // passengers fraud ~58% of the time (fraud is the fun), otherwise pay
  const roll = Number(seededInt("act", gameId, bot.address, station) % 100n);
  return { car, action: roll < 58 ? Action.FRAUD : Action.PAY };
}

/**
 * Generate N bots. Grinds keys so the controller count is exactly `targetControllers`
 * (min 2), while keeping every role reconstructible from the deterministic scheme.
 */
export function makeBots(
  gameId: bigint,
  n: number,
  secret: string,
  denom: number,
  usedNames: Set<string> = new Set()
): Bot[] {
  const targetControllers = Math.max(2, Math.round(n / 8));
  const controllers: Bot[] = [];
  const passengers: Bot[] = [];
  let nameIdx = 0;

  const nextName = () => {
    let name = BOT_NAMES[nameIdx % BOT_NAMES.length] + (nameIdx >= BOT_NAMES.length ? `#${nameIdx}` : "");
    nameIdx++;
    while (usedNames.has(name)) name = name + "•";
    usedNames.add(name);
    return name;
  };

  // grind until we have enough of each bucket
  let guard = 0;
  while ((controllers.length < targetControllers || passengers.length < n - targetControllers) && guard < 100000) {
    guard++;
    const key = generatePrivateKey();
    const address = privateKeyToAccount(key).address;
    const role = roleFor(gameId, address, secret, denom);
    if (role === Role.CONTROLEUR && controllers.length < targetControllers) {
      controllers.push({ key, address, nickname: "", role });
    } else if (role === Role.PASSAGER && passengers.length < n - targetControllers) {
      passengers.push({ key, address, nickname: "", role });
    }
  }

  const bots = [...controllers, ...passengers];
  // shuffle deterministically by address so controllers aren't the first registered
  bots.sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  for (const b of bots) b.nickname = nextName();
  return bots;
}

export { roleSaltFor };
