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
  - **Color** = fee rate (purple=new, blue=mempool, orange=high fee, yellow=selected)
  - **Size** = BTC amount (larger = more bitcoin)
  - **Alpha/brightness** = vsize (dimmer = more complex/heavy transaction)
  - **₿ icon** shown on transactions with ≥1 BTC
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

- Visual encoding reworked: size = BTC amount, brightness = vsize complexity
- ₿ icon added to nodes with ≥1 BTC
- HUD overlay: block height, mempool stats, peers, hashrate, latest block info
- Block segments with variable stroke width based on block size
- Confirmed transactions animate toward mined block segment

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

- Add HUD overlay (block height, mempool count, last block time, fee legend)
- Show block number on each ring segment
- Tooltip on hover showing tx details (txid, fee rate, amount, vsize)
