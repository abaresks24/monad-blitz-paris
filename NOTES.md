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

### RESULT — measured on real Monad Testnet (2026-09-19)
Contract deployed live: **`0x49b178282ad9e83cc117e0412a5f0ad062f2198a`** (GM `0x2a9d…c7Aa`).
- **The chain is fast** — `Ping` deploy mined in ~570 ms; individual txs confirm in ~1 block.
- **The bottleneck is the public RPC, not Monad.** Blasting 20 parallel `sendRawTransaction`
  from ONE sender to `testnet-rpc.monad.xyz` → **HTTP 429 (rate limit)**. Human phones are on
  separate IPs so they're unaffected; the risk is the **keeper's 20 bots from one IP**.
- **Fix applied & verified:** (1) bounded tx concurrency (`BOT_TX_CONCURRENCY`, default 5),
  (2) retry with harder back-off on 429, (3) a **fallback RPC pool** (`testnet-rpc.monad.xyz`,
  `10143.rpc.thirdweb.com`, `rpc.ankr.com/monad_testnet`) so 429s fail over automatically.
- **Proof:** after the fix, a full **20-bot × 3-station** game ran to completion on Monad Testnet
  — every station committed/revealed/resolved, correct fines & splits, roles revealed. Point
  spread 280→40.

**Verdict: 20 s stations with 20+ players are feasible on Monad.** For the live demo, add a
dedicated RPC (Alchemy Monad) via `MONAD_RPC_URLS` for extra headroom; the pool + cached
`/api/state` already keep the public endpoints within limits.

**Proxy evidence (local anvil, 1 s blocks — mimics Monad's ~1 s cadence):** two full games ran
clean end-to-end — **20 bots × 4 stations, 20/20 commit and 20/20 reveal every station**, plus a
mixed human+bot live game through the real app. All commits/reveals landed inside the windows once
phase transitions were gated on the **chain clock** (not the local wall-clock — see below). Since
Monad targets sub-second blocks (faster than anvil here), a 12 s commit / 5 s reveal window has
comfortable headroom for 20+ passengers. **Verdict: 20 s stations are feasible; proceed.**
Recommended: use an Alchemy Monad RPC for the demo to lift the 25 rps public-RPC limit when ~30
phones + the screen are polling.

### Gotcha found & fixed (important)
Phase transitions MUST be gated on the **chain's latest block timestamp**, not `Date.now()`.
Under drift (anvil `--block-time`, or a busy RPC) the local clock runs ahead of block time, causing
`resolveStation`→`RevealWindowNotOver` and late reveals→`NotInRevealWindow`. `keeper/src/client.ts:waitUntilChain`
polls block time and both the keeper and simulate use it. The web clients measure server/chain skew
in `useGame` and count down against that.

## M5 — Rehearsal
- 4 stations × (12s commit + 5s reveal + 3s buffer) = **80 s of game** + ~a few s setup → fits the
  "~90 s for 4 stations" target. Solo mode = keeper bots only.
- Verified: `/api/admin` create, signed `/api/join` (fund+register), `/api/state` polling (dots +
  results), keeper bot driving, `resolveStation`, `finishGame` with a **human role reconstructed
  from the shared secret** (no BadRoleProof) → roles revealed correctly.

## Design decisions log
- `roleCommit = keccak256(abi.encode(player, role, roleSalt, gameId))`.
- Per-station commit `h = keccak256(abi.encode(car, action, salt, player, stationIndex))`.
- Players capped at 64 (no unbounded loops in user-facing fns).
- Non-revealers treated as fraudsters in a pseudo-random car (derived from blockhash + player).
- Points are in-game only (start 100), never real money — not gambling.
