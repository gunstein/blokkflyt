# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

Full ende-til-ende flyt fungerer:
**Bitcoin Core → ZMQ → FastAPI → WebSocket → TypeScript-klient i browser**

- `server/main.py` — FastAPI med ZMQ-lytter, in-memory mempool, `/ws` og `/snapshot`
- `client/src/main.ts` — Vite + TypeScript, kobler til WebSocket og logger live events
- Live `tx_seen` og `block_seen` events vises i browser-konsollen

---

## ✅ Last completed

- Bygget Vite + TypeScript klient med PixiJS installert
- WebSocket-tilkobling med auto-reconnect
- Snapshot-henting på oppstart
- CORS konfigurert i FastAPI for `localhost:5173`
- Verifisert live Bitcoin-transaksjoner i browser-konsoll

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

**Begynn PixiJS-rendering:**

1. Sett opp PixiJS `Application` med fullskjerm canvas
2. Vis hver `tx_seen` som en liten sirkel i midten (mempool-sonen)
3. Flytt sirkler sakte utover over tid
4. Ved `block_seen`: animer sirkler inn i en ring rundt kanten og fjern dem
