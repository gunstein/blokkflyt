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
- REST `GET /snapshot` returns full mempool with all tx fields
- REST `GET /stats` returns block height, mempool stats, peers, hashrate, difficulty
- WebSocket `/ws` broadcasts live `tx_seen` and `block_seen` events to all clients

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
- `block_seen` includes block timestamp — "Last Block" age resets immediately
- HUD overlay: block height, last block age, mempool stats, peers, hashrate, difficulty, latest block info
- `simulateBlock(sizeKb)` available in browser console for testing
- Press `b` to simulate an 800 KB block

### Tests
- `client/src/utils.test.ts` — 26 vitest tests covering visual encoding thresholds (`npm test`)
- `server/test_main.py` — 7 pytest tests covering `_median_fee_rate` edge cases (`python3 -m pytest test_main.py -v`)

---

## ✅ Last completed

- Unit tests added for all pure functions on client and server
- Pure functions extracted to `utils.ts` to enable testing
- ZMQ listeners now reconnect automatically on crash
- `addTx` delegates drawing to `drawNode` (no duplicated draw logic)
- High fee nodes get blue stroke to indicate mempool membership
- Visual encoding: size = BTC amount, brightness = vsize complexity
- `block_seen` includes block timestamp so Last Block age resets immediately

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

- Tooltip on hover showing tx details (txid, fee rate, amount, vsize)
- More dramatic block animation (glow/flash on new segment)
- More rectangular block segments (like reference image)
