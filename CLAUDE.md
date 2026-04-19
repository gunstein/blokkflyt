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

> Fill in as setup is implemented.

- Server: `cd server && ...`
- Client: `cd client && ...`
- Requires a local Bitcoin Core node with ZMQ enabled

## Key conventions

- `docs/handoff.md` must be updated after each meaningful change — it is the current working state
- Architecture changes must be recorded in `docs/decisions.md`
- Event schema is JSON over WebSocket; REST is only used for the initial snapshot

## Important constraints

- Do not add abstractions beyond what the current task requires
- No mock Bitcoin data — all data comes from a real Bitcoin Core node
- Keep server state in-memory (no database)
