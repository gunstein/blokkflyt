# Decisions

This document records architectural decisions and the reasoning behind them.

Agents and developers must read this before changing the architecture.

---

## 2026-04-19 — Python + FastAPI for server

**Decision:** Use Python with FastAPI as the server layer.

**Why:** FastAPI has native async support, easy WebSocket handling, and good ZMQ integration via `pyzmq`. Bitcoin tooling (RPC libraries, community examples) is also well-established in Python.

**Alternatives considered:** Node.js — rejected to keep the ZMQ/Bitcoin layer closer to existing Python tooling.

---

## 2026-04-19 — TypeScript + PixiJS for client

**Decision:** Use TypeScript with PixiJS for the frontend.

**Why:** PixiJS is a WebGL-accelerated 2D renderer well-suited for animating hundreds of transaction nodes in real time. TypeScript gives type safety across the event schema boundary.

**Alternatives considered:** Three.js (overkill for 2D), plain Canvas (too low-level), D3 (not optimized for real-time animation at this scale).

---

## 2026-04-19 — REST for snapshot, WebSocket for live updates

**Decision:** On connect, the client fetches the current mempool state via REST, then subscribes to live events over WebSocket.

**Why:** Avoids replaying the full history over WebSocket on reconnect. The snapshot gives an immediate consistent view; the stream keeps it live.

---

## 2026-04-19 — In-memory state on server

**Decision:** Server holds mempool state in memory only — no database.

**Why:** Mempool state is ephemeral and fully reconstructable from Bitcoin Core on restart. A database would add complexity with no benefit.

---

## 2026-04-19 — ZMQ topics: hashtx / hashblock

**Decision:** Subscribe to `hashtx` and `hashblock` ZMQ topics (not `rawtx` / `rawblock`).

**Why:** Hash-only topics are lightweight. The server fetches full transaction/block details via RPC when needed, keeping ZMQ bandwidth low.
