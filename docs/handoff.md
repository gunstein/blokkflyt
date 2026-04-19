# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

- Repo `blokkflyt` created (monorepo)
- Basic project structure defined:
  - `server/`
  - `client/`
  - `shared/`
- Architecture documented in `docs/architecture.md`
- README created
- No live Bitcoin integration yet

---

## ✅ Last completed

- Chose project name: **Blokkflyt**
- Decided on architecture:
  - Python server (FastAPI)
  - TypeScript client (PixiJS)
  - Bitcoin Core via ZMQ + RPC
- Defined communication model:
  - REST for snapshot
  - WebSocket for live updates
- Defined initial event schema (conceptually)

---

## 🔧 In progress

- Setting up initial Python server skeleton
- Defining WebSocket connection between server and client
- Preparing first minimal client (no rendering yet)

---

## ▶️ Next recommended step

**Goal: first end-to-end live flow**

1. Implement ZMQ listener in Python server:
   - subscribe to:
     - `hashtx` or `rawtx`
     - `hashblock` or `rawblock`

2. When event is received:
   - log it
   - broadcast minimal event over WebSocket

3. Define minimal event format:
```json
{
  "type": "tx_seen",
  "tx": { "id": "..." }
}
