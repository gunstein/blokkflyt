# CLAUDE.md

This file is read automatically by Claude Code at the start of every session.

## Project

**Blokkflyt** — real-time visualization of the Bitcoin network.
Transactions appear in the mempool, move outward by fee priority, and transition into blocks when mined.

## Stack

| Layer | Tech |
|---|---|
| Bitcoin source | Bitcoin Core — ZMQ (events) + RPC (queries) |
| Server | Python, FastAPI, WebSocket |
| Client | TypeScript, PixiJS |
| Communication | REST (snapshot on connect), WebSocket (live updates) |

## Repo structure

```
server/   — Python FastAPI server
client/   — TypeScript PixiJS client
shared/   — shared types / schemas (if needed)
docs/     — architecture, decisions, handoff
```

## Running the project

- Server: `cd server && uvicorn main:app --reload`
- Client: `cd client && npm run dev` → opens at `http://localhost:5173`
- Requires a Bitcoin Core node with ZMQ enabled (see Infrastructure below)

## Infrastructure

**Bitcoin Core node** runs on `192.168.0.104` (home network server, snap install).

- Config: `/home/gunnis/snap/bitcoin-core/common/.bitcoin/bitcoin.conf`
- Start daemon: `snap run bitcoin-core.daemon -daemon`
- Stop daemon: `bitcoin-core.cli stop`
- Restart: `bitcoin-core.cli stop && snap run bitcoin-core.daemon -daemon`
- Status/info: `bitcoin-core.cli getblockchaininfo`
- ZMQ status: `bitcoin-core.cli getzmqnotifications`
- Note: `sudo snap restart bitcoin-core` does NOT work — the node has no snap service, must be stopped/started manually
- ZMQ ports: `28332` (blocks), `28333` (txs) — both on `0.0.0.0`
- UFW: ports 28332/28333 open for `192.168.0.0/24`
- ZMQ topics: `hashblock` (port 28332), `hashtx` (port 28333)

**Python dependencies** (no venv — system Python with `--break-system-packages`):
```bash
pip3 install pyzmq --break-system-packages
```

## Key conventions

- `docs/handoff.md` must be updated after each meaningful change — it is the current working state
- Architecture changes must be recorded in `docs/decisions.md`
- Event schema is JSON over WebSocket; REST is only used for the initial snapshot

## Important constraints

- Do not add abstractions beyond what the current task requires
- No mock Bitcoin data — all data comes from a real Bitcoin Core node
- Keep server state in-memory (no database)
