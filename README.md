# Blokkflyt

Visualizing Bitcoin in real time.

Blokkflyt is a live visualization of the Bitcoin network, showing how transactions flow from the mempool into blocks.

---

## ✨ Concept

Blokkflyt presents Bitcoin as a living system:

- New transactions appear in the center (mempool)
- Transactions move outward based on priority (fee rate + time)
- Blocks form a stable ring around the center
- When a block is mined, transactions transition from mempool → blockchain

The goal is to make Bitcoin intuitive, visual, and alive.

---

## 🧱 Architecture

```text
Bitcoin Core (ZMQ + RPC)
        ↓
Python Server (FastAPI)
        ↓
WebSocket + REST
        ↓
TypeScript Client (PixiJS)
