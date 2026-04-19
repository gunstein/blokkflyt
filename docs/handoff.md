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

- PixiJS Application set up with fullscreen black canvas
- Live transaction nodes rendered as orange circles
- Ticker-based animation loop moving nodes outward
- Verified visually in browser

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

Make the visualization more interesting:
- Vary node size or color by fee rate (requires RPC enrichment)
- Add a visible mempool ring / boundary
- Animate block confirmation (flash, sweep, or burst effect)
- Add a block ring that persists around the edge
