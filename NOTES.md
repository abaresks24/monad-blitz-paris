# NOTES — Fraude sur le RER B (Monad Blitz Paris)

## Monad Testnet — network facts (verified 2026-09-19)

| Field | Value |
|---|---|
| Chain ID | **10143** (0x279f) |
| Native currency | **MON** |
| Official RPC | `https://testnet-rpc.monad.xyz` |
| Fallback RPCs | `https://monad-testnet.drpc.org`, Alchemy (`https://monad-testnet.g.alchemy.com/v2/<key>`) |
| Explorer | https://testnet.monadexplorer.com  (also testnet.monadscan.com) |
| Block time | ~0.5–1 s (targets sub-second blocks, ~1 s finality) |
| EVM version | `cancun` (safe default for solc 0.8.28) |
| Faucet | blitz.devnads.com (Blitz event faucet) |

Sources: chainlist.org/chain/10143, docs.monad.xyz, Blitz event faucet.

## M0 — Risk check (latency / throughput)

Goal: confirm 20 bot txs per station can all be included well inside a 12 s commit window,
so 20 s stations are feasible with 20+ passengers.

Probe: `keeper/probe.ts` — deploys `Ping`, then blasts N txs (default 20) from the GM key
with **explicit parallel nonce management** (nonce n..n+N-1 sent concurrently), and measures:
- time-to-hash (submission accepted by RPC)
- time-to-mined (receipt) per tx
- wall-clock to get ALL receipts

Optionally spreads the load across K derived sender keys (`--senders K`) funded from the GM key,
which is the real keeper strategy to dodge single-account nonce serialization.

### Decisions taken (per "pick simplest, note it" rule)
- Single funded GM key is enough for the probe; extra sender keys are derived + funded on demand.
- If ALL 20 receipts land in < ~6 s, a 12 s commit window is comfortable → proceed.
- If not, fallbacks in order: (a) more sender keys, (b) longer commit window (config), (c) fewer bots.

### RESULT
> _Pending: requires a funded GM private key in `.env` (MON from blitz.devnads.com).
> Run `cd keeper && npm i && npm run probe`. Result will be pasted here._

## Design decisions log
- `roleCommit = keccak256(abi.encode(player, role, roleSalt, gameId))`.
- Per-station commit `h = keccak256(abi.encode(car, action, salt, player, stationIndex))`.
- Players capped at 64 (no unbounded loops in user-facing fns).
- Non-revealers treated as fraudsters in a pseudo-random car (derived from blockhash + player).
- Points are in-game only (start 100), never real money — not gambling.
