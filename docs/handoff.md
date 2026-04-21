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
  - Fetches chain info, mempool info, network info, fee estimates, `getchaintxstats(144)` via RPC
  - Computes mempool activity status from rolling window of 20 samples (~10 min)
  - Caches result in `cached_stats` and broadcasts `stats_update` to all WS clients
- Block arrival triggers immediate `_refresh_stats()` so HUD updates without delay
- REST `GET /snapshot` — initial mempool state for connecting clients
- REST `GET /stats` — returns `cached_stats` for initial page load only
- WebSocket `/ws` on connect sends: last 12 block events (replay), `cached_stats`, `cached_price`, `cached_sparkline`, `cached_news`
- WebSocket `/ws` broadcasts: `tx_seen`, `block_seen`, `stats_update`, `price_update`, `sparkline_update`, `news_update`
- Background task `sample_price()` fetches BTC/USD price from CoinGecko every 60s
- Background task `sample_sparkline()` fetches 7-day price history from CoinGecko every 6h
- Background task `sample_news()` fetches Bitcoin Magazine RSS every 15 min via `httpx`
- All numeric values explicitly cast to `int()`/`float()` before JSON broadcast to avoid Decimal serialization errors from python-bitcoinrpc
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
- Ring center offset: 40px above screen center on desktop, 67% down on mobile (≤640px)
- Block segments along the ring:
  - Stroke width = block size in KB
  - Label shows block height, tx count, total BTC
  - Fade to near-invisible over 1 hour
  - Up to 12 recent blocks shown
- On block: confirmed transactions animate toward the new segment; rest stay in mempool
- HUD overlay (left): BTC price + sparkline, block height, last block age, mempool stats, peers, network, activity
- HUD overlay (right): fee rate bar, fee histogram, recommended fees, supply + halving, latest block details
- Tooltip on hover: shows txid, fee rate, amount, vsize
- Stats updated via `stats_update` WebSocket message — no polling
- `fetchStats()` used for initial load only
- News ticker: rotating Bitcoin Magazine headlines, one every 8s with fade + publication age
- **Responsive layout:** on mobile (≤640px) HUDs narrow to 145px, less essential blocks hidden, legend hidden, circle shifted lower

### Tests
- `client/src/utils.test.ts` — 26 vitest tests covering visual encoding thresholds (`npm test`)
- `server/test_main.py` — 17 pytest tests covering `_median_fee_rate`, `_compute_activity`, `_compute_supply` (`python3 -m pytest test_main.py -v`)

---

## ✅ Last completed

- Responsive layout for mobile (≤640px): compact HUDs, hidden non-essential blocks, circle shifted lower
- Fixed server JSON serialization: explicit int()/float() casting to prevent Decimal errors from python-bitcoinrpc
- `cached_stats` now sent to new WebSocket clients on connect (no wait for next 30s cycle)
- BTC price (real-time + 7-day sparkline) via CoinGecko
- Transaction volume (daily tx count via `getchaintxstats`)
- Supply + halving info (circulating BTC, % mined, subsidy, next halving block + days)
- Fee rate histogram (7 buckets)
- Recommended fees (fast/medium/slow via `estimatesmartfee`)
- Tooltip on hover: txid, fee rate, amount, vsize
- Bitcoin Magazine news ticker via server-side RSS, distributed via WebSocket
- Stats pushed via WebSocket (`stats_update`) instead of client polling
- Server-side mempool activity analysis (calibrating/normal/busy/congested/quiet)
- Unit tests for all pure functions on client and server
- ZMQ listeners reconnect automatically on crash

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

- More dramatic block animation (glow/flash on new segment)
- Historical data persistence (SQLite) for fee rate trends and congestion history over time
- Multiple RSS sources or configurable feed URL
