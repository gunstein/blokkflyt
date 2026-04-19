# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

- Repo `blokkflyt` created (monorepo)
- Project structure defined: `server/`, `client/`, `shared/`
- Architecture documented in `docs/architecture.md`
- `server/main.py` — FastAPI server kjørende med:
  - ZMQ-lytter for `hashtx` og `hashblock`
  - In-memory mempool-state
  - WebSocket endpoint `/ws` — broadcaster live events til klienter
  - REST endpoint `GET /snapshot` — returnerer gjeldende mempool
- Ende-til-ende verifisert: live `tx_seen`-events strømmer til WebSocket-klient

---

## ✅ Last completed

- Bygget `server/main.py` med FastAPI + ZMQ + WebSocket
- Verifisert live Bitcoin-transaksjoner over WebSocket
- `GET /snapshot` returnerer gjeldende mempool-innhold

---

## 🔧 In progress

Nothing.

---

## ▶️ Next recommended step

**Bygg minimal TypeScript-klient:**

1. `client/` — Vite + TypeScript prosjekt med PixiJS
2. Koble til `ws://localhost:8000/ws` og motta events
3. Logg events til konsoll (ingen rendering ennå)
4. Hent snapshot på oppstart via `GET /snapshot`
