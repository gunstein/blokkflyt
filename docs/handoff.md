# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

Full end-to-end flow working:
**Bitcoin Core → ZMQ → FastAPI → WebSocket → TypeScript client in browser**

- `server/main.py` — FastAPI with ZMQ listener, in-memory mempool, `/ws` and `/snapshot`
- `client/src/main.ts` — Vite + TypeScript, connects to WebSocket and logs live events
- Live `tx_seen` and `block_seen` events visible in browser console

---

## ✅ Last completed

- Built Vite + TypeScript client with PixiJS installed
- WebSocket connection with auto-reconnect
- Snapshot fetch on startup
- CORS configured in FastAPI for `localhost:5173`
- Verified live Bitcoin transactions in browser console

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

**Start PixiJS rendering:**

1. Set up PixiJS `Application` with fullscreen canvas
2. Render each `tx_seen` as a small circle in the center (mempool zone)
3. Move circles slowly outward over time
4. On `block_seen`: animate circles into a ring around the edge and remove them
