# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

Full end-to-end flow with rich visualization:
**Bitcoin Core → ZMQ → FastAPI → WebSocket → PixiJS canvas in browser**

### Server (`server/main.py`)
- ZMQ listener for `hashtx` and `hashblock`
- Per transaction: fetches `fee_rate`, `vsize`, `amount_btc` via RPC (`getmempoolentry` + `getrawtransaction`)
- Per block: fetches `confirmed_txids`, `ntx`, `size_kb` via RPC (`getblock`)
- Only confirmed txids are removed from mempool on block
- REST `GET /snapshot` returns full mempool with all tx fields
- WebSocket `/ws` broadcasts live events to all clients

### Client (`client/src/main.ts`)
- Transaction nodes rendered as circles:
  - **Color** = fee rate (blue=low, green=medium, orange=high, red=very high)
  - **Size** = vsize (transaction complexity)
  - **Alpha** = amount in BTC (brighter = more bitcoin)
- Rolling window of 500 nodes — oldest removed when full
- Mempool ring drawn at 85% of screen radius
- Block segments along the ring:
  - Stroke width = block size in KB
  - Fade to near-invisible over 1 hour
  - Up to 12 recent blocks shown
- On block: only confirmed transactions animate toward the new block segment
- Remaining transactions stay in mempool
- `simulateBlock(sizeKb)` available in browser console for testing
- Press `b` to simulate an 800 KB block

---

## ✅ Last completed

- Added vsize and amount_btc to tx events
- Block segments with variable stroke width based on block size
- Correct mempool clearing — only confirmed txids removed on block
- Transaction nodes animate toward mined block segment (not random explosion)
- Block segments fade over 1 hour, max 12 visible

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

- Add HUD overlay (block height, mempool count, last block time, fee legend)
- Show block number on each ring segment
- Tooltip on hover showing tx details (txid, fee rate, amount, vsize)
