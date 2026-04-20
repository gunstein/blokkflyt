# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

Full end-to-end flow with rich visualization:
**Bitcoin Core → ZMQ → FastAPI → WebSocket → PixiJS canvas in browser**

### Server (`server/main.py`)
- ZMQ listeners for `hashtx` and `hashblock` — reconnect automatically on crash
- Per transaction: fetches `fee_rate`, `vsize`, `amount_btc` via RPC (`getmempoolentry` + `getrawtransaction`)
- Per block: fetches `confirmed_txids`, `ntx`, `size_kb`, `time`, `height` via RPC (`getblock` verbosity 2)
- Only confirmed txids are removed from mempool on block
- Background task `sample_stats()` runs every 30s and immediately on startup:
  - Fetches chain info, mempool info, network info via RPC
  - Computes mempool activity status from rolling window of 20 samples (~10 min)
  - Caches result in `cached_stats` and broadcasts `stats_update` to all WS clients
- Block arrival triggers immediate `_refresh_stats()` so HUD updates without delay
- REST `GET /snapshot` — initial mempool state for connecting clients
- REST `GET /stats` — returns `cached_stats` for initial page load only
- WebSocket `/ws` broadcasts: `tx_seen`, `block_seen`, `stats_update`, `news_update`
- Background task `sample_news()` fetches Bitcoin Magazine RSS every 15 min via `httpx`:
  - Caches last 5 headlines
  - Broadcasts `news_update` to all clients when headlines change
  - Sends cached headlines to new clients immediately on connect
- All data is in-memory (appropriate — mempool is ephemeral and bounded by Bitcoin Core)

### Client (`client/src/main.ts` + `client/src/utils.ts`)
- Pure functions (visual encoding, time formatting) extracted to `utils.ts`
- Transaction nodes rendered as circles:
  - **Color** = state: purple=new, blue=mempool, orange=high fee (≥10 sat/vB), yellow=selected
  - **High fee nodes** get a blue stroke to show they are also in mempool
  - **Size** = BTC amount (larger circle = more bitcoin)
  - **Alpha/brightness** = vsize (dimmer = more complex/heavy transaction)
  - **₿ icon** shown on transactions with ≥1 BTC
- Rolling window of 500 nodes — oldest removed when full
- Mempool ring drawn at 85% of screen radius
- Block segments along the ring:
  - Stroke width = block size in KB
  - Label shows block height, tx count, total BTC
  - Fade to near-invisible over 1 hour
  - Up to 12 recent blocks shown
- On block: confirmed transactions animate toward the new segment; rest stay in mempool
- HUD overlay: block height, last block age, mempool stats, peers, hashrate, difficulty, latest block info, activity status
- Stats updated via `stats_update` WebSocket message — no polling
- `fetchStats()` used for initial load only
- News ticker above legend: rotating Bitcoin Magazine headlines, one every 8s with fade

### Tests
- `client/src/utils.test.ts` — 26 vitest tests covering visual encoding thresholds (`npm test`)
- `server/test_main.py` — 13 pytest tests covering `_median_fee_rate` and `_compute_activity` (`python3 -m pytest test_main.py -v`)

---

## ✅ Last completed

- Bitcoin Magazine news ticker via server-side RSS, distributed via WebSocket
- Stats pushed via WebSocket (`stats_update`) instead of client polling
- `_refresh_stats()` called immediately on block arrival — HUD always current
- `sample_stats()` runs immediately on startup — no 30s wait for first data
- Server-side mempool activity analysis (calibrating/normal/busy/congested/quiet)
- Unit tests for all pure functions on client and server
- ZMQ listeners reconnect automatically on crash

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

- Tooltip on hover showing tx details (txid, fee rate, amount, vsize)
- More dramatic block animation (glow/flash on new segment)
- Historical data persistence (SQLite) for fee rate trends and congestion history over time
- Multiple RSS sources or configurable feed URL
