# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

Full end-to-end flow working with live rendering:
**Bitcoin Core → ZMQ → FastAPI → WebSocket → PixiJS canvas in browser**

- `server/main.py` — FastAPI with ZMQ listener, in-memory mempool, `/ws` and `/snapshot`
- `client/src/main.ts` — PixiJS canvas rendering live mempool as orange circles
  - Each `tx_seen` spawns a circle at center, drifts outward
  - Circles stop at 85% of screen radius
  - On `block_seen`: all circles cleared
  - Max 500 nodes rendered at once
  - Snapshot loaded on startup

---

## ✅ Last completed

- Added RPC client (`python-bitcoinrpc`) to fetch fee rate per transaction via `getmempoolentry`
- Fee rate used to color and size transaction nodes:
  - Blue = low fee (<5 sat/vB)
  - Green = medium (5–20 sat/vB)
  - Orange = high (20–50 sat/vB)
  - Red = very high (>50 sat/vB)
- RPC credentials stored in `server/.env` (gitignored), template in `server/.env.example`
- Verified fee-colored nodes visible in browser

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

- Add a visible ring/boundary around the mempool zone
- Animate block confirmation (flash, sweep, or burst effect when block is mined)
- Add a block ring around the edge showing recent blocks
