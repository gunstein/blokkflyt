# Architecture

This document defines the technical architecture of Blokkflyt.

It is the source of truth for how the system is structured.
If changes are made, they must be recorded in `docs/decisions.md`.

---

## 🧱 System Overview

```text
Bitcoin Core
  ├─ ZMQ (real-time events)
  └─ RPC (queries / snapshots)
        ↓
Python Server (FastAPI)
  ├─ ZMQ listener
  ├─ RPC client
  ├─ in-memory state
  ├─ visual mapping
  ├─ REST API
  └─ WebSocket gateway
        ↓
TypeScript Client (PixiJS)
  ├─ initial snapshot
  ├─ live updates
  └─ rendering + animation
